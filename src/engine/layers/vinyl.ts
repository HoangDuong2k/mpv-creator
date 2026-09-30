// Đĩa than xoay: rãnh đĩa có ánh bóng, nhãn giữa là ảnh bìa bài đang phát (hoặc nhãn in tên bài),
// cần đọc đĩa chạy dần vào trong theo tiến độ bài. Đổi bài: đĩa chậm lại tới dừng, cần đọc về
// rãnh ngoài, nhãn đổi sang bài mới rồi đĩa quay tiếp. Góc quay là tích phân của tốc độ nên chỉ
// phụ thuộc thời điểm t (tua, xuất song song vẫn khớp).
import { cssFont } from '../../shared/fonts'
import type { Timeline } from '../../shared/timeline'
import type { VinylProps } from '../../shared/types'
import { cached, recordBounds, type OffscreenSurface, type RenderEnv } from '../env'
import { clamp, easeInOutCubic, hash01, lerp, sourceSize } from '../util'
import { bassPulse } from './background'

/** Nửa khoảng thời gian đĩa chậm lại quanh ranh giới hai bài (giây) */
export const VINYL_SLOW = 0.9

/**
 * Thời gian quay "bị mất" tới thời điểm t do đĩa chậm lại quanh các ranh giới bài (tăng dần).
 * Tốc độ quanh ranh giới b: 1 − (1 + cos(π·u/d)) / 2 với u = t − b, |u| < d (dừng hẳn tại b).
 */
export function vinylLoss(boundaries: number[], t: number, d = VINYL_SLOW): number {
  let loss = 0
  for (const b of boundaries) {
    const u = t - b
    if (u <= -d) break
    if (u >= d) {
      loss += d
      continue
    }
    loss += 0.5 * (u + d + (d / Math.PI) * Math.sin((Math.PI * u) / d))
  }
  return loss
}

/** Góc quay (radian) của đĩa tại t */
export function vinylAngle(p: Pick<VinylProps, 'rpm' | 'slowOnChange'>, boundaries: number[], t: number): number {
  const omega = (Math.max(0, p.rpm) / 60) * Math.PI * 2
  return omega * (t - (p.slowOnChange ? vinylLoss(boundaries, t) : 0))
}

const boundaryCache = new WeakMap<Timeline, number[]>()

/** Các mốc đổi bài (tăng dần) */
function boundariesOf(tl: Timeline): number[] {
  let b = boundaryCache.get(tl)
  if (!b) {
    b = tl.entries.slice(1).map((e) => e.displayStart)
    boundaryCache.set(tl, b)
  }
  return b
}

/** Mặt đĩa (nền, rãnh, ánh bóng) không đổi theo thời gian: vẽ sẵn một lần */
function discSurface(env: RenderEnv, p: VinylProps, D: number): OffscreenSurface {
  const size = Math.max(8, Math.round(D))
  const key = `vinyl-disc|${size}|${p.discColor}|${p.sheen}|${p.labelSize}`
  return cached(env, key, () => {
    const s = env.assets.createSurface(size, size)
    const c = s.ctx
    const R = size / 2
    const labelR = R * clamp(p.labelSize, 0.15, 0.7)
    c.fillStyle = p.discColor
    c.beginPath()
    c.arc(R, R, R, 0, Math.PI * 2)
    c.fill()
    // Rãnh đĩa: nhiều vòng tròn mảnh, sáng tối xen kẽ ngẫu nhiên nhẹ
    c.lineWidth = Math.max(0.5, size * 0.0011)
    for (let r = labelR * 1.12, i = 0; r < R * 0.975; r += size * 0.0042, i++) {
      c.strokeStyle = `rgba(255,255,255,${0.02 + 0.035 * hash01(i, 17)})`
      c.beginPath()
      c.arc(R, R, r, 0, Math.PI * 2)
      c.stroke()
    }
    // Khoảng trống giữa các bài trên mặt đĩa
    c.lineWidth = size * 0.006
    c.strokeStyle = 'rgba(0,0,0,0.6)'
    for (const k of [0.34, 0.58, 0.8]) {
      c.beginPath()
      c.arc(R, R, labelR * 1.12 + (R * 0.975 - labelR * 1.12) * k, 0, Math.PI * 2)
      c.stroke()
    }
    // Mép ngoài
    c.lineWidth = size * 0.004
    c.strokeStyle = 'rgba(255,255,255,0.12)'
    c.beginPath()
    c.arc(R, R, R - c.lineWidth / 2, 0, Math.PI * 2)
    c.stroke()
    // Ánh bóng: hai dải sáng đối xứng, không xoay theo đĩa (như ánh đèn phản chiếu thật)
    if (p.sheen > 0) {
      for (const center of [-0.95, Math.PI - 0.95]) {
        for (let i = -24; i <= 24; i++) {
          const a = center + i * 0.02
          const w = Math.cos((i / 24) * (Math.PI / 2)) ** 2
          c.fillStyle = `rgba(255,255,255,${0.11 * clamp(p.sheen) * w})`
          c.beginPath()
          c.arc(R, R, R * 0.97, a, a + 0.021)
          c.arc(R, R, labelR * 1.1, a + 0.021, a, true)
          c.closePath()
          c.fill()
        }
      }
    }
    return s
  })
}

