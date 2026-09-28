import type { Timeline } from './timeline'

/** 75.4 → "1:15", 3725 → "1:02:05". withHours ép hiển thị giờ. */
export function formatTime(seconds: number, withHours = false): string {
  const s = Math.max(0, Math.floor(seconds + 1e-6))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const ss = String(sec).padStart(2, '0')
  if (h > 0 || withHours) return `${h}:${String(m).padStart(2, '0')}:${ss}`
  return `${m}:${ss}`
}

/** Như formatTime nhưng giữ 1 chữ số lẻ khi cần: 62.5 → "1:02.5", 60 → "1:00" */
export function formatTimePrecise(seconds: number, withHours = false): string {
  const tenths = Math.round(Math.max(0, seconds) * 10)
  const whole = Math.floor(tenths / 10)
  const frac = tenths % 10
  return formatTime(whole, withHours) + (frac ? `.${frac}` : '')
}

/** "1:30" → 90, "1:02:05" → 3725, "45" → 45. Trả về NaN nếu sai định dạng. */
export function parseTime(text: string): number {
  const parts = text.trim().split(':').map((p) => p.trim())
  if (parts.length === 0 || parts.length > 3 || parts.some((p) => p === '' || !/^\d+(\.\d+)?$/.test(p))) return NaN
  return parts.reduce((acc, p) => acc * 60 + parseFloat(p), 0)
}

export function parseTimeList(text: string): number[] {
  return text
    .split(/[,;\n]+/)
    .map(parseTime)
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b)
}

export interface ChapterOptions {
  /** Mẫu mỗi dòng: {time} {title} {artist} {index} */
  template: string
}

/**
 * Sinh danh sách timestamp để dán vào mô tả YouTube.
 * YouTube yêu cầu dòng đầu là 0:00; nếu video dài từ 1 giờ thì dùng định dạng h:mm:ss cho mọi dòng.
 */
export function buildChapters(tl: Timeline, opts: ChapterOptions = { template: '{time} {title}{ - artist}' }): string {
  const withHours = tl.total >= 3600
  return tl.entries
    .map((e, i) => {
      const t = i === 0 ? 0 : e.displayStart
      return opts.template
        .replace('{time}', formatTime(t, withHours))
        .replace('{index}', String(i + 1).padStart(2, '0'))
        .replace('{title}', e.track.title || `Track ${i + 1}`)
        .replace('{ - artist}', e.track.artist ? ` - ${e.track.artist}` : '')
        .replace('{artist}', e.track.artist)
    })
    .join('\n')
}
