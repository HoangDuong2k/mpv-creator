import { cssFilterOf, isNeutralFilter } from '../../shared/filterPresets'
import type { FilterProps } from '../../shared/types'
import { cached, type OffscreenSurface, type RenderEnv } from '../env'
import { clamp, hash01 } from '../util'

const GRAIN_TILE = 256
const GRAIN_FRAMES = 4

/** Canvas tạm dùng lại giữa các frame (theo kích thước thật của khung hình) */
function surface(env: RenderEnv, name: string, w: number, h: number): OffscreenSurface {
  return cached(env, `filter-${name}|${w}x${h}`, () => env.assets.createSurface(w, h))
}

/** Ô nhiễu xám (hạt phim) sinh bằng số giả ngẫu nhiên cố định — preview và export giống nhau */
function grainTile(env: RenderEnv, index: number): OffscreenSurface {
  return cached(env, `filter-grain|${index}`, () => {
    const s = env.assets.createSurface(GRAIN_TILE, GRAIN_TILE)
    const img = s.ctx.createImageData(GRAIN_TILE, GRAIN_TILE)
    const d = img.data
    for (let i = 0; i < GRAIN_TILE * GRAIN_TILE; i++) {
      // Phân bố gần chuẩn (trung bình 3 mẫu) quanh xám 128
      const n = (hash01(i, 101 + index) + hash01(i, 211 + index) + hash01(i, 307 + index)) / 3
      const v = Math.round(128 + (n - 0.5) * 2 * 110)
      d[i * 4] = v
      d[i * 4 + 1] = v
      d[i * 4 + 2] = v
      d[i * 4 + 3] = 255
    }
    s.ctx.putImageData(img, 0, 0)
    return s
  })
}

/**
 * Phần chỉnh màu của bộ lọc (mọi phép tính theo từng điểm ảnh + làm mờ): chép `source` sang `w`
 * qua chuỗi CSS filter (sáng / tương phản / bão hoà / xoay màu / sepia / làm mờ), rồi phủ nhiệt độ
 * màu, sắc độ (soft-light) và nâng vùng tối (nhạt màu). `w` có kích thước dw × dh, `source` cùng cỡ.
 */
function colorGrade(w: CanvasRenderingContext2D, source: CanvasImageSource, dw: number, dh: number, p: FilterProps, blurPx: number): void {
  w.setTransform(1, 0, 0, 1, 0, 0)
  w.globalAlpha = 1
  w.globalCompositeOperation = 'copy'
  w.filter = cssFilterOf(p, blurPx)
  w.drawImage(source, 0, 0)
  w.filter = 'none'

  // Nhiệt độ màu và sắc độ: phủ màu kiểu soft-light (giữ chi tiết sáng tối)
  const tint = (color: string, amount: number): void => {
    if (Math.abs(amount) < 0.005) return
    w.globalCompositeOperation = 'soft-light'
    w.globalAlpha = clamp(Math.abs(amount))
    w.fillStyle = color
    w.fillRect(0, 0, dw, dh)
  }
  tint(p.temperature >= 0 ? '#ff8a2a' : '#2a8aff', p.temperature)
  tint(p.tint >= 0 ? '#ff3cc8' : '#3cff6a', p.tint)

  // Nhạt màu: nâng vùng tối lên (đen thành xám) như ảnh phim
  if (p.fade > 0.005) {
    const v = Math.round(clamp(p.fade) * 80)
    w.globalCompositeOperation = 'lighten'
    w.globalAlpha = 1
    w.fillStyle = `rgb(${v},${v},${v})`
    w.fillRect(0, 0, dw, dh)
  }
  w.globalCompositeOperation = 'source-over'
  w.globalAlpha = 1
}

/**
 * Viền tối và hạt phim — luôn tính theo khung hình (hạt đổi 24 lần/giây theo t nên export song song
 * vẫn khớp). `strength` nhân vào độ đậm (cường độ × hiện dần khi vẽ thẳng lên khung hình).
 */
