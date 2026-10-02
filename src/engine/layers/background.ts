import type { BackgroundProps } from '../../shared/types'
import { cached, type OffscreenSurface, type RenderEnv } from '../env'
import { clamp, drawCover, noise1, parseHex } from '../util'
import { bakeFilterInto, bakeSignature } from './filter'

/** Thời gian chuyển giữa hai ảnh bìa khi đổi bài (giây) */
const COVER_FADE = 1.2

/** Xung "đập" theo nhạc 0..1: kết hợp beat và mức bass */
export function bassPulse(env: RenderEnv): number {
  const beat = env.audio.beat(env.t, 6)
  const bass = env.audio.bass(env.t, 10)
  return clamp(0.7 * beat + 0.5 * bass * bass)
}

/**
 * Ảnh đã phủ kín khung (và làm mờ nếu cần), vẽ sẵn một lần rồi dùng lại mỗi frame. Vẽ trên nền đen nên luôn đục
 * (ảnh PNG có chỗ trong suốt, mép ảnh làm mờ vẫn hiện đen như khi vẽ lên khung đã tô đen).
 */
function prerendered(env: RenderEnv, path: string, blur: number): CanvasImageSource | null {
  const key = `bg|${path}|${blur}|${env.W}x${env.H}`
  const lru = cached(env, 'bg-lru', () => new Map<string, OffscreenSurface>())
  const hit = lru.get(key)
  if (hit) {
    lru.delete(key)
    lru.set(key, hit)
    return hit.canvas
  }
  const img = env.assets.image(path)
  if (!img) return null
  const surf = env.assets.createSurface(env.W, env.H)
  surf.ctx.fillStyle = '#000000'
  surf.ctx.fillRect(0, 0, env.W, env.H)
  const pad = blur > 0 ? blur * env.S * 2 : 0
  if (blur > 0) surf.ctx.filter = `blur(${blur * env.S}px)`
  drawCover(surf.ctx, img, -pad, -pad, env.W + pad * 2, env.H + pad * 2)
  surf.ctx.filter = 'none'
  lru.set(key, surf)
  while (lru.size > 4) lru.delete(lru.keys().next().value as string)
  return surf.canvas
}

/** Gradient theo góc, phủ kín khung W × H */
function linearGradient(ctx: CanvasRenderingContext2D, W: number, H: number, angle: number, c0: string, c1: string): CanvasGradient {
  const a = (angle * Math.PI) / 180
  const r = (Math.abs(W * Math.cos(a)) + Math.abs(H * Math.sin(a))) / 2
  const g = ctx.createLinearGradient(W / 2 - Math.cos(a) * r, H / 2 - Math.sin(a) * r, W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r)
  g.addColorStop(0, c0)
  g.addColorStop(1, c1)
  return g
}

/**
 * Gradient vẽ sẵn một lần (dùng khi nướng bộ lọc màu vào nền).
 * Chỉ giữ vài gradient gần nhất — kéo bảng chọn màu không làm bộ nhớ phình ra.
 */
function gradientSurface(env: RenderEnv, p: BackgroundProps): OffscreenSurface {
  const { W, H } = env
  const key = `${p.color}|${p.color2}|${p.angle}|${W}x${H}`
  const lru = cached(env, 'bg-gradient-lru', () => new Map<string, OffscreenSurface>())
  const hit = lru.get(key)
  if (hit) {
    lru.delete(key)
    lru.set(key, hit)
    return hit
  }
  const s = env.assets.createSurface(W, H)
  s.ctx.fillStyle = linearGradient(s.ctx, W, H, p.angle, p.color, p.color2)
  s.ctx.fillRect(0, 0, W, H)
  lru.set(key, s)
  while (lru.size > 4) lru.delete(lru.keys().next().value as string)
  return s
}

/** Khung màu đơn W × H (chỉ cần khi nướng bộ lọc) — một canvas dùng lại, tô lại khi đổi màu */
function colorSurface(env: RenderEnv, color: string): CanvasImageSource {
  const { W, H } = env
  const slot = cached(env, `bg-color|${W}x${H}`, () => ({ color: '', surf: env.assets.createSurface(W, H) }))
  if (slot.color !== color) {
    slot.surf.ctx.fillStyle = color
    slot.surf.ctx.fillRect(0, 0, W, H)
    slot.color = color
  }
  return slot.surf.canvas
}

/** Số ảnh nền đã nướng bộ lọc giữ lại (ảnh bìa lúc chuyển bài cần 2) */
const BAKE_MAX = 6

