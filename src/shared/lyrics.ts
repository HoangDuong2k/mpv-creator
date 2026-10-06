/**
 * Lời bài hát: đọc / ghi LRC, tìm dòng đang hát, chia thời gian cho từng từ.
 * Mọi mốc thời gian tính theo file nhạc gốc (chưa cắt đầu); lệch cả bài (offset) cộng vào lúc hiển thị.
 */
import type { LyricLine, LyricWord, LyricsSource, TrackLyrics } from './types'
import { normalizeWord, type AlignedLine } from './lyricsAlign'

/** Dòng không có dòng sau (dòng cuối, hoặc trước đoạn nhạc dạo dài): hiện tối đa ngần này giây */
export const LAST_LINE_HOLD = 6

const TIME_TAG = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g
const WORD_TAG = /<(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)>/g
const META_TAG = /^\[([a-z#]+):(.*)\]\s*$/i

function tagSeconds(min: string, sec: string): number {
  return Number(min) * 60 + Number(sec.replace(':', '.'))
}

/** Có phải nội dung LRC không (ít nhất một dòng bắt đầu bằng [mm:ss]) */
export function looksLikeLrc(text: string): boolean {
  return /^\s*\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/m.test(text)
}

/**
 * Đọc LRC: [mm:ss.xx] đầu dòng (một dòng có thể có nhiều mốc, vd. điệp khúc lặp), thẻ [offset:±ms],
 * LRC mở rộng <mm:ss.xx> trước từng từ. Dòng chỉ có mốc mà không có chữ là điểm kết thúc dòng trước.
 */
export function parseLrc(text: string, source: LyricsSource = 'manual'): TrackLyrics {
  const lines: LyricLine[] = []
  let offset = 0
  for (const raw of text.replace(/\r/g, '').split('\n').map((l) => l.trim())) {
    const meta = META_TAG.exec(raw)
    if (meta && !/^\d/.test(meta[1])) {
      // [offset:+500]: dương = lời hiện sớm hơn (chuẩn LRC); trong app offset dương = muộn hơn
      if (meta[1].toLowerCase() === 'offset' && Number.isFinite(Number(meta[2]))) offset = -Number(meta[2]) / 1000
      continue
    }
    const times: number[] = []
    let rest = raw
    TIME_TAG.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = TIME_TAG.exec(raw)) && m.index === raw.length - rest.length) {
      times.push(tagSeconds(m[1], m[2]))
      rest = raw.slice(TIME_TAG.lastIndex)
    }
    if (times.length === 0) continue
    const { text: lineText, words } = parseWordTags(rest)
    for (const t of times) lines.push({ t, text: lineText, ...(words.length > 0 && times.length === 1 ? { words } : {}) })
  }
  lines.sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
  // Dòng rỗng = kết thúc dòng trước (giữ lại để biết đoạn nhạc dạo), bỏ dòng rỗng ở đầu
  const out: LyricLine[] = []
  for (const l of lines) {
    if (!l.text.trim()) {
      const prev = out[out.length - 1]
      if (prev && prev.t !== null && l.t !== null && l.t > prev.t) prev.end = l.t
      continue
    }
    out.push(l)
  }
  return { lines: out, offset, source }
}

function parseWordTags(rest: string): { text: string; words: LyricWord[] } {
  const words: LyricWord[] = []
  WORD_TAG.lastIndex = 0
  const parts = rest.split(WORD_TAG)
  // split với 2 nhóm bắt: [chữ trước, phút, giây, chữ, phút, giây, chữ…]
  let text = parts[0] ?? ''
  for (let i = 1; i + 2 < parts.length + 1; i += 3) {
    const t = tagSeconds(parts[i], parts[i + 1])
    const chunk = parts[i + 2] ?? ''
    text += chunk
    if (chunk.trim()) words.push({ t, text: chunk.trim() })
  }
  return { text: text.replace(/\s+/g, ' ').trim(), words }
}

/** Lời thường (không có mốc thời gian): mỗi dòng không rỗng là một dòng lời chưa đồng bộ */
export function parsePlainLyrics(text: string, source: LyricsSource = 'manual'): TrackLyrics {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .map((text) => ({ t: null, text }))
  return { lines, offset: 0, source }
}

/** Đọc lời dán vào / nhập từ file: LRC nếu có mốc thời gian, không thì lời thường */
export function parseLyricsText(text: string, source: LyricsSource = 'manual'): TrackLyrics {
  return looksLikeLrc(text) ? parseLrc(text, source) : parsePlainLyrics(text, source)
}

function stamp(t: number): string {
  const v = Math.max(0, t)
  const m = Math.floor(v / 60)
  const s = v - m * 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`
}

/** Ghi LRC (đã cộng lệch cả bài); dòng chưa đồng bộ bị bỏ qua; có thời gian từng từ thì ghi LRC mở rộng */
export function toLrc(lyrics: TrackLyrics, meta: { title?: string; artist?: string } = {}): string {
  const out: string[] = []
  if (meta.title) out.push(`[ti:${meta.title}]`)
  if (meta.artist) out.push(`[ar:${meta.artist}]`)
  const synced = lyrics.lines.filter((l): l is LyricLine & { t: number } => l.t !== null)
  synced.forEach((l, i) => {
    const o = lyrics.offset
    const words = l.words?.length ? l.words.map((w) => `<${stamp(w.t + o)}>${w.text}`).join(' ') : l.text
    out.push(`[${stamp(l.t + o)}]${words}`)
    const next = synced[i + 1]
    if (l.end !== undefined && (!next || next.t > l.end + 0.05)) out.push(`[${stamp(l.end + o)}]`)
  })
  return out.join('\n') + '\n'
}

/** Lời thường (mỗi dòng một câu) để soạn lại */
export function toPlainText(lyrics: TrackLyrics): string {
  return lyrics.lines.map((l) => l.text).join('\n')
}

export function hasSyncedLyrics(lyrics: TrackLyrics | undefined): boolean {
  return !!lyrics && lyrics.lines.some((l) => l.t !== null)
}

/** Dòng đang hiện tại thời điểm `t` của file nhạc (đã tính lệch cả bài, hiện sớm `lead` giây) */
export interface ActiveLine {
  index: number
  line: LyricLine
  /** Lúc bắt đầu, lúc hết dòng (giây theo file, đã cộng lệch) */
  start: number
  end: number
}

/** Mốc bắt đầu / kết thúc của các dòng đã đồng bộ (đã cộng lệch), theo thứ tự thời gian */
export function timedLines(lyrics: TrackLyrics, hold = LAST_LINE_HOLD): ActiveLine[] {
  const synced = lyrics.lines.map((line, index) => ({ line, index })).filter((x) => x.line.t !== null)
  synced.sort((a, b) => (a.line.t as number) - (b.line.t as number))
  return synced.map(({ line, index }, i) => {
    const start = (line.t as number) + lyrics.offset
    const next = synced[i + 1]
    const nextStart = next ? (next.line.t as number) + lyrics.offset : Infinity
    const ownEnd = line.end !== undefined ? line.end + lyrics.offset : start + hold
    return { index, line, start, end: Math.max(start + 0.2, Math.min(ownEnd, nextStart)) }
  })
}

/** Dòng hiện tại thời điểm `t` (giây theo file nhạc), hiện sớm `lead` giây; null nếu đang không có lời */
export function lineAt(lines: ActiveLine[], t: number, lead = 0): ActiveLine | null {
  let lo = 0
  let hi = lines.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].start - lead <= t) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  if (found < 0) return null
  const l = lines[found]
  return t < l.end ? l : null
}

/**
 * Thời điểm từng từ trong dòng: dùng thời gian từ nếu có (AI, LRC mở rộng), không thì chia thời gian của dòng
 * cho các từ theo số chữ cái (tiếng Việt mỗi từ một âm tiết nên gần như chia đều). Trả về mốc bắt đầu từng từ
 * (đã cộng lệch) và mốc hết từ cuối.
 */
export function wordTimings(active: ActiveLine, offset: number): { words: string[]; starts: number[]; end: number } {
  const { line, start, end } = active
  if (line.words?.length) {
    const words = line.words.map((w) => w.text)
    const starts = line.words.map((w) => w.t + offset)
    const last = starts[starts.length - 1]
    const avg = (last - starts[0]) / Math.max(1, words.length - 1) || 0.35
    return { words, starts, end: Math.min(end, last + Math.max(0.25, avg)) }
  }
  const words = line.text.split(/\s+/).filter(Boolean)
  // Hát hết dòng trước lúc dòng sau bắt đầu một chút (ngắt hơi); dòng dài không kéo quá 0,45 giây mỗi chữ cái
  const sing = Math.min((end - start) * 0.92, Math.max(0.6, line.text.length * 0.45))
  const weights = words.map((w) => Math.max(1, Array.from(w).length) + 1.5)
  const total = weights.reduce((a, b) => a + b, 0) || 1
  const starts: number[] = []
  let acc = start
  for (const w of weights) {
    starts.push(acc)
    acc += (w / total) * sing
  }
  return { words, starts, end: start + sing }
}

/** Mốc thời gian gần nhất trong `beats` (giây) trong khoảng ±`within` giây quanh `t`; không có thì giữ `t` */
export function snapToBeat(t: number, beats: number[], within = 0.12): number {
  let best = t
  let bestD = within
  for (const b of beats) {
    const d = Math.abs(b - t)
    if (d <= bestD) {
      bestD = d
      best = b
    }
  }
  return best
}

/**
 * Soạn lại lời (mỗi dòng một câu): dòng nào giữ nguyên chữ thì giữ nguyên mốc thời gian (so khớp kiểu LCS, nên
 * thêm / xoá / sửa vài dòng không làm mất mốc của các dòng khác); dòng mới hoặc đã sửa là chưa đồng bộ.
 */
export function remapLyrics(old: TrackLyrics | undefined, text: string): TrackLyrics {
  const next = parsePlainLyrics(text, old?.source ?? 'manual').lines
  if (!old) return { lines: next, offset: 0, source: 'manual' }
  const a = old.lines
  const n = a.length
  const m = next.length
  // Bảng LCS theo chữ của dòng
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i].text === next[j].text ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i].text === next[j].text) {
      next[j] = { ...a[i] }
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return { lines: next, offset: old.offset, source: old.source }
}

/** Đặt mốc bắt đầu cho dòng `index` (giây theo file nhạc, đã trừ lệch cả bài); bỏ thời gian từng từ cũ của dòng */
export function setLineTime(lyrics: TrackLyrics, index: number, t: number | null): TrackLyrics {
  const lines = lyrics.lines.map((l, i) => {
    if (i !== index) return l
    // Chỉnh tay: bỏ thời gian từ cũ, mốc hết dòng và độ tin cậy của AI (dòng đã được người dùng xem lại)
    const { words: _w, end: _e, conf: _c, ...rest } = l
    return { ...rest, t: t === null ? null : Math.max(0, Math.round(t * 100) / 100) }
  })
  return { ...lyrics, lines }
}

/** Dời mốc của dòng `index` thêm `delta` giây (cả thời gian từng từ nếu có) */
export function nudgeLine(lyrics: TrackLyrics, index: number, delta: number): TrackLyrics {
  const lines = lyrics.lines.map((l, i) => {
    if (i !== index || l.t === null) return l
    const shift = (v: number): number => Math.max(0, Math.round((v + delta) * 100) / 100)
    const { conf: _c, ...rest } = l
    return { ...rest, t: shift(l.t), ...(l.end !== undefined ? { end: shift(l.end) } : {}), ...(l.words ? { words: l.words.map((w) => ({ ...w, t: shift(w.t) })) } : {}) }
  })
  return { ...lyrics, lines }
}

/** AI căn lời: dòng hiện thêm chừng này giây sau chữ cuối (đoạn nhạc dạo dài thì tắt lời, không treo dòng cũ) */
export const AI_LINE_HOLD = 1

/**
 * Áp kết quả AI căn lời: mốc từng dòng, từng chữ (dấu câu đứng riêng lấy mốc của chữ trước) và độ tin cậy. Mốc
 * trừ đi lệch cả bài để hiện đúng chỗ AI nghe được. Dòng AI bỏ qua (dòng trống, chú thích kiểu [Chorus]) thành chưa
 * đồng bộ.
 */
export function applyAlignment(lyrics: TrackLyrics, aligned: AlignedLine[]): TrackLyrics {
  const byIndex = new Map(aligned.map((a) => [a.index, a]))
  const rel = (v: number): number => Math.max(0, Math.round((v - lyrics.offset) * 100) / 100)
  const lines = lyrics.lines.map((line, i): LyricLine => {
    const { words: _w, end: _e, conf: _c, ...rest } = line
    const a = byIndex.get(i)
    if (!a) return { ...rest, t: null }
    const words: LyricWord[] = []
    let k = 0
    let at = a.start
    for (const text of line.text.trim().split(/\s+/).filter(Boolean)) {
      if (normalizeWord(text) && k < a.words.length) at = a.words[k++].start
      words.push({ t: rel(at), text })
    }
    return { ...rest, t: rel(a.start), end: rel(a.end + AI_LINE_HOLD), words, conf: a.confidence }
  })
  return { ...lyrics, lines, source: 'ai' }
}
