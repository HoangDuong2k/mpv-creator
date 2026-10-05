import type { FlickerProps, ImageProps, ParticlesProps, VignetteProps } from '../../shared/types'
import { cached, recordBounds, type RenderEnv } from '../env'
import { clamp, easeOutCubic, hash01, noise1, smoothstep, sourceSize, withAlpha } from '../util'
import { bassPulse } from './background'

export function drawImageLayer(env: RenderEnv, p: ImageProps): void {
  const { ctx, W, H, t } = env
  const path = p.source === 'cover' ? env.entry?.track.coverPath : p.src
  const img = path ? env.assets.image(path) : null
  if (!img) {
    // Chưa chọn ảnh: vẽ khung giữ chỗ cho layer đang chỉnh để kéo thả được
    if (env.editLayerId === env.layerId) drawPlaceholder(env, p.x * W, p.y * H, p.width * W)
    return
  }
  const { width: iw, height: ih } = sourceSize(img)
  if (!iw || !ih) return
  const w = p.width * W
  const h = p.circle ? w : (w * ih) / iw
  const cx = p.x * W
  const cy = p.y * H
  recordBounds(env, cx - w / 2, cy - h / 2, w, h)
  const s = 1 + (p.beatScale > 0 ? p.beatScale * bassPulse(env) : 0)
  ctx.globalAlpha = clamp(p.opacity) * env.fade
  ctx.translate(cx, cy)
  ctx.scale(s, s)
  if (p.rotateSpeed) ctx.rotate((p.rotateSpeed * t * Math.PI) / 180)
  if (p.circle) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(0, 0, w / 2, 0, Math.PI * 2)
    ctx.clip()
    const k = w / Math.min(iw, ih)
    ctx.drawImage(img, (-iw * k) / 2, (-ih * k) / 2, iw * k, ih * k)
    ctx.restore()
    if (p.borderWidth > 0) {
      ctx.lineWidth = p.borderWidth * env.S
      ctx.strokeStyle = p.borderColor
      ctx.beginPath()
      ctx.arc(0, 0, w / 2, 0, Math.PI * 2)
      ctx.stroke()
    }
  } else {
    ctx.drawImage(img, -w / 2, -h / 2, w, h)
    if (p.borderWidth > 0) {
      ctx.lineWidth = p.borderWidth * env.S
      ctx.strokeStyle = p.borderColor
      ctx.strokeRect(-w / 2, -h / 2, w, h)
    }
  }
}

function drawPlaceholder(env: RenderEnv, cx: number, cy: number, w: number): void {
  const { ctx, S } = env
  recordBounds(env, cx - w / 2, cy - w / 2, w, w)
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'
  ctx.lineWidth = 2 * S
  ctx.setLineDash([8 * S, 6 * S])
  ctx.fillRect(cx - w / 2, cy - w / 2, w, w)
  ctx.strokeRect(cx - w / 2, cy - w / 2, w, w)
  ctx.setLineDash([])
}

export function drawFlicker(env: RenderEnv, p: FlickerProps): void {
  const { ctx, W, H, t } = env
  let v: number
  if (p.trigger === 'beat') v = env.audio.beat(t, p.decay)
  else if (p.trigger === 'bass') v = clamp((env.audio.bass(t, p.decay) - 0.45) / 0.55)
  else {
    // Nhấp nháy kiểu phim cũ: nhiễu theo frame (15 lần/giây), thỉnh thoảng loé mạnh
    const f = Math.floor(t * 15)
    const n = hash01(f, 91)
    v = Math.pow(n, 4) + (n > 0.93 ? 0.6 : 0)
  }
  const alpha = clamp(p.intensity * v) * env.fade
  if (alpha < 0.004) return
  ctx.globalCompositeOperation = p.blend === 'normal' ? 'source-over' : p.blend
  ctx.globalAlpha = alpha
  ctx.fillStyle = p.color
  ctx.fillRect(0, 0, W, H)
}

