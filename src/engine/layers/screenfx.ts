// Hiệu ứng màn hình tác động lên mọi lớp nằm dưới: VHS / băng từ, glitch theo beat, màn hình CRT cũ.
// Làm việc trên điểm ảnh thật của canvas (như bộ lọc màu) nên đúng cả khi preview thu nhỏ.
// Nhiễu, lát cắt, dải kéo băng đều sinh từ số giả ngẫu nhiên theo thời điểm t: preview và video
// xuất (render song song nhiều đoạn) cho cùng một hình.
import { cssFont } from '../../shared/fonts'
import { formatTime } from '../../shared/time'
import type { CrtProps, GlitchProps, VhsProps } from '../../shared/types'
import { cached, type OffscreenSurface, type RenderEnv } from '../env'
import { clamp, hash01, noise1 } from '../util'

type Canvasish = CanvasImageSource & { width: number; height: number }

export function surface(env: RenderEnv, name: string, w: number, h: number): OffscreenSurface {
  return cached(env, `fx-${name}|${w}x${h}`, () => env.assets.createSurface(w, h))
}

export interface Snap {
  s: OffscreenSurface
  w: number
  h: number
  dw: number
  dh: number
}

/** Chụp khung hình hiện tại sang canvas phụ, thu nhỏ theo `res` (hình mềm hơn, xử lý nhanh hơn) */
export function snapshot(env: RenderEnv, name: string, res = 1, filter = 'none'): Snap {
  const canvas = env.ctx.canvas as unknown as Canvasish
  const dw = canvas.width
  const dh = canvas.height
  const w = Math.max(1, Math.round(dw * res))
  const h = Math.max(1, Math.round(dh * res))
  const s = surface(env, name, w, h)
  const c = s.ctx
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.globalAlpha = 1
  c.globalCompositeOperation = 'copy'
  c.filter = filter
  c.drawImage(canvas, 0, 0, dw, dh, 0, 0, w, h)
  c.filter = 'none'
  c.globalCompositeOperation = 'source-over'
  return { s, w, h, dw, dh }
}

/** Giữ một phần kênh màu của ảnh: nhân với màu thuần (đỏ, hoặc xanh lục + lam) */
export function channel(env: RenderEnv, name: string, snap: Snap, color: string): OffscreenSurface {
  const s = surface(env, name, snap.w, snap.h)
  const c = s.ctx
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.globalAlpha = 1
  c.globalCompositeOperation = 'copy'
  c.drawImage(snap.s.canvas, 0, 0)
  c.globalCompositeOperation = 'multiply'
  c.fillStyle = color
  c.fillRect(0, 0, snap.w, snap.h)
  c.globalCompositeOperation = 'source-over'
  return s
}

/** Lệch màu: kênh đỏ lệch sang phải, xanh lục + lam lệch sang trái, cộng lại lên khung hình */
function splitCompose(env: RenderEnv, snap: Snap, prefix: string, dx: number, dy = 0): void {
  const red = channel(env, `${prefix}-r`, snap, '#ff0000')
  const cyan = channel(env, `${prefix}-gb`, snap, '#00ffff')
  const { ctx } = env
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.filter = 'none'
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'copy'
  ctx.drawImage(cyan.canvas, 0, 0, snap.w, snap.h, -dx, -dy, snap.dw, snap.dh)
  ctx.globalCompositeOperation = 'lighter'
  ctx.drawImage(red.canvas, 0, 0, snap.w, snap.h, dx, dy, snap.dw, snap.dh)
  ctx.restore()
}

/** Vẽ ảnh chụp trở lại khung hình (đã thu nhỏ thì phóng lên: mềm như băng từ) */
function putBack(env: RenderEnv, snap: Snap): void {
  const { ctx } = env
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'copy'
  ctx.drawImage(snap.s.canvas, 0, 0, snap.w, snap.h, 0, 0, snap.dw, snap.dh)
  ctx.restore()
}

/** Sọc quét ngang (vẽ sẵn một lần theo cỡ khung hình) */
function scanlines(env: RenderEnv, dw: number, dh: number, period: number, alpha: number): void {
  if (alpha < 0.005) return
  const p = Math.max(2, Math.round(period))
  const s = cached(env, `fx-scan|${dw}x${dh}|${p}`, () => {
    const surf = env.assets.createSurface(dw, dh)
    surf.ctx.fillStyle = '#000000'
    for (let y = 0; y < dh; y += p) surf.ctx.fillRect(0, y + Math.floor(p / 2), dw, Math.max(1, Math.floor(p / 2)))
    return surf
  })
  env.ctx.globalAlpha = clamp(alpha)
  env.ctx.drawImage(s.canvas, 0, 0)
  env.ctx.globalAlpha = 1
}

