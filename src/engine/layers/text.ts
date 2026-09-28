import { cssFont } from '../../shared/fonts'
import { formatTime } from '../../shared/time'
import type { ProgressProps, TextProps } from '../../shared/types'
import { recordBounds, type RenderEnv } from '../env'
import { clamp, easeOutCubic } from '../util'
import { bassPulse } from './background'
import { tr, trKey } from '../../shared/i18n'

const TRACK_TOKENS = /\{(title|artist|album|index|count|next|nextArtist|elapsed|duration|remaining)\}/

export function isTrackDependent(template: string): boolean {
  return TRACK_TOKENS.test(template)
}

/** Thay các biến {title}, {artist}, ... bằng thông tin bài đang phát */
export function fillTemplate(env: RenderEnv, template: string): string {
  const e = env.entry
  const entries = env.timeline.entries
  const next = e ? entries[e.index + 1] : undefined
  const elapsed = e ? Math.max(0, env.t - e.start) : env.t
  const vars: Record<string, string> = {
    title: e?.track.title ?? '',
    artist: e?.track.artist ?? '',
    album: e?.track.album ?? '',
    index: e ? String(e.index + 1) : '',
    count: String(entries.length),
    next: next?.track.title ?? '',
    nextArtist: next?.track.artist ?? '',
    elapsed: formatTime(elapsed),
    duration: e ? formatTime(e.length) : '',
    remaining: e ? formatTime(Math.max(0, e.end - env.t)) : '',
    playlist: env.project.name
  }
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m))
}

const FADE = 0.8

export function drawText(env: RenderEnv, p: TextProps): void {
  const { ctx, W, H, S, t } = env
  const editing = env.editLayerId === env.layerId
  let text = fillTemplate(env, p.template)
  // Chưa có bài hát: hiện chữ mẫu cho layer đang chỉnh để vẫn canh được vị trí
  if (!text.trim() && editing) text = p.template.replace(/\{(\w+)\}/g, (_m, k: string) => (SAMPLE[k] !== undefined ? tr(SAMPLE[k]) : k))
  if (p.uppercase) text = text.toLocaleUpperCase('vi')
  if (!text.trim()) return

  let size = p.size * S
  ctx.font = cssFont(p.font, size, p.bold)
  const maxW = p.maxWidth * W
  const fullWidth = ctx.measureText(text).width
  if (maxW > 0 && fullWidth > maxW) {
    size = (size * maxW) / fullWidth
    ctx.font = cssFont(p.font, size, p.bold)
  }
  const x = p.x * W
  const boxW = Math.min(fullWidth, maxW > 0 ? maxW : fullWidth)
  const boxX = p.align === 'left' ? x : p.align === 'right' ? x - boxW : x - boxW / 2
  recordBounds(env, boxX, p.y * H - size * 0.65, boxW, size * 1.3)

  let alpha = clamp(p.opacity) * env.fade
  let offsetY = 0
  if (p.animation !== 'none' && isTrackDependent(p.template) && env.entry) {
    const e = env.entry
    const sinceStart = t - e.displayStart
    const untilEnd = e.displayEnd - t
    // Bài đầu tiên hiện chữ ngay từ giây 0
    const inK = e.index === 0 ? 1 : clamp(sinceStart / FADE)
    const outK = clamp(untilEnd / FADE)
    const k = Math.min(inK, outK)
    alpha *= easeOutCubic(k)
    if (p.animation === 'slide') offsetY = (1 - easeOutCubic(k)) * 40 * S
    if (p.animation === 'typewriter') {
      const chars = Math.floor(Math.max(0, sinceStart) * 28)
      text = Array.from(text).slice(0, chars).join('')
      alpha = clamp(p.opacity) * env.fade * easeOutCubic(outK)
    }
  }
  if (alpha <= 0.001 || !text) return

  const y = p.y * H + offsetY
  ctx.globalAlpha = alpha
  ctx.textAlign = p.align
  ctx.textBaseline = 'middle'
  if (p.beatScale > 0) {
    const s = 1 + p.beatScale * bassPulse(env)
    ctx.translate(x, y)
    ctx.scale(s, s)
    ctx.translate(-x, -y)
  }
  if (p.strokeWidth > 0) {
    ctx.lineJoin = 'round'
    ctx.lineWidth = p.strokeWidth * S * 2
    ctx.strokeStyle = p.strokeColor
    ctx.strokeText(text, x, y)
  }
  if (p.shadowBlur > 0) {
    ctx.shadowColor = p.shadowColor
    ctx.shadowBlur = p.shadowBlur * S * env.px
    ctx.shadowOffsetY = 2 * S * env.px
  }
  ctx.fillStyle = p.color
  ctx.fillText(text, x, y)
}

const SAMPLE: Record<string, string> = {
  title: trKey('Tên bài hát'),
  artist: trKey('Ca sĩ'),
  album: 'Album',
  index: '1',
  count: '10',
  next: trKey('Bài kế tiếp'),
  nextArtist: trKey('Ca sĩ'),
  elapsed: '1:23',
  duration: '3:45',
  remaining: '2:22',
  playlist: 'Playlist'
}

export function drawProgress(env: RenderEnv, p: ProgressProps): void {
  const { ctx, W, H, S, t } = env
  let elapsed: number
  let total: number
  if (p.scope === 'track' && env.entry) {
    elapsed = clamp(t - env.entry.start, 0, env.entry.length)
    total = env.entry.length
  } else {
    total = env.timeline.total
    elapsed = clamp(t, 0, total)
  }
  const frac = total > 0 ? elapsed / total : 0
  const w = p.width * W
  const x0 = p.x * W - w / 2
  const y = p.y * H
  const th = Math.max(1, p.thickness * S)
  const textH = p.showTime ? 8 * S + p.fontSize * S * 1.2 : 0
  recordBounds(env, x0 - th * 1.6, y - th * 1.6, w + th * 3.2, th * 3.2 + textH)
  ctx.lineCap = 'round'
  ctx.lineWidth = th
  ctx.strokeStyle = p.trackColor
  ctx.beginPath()
  ctx.moveTo(x0, y)
  ctx.lineTo(x0 + w, y)
  ctx.stroke()
  ctx.strokeStyle = p.color
  ctx.beginPath()
  ctx.moveTo(x0, y)
  ctx.lineTo(x0 + Math.max(0.5, w * frac), y)
  ctx.stroke()
  if (p.showDot) {
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(x0 + w * frac, y, th * 1.6, 0, Math.PI * 2)
    ctx.fill()
  }
  if (p.showTime) {
    const withHours = total >= 3600
    ctx.font = cssFont('Be Vietnam Pro', p.fontSize * S, false)
    ctx.fillStyle = p.textColor
    ctx.textBaseline = 'top'
    const ty = y + th * 1.6 + 8 * S
    ctx.textAlign = 'left'
    ctx.fillText(formatTime(elapsed, withHours), x0, ty)
    ctx.textAlign = 'right'
    ctx.fillText(formatTime(total, withHours), x0 + w, ty)
  }
}