export function drawVignette(env: RenderEnv, p: VignetteProps): void {
  const { W, H } = env
  const surf = cached(env, `vignette|${p.amount}|${p.size}|${p.color}|${W}x${H}`, () => {
    const s = env.assets.createSurface(W, H)
    const r = Math.hypot(W, H) / 2
    const g = s.ctx.createRadialGradient(W / 2, H / 2, r * clamp(p.size, 0, 0.98), W / 2, H / 2, r)
    g.addColorStop(0, withAlpha(p.color, 0))
    g.addColorStop(1, withAlpha(p.color, clamp(p.amount)))
    s.ctx.fillStyle = g
    s.ctx.fillRect(0, 0, W, H)
    return s
  })
  env.ctx.drawImage(surf.canvas, 0, 0)
}

/** Hạt bay: vị trí mỗi hạt là hàm của thời gian nên tua/render song song vẫn khớp. */
/** Bảng màu lễ hội cho hạt nhiều màu (pháo giấy, pháo hoa…) */
export const FESTIVE = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff', '#ff9f1c']

/** Trái tim rộng `s`, tâm ở gốc toạ độ */
function heartPath(ctx: CanvasRenderingContext2D, s: number): void {
  const h = s * 0.9
  const top = -h / 2
  ctx.moveTo(0, top + h * 0.3)
  ctx.bezierCurveTo(0, top, -s / 2, top, -s / 2, top + h * 0.3)
  ctx.bezierCurveTo(-s / 2, top + h * 0.62, 0, top + h * 0.78, 0, top + h)
  ctx.bezierCurveTo(0, top + h * 0.78, s / 2, top + h * 0.62, s / 2, top + h * 0.3)
  ctx.bezierCurveTo(s / 2, top, 0, top, 0, top + h * 0.3)
}