const GRAIN = 192

/** Hạt nhiễu (4 ô nhiễu dựng sẵn, đổi ô và vị trí theo thời gian) */
function grain(env: RenderEnv, dw: number, dh: number, alpha: number): void {
  if (alpha < 0.005) return
  const frame = Math.floor(env.t * 30)
  const tile = cached(env, `fx-grain|${frame % 4}`, () => {
    const s = env.assets.createSurface(GRAIN, GRAIN)
    const img = s.ctx.createImageData(GRAIN, GRAIN)
    for (let i = 0; i < GRAIN * GRAIN; i++) {
      const v = Math.round(40 + 175 * hash01(i, 501 + (frame % 4)))
      img.data[i * 4] = v
      img.data[i * 4 + 1] = v
      img.data[i * 4 + 2] = v
      img.data[i * 4 + 3] = 255
    }
    s.ctx.putImageData(img, 0, 0)
    return s
  })
  const { ctx } = env
  const size = Math.max(96, Math.round(GRAIN * env.S * env.px))
  const ox = -Math.floor(hash01(frame, 7) * size)
  const oy = -Math.floor(hash01(frame, 8) * size)
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = clamp(alpha)
  for (let y = oy; y < dh; y += size) for (let x = ox; x < dw; x += size) ctx.drawImage(tile.canvas, x, y, size, size)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

/** Vạch nhiễu trắng ngắn (tín hiệu băng từ hỏng) */
function noiseLines(env: RenderEnv, x0: number, y0: number, w: number, h: number, count: number, seed: number, alpha: number): void {
  const { ctx } = env
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = clamp(alpha * (0.3 + 0.7 * hash01(i, seed + 1)))
    const lw = w * (0.03 + 0.25 * hash01(i, seed + 2))
    ctx.fillRect(x0 + hash01(i, seed + 3) * (w - lw), y0 + hash01(i, seed + 4) * h, lw, Math.max(1, h * 0.04 * hash01(i, seed + 5)))
  }
  ctx.globalAlpha = 1
}

export function drawVhs(env: RenderEnv, p: VhsProps): void {
  const k = clamp(p.intensity) * env.fade
  if (k < 0.01) return
  const { ctx, t } = env
  const unit = env.S * env.px
  // Băng từ mềm: chụp ở độ phân giải thấp hơn rồi phóng lên
  const res = 1 - 0.55 * clamp(p.soft) * k
  const snap = snapshot(env, 'vhs-snap', res, `saturate(${Math.round((1 - 0.25 * k) * 100) / 100}) contrast(${Math.round((1 + 0.06 * k) * 100) / 100})`)
  const { dw, dh } = snap
  const dx = p.chroma * unit * k
  if (dx >= 0.3) splitCompose(env, snap, 'vhs', dx)
  else putBack(env, snap)

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.filter = 'none'
  scanlines(env, dw, dh, 3.2 * unit, p.scanlines * k * 0.5)
  grain(env, dw, dh, p.noise * k * 0.4)

  const frame = Math.floor(t * 30)
  if (p.tracking > 0) {
    const a = clamp(p.tracking) * k
    // Dải kéo băng trôi dần xuống, lúc có lúc không
    if (noise1(t * 0.25, 91) < 0.3 + 0.45 * a) {
      const bandH = dh * (0.03 + 0.06 * a)
      const center = (((t * 0.09 + 0.3) % 1.4) - 0.2) * dh
      const stripH = Math.max(2, Math.round(3 * unit))
      for (let y = Math.max(0, Math.floor(center - bandH / 2)); y < Math.min(dh, center + bandH / 2); y += stripH) {
        const off = (hash01(y + frame * 131, 23) - 0.5) * 60 * unit * a
        ctx.drawImage(snap.s.canvas, 0, y * res, snap.w, stripH * res, off, y, dw, stripH)
      }
      noiseLines(env, 0, center - bandH / 2, dw, bandH, Math.round(6 + 14 * a), frame * 7, 0.55 * a)
    }
    // Mép dưới rung (đầu từ chuyển kênh)
    const edgeH = Math.round(dh * 0.022)
    const off = (8 + 18 * hash01(frame, 31)) * unit * a
    ctx.drawImage(snap.s.canvas, 0, (dh - edgeH) * res, snap.w, edgeH * res, off, dh - edgeH, dw, edgeH)
    noiseLines(env, 0, dh - edgeH, dw, edgeH, Math.round(4 + 8 * a), frame * 13, 0.6 * a)
  }

  // Chữ trên màn hình như máy quay / đầu video
  if (p.osd) {
    const size = 34 * unit
    ctx.font = cssFont('JetBrains Mono', size, false)
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#f4f4f4'
    ctx.shadowColor = 'rgba(0,0,0,0.7)'
    ctx.shadowBlur = 4 * unit
    ctx.shadowOffsetX = 2 * unit
    ctx.shadowOffsetY = 2 * unit
    ctx.globalAlpha = k * (0.82 + 0.18 * noise1(t * 6, 77))
    const mx = dw * 0.06
    ctx.textAlign = 'left'
    const osdText = p.osdText.trim()
    if (osdText) {
      ctx.fillText(osdText, mx, dh * 0.09)
      // Tam giác "phát" vẽ bằng hình (không phụ thuộc font có ký tự ▶)
      const tx = mx + ctx.measureText(osdText).width + size * 0.45
      ctx.beginPath()
      ctx.moveTo(tx, dh * 0.09 - size * 0.34)
      ctx.lineTo(tx + size * 0.55, dh * 0.09)
      ctx.lineTo(tx, dh * 0.09 + size * 0.34)
      ctx.closePath()
      ctx.fill()
    }
    if (p.dateText.trim()) ctx.fillText(p.dateText.trim(), mx, dh * 0.9)
    if (p.showTime) {
      ctx.textAlign = 'right'
      ctx.fillText(formatTime(t, true), dw - mx, dh * 0.9)
    }
  }
  ctx.restore()
}

