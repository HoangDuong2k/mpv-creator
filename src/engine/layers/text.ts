import { cssFont } from '../../shared/fonts'
import { formatTime } from '../../shared/time'
import { FEATURE_RATE, OFF_RMS } from '../../shared/featureFormat'
import type { ProgressProps, TextProps, Track } from '../../shared/types'
import { cached, recordBounds, type RenderEnv } from '../env'
import { clamp, easeOutCubic, hash01, noise1 } from '../util'
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
  ctx.textAlign = p.align
  ctx.textBaseline = 'middle'
  if (p.beatScale > 0) {
    const s = 1 + p.beatScale * bassPulse(env)
    ctx.translate(x, y)
    ctx.scale(s, s)
    ctx.translate(-x, -y)
  }
  const paint = (a: number, glowK: number): void => {
    ctx.globalAlpha = a
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0
    if (p.strokeWidth > 0) {
      ctx.lineJoin = 'round'
      ctx.lineWidth = p.strokeWidth * S * 2
      ctx.strokeStyle = p.strokeColor
      ctx.strokeText(text, x, y)
    }
    if (p.shadowBlur > 0 && glowK > 0.01) {
      ctx.shadowColor = p.shadowColor
      ctx.shadowBlur = p.shadowBlur * S * env.px * glowK
      ctx.shadowOffsetY = 2 * S * env.px
    }
    ctx.fillStyle = p.color
    ctx.fillText(text, x, y)
  }
  if (p.flicker <= 0.001) {
    paint(alpha, 1)
    return
  }
  // Neon chập chờn: cả chữ tắt / chớp thất thường, có lúc một đoạn chữ hỏng tối hẳn
  const f = neonFlicker(t, p.flicker, seedOf(env.layerId))
  if (!f.slice) {
    paint(alpha * f.k, f.k)
    return
  }
  const bx = boxX - size
  const bw = boxW + size * 2
  const sx = boxX + boxW * f.slice.from
  const sw = boxW * f.slice.width
  const top = y - size * 1.5
  const tall = size * 3
  ctx.save()
  ctx.beginPath()
  ctx.rect(bx, top, sx - bx, tall)
  ctx.rect(sx + sw, top, bx + bw - sx - sw, tall)
  ctx.clip()
  paint(alpha * f.k, f.k)
  ctx.restore()
  ctx.save()
  ctx.beginPath()
  ctx.rect(sx, top, sw, tall)
  ctx.clip()
  paint(alpha * f.k * f.slice.k, f.k * f.slice.k)
  ctx.restore()
}

/** Số hạt giống cố định theo id lớp: mỗi chữ neon chập chờn một kiểu */
function seedOf(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h % 9973)
}

/**
 * Đèn neon: rung nhẹ liên tục, thỉnh thoảng tắt / chớp vài lần (cụm 1..3 ô 1/12 giây),
 * và có những quãng 4 giây một đoạn chữ bị "hỏng" (gần như tắt, lâu lâu loé sáng).
 * `amount` 0..1: càng lớn càng hay chập chờn.
 */