export function drawParticles(env: RenderEnv, p: ParticlesProps): void {
  const { ctx, W, H, S, t } = env
  const n = Math.max(0, Math.min(600, Math.round(p.count)))
  const pulse = bassPulse(env)
  const react = 1 + p.beatReact * pulse
  // Vùng có hạt (mặc định cả khung hình)
  const RW = Math.max(1, p.width * W)
  const RH = Math.max(1, p.height * H)
  const RX = p.x * W - RW / 2
  const RY = p.y * H - RH / 2
  recordBounds(env, RX, RY, RW, RH)
  // Vùng nhỏ hơn khung hình: hạt mờ dần khi tới gần mép vùng (không cắt thẳng)
  const bounded = p.width < 0.999 || p.height < 0.999
  if (p.style === 'fog' || p.style === 'fireworks') {
    if (bounded) {
      ctx.beginPath()
      ctx.rect(RX, RY, RW, RH)
      ctx.clip()
    }
    if (p.style === 'fog') drawFog(env, p, RX, RY, RW, RH)
    else drawFireworks(env, p, RX, RY, RW, RH, pulse)
    return
  }
  const edge = Math.max(1, Math.min(RW, RH) * 0.15)
  const margin = 40 * S
  const spanW = RW + margin * 2
  const spanH = RH + margin * 2
  const wrap = (v: number, m: number): number => ((v % m) + m) % m
  ctx.fillStyle = p.color
  ctx.strokeStyle = p.color
  for (let i = 0; i < n; i++) {
    const r1 = hash01(i, p.seed)
    const r2 = hash01(i, p.seed + 1)
    const r3 = hash01(i, p.seed + 2)
    const r4 = hash01(i, p.seed + 3)
    const sizeK = 0.4 + r3 * 1.2
    const speedK = (0.5 + r4) * p.speed
    let x: number
    let y: number
    let size = p.size * S * sizeK
    let alpha = p.opacity
    // Xoay và lật (hoa, giấy màu rơi chao lượn)
    let rot = 0
    let flip = 1
    switch (p.style) {
      case 'snow':
        x = wrap(r1 * spanW + Math.sin(t * 0.8 * speedK + r2 * 10) * 30 * S, spanW) - margin + RX
        y = wrap(r2 * spanH + t * 60 * S * speedK, spanH) - margin + RY
        break
      case 'rain':
        x = wrap(r1 * spanW - t * 120 * S * speedK, spanW) - margin + RX
        y = wrap(r2 * spanH + t * 900 * S * speedK, spanH) - margin + RY
        break
      case 'bokeh':
        x = wrap(r1 * spanW + t * 8 * S * speedK, spanW) - margin + RX
        y = wrap(r2 * spanH - t * 5 * S * speedK, spanH) - margin + RY
        size *= 8
        alpha *= 0.18 + 0.2 * noise1(t * 0.3 + i, p.seed)
        break
      case 'stars':
        x = RX + r1 * RW
        y = RY + r2 * RH
        alpha *= 0.3 + 0.7 * noise1(t * 1.5 * speedK + i * 7.3, p.seed)
        break
      case 'orbit': {
        // Bay vòng quanh tâm vùng (quanh ảnh bìa, đĩa than), bung ra theo tiếng bass
        const R = Math.min(RW, RH) * 0.42
        const ang = r1 * Math.PI * 2 + t * (0.12 + r4 * 0.3) * p.speed
        const rad = R * (0.86 + r2 * 0.28) * (1 + p.beatReact * pulse * (0.08 + r3 * 0.22))
        x = p.x * W + Math.cos(ang) * rad
        y = p.y * H + Math.sin(ang) * rad
        alpha *= 0.45 + 0.55 * noise1(t * 1.3 + i * 2.7, p.seed)
        break
      }
      case 'hearts':
        // Bay lên, đung đưa
        x = wrap(r1 * spanW + Math.sin(t * 1.2 * speedK + r2 * 9) * 24 * S, spanW) - margin + RX
        y = wrap(r2 * spanH - t * 40 * S * speedK, spanH) - margin + RY
        rot = Math.sin(t * 1.5 * speedK + i) * 0.3
        size *= 5
        break
      case 'petals':
        // Rơi chéo theo gió, chao lượn và lật mặt
        x = wrap(r1 * spanW + t * 45 * S * speedK + Math.sin(t * 1.1 * speedK + r2 * 7) * 40 * S, spanW) - margin + RX
        y = wrap(r2 * spanH + t * 70 * S * speedK, spanH) - margin + RY
        rot = t * (0.8 + r3) * speedK + r1 * 6
        flip = Math.cos(t * (1.5 + r4 * 2) * speedK + r2 * 5)
        size *= 5
        break
      case 'bubbles':
        x = wrap(r1 * spanW + Math.sin(t * 2 * speedK + r3 * 8) * 14 * S, spanW) - margin + RX
        y = wrap(r2 * spanH - t * 55 * S * speedK, spanH) - margin + RY
        size *= 5
        break
      case 'confetti':
        x = wrap(r1 * spanW + Math.sin(t * 1.7 * speedK + r4 * 9) * 30 * S, spanW) - margin + RX
        y = wrap(r2 * spanH + t * 110 * S * speedK, spanH) - margin + RY
        rot = t * (2 + r3 * 3) * speedK + r1 * 6
        flip = Math.cos(t * (3 + r4 * 4) * speedK + r2 * 7)
        size *= 3.6
        break
      case 'fireflies': {
        // Bay lượn lờ, lúc sáng lúc tắt
        x = RX + wrap(r1 * RW + (noise1(t * 0.18 * speedK + i * 3.1, p.seed + 7) - 0.5) * RW * 0.5, RW)
        y = RY + wrap(r2 * RH + (noise1(t * 0.15 * speedK + i * 5.7, p.seed + 8) - 0.5) * RH * 0.5, RH)
        alpha *= smoothstep((noise1(t * 0.8 * speedK + i * 5.3, p.seed + 11) - 0.3) / 0.4)
        size *= 1.2
        break
      }
      default:
        // dust / đom đóm: bay lơ lửng lên trên
        x = wrap(r1 * spanW + noise1(t * 0.15 * speedK + i, p.seed) * 160 * S + t * 6 * S * speedK, spanW) - margin + RX
        y = wrap(r2 * spanH - t * 18 * S * speedK, spanH) - margin + RY
        alpha *= 0.35 + 0.65 * noise1(t * 0.7 + i * 3.1, p.seed + 5)
    }
    if (bounded && p.style !== 'orbit') {
      const d = Math.min(x - RX, RX + RW - x, y - RY, RY + RH - y)
      if (d <= 0) continue
      alpha *= smoothstep(d / edge)
    }
    if (alpha <= 0.002) continue
    const color = p.multicolor ? FESTIVE[Math.floor(hash01(i, p.seed + 9) * FESTIVE.length) % FESTIVE.length] : p.color
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.globalAlpha = clamp(alpha * (0.6 + 0.4 * react)) * env.fade
    const rr = size * react
    switch (p.style) {
      case 'rain':
        ctx.lineWidth = Math.max(1, rr * 0.4)
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + 6 * S * speedK, y - 40 * S * speedK)
        ctx.stroke()
        break
      case 'bokeh': {
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr)
        g.addColorStop(0, withAlpha(color, 0.9))
        g.addColorStop(0.7, withAlpha(color, 0.35))
        g.addColorStop(1, withAlpha(color, 0))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, rr, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      case 'hearts':
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot)
        ctx.beginPath()
        heartPath(ctx, rr)
        ctx.fill()
        ctx.restore()
        break
      case 'petals':
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot)
        ctx.scale(Math.max(0.15, Math.abs(flip)), 1)
        ctx.beginPath()
        ctx.ellipse(0, 0, rr * 0.5, rr * 0.3, 0, 0, Math.PI * 2)
        ctx.fill()
        // Gân giữa cánh hoa sáng hơn
        ctx.globalAlpha *= 0.5
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.ellipse(-rr * 0.08, 0, rr * 0.22, rr * 0.08, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        break
      case 'confetti':
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot)
        ctx.scale(1, Math.max(0.12, Math.abs(flip)))
        ctx.fillRect(-rr / 2, -rr * 0.22, rr, rr * 0.44)
        ctx.restore()
        break
      case 'bubbles': {
        const r = Math.max(1, rr / 2)
        const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r)
        g.addColorStop(0, withAlpha(color, 0))
        g.addColorStop(0.8, withAlpha(color, 0.12))
        g.addColorStop(1, withAlpha(color, 0.45))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.lineWidth = Math.max(1, r * 0.07)
        ctx.stroke()
        // Đốm phản chiếu
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(x - r * 0.38, y - r * 0.38, r * 0.16, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      case 'fireflies': {
        const r = Math.max(1, rr * 5)
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, withAlpha('#ffffff', 0.95))
        g.addColorStop(0.15, withAlpha(color, 0.85))
        g.addColorStop(1, withAlpha(color, 0))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      default:
        ctx.beginPath()
        ctx.arc(x, y, Math.max(0.5, rr / 2), 0, Math.PI * 2)
        ctx.fill()
    }
  }
}