function frameOverlays(env: RenderEnv, w: CanvasRenderingContext2D, p: FilterProps, dw: number, dh: number, strength: number): void {
  if (p.vignette > 0.005) {
    const r = Math.hypot(dw, dh) / 2
    const g = w.createRadialGradient(dw / 2, dh / 2, r * 0.45, dw / 2, dh / 2, r)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, `rgba(0,0,0,${clamp(p.vignette) * 0.85 * strength})`)
    w.globalCompositeOperation = 'source-over'
    w.globalAlpha = 1
    w.fillStyle = g
    w.fillRect(0, 0, dw, dh)
  }
  if (p.grain > 0.005) {
    const tile = grainTile(env, Math.floor(env.t * 24) % GRAIN_FRAMES)
    const size = Math.max(64, Math.round(GRAIN_TILE * env.S * env.px))
    w.globalCompositeOperation = 'overlay'
    w.globalAlpha = clamp(p.grain) * 0.55 * strength
    for (let y = 0; y < dh; y += size) for (let x = 0; x < dw; x += size) w.drawImage(tile.canvas, x, y, size, size)
  }
  w.globalCompositeOperation = 'source-over'
  w.globalAlpha = 1
}

/** Dấu vân tay của phần bộ lọc được nướng vào ảnh (đổi → nướng lại). Viền tối, hạt phim không nằm trong ảnh nướng. */
export function bakeSignature(p: FilterProps, dim: number): string {
  return [p.intensity, p.brightness, p.contrast, p.saturation, p.hue, p.sepia, p.blur, p.temperature, p.tint, p.fade, dim].join(',')
}

/**
 * "Nướng" bộ lọc vào một ảnh nền tĩnh (kích thước project W × H), làm một lần thay vì mỗi frame:
 * dst = cường độ × lọc(ảnh gốc làm tối theo `dim`) + (1 − cường độ) × ảnh gốc làm tối.
 * Ảnh gốc nằm dưới nên viền làm mờ để lộ ảnh gốc giống hệt cách lọc từng frame.
 */
export function bakeFilterInto(env: RenderEnv, dst: OffscreenSurface, src: CanvasImageSource, p: FilterProps, dim: number): void {
  const { W, H } = env
  const d = dst.ctx
  d.save()
  d.setTransform(1, 0, 0, 1, 0, 0)
  d.globalAlpha = 1
  d.filter = 'none'
  d.globalCompositeOperation = 'copy'
  d.drawImage(src, 0, 0)
  if (dim > 0) {
    d.globalCompositeOperation = 'source-over'
    d.fillStyle = `rgba(0,0,0,${clamp(dim)})`
    d.fillRect(0, 0, W, H)
  }
  const graded = surface(env, 'bake-work', W, H)
  colorGrade(graded.ctx, dst.canvas, W, H, p, p.blur * env.S)
  d.globalCompositeOperation = 'source-over'
  d.globalAlpha = clamp(p.intensity)
  d.drawImage(graded.canvas, 0, 0)
  d.restore()
}

/**
 * Lớp bộ lọc màu: chụp lại những gì đã vẽ (mọi lớp nằm dưới), chỉnh màu rồi trộn trở lại
 * theo cường độ. Làm việc trên điểm ảnh thật của canvas nên đúng cả khi preview thu nhỏ.
 * Khi bộ lọc đã được nướng sẵn vào ảnh nền (env.bake, xem Renderer) thì chỉ còn vẽ viền tối + hạt phim.
 */
export function drawFilter(env: RenderEnv, p: FilterProps): void {
  const k = clamp(p.intensity) * env.fade
  if (k < 0.004 || isNeutralFilter(p)) return
  const { ctx } = env
  const canvas = ctx.canvas as unknown as CanvasImageSource & { width: number; height: number }
  const dw = canvas.width
  const dh = canvas.height

  const bake = env.bake
  if (bake && bake.filterId === env.layerId && !bake.failed) {
    if (p.vignette <= 0.005 && p.grain <= 0.005) return
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.filter = 'none'
    frameOverlays(env, ctx, p, dw, dh, k)
    ctx.restore()
    return
  }

  // 1. Chụp khung hình hiện tại (mọi lớp nằm dưới) sang canvas phụ, chỉnh màu trên đó
  const work = surface(env, 'work', dw, dh)
  colorGrade(work.ctx, canvas, dw, dh, p, p.blur * env.S * env.px)
  frameOverlays(env, work.ctx, p, dw, dh, 1)

  // 2. Trộn vào khung hình theo cường độ (và hiện dần / ẩn dần của lớp)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = k
  ctx.filter = 'none'
  ctx.drawImage(work.canvas, 0, 0)
  ctx.restore()
}