/** Nhãn in chữ: nền màu, tên bài và ca sĩ (xoay cùng đĩa) */
function drawTextLabel(ctx: CanvasRenderingContext2D, r: number, color: string, title: string, artist: string): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = r * 0.02
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#fff6e6'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const fit = (text: string, size: number, bold: boolean, y: number): void => {
    let s = size
    ctx.font = cssFont('Be Vietnam Pro', s, bold)
    const w = ctx.measureText(text).width
    if (w > r * 1.4) {
      s = (s * r * 1.4) / w
      ctx.font = cssFont('Be Vietnam Pro', s, bold)
    }
    ctx.fillText(text, 0, y)
  }
  if (title) fit(title, r * 0.2, true, -r * 0.38)
  if (artist) fit(artist, r * 0.14, false, r * 0.4)
}

export function drawVinyl(env: RenderEnv, p: VinylProps): void {
  const { ctx, W, H, S, t } = env
  const D = Math.max(8, p.size * H)
  const R = D / 2
  const cx = p.x * W
  const cy = p.y * H
  const labelR = R * clamp(p.labelSize, 0.15, 0.7)
  const armReach = p.tonearm ? R * 0.42 : 0
  recordBounds(env, cx - R, cy - R - (p.tonearm ? R * 0.12 : 0), D + armReach, D + (p.tonearm ? R * 0.12 : 0))

  const A = clamp(p.opacity) * env.fade
  ctx.globalAlpha = A
  if (p.beatScale > 0) {
    const k = 1 + p.beatScale * bassPulse(env)
    ctx.translate(cx, cy)
    ctx.scale(k, k)
    ctx.translate(-cx, -cy)
  }

  // Mặt đĩa + bóng đổ
  const disc = discSurface(env, p, D)
  if (p.shadow > 0) {
    ctx.shadowColor = `rgba(0,0,0,${0.55 * clamp(p.shadow)})`
    ctx.shadowBlur = D * 0.05 * env.px
    ctx.shadowOffsetY = D * 0.018 * env.px
  }
  ctx.drawImage(disc.canvas, cx - R, cy - R, D, D)
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  // Nhãn giữa xoay cùng đĩa
  const boundaries = boundariesOf(env.timeline)
  const angle = vinylAngle(p, boundaries, t)
  const entry = env.entry
  const path = p.label === 'cover' ? entry?.track.coverPath : p.label === 'custom' ? p.src : undefined
  const img = path ? env.assets.image(path) : null
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.arc(0, 0, labelR, 0, Math.PI * 2)
  ctx.clip()
  if (img) {
    const { width: iw, height: ih } = sourceSize(img)
    const k = (labelR * 2) / Math.max(1, Math.min(iw, ih))
    ctx.drawImage(img, (-iw * k) / 2, (-ih * k) / 2, iw * k, ih * k)
  } else drawTextLabel(ctx, labelR, p.labelColor, entry?.track.title ?? '', entry?.track.artist ?? '')
  // Vệt sáng nhỏ trên mép nhãn: thấy rõ đĩa đang quay kể cả khi ảnh bìa một màu
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = labelR * 0.03
  ctx.beginPath()
  ctx.arc(0, 0, labelR * 0.93, -0.35, 0.35)
  ctx.stroke()
  ctx.restore()
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'
  ctx.lineWidth = Math.max(1, labelR * 0.03)
  ctx.beginPath()
  ctx.arc(cx, cy, labelR, 0, Math.PI * 2)
  ctx.stroke()
  // Lỗ giữa
  ctx.fillStyle = '#0a0a0a'
  ctx.beginPath()
  ctx.arc(cx, cy, D * 0.013, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.beginPath()
  ctx.arc(cx - D * 0.004, cy - D * 0.004, D * 0.004, 0, Math.PI * 2)
  ctx.fill()

  if (p.tonearm) drawTonearm(env, p, cx, cy, R, labelR, boundaries)
}

/** Vị trí đầu kim: bán kính trên mặt đĩa theo tiến độ bài; quanh lúc đổi bài thì lùi về rãnh ngoài */
function stylusRadius(env: RenderEnv, R: number, labelR: number, boundaries: number[]): number {
  const outer = R * 0.93
  const inner = labelR * 1.2
  const e = env.entry
  if (!e) return outer
  const progress = e.length > 0 ? clamp((env.t - e.start) / e.length) : 0
  let r = lerp(outer, inner, progress)
  for (const b of boundaries) {
    const u = env.t - b
    if (Math.abs(u) < VINYL_SLOW) {
      // Đang đổi bài: từ rãnh trong (cuối bài cũ) về rãnh ngoài (đầu bài mới)
      r = lerp(inner, outer, easeInOutCubic((u + VINYL_SLOW) / (2 * VINYL_SLOW)))
      break
    }
  }
  return r
}

function drawTonearm(env: RenderEnv, p: VinylProps, cx: number, cy: number, R: number, labelR: number, boundaries: number[]): void {
  const { ctx } = env
  // Trục cần đọc ở góc trên bên phải đĩa
  const px = cx + R * 1.12
  const py = cy - R * 0.78
  const L = R * 1.58
  const rs = stylusRadius(env, R, labelR, boundaries)
  // Đầu kim: giao điểm của vòng bán kính L quanh trục và vòng bán kính rs quanh tâm đĩa
  const dx = cx - px
  const dy = cy - py
  const d = Math.hypot(dx, dy)
  const a = (L * L - rs * rs + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, L * L - a * a))
  const mx = px + (a * dx) / d
  const my = py + (a * dy) / d
  // Giao điểm phía dưới bên phải: như mâm đĩa thật, cần từ trục góc trên thả xuống mặt đĩa bên phải
  const sx = mx + (h * dy) / d
  const sy = my - (h * dx) / d
  const ang = Math.atan2(sy - py, sx - px)
  const thick = R * 0.035

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = R * 0.04 * env.px
  ctx.shadowOffsetY = R * 0.02 * env.px
  // Đối trọng phía sau trục
  ctx.fillStyle = '#6f6f6f'
  ctx.beginPath()
  ctx.arc(px - Math.cos(ang) * R * 0.2, py - Math.sin(ang) * R * 0.2, R * 0.075, 0, Math.PI * 2)
  ctx.fill()
  // Thân cần
  ctx.strokeStyle = '#cfcfcf'
  ctx.lineCap = 'round'
  ctx.lineWidth = thick
  ctx.beginPath()
  ctx.moveTo(px - Math.cos(ang) * R * 0.2, py - Math.sin(ang) * R * 0.2)
  ctx.lineTo(sx - Math.cos(ang) * R * 0.1, sy - Math.sin(ang) * R * 0.1)
  ctx.stroke()
  // Đầu đọc (headshell) nghiêng nhẹ theo cần
  ctx.translate(sx, sy)
  ctx.rotate(ang + 0.35)
  ctx.fillStyle = '#e8e8e8'
  ctx.beginPath()
  ctx.roundRect(-R * 0.13, -R * 0.045, R * 0.17, R * 0.09, R * 0.015)
  ctx.fill()
  ctx.fillStyle = '#2a2a2a'
  ctx.fillRect(-R * 0.03, -R * 0.035, R * 0.05, R * 0.07)
  ctx.restore()
  // Trục xoay (đế kim loại)
  const g = ctx.createRadialGradient(px - R * 0.03, py - R * 0.03, R * 0.01, px, py, R * 0.12)
  g.addColorStop(0, '#f2f2f2')
  g.addColorStop(1, '#6a6a6a')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(px, py, R * 0.11, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3a3a3a'
  ctx.beginPath()
  ctx.arc(px, py, R * 0.04, 0, Math.PI * 2)
  ctx.fill()
}