/** Sương mù: các mảng sương lớn, mềm, trôi ngang chậm (Kích thước: độ lớn của mảng sương) */
function drawFog(env: RenderEnv, p: ParticlesProps, RX: number, RY: number, RW: number, RH: number): void {
  const { ctx, S, t } = env
  const n = Math.max(1, Math.min(40, Math.round(p.count)))
  for (let i = 0; i < n; i++) {
    const r1 = hash01(i, p.seed)
    const r2 = hash01(i, p.seed + 1)
    const r3 = hash01(i, p.seed + 2)
    const r4 = hash01(i, p.seed + 3)
    const R = RH * (0.3 + 0.35 * r3) * (p.size / 4)
    const span = RW + R * 2
    const x = RX - R + ((((r1 * span + t * 14 * S * p.speed * (0.5 + r4)) % span) + span) % span)
    const y = RY + RH * (0.2 + 0.7 * r2) + Math.sin(t * 0.13 * p.speed + i) * RH * 0.03
    const a = clamp(p.opacity * 0.32 * (0.55 + 0.45 * noise1(t * 0.12 * p.speed + i * 2.3, p.seed + 4))) * env.fade
    const color = p.multicolor ? FESTIVE[i % FESTIVE.length] : p.color
    const g = ctx.createRadialGradient(x, y, 0, x, y, R)
    g.addColorStop(0, withAlpha(color, a))
    g.addColorStop(0.55, withAlpha(color, a * 0.45))
    g.addColorStop(1, withAlpha(color, 0))
    ctx.globalAlpha = 1
    ctx.fillStyle = g
    ctx.fillRect(x - R, y - R, R * 2, R * 2)
  }
}