export function neonFlicker(t: number, amount: number, seed: number): { k: number; slice: { from: number; width: number; k: number } | null } {
  const a = clamp(amount)
  let k = 1 - 0.07 * a * noise1(t * 9, seed)
  const slot = Math.floor(t * 12)
  for (let back = 0; back < 3; back++) {
    const s = slot - back
    if (hash01(s, seed) < a * 0.07) {
      const len = 1 + Math.floor(hash01(s, seed + 1) * 3)
      if (back < len) k *= hash01(slot, seed + 2) < 0.55 ? 0.1 : 0.5
      break
    }
  }
  const win = Math.floor(t / 4)
  const broken = hash01(win, seed + 3) < a * 0.55
  const slice = broken ? { from: 0.12 + hash01(win, seed + 4) * 0.62, width: 0.07 + 0.08 * hash01(win, seed + 5), k: hash01(slot, seed + 6) < 0.75 ? 0.12 : 1 } : null
  return { k: clamp(k), slice }
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
  let below: number
  if (p.style === 'wave') {
    // Thanh tiến trình vẽ bằng sóng âm: phần đã phát đậm màu, phần chưa phát nhạt
    const halfH = Math.max(2 * S, (p.waveHeight * S) / 2)
    recordBounds(env, x0, y - halfH, w, halfH * 2 + textH)
    const barW = Math.max(1, 3 * S)
    const count = Math.max(16, Math.min(400, Math.round(w / (barW * 2))))
    const env01 = p.scope === 'track' && env.entry ? trackEnvelope(env, env.entry.track, env.entry.length, count) : mixEnvelope(env, count)
    const r = barW / 2
    // Hai lượt tô: phần chưa phát rồi phần đã phát (không dùng Path2D: khi xuất video chạy trong Node)
    for (const donePart of [false, true]) {
      ctx.fillStyle = donePart ? p.color : p.trackColor
      ctx.beginPath()
      for (let i = 0; i < count; i++) {
        if ((i + 0.5) / count <= frac !== donePart) continue
        const h = Math.max(barW, env01[i] * halfH * 2)
        ctx.roundRect(x0 + ((i + 0.5) * w) / count - barW / 2, y - h / 2, barW, h, r)
      }
      ctx.fill()
    }
    if (p.showDot) {
      ctx.fillStyle = p.color
      ctx.fillRect(x0 + w * frac - Math.max(1, S), y - halfH * 1.1, Math.max(2, 2 * S), halfH * 2.2)
    }
    below = halfH * 1.1 + 8 * S
  } else {
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
    below = th * 1.6 + 8 * S
  }
  if (p.showTime) {
    const withHours = total >= 3600
    ctx.font = cssFont('Be Vietnam Pro', p.fontSize * S, false)
    ctx.fillStyle = p.textColor
    ctx.textBaseline = 'top'
    const ty = y + below
    ctx.textAlign = 'left'
    ctx.fillText(formatTime(elapsed, withHours), x0, ty)
    ctx.textAlign = 'right'
    ctx.fillText(formatTime(total, withHours), x0 + w, ty)
  }
}

/** Tăng tương phản cho sóng âm: mức lưu theo thang 40 dB nên đoạn nhỏ tiếng vẫn khá cao */
const shapeLevel = (v: number): number => Math.pow(clamp((v - 0.3) / 0.7), 1.3)

/** Độ lớn âm thanh của một bài chia thành `count` cột (đỉnh RMS mỗi đoạn), có cache */
function trackEnvelope(env: RenderEnv, track: Track, length: number, count: number): Float32Array {
  const f = env.audio.features(track.analysisKey)
  const key = `wave-env|${track.analysisKey}|${track.trimStart}|${length}|${count}`
  if (!f) return new Float32Array(count)
  return cached(env, key, () => {
    const out = new Float32Array(count)
    const from = Math.round((track.trimStart || 0) * FEATURE_RATE)
    const frames = Math.max(1, Math.round(length * FEATURE_RATE))
    for (let i = 0; i < count; i++) {
      const a = from + Math.floor((i * frames) / count)
      const b = from + Math.max(Math.floor(((i + 1) * frames) / count), Math.floor((i * frames) / count) + 1)
      let m = 0
      for (let g = a; g < Math.min(b, f.frames); g++) m = Math.max(m, f.data[g * f.header.stride + OFF_RMS] / 255)
      out[i] = shapeLevel(m)
    }
    return out
  })
}

/** Sóng âm của cả video (mọi bài nối tiếp), có cache theo danh sách bài */
function mixEnvelope(env: RenderEnv, count: number): Float32Array {
  const tl = env.timeline
  const sig = tl.entries.map((e) => `${e.track.analysisKey}@${Math.round(e.start * 10)}`).join(',')
  return cached(env, `wave-mix|${count}|${Math.round(tl.total * 10)}|${sig}`, () => {
    const out = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      let m = 0
      for (let j = 0; j < 4; j++) {
        const t = ((i + (j + 0.5) / 4) / count) * tl.total
        const e = tl.entries.find((x) => t >= x.start && t < x.end)
        const f = e ? env.audio.features(e.track.analysisKey) : undefined
        if (!e || !f) continue
        const g = Math.round((t - e.start + (e.track.trimStart || 0)) * FEATURE_RATE)
        if (g >= 0 && g < f.frames) m = Math.max(m, f.data[g * f.header.stride + OFF_RMS] / 255)
      }
      out[i] = shapeLevel(m)
    }
    return out
  })
}
