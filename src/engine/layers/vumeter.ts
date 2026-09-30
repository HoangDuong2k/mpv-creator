// Đồng hồ VU kim kiểu dàn âm thanh cổ: mặt đồng hồ có thang dB (vùng đỏ từ 0 tới +3), kim trái / phải
// nhảy theo âm lượng từng kênh, lên xuống trong khoảng 0,3 giây như kim thật, đèn báo khi quá mức.
// Mặt đồng hồ không đổi theo thời gian nên được vẽ sẵn một lần.
import { cssFont } from '../../shared/fonts'
import type { VuMeterProps } from '../../shared/types'
import { cached, recordBounds, type OffscreenSurface, type RenderEnv } from '../env'
import { clamp, lerp } from '../util'

/** Góc lệch lớn nhất của kim so với phương thẳng đứng */
const SWING = (47 * Math.PI) / 180
const DB_MIN = -20
const DB_MAX = 3

/** Thang VU không đều: vị trí 0..1 trên cung theo dB (tỉ lệ với điện áp như đồng hồ thật) */
export function vuPosition(db: number): number {
  const v = (d: number): number => Math.pow(10, d / 20)
  return (v(db) - v(DB_MIN)) / (v(DB_MAX) - v(DB_MIN))
}

/** Mức 0..1 (thang 40 dB, 1 = đoạn to nhất của bài) → dB hiển thị trên đồng hồ */
export function vuDb(level: number, sensitivity: number): number {
  return -3 + (level * sensitivity - 0.85) * 40
}

const TICKS = [-20, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3]
const LABELED = new Set([-20, -10, -7, -5, -3, 0, 3])

function faceSurface(env: RenderEnv, p: VuMeterProps, fw: number, fh: number, channel: string): OffscreenSurface {
  const w = Math.max(16, Math.round(fw))
  const h = Math.max(10, Math.round(fh))
  const key = `vu-face|${w}x${h}|${p.style}|${p.faceColor}|${p.accent}|${p.textColor}|${p.backlight}|${p.label}|${channel}`
  return cached(env, key, () => {
    const s = env.assets.createSurface(w, h)
    const c = s.ctx
    const dark = p.style === 'dark'
    // Viền ngoài
    c.fillStyle = dark ? '#0d0c0b' : '#1f1b17'
    c.beginPath()
    c.roundRect(0, 0, w, h, h * 0.07)
    c.fill()
    const m = h * 0.07
    const face = dark ? '#16130f' : p.faceColor
    c.fillStyle = face
    c.beginPath()
    c.roundRect(m, m, w - m * 2, h - m * 2, h * 0.04)
    c.fill()
    // Đèn nền: vùng sáng ấm ở giữa mặt đồng hồ
    if (p.backlight > 0) {
      const g = c.createRadialGradient(w / 2, h * 0.62, h * 0.05, w / 2, h * 0.62, w * 0.6)
      g.addColorStop(0, dark ? `rgba(255,170,60,${0.35 * clamp(p.backlight)})` : `rgba(255,236,190,${0.55 * clamp(p.backlight)})`)
      g.addColorStop(1, 'rgba(255,200,120,0)')
      c.fillStyle = g
      c.fillRect(m, m, w - m * 2, h - m * 2)
    }
    const ink = dark ? '#f3b45a' : p.textColor
    const px = w / 2
    const py = h * 1.02
    const Ra = h * 0.74
    const at = (db: number, r: number): [number, number] => {
      const a = lerp(-SWING, SWING, vuPosition(db))
      return [px + Math.sin(a) * r, py - Math.cos(a) * r]
    }
    // Cung thang đo: đen tới 0 dB, đỏ từ 0 tới +3
    const arc = (from: number, to: number, color: string, width: number): void => {
      c.strokeStyle = color
      c.lineWidth = width
      c.beginPath()
      const steps = 24
      for (let i = 0; i <= steps; i++) {
        const [x, y] = at(lerp(from, to, i / steps), Ra)
        if (i === 0) c.moveTo(x, y)
        else c.lineTo(x, y)
      }
      c.stroke()
    }
    arc(DB_MIN, 0, ink, h * 0.012)
    arc(0, DB_MAX, p.accent, h * 0.05)
    c.lineCap = 'butt'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    for (const db of TICKS) {
      const major = LABELED.has(db)
      const [x1, y1] = at(db, Ra)
      const [x2, y2] = at(db, Ra + h * (major ? 0.09 : 0.055))
      c.strokeStyle = db > 0 ? p.accent : ink
      c.lineWidth = h * (major ? 0.014 : 0.009)
      c.beginPath()
      c.moveTo(x1, y1)
      c.lineTo(x2, y2)
      c.stroke()
      if (major) {
        const [lx, ly] = at(db, Ra + h * 0.16)
        c.font = cssFont('Be Vietnam Pro', h * 0.075, true)
        c.fillStyle = db > 0 ? p.accent : ink
        c.fillText(db > 0 ? `+${db}` : String(Math.abs(db)), lx, ly)
      }
    }
    // Dấu âm / dương ở hai đầu thang
    c.font = cssFont('Be Vietnam Pro', h * 0.09, true)
    c.fillStyle = ink
    const [mx, my] = at(DB_MIN, Ra - h * 0.1)
    c.fillText('−', mx, my)
    c.fillStyle = p.accent
    const [ax, ay] = at(DB_MAX, Ra - h * 0.1)
    c.fillText('+', ax, ay)
    // Chữ VU và kênh
    c.fillStyle = ink
    if (p.label.trim()) {
      c.font = cssFont('Playfair Display', h * 0.17, false)
      c.fillText(p.label.trim(), px, h * 0.64)
    }
    if (channel) {
      c.font = cssFont('Be Vietnam Pro', h * 0.08, true)
      c.textAlign = 'left'
      c.fillText(channel, m + h * 0.06, h - m - h * 0.08)
    }
    // Bóng tối ở mép trong (mặt đồng hồ lõm vào hộp)
    c.strokeStyle = 'rgba(0,0,0,0.35)'
    c.lineWidth = h * 0.02
    c.beginPath()
    c.roundRect(m + c.lineWidth / 2, m + c.lineWidth / 2, w - m * 2 - c.lineWidth, h - m * 2 - c.lineWidth, h * 0.04)
    c.stroke()
    return s
  })
}

