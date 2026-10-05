// Ánh sáng phủ lên khung hình (cộng sáng kiểu "screen", như hiệu ứng Ánh sáng của CapCut): rò sáng (light leak),
// lóe sáng ống kính, tia sáng chiếu từ một điểm, cầu vồng lăng kính. Sáng bừng theo tiếng bass / beat.
// Mọi chuyển động tính từ thời điểm t nên preview và video xuất ra như nhau.
import type { LightProps } from '../../shared/types'
import { recordBounds, type RenderEnv } from '../env'
import { clamp, hash01, mixColor, noise1, withAlpha } from '../util'
import { bassPulse } from './background'

export function drawLight(env: RenderEnv, p: LightProps): void {
  const { ctx } = env
  const gain = clamp(p.intensity) * (1 + 0.6 * p.beatReact * bassPulse(env))
  if (gain < 0.003) return
  ctx.globalAlpha = env.fade
  ctx.globalCompositeOperation = 'screen'
  switch (p.style) {
    case 'flare':
      drawFlare(env, p, gain)
      break
    case 'rays':
      drawRays(env, p, gain)
      break
    case 'prism':
      drawPrism(env, p, gain)
      break
    default:
      drawLeak(env, p, gain)
  }
  ctx.globalCompositeOperation = 'source-over'
}

/** Nguồn sáng (lóe sáng, tia sáng): trôi nhẹ quanh vị trí đã đặt; kéo được trên preview */
function source(env: RenderEnv, p: LightProps): { x: number; y: number } {
  const { W, H, S, t } = env
  const x = p.x * W + (noise1(t * 0.07 * p.speed, 31) - 0.5) * W * 0.02
  const y = p.y * H + (noise1(t * 0.06 * p.speed, 32) - 0.5) * H * 0.02
  const box = 140 * S
  recordBounds(env, p.x * W - box / 2, p.y * H - box / 2, box, box)
  return { x, y }
}

/** Rò sáng: ba vệt sáng lớn, mềm trôi chậm quanh mép khung hình (như phim bị lọt sáng) */
function drawLeak(env: RenderEnv, p: LightProps, gain: number): void {
  const { ctx, W, H, t } = env
  for (let i = 0; i < 3; i++) {
    const u = t * 0.05 * p.speed + i * 1.7
    const cx = W * (0.5 + 0.55 * Math.sin(u * 1.3 + i * 2.1))
    const cy = H * (0.5 + 0.45 * Math.cos(u * 0.9 + i * 1.3))
    const R = Math.max(W, H) * (0.42 + 0.2 * noise1(u * 0.7, 30 + i)) * p.size
    const color = i === 0 ? p.color : i === 1 ? p.color2 : mixColor(p.color, p.color2, 0.5)
    const a = clamp(gain * (0.45 + 0.4 * noise1(t * 0.25 * p.speed + i * 3.3, 40)))
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
    g.addColorStop(0, withAlpha(color, a))
    g.addColorStop(0.5, withAlpha(color, a * 0.45))
    g.addColorStop(1, withAlpha(color, 0))
    ctx.fillStyle = g
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2)
  }
}