/**
 * Ảnh nền đã nướng bộ lọc (env.bake). Mỗi (lớp bộ lọc, nguồn ảnh) có đúng một canvas: đổi thông số
 * bộ lọc (kéo thanh trượt…) thì nướng lại vào chính canvas đó, không sinh thêm.
 */
function bakedSurface(env: RenderEnv, srcKey: string, src: CanvasImageSource, dim: number): CanvasImageSource {
  const bake = env.bake!
  const { W, H } = env
  const lru = cached(env, 'filter-bake', () => new Map<string, { sig: string; surf: OffscreenSurface }>())
  const key = `${bake.filterId}|${srcKey}|${W}x${H}`
  const sig = bakeSignature(bake.props, dim)
  let entry = lru.get(key)
  if (entry) lru.delete(key)
  else {
    let surf: OffscreenSurface | undefined
    if (lru.size >= BAKE_MAX) {
      const oldest = lru.keys().next().value as string
      const old = lru.get(oldest)!.surf
      lru.delete(oldest)
      const c = old.canvas as unknown as { width: number; height: number }
      if (c.width === W && c.height === H) surf = old
    }
    entry = { sig: '', surf: surf ?? env.assets.createSurface(W, H) }
  }
  if (entry.sig !== sig) {
    bakeFilterInto(env, entry.surf, src, bake.props, dim)
    entry.sig = sig
  }
  lru.set(key, entry)
  return entry.surf.canvas
}

/** Số ảnh nền đã tối sẵn giữ lại (ảnh bìa lúc chuyển bài cần 2) */
const DIM_MAX = 3

/**
 * Ảnh nền (đục) đã phủ sẵn độ tối của nền: mỗi frame chỉ còn một lần vẽ ảnh, thay cho vẽ ảnh rồi phủ đen cả khung.
 * Phủ đen trước hay sau khi phóng ảnh đều như nhau (phóng ảnh chỉ trộn tuyến tính các điểm ảnh).
 */
function dimmedSurface(env: RenderEnv, srcKey: string, src: CanvasImageSource, dim: number): CanvasImageSource {
  if (dim <= 0) return src
  const { W, H } = env
  const lru = cached(env, 'bg-dim-lru', () => new Map<string, OffscreenSurface>())
  const key = `${srcKey}|${clamp(dim)}|${W}x${H}`
  let surf = lru.get(key)
  if (surf) lru.delete(key)
  else {
    // Đủ số lượng thì dùng lại canvas của ảnh cũ nhất
    if (lru.size >= DIM_MAX) {
      const oldest = lru.keys().next().value as string
      const old = lru.get(oldest)!
      lru.delete(oldest)
      const c = old.canvas as unknown as { width: number; height: number }
      if (c.width === W && c.height === H) surf = old
    }
    surf ??= env.assets.createSurface(W, H)
    const d = surf.ctx
    d.save()
    d.setTransform(1, 0, 0, 1, 0, 0)
    d.globalAlpha = 1
    d.filter = 'none'
    d.globalCompositeOperation = 'copy'
    d.drawImage(src, 0, 0)
    d.globalCompositeOperation = 'source-over'
    d.fillStyle = `rgba(0,0,0,${clamp(dim)})`
    d.fillRect(0, 0, W, H)
    d.restore()
  }
  lru.set(key, surf)
  return surf.canvas
}

/** Màu hex đục tối đi như khi phủ đen với độ tối `dim`; null nếu không phải màu hex (có thể có độ trong) */
function dimmedHex(color: string, dim: number): string | null {
  const rgb = parseHex(color)
  if (!rgb) return null
  const k = 1 - clamp(dim)
  return `rgb(${Math.round(rgb[0] * k)},${Math.round(rgb[1] * k)},${Math.round(rgb[2] * k)})`
}

/** Ảnh (hoặc màu thay thế khi chưa có ảnh) vẽ ra đục: ảnh đã nạp luôn đục (xem prerendered), màu phải là hex */
function opaqueImage(env: RenderEnv, p: BackgroundProps, path: string | undefined): boolean {
  return (path ? prerendered(env, path, p.blur) !== null : false) || parseHex(p.color) !== null
}

/**
 * Nền đục đang hiện đủ, phủ kín khung (phóng ≥ 1): màu đơn / gradient bằng màu hex, ảnh, ảnh bìa (cả lúc chuyển
 * giữa hai ảnh bìa). Các lớp nằm dưới bị che hết nên không cần vẽ, và không cần tô đen khung trước.
 * Nền video chưa tính (frame video trên preview có thể trong suốt).
 */