/** Pháo hoa: mỗi "làn" bắn một quả mỗi chu kỳ (bay lên rồi nổ tung, tàn rơi xuống theo trọng lực) */
const FW_RISE = 0.45
const FW_LIFE = 1.8
const FW_SPARKS = 64

function drawFireworks(env: RenderEnv, p: ParticlesProps, RX: number, RY: number, RW: number, RH: number, pulse: number): void {
  const { ctx, S, t } = env
  const lanes = Math.max(1, Math.min(8, Math.round(p.count / 25)))
  const period = 2.4 / Math.max(0.1, p.speed)
  const radius = Math.min(RW, RH) * 0.28 * (p.size / 3)
  const gravity = RH * 0.14
  const dot = Math.max(1, p.size * S * 0.9)
  ctx.globalCompositeOperation = 'lighter'
  for (let j = 0; j < lanes; j++) {
    const tt = t + hash01(j, p.seed + 21) * period
    const cycle = Math.floor(tt / period)
    for (let back = 0; back < 2; back++) {
      const c = cycle - back
      const u = tt - c * period
      if (u > FW_RISE + FW_LIFE) continue
      const id = c * 13 + j
      const hx = RX + RW * (0.15 + 0.7 * hash01(id, p.seed + 22))
      const hy = RY + RH * (0.15 + 0.4 * hash01(id, p.seed + 23))
      const color = p.multicolor ? FESTIVE[Math.floor(hash01(id, p.seed + 24) * FESTIVE.length) % FESTIVE.length] : p.color
      ctx.fillStyle = color
      if (u < FW_RISE) {
        // Đuôi pháo bay lên
        const k = easeOutCubic(u / FW_RISE)
        const y = RY + RH + (hy - RY - RH) * k
        for (let q = 0; q < 6; q++) {
          ctx.globalAlpha = clamp(p.opacity * (1 - q / 6)) * env.fade
          ctx.beginPath()
          ctx.arc(hx, y + q * dot * 2.2, dot * (1 - q / 8), 0, Math.PI * 2)
          ctx.fill()
        }
        continue
      }
      const e = u - FW_RISE
      const life = 1 - e / FW_LIFE
      const boost = 1 + p.beatReact * pulse * 0.5
      // Loé sáng lúc nổ
      if (e < 0.18) {
        const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, radius * 0.5)
        g.addColorStop(0, withAlpha('#ffffff', 0.6 * (1 - e / 0.18)))
        g.addColorStop(1, withAlpha(color, 0))
        ctx.globalAlpha = clamp(p.opacity) * env.fade
        ctx.fillStyle = g
        ctx.fillRect(hx - radius, hy - radius, radius * 2, radius * 2)
        ctx.fillStyle = color
      }
      // Mỗi tia là một vệt ngắn (vị trí bây giờ nối với vị trí 0,12 giây trước), lõi trắng lúc mới nổ
      const at = (k: number, v: number, a: number, time: number): [number, number] => {
        const dist = 1 - Math.exp(-3.2 * time)
        return [hx + Math.cos(a) * v * dist, hy + Math.sin(a) * v * dist + gravity * time * time]
      }
      ctx.lineCap = 'round'
      for (let k = 0; k < FW_SPARKS; k++) {
        const a = (k / FW_SPARKS) * Math.PI * 2 + hash01(k, id) * 0.12
        const v = radius * (0.55 + 0.45 * hash01(k + 97, id)) * boost
        const [x, y] = at(k, v, a, e)
        const [x0, y0] = at(k, v, a, Math.max(0, e - 0.12))
        const twinkle = e < 0.6 ? 1 : 0.5 + 0.5 * hash01(k + Math.floor(e * 18) * 131, id)
        ctx.globalAlpha = clamp(p.opacity * Math.pow(life, 1.15) * twinkle) * env.fade
        ctx.strokeStyle = color
        ctx.lineWidth = dot * (0.7 + 0.8 * life)
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x, y)
        ctx.stroke()
        if (e < 0.5) {
          ctx.strokeStyle = '#ffffff'
          ctx.globalAlpha *= 1 - e / 0.5
          ctx.lineWidth = dot * 0.6
          ctx.stroke()
        }
      }
    }
  }
  ctx.globalCompositeOperation = 'source-over'
}