function drawMeter(env: RenderEnv, p: VuMeterProps, x: number, y: number, fw: number, fh: number, level: number, channel: string): void {
  const { ctx } = env
  ctx.drawImage(faceSurface(env, p, fw, fh, channel).canvas, x, y, fw, fh)
  const m = fh * 0.07
  const db = vuDb(level, p.sensitivity)
  // Kim chạm chốt ở hai đầu (vượt thang một chút rồi dừng)
  const pos = clamp(vuPosition(Math.max(DB_MIN - 2, db)), -0.04, 1.04)
  const a = lerp(-SWING, SWING, pos)
  const px = x + fw / 2
  const py = y + fh * 1.02
  const len = fh * 0.86
  ctx.save()
  ctx.beginPath()
  ctx.rect(x + m, y + m, fw - m * 2, fh - m * 2)
  ctx.clip()
  // Bóng kim
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'
  ctx.lineWidth = fh * 0.014
  ctx.beginPath()
  ctx.moveTo(px + fh * 0.02, py + fh * 0.02)
  ctx.lineTo(px + Math.sin(a) * len + fh * 0.02, py - Math.cos(a) * len + fh * 0.02)
  ctx.stroke()
  ctx.strokeStyle = p.style === 'dark' ? '#ff7a2f' : p.needleColor
  ctx.lineWidth = fh * 0.011
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(px, py)
  ctx.lineTo(px + Math.sin(a) * len, py - Math.cos(a) * len)
  ctx.stroke()
  // Đèn báo quá mức
  const peak = clamp((db - 0.5) / 1.5)
  ctx.fillStyle = `rgba(255,${Math.round(60 + 40 * (1 - peak))},40,${0.18 + 0.82 * peak})`
  ctx.beginPath()
  ctx.arc(x + fw - m - fh * 0.1, y + m + fh * 0.1, fh * 0.035, 0, Math.PI * 2)
  ctx.fill()
  // Ánh kính
  const g = ctx.createLinearGradient(x, y, x + fw * 0.6, y + fh)
  g.addColorStop(0, 'rgba(255,255,255,0.16)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.03)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(x + m, y + m, fw - m * 2, fh - m * 2)
  ctx.restore()
}

export function drawVuMeter(env: RenderEnv, p: VuMeterProps): void {
  const { ctx, W, H, t } = env
  const fw = Math.max(40, p.size * env.S)
  const fh = fw * 0.62
  const stereo = p.layout === 'stereo'
  const gap = fw * 0.08
  const total = stereo ? fw * 2 + gap : fw
  const x0 = p.x * W - total / 2
  const y0 = p.y * H - fh / 2
  recordBounds(env, x0, y0, total, fh)
  ctx.globalAlpha = clamp(p.opacity) * env.fade
  // Bóng đổ của cả hộp
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = fh * 0.08 * env.px
  ctx.shadowOffsetY = fh * 0.03 * env.px
  ctx.fillStyle = '#000000'
  ctx.beginPath()
  ctx.roundRect(x0, y0, fw, fh, fh * 0.07)
  if (stereo) ctx.roundRect(x0 + fw + gap, y0, fw, fh, fh * 0.07)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  const lv = env.audio.stereo(t, 0.3)
  if (stereo) {
    drawMeter(env, p, x0, y0, fw, fh, lv.left, 'L')
    drawMeter(env, p, x0 + fw + gap, y0, fw, fh, lv.right, 'R')
  } else drawMeter(env, p, x0, y0, fw, fh, (lv.left + lv.right) / 2, '')
}