export function coversFrame(env: RenderEnv, p: BackgroundProps): boolean {
  if (!env.fastBackground || env.fade < 0.999) return false
  switch (p.mode) {
    case 'color':
      return parseHex(p.color) !== null
    case 'gradient':
      return parseHex(p.color) !== null && parseHex(p.color2) !== null
    case 'image':
      return opaqueImage(env, p, p.src || undefined)
    case 'cover': {
      const e = env.entry
      if (!opaqueImage(env, p, e?.track.coverPath)) return false
      const prev = e && e.index > 0 ? env.timeline.entries[e.index - 1] : null
      const fading = !!prev && (env.t - e!.displayStart) / COVER_FADE < 1 && prev.track.coverPath !== e!.track.coverPath
      return !fading || opaqueImage(env, p, prev.track.coverPath)
    }
    default:
      return false
  }
}

/**
 * Nền phủ kín khung, không nướng bộ lọc: tô thẳng một lần bằng màu đã tối sẵn, thay cho vẽ gradient phóng to
 * rồi phủ đen cả khung. Hình như nhau — phủ đen lên một lớp đục chỉ là nhân màu với (1 − độ tối) — nhưng xuất
 * video nhanh hơn nhiều vì Skia vẽ bằng CPU. Trả về màu đầu–cuối đã tối, null nếu không dùng được cách này.
 */
function solidColors(env: RenderEnv, p: BackgroundProps): [string, string] | null {
  if (env.bake || (p.mode !== 'color' && p.mode !== 'gradient') || !coversFrame(env, p)) return null
  const c0 = dimmedHex(p.color, p.dim)!
  return [c0, p.mode === 'gradient' ? dimmedHex(p.color2, p.dim)! : c0]
}


/**
 * Nền vẽ ra đúng một ảnh tĩnh (W × H) ở frame này nên nướng sẵn bộ lọc màu được: ảnh, màu, gradient,
 * ảnh bìa (trừ lúc đang chuyển ảnh bìa giữa hai bài — khi đó lọc từng frame cho đúng màu lúc đan nhau).
 */
export function isStaticBackground(env: RenderEnv, p: BackgroundProps): boolean {
  if (p.mode === 'video') return false
  if (p.mode !== 'cover') return true
  const e = env.entry
  if (!e || e.index === 0) return true
  const prev = env.timeline.entries[e.index - 1]
  return (env.t - e.displayStart) / COVER_FADE >= 1 || prev.track.coverPath === e.track.coverPath
}

/**
 * Vẽ nội dung nền (trong hệ toạ độ đã phóng / lia). `kind`: 'plain' ảnh gốc, 'baked' bản đã nướng bộ lọc (có sẵn
 * độ tối), 'dimmed' bản đã phủ sẵn độ tối (chỉ dùng khi nền đục phủ kín khung, xem coversFrame).
 */
function drawContent(env: RenderEnv, p: BackgroundProps, kind: 'plain' | 'baked' | 'dimmed', alpha: number): void {
  const { ctx, W, H } = env
  ctx.globalAlpha = alpha
  // Một nguồn tĩnh W × H — đã lọc / đã tối sẵn nếu cần
  const put = (key: string, src: CanvasImageSource): void => {
    ctx.drawImage(kind === 'baked' ? bakedSurface(env, key, src, p.dim) : kind === 'dimmed' ? dimmedSurface(env, key, src, p.dim) : src, 0, 0)
  }
  const fallback = (): void => {
    if (kind === 'baked') put(`color|${p.color}`, colorSurface(env, p.color))
    else {
      ctx.fillStyle = (kind === 'dimmed' && dimmedHex(p.color, p.dim)) || p.color
      ctx.fillRect(0, 0, W, H)
    }
  }
  switch (p.mode) {
    case 'color':
      fallback()
      return
    case 'gradient':
      put(`gradient|${p.color}|${p.color2}|${p.angle}`, gradientSurface(env, p).canvas)
      return
    case 'image': {
      const img = p.src ? prerendered(env, p.src, p.blur) : null
      if (img) put(`image|${p.src}|${p.blur}`, img)
      else fallback()
      return
    }
    case 'video': {
      // Frame video đổi liên tục: không nướng được (Renderer không chọn cách này cho nền video)
      if (kind === 'baked' && env.bake) env.bake.failed = true
      const frame = p.src ? env.assets.video(p.src, env.t) : null
      if (frame) drawCover(ctx, frame, 0, 0, W, H)
      else {
        ctx.fillStyle = p.color
        ctx.fillRect(0, 0, W, H)
      }
      return
    }
    case 'cover': {
      const e = env.entry
      const cur = e?.track.coverPath ? prerendered(env, e.track.coverPath, p.blur) : null
      if (cur) put(`image|${e!.track.coverPath}|${p.blur}`, cur)
      else fallback()
      if (e && e.index > 0) {
        const k = (env.t - e.displayStart) / COVER_FADE
        const prev = env.timeline.entries[e.index - 1]
        if (k < 1 && prev.track.coverPath !== e.track.coverPath) {
          const old = prev.track.coverPath ? prerendered(env, prev.track.coverPath, p.blur) : null
          ctx.globalAlpha = (1 - clamp(k)) * alpha
          if (old) put(`image|${prev.track.coverPath}|${p.blur}`, old)
          else fallback()
          ctx.globalAlpha = alpha
        }
      }
      return
    }
  }
}