/** Lóe sáng ống kính: quầng sáng, vệt ngang, tia sao và các "bóng ma" tròn dọc đường qua tâm khung hình */
function drawFlare(env: RenderEnv, p: LightProps, gain: number): void {
  const { ctx, W, H, t } = env
  const { x: sx, y: sy } = source(env, p)
  const L = Math.min(W, H) * p.size
  const k = clamp(gain)
  // Quầng sáng
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, L * 0.4)
  glow.addColorStop(0, withAlpha('#ffffff', k))
  glow.addColorStop(0.12, withAlpha(p.color, k * 0.6))
  glow.addColorStop(1, withAlpha(p.color, 0))
  ctx.fillStyle = glow
  ctx.fillRect(sx - L * 0.4, sy - L * 0.4, L * 0.8, L * 0.8)
  // Vệt ngang (ống kính anamorphic)
  ctx.save()
  ctx.translate(sx, sy)
  ctx.scale(1, 0.03)
  const streak = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.55 * p.size)
  streak.addColorStop(0, withAlpha('#ffffff', k * 0.9))
  streak.addColorStop(0.3, withAlpha(p.color2, k * 0.45))
  streak.addColorStop(1, withAlpha(p.color2, 0))
  ctx.fillStyle = streak
  ctx.fillRect(-W * 0.6 * p.size, -W * 0.6 * p.size, W * 1.2 * p.size, W * 1.2 * p.size)
  ctx.restore()
  // Tia sao
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + t * 0.05 * p.speed
    const len = L * 0.28 * (0.6 + 0.4 * hash01(i, 33))
    const wd = L * 0.004
    const g = ctx.createLinearGradient(sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len)
    g.addColorStop(0, withAlpha('#ffffff', k * 0.7))
    g.addColorStop(1, withAlpha('#ffffff', 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(sx + Math.cos(a + Math.PI / 2) * wd, sy + Math.sin(a + Math.PI / 2) * wd)
    ctx.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len)
    ctx.lineTo(sx + Math.cos(a - Math.PI / 2) * wd, sy + Math.sin(a - Math.PI / 2) * wd)
    ctx.closePath()
    ctx.fill()
  }
  // Bóng ma: đối xứng với nguồn sáng qua tâm khung hình
  const cx = W / 2
  const cy = H / 2
  const ghosts: Array<[number, number, string, number]> = [
    [0.35, 0.03, p.color2, 0.22],
    [0.7, 0.07, p.color, 0.14],
    [1.15, 0.02, '#ffffff', 0.25],
    [1.5, 0.11, p.color2, 0.1],
    [1.9, 0.05, p.color, 0.18]
  ]
  for (const [f, r, color, a] of ghosts) {
    const gx = sx + (cx - sx) * f
    const gy = sy + (cy - sy) * f
    const R = L * r
    const g = ctx.createRadialGradient(gx, gy, R * 0.2, gx, gy, R)
    g.addColorStop(0, withAlpha(color, k * a * 0.4))
    g.addColorStop(0.75, withAlpha(color, k * a))
    g.addColorStop(1, withAlpha(color, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(gx, gy, R, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Tia sáng: các tia mềm toả ra từ nguồn sáng về phía giữa khung hình, sáng tối lung linh */
function drawRays(env: RenderEnv, p: LightProps, gain: number): void {
  const { ctx, W, H, t } = env
  const { x: sx, y: sy } = source(env, p)
  const len = Math.hypot(W, H) * 1.1 * p.size
  const a0 = Math.atan2(H / 2 - sy, W / 2 - sx)
  const N = 20
  for (let i = 0; i < N; i++) {
    const a = a0 + (hash01(i, 61) - 0.5) * 1.3 + Math.sin(t * 0.07 * p.speed + i) * 0.04
    const w = 0.012 + 0.05 * hash01(i, 62)
    const al = clamp(gain * (0.08 + 0.2 * noise1(t * 0.35 * p.speed + i * 2.1, 63)))
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, len)
    g.addColorStop(0, withAlpha(p.color, al))
    g.addColorStop(0.55, withAlpha(p.color2, al * 0.4))
    g.addColorStop(1, withAlpha(p.color2, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(sx + Math.cos(a - w) * len, sy + Math.sin(a - w) * len)
    ctx.lineTo(sx + Math.cos(a + w) * len, sy + Math.sin(a + w) * len)
    ctx.closePath()
    ctx.fill()
  }
  const R = Math.min(W, H) * 0.18 * p.size
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, R)
  glow.addColorStop(0, withAlpha('#ffffff', clamp(gain * 0.8)))
  glow.addColorStop(1, withAlpha(p.color, 0))
  ctx.fillStyle = glow
  ctx.fillRect(sx - R, sy - R, R * 2, R * 2)
}

const RAINBOW = ['#ff3b3b', '#ff9f1c', '#ffe14d', '#3ddc84', '#3bb2ff', '#7a5cff', '#d94dff']

/** Cầu vồng lăng kính: dải cầu vồng chéo, mờ, trôi chậm ngang khung hình */
function drawPrism(env: RenderEnv, p: LightProps, gain: number): void {
  const { ctx, W, H, t } = env
  const diag = Math.hypot(W, H)
  const bw = W * 0.16 * p.size
  ctx.save()
  ctx.translate(W / 2, H / 2)
  ctx.rotate(-0.6)
  for (const [phase, k] of [
    [0, 1],
    [0.55, 0.5]
  ]) {
    const off = ((((t * 0.04 * p.speed + phase) % 1.4) + 1.4) % 1.4 - 0.7) * diag
    const g = ctx.createLinearGradient(off - bw, 0, off + bw, 0)
    RAINBOW.forEach((c, i) => {
      const u = i / (RAINBOW.length - 1)
      // Mép dải mờ dần
      const edge = Math.sin(u * Math.PI)
      g.addColorStop(u, withAlpha(c, clamp(gain * 0.38 * k * edge)))
    })
    ctx.fillStyle = g
    ctx.fillRect(off - bw, -diag / 2, bw * 2, diag)
  }
  ctx.restore()
}