/** Độ mạnh của glitch lúc t (0 = không glitch) */
export function glitchStrength(p: GlitchProps, env: Pick<RenderEnv, 't' | 'audio' | 'fade'>): number {
  const th = clamp(p.threshold, 0, 0.95)
  let v: number
  if (p.trigger === 'random') {
    const slot = Math.floor(env.t * 8)
    v = hash01(slot, 404) < 0.1 + 0.2 * clamp(p.amount) ? 0.55 + 0.45 * hash01(slot, 405) : 0
  } else v = p.trigger === 'bass' ? env.audio.bass(env.t, 14) : env.audio.beat(env.t, 12)
  return clamp((v - th) / (1 - th)) * clamp(p.amount) * env.fade
}

export function drawGlitch(env: RenderEnv, p: GlitchProps): void {
  const k = glitchStrength(p, env)
  if (k < 0.02) return
  const { ctx, t } = env
  const unit = env.S * env.px
  // Hình glitch đổi 20 lần mỗi giây
  const frame = Math.floor(t * 20)
  const snap = snapshot(env, 'gl-snap', 1)
  const { dw, dh } = snap
  const dx = p.rgbSplit * unit * k * (0.6 + 0.8 * hash01(frame, 7))
  const dy = p.rgbSplit * unit * k * (hash01(frame, 8) - 0.5) * 0.4
  if (dx > 0.3) splitCompose(env, snap, 'gl', dx, dy)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.filter = 'none'
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  // Lát cắt lệch ngang, lấy từ hình chưa tách màu
  const n = Math.round(clamp(p.slices, 0, 40) * (0.4 + 0.6 * k))
  for (let i = 0; i < n; i++) {
    const seed = frame * 31 + i
    const y = Math.floor(hash01(seed, 11) * dh)
    const h = Math.max(2, Math.round(dh * (0.006 + 0.05 * hash01(seed, 12))))
    const off = (hash01(seed, 13) - 0.5) * dw * 0.14 * k
    ctx.drawImage(snap.s.canvas, 0, y, dw, h, off, y, dw, h)
  }
  // Khối màu lỗi tín hiệu
  if (p.blocks) {
    const colors = ['#ff2bd6', '#00f0ff', '#ffe600', '#ffffff']
    ctx.globalCompositeOperation = 'screen'
    const nb = Math.round(3 + 6 * k)
    for (let i = 0; i < nb; i++) {
      const r = (j: number): number => hash01(frame * 97 + i * 7 + j, 21)
      ctx.fillStyle = colors[Math.floor(r(0) * colors.length) % colors.length]
      ctx.globalAlpha = 0.2 + 0.45 * k * r(1)
      ctx.fillRect(r(2) * dw, r(3) * dh, dw * (0.02 + 0.12 * r(4)), dh * (0.004 + 0.03 * r(5)))
    }
  }
  ctx.restore()
}

