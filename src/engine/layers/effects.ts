import type { FlickerProps, ImageProps, ParticlesProps, VignetteProps } from '../../shared/types'
import { cached, recordBounds, type RenderEnv } from '../env'
import { clamp, hash01, noise1, smoothstep, sourceSize, withAlpha } from '../util'
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
export function drawParticles(env: RenderEnv, p: ParticlesProps): void {
  const { ctx, W, H, S, t } = env
  const n = Math.max(0, Math.min(600, Math.round(p.count)))
  const react = 1 + p.beatReact * bassPulse(env)
  // Vùng có hạt (mặc định cả khung hình)
  const RW = Math.max(1, p.width * W)
  const RH = Math.max(1, p.height * H)
  const RX = p.x * W - RW / 2
  const RY = p.y * H - RH / 2
  recordBounds(env, RX, RY, RW, RH)
  // Vùng nhỏ hơn khung hình: hạt mờ dần khi tới gần mép vùng (không cắt thẳng)
  const bounded = p.width < 0.999 || p.height < 0.999
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
      default:
        // dust / đom đóm: bay lơ lửng lên trên
        x = wrap(r1 * spanW + noise1(t * 0.15 * speedK + i, p.seed) * 160 * S + t * 6 * S * speedK, spanW) - margin + RX
        y = wrap(r2 * spanH - t * 18 * S * speedK, spanH) - margin + RY
        alpha *= 0.35 + 0.65 * noise1(t * 0.7 + i * 3.1, p.seed + 5)
    }
    if (bounded) {
      const d = Math.min(x - RX, RX + RW - x, y - RY, RY + RH - y)
      if (d <= 0) continue
      alpha *= smoothstep(d / edge)
    }
    ctx.globalAlpha = clamp(alpha * (0.6 + 0.4 * react)) * env.fade
    const rr = size * react
    if (p.style === 'rain') {
      ctx.lineWidth = Math.max(1, rr * 0.4)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + 6 * S * speedK, y - 40 * S * speedK)
      ctx.stroke()
    } else if (p.style === 'bokeh') {
      const g = ctx.createRadialGradient(x, y, 0, x, y, rr)
      g.addColorStop(0, withAlpha(p.color, 0.9))
      g.addColorStop(0.7, withAlpha(p.color, 0.35))
      g.addColorStop(1, withAlpha(p.color, 0))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, rr, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.arc(x, y, Math.max(0.5, rr / 2), 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