export function drawBackground(env: RenderEnv, p: BackgroundProps): void {
  const { ctx, W, H, S, t } = env
  const pulse = p.beatZoom > 0 ? bassPulse(env) : 0
  const kb = p.kenBurns * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 36))
  const shakeAmp = p.shake * S
  const beat = shakeAmp > 0 ? env.audio.beat(t, 10) : 0
  // Phóng to thêm một chút để khi rung/pan không lộ viền. Lia chỉ dùng phần phóng của Ken Burns / đập theo bass;
  // phần phóng thêm cho rung để riêng (lia hết cỡ đúng lúc rung mạnh vẫn phủ kín khung)
  const panZoom = 1 + kb + p.beatZoom * pulse
  const zoom = panZoom + (shakeAmp * 2.2) / Math.min(W, H)
  const panRoom = ((panZoom - 1) * W) / 2
  const panX = kb > 0 ? Math.sin((2 * Math.PI * t) / 53) * panRoom * 0.6 : 0
  const panY = kb > 0 ? Math.cos((2 * Math.PI * t) / 61) * panRoom * 0.3 : 0
  const frame = Math.floor(t * 30)
  const dx = shakeAmp * beat * (noise1(frame * 0.9, 11) * 2 - 1)
  const dy = shakeAmp * beat * (noise1(frame * 0.9, 23) * 2 - 1)

  const content = (kind: 'plain' | 'baked' | 'dimmed', alpha: number): void => {
    ctx.save()
    ctx.translate(W / 2 + panX + dx, H / 2 + panY + dy)
    ctx.scale(zoom, zoom)
    ctx.translate(-W / 2, -H / 2)
    drawContent(env, p, kind, alpha)
    ctx.restore()
  }
  const dimFill = (): void => {
    if (p.dim > 0) {
      ctx.fillStyle = `rgba(0,0,0,${clamp(p.dim)})`
      ctx.fillRect(0, 0, W, H)
    }
  }

  const bake = env.bake
  if (!bake) {
    const solid = solidColors(env, p)
    if (solid) {
      ctx.globalAlpha = env.fade
      if (p.mode === 'color') {
        ctx.fillStyle = solid[0]
        ctx.fillRect(0, 0, W, H)
        return
      }
      ctx.save()
      ctx.translate(W / 2 + panX + dx, H / 2 + panY + dy)
      ctx.scale(zoom, zoom)
      ctx.translate(-W / 2, -H / 2)
      ctx.fillStyle = linearGradient(ctx, W, H, p.angle, solid[0], solid[1])
      // Tô rộng hơn khung: phóng / lia / rung thế nào cũng phủ kín
      ctx.fillRect(-W, -H, W * 3, H * 3)
      ctx.restore()
      return
    }
    // Ảnh / ảnh bìa phủ kín khung: vẽ bản đã tối sẵn, không phủ đen cả khung mỗi frame
    if ((p.mode === 'image' || p.mode === 'cover') && coversFrame(env, p)) {
      content('dimmed', env.fade)
      return
    }
    content('plain', env.fade)
    dimFill()
    return
  }
  if (bake.fade >= 0.999) {
    // Ảnh đã nướng có sẵn độ tối của nền
    content('baked', env.fade)
    if (bake.failed) dimFill()
    return
  }
  // Bộ lọc đang hiện dần / ẩn dần: ảnh gốc, rồi ảnh đã lọc phủ lên theo độ hiện của bộ lọc
  content('plain', env.fade)
  dimFill()
  content('baked', env.fade * bake.fade)
  ctx.globalAlpha = env.fade
}