export function drawCrt(env: RenderEnv, p: CrtProps): void {
  const k = env.fade
  if (k < 0.01) return
  const { ctx, t } = env
  const unit = env.S * env.px
  const snap = snapshot(env, 'crt-snap', 1)
  const { dw, dh } = snap
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.filter = 'none'
  ctx.globalAlpha = 1

  // Mặt kính cong: kéo co từng dải ngang rồi từng dải dọc (mép hình cong vào như màn CRT)
  const curv = clamp(p.curvature) * 0.12 * k
  if (curv > 0.002) {
    const mid = surface(env, 'crt-mid', dw, dh)
    const m = mid.ctx
    m.setTransform(1, 0, 0, 1, 0, 0)
    m.globalAlpha = 1
    m.globalCompositeOperation = 'copy'
    m.fillStyle = '#000000'
    m.fillRect(0, 0, dw, dh)
    m.globalCompositeOperation = 'source-over'
    const rows = 96
    for (let i = 0; i < rows; i++) {
      const y0 = Math.floor((i * dh) / rows)
      const y1 = Math.floor(((i + 1) * dh) / rows)
      const v = ((y0 + y1) / dh) - 1
      const ww = dw * (1 - curv * v * v)
      m.drawImage(snap.s.canvas, 0, y0, dw, y1 - y0, (dw - ww) / 2, y0, ww, y1 - y0)
    }
    ctx.globalCompositeOperation = 'copy'
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, dw, dh)
    ctx.globalCompositeOperation = 'source-over'
    const cols = 128
    for (let j = 0; j < cols; j++) {
      const x0 = Math.floor((j * dw) / cols)
      const x1 = Math.floor(((j + 1) * dw) / cols)
      const u = ((x0 + x1) / dw) - 1
      const hh = dh * (1 - curv * u * u)
      ctx.drawImage(mid.canvas, x0, 0, x1 - x0, dh, x0, (dh - hh) / 2, x1 - x0, hh)
    }
  }

  // Phát sáng (bloom) từ bản thu nhỏ đã làm mờ
  if (p.glow > 0.01) {
    const glow = snapshot(env, 'crt-glow', 0.25, `blur(${Math.max(1, Math.round(3 * unit))}px)`)
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = clamp(p.glow) * 0.45 * k
    ctx.drawImage(glow.s.canvas, 0, 0, glow.w, glow.h, 0, 0, dw, dh)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }

  scanlines(env, dw, dh, 4 * unit, p.scanlines * k * 0.55)

  // Lưới điểm RGB của màn hình
  if (p.mask > 0.01) {
    const period = Math.max(3, Math.round(3 * unit))
    const mask = cached(env, `fx-mask|${dw}x${dh}|${period}`, () => {
      const s = env.assets.createSurface(dw, dh)
      const colors = ['#ff4040', '#40ff40', '#4040ff']
      for (let x = 0, i = 0; x < dw; x += period / 3, i++) {
        s.ctx.fillStyle = colors[i % 3]
        s.ctx.fillRect(Math.floor(x), 0, Math.max(1, Math.ceil(period / 3)), dh)
      }
      return s
    })
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = clamp(p.mask) * 0.3 * k
    ctx.drawImage(mask.canvas, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }

  // Tối dần về mép
  if (p.vignette > 0.01) {
    const r = Math.hypot(dw, dh) / 2
    const g = ctx.createRadialGradient(dw / 2, dh / 2, r * 0.35, dw / 2, dh / 2, r)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, `rgba(0,0,0,${clamp(p.vignette) * 0.8 * k})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, dw, dh)
  }

  // Nhấp nháy và dải sáng trôi chậm
  if (p.flicker > 0.01) {
    ctx.fillStyle = '#000000'
    ctx.globalAlpha = clamp(p.flicker) * 0.07 * k * noise1(t * 24, 61)
    ctx.fillRect(0, 0, dw, dh)
    const by = ((t * 0.11) % 1.3 - 0.15) * dh
    const bh = dh * 0.14
    const g = ctx.createLinearGradient(0, by, 0, by + bh)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.5, `rgba(255,255,255,${0.05 * clamp(p.flicker) * k})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.globalAlpha = 1
    ctx.fillStyle = g
    ctx.fillRect(0, by, dw, bh)
  }

  // Vỏ màn hình bo tròn góc
  if (p.bezel) {
    const inset = Math.min(dw, dh) * (0.012 + curv * 0.25)
    const radius = Math.min(dw, dh) * 0.07
    ctx.globalAlpha = k
    ctx.fillStyle = '#070707'
    ctx.beginPath()
    ctx.rect(0, 0, dw, dh)
    ctx.roundRect(inset, inset, dw - inset * 2, dh - inset * 2, radius)
    ctx.fill('evenodd')
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'
    ctx.lineWidth = Math.max(1, 2 * unit)
    ctx.beginPath()
    ctx.roundRect(inset, inset, dw - inset * 2, dh - inset * 2, radius)
    ctx.stroke()
  }
  ctx.restore()
}
