import type { ProjectSettings, Track } from './types'

/** Những gì cần biết về một bài để xếp nó lên timeline */
export type TimedTrack = Pick<Track, 'duration' | 'trimStart' | 'trimEnd'>

export interface TimelineEntry<T extends TimedTrack = Track> {
  track: T
  index: number
  /** Thời điểm bắt đầu phát trong bản mix tổng (giây) */
  start: number
  /** Thời điểm kết thúc trong bản mix tổng (giây) */
  end: number
  /** Thời lượng phát thực tế (sau khi cắt đầu/cuối) */
  length: number
  /** Độ dài đoạn chồng (crossfade) với bài trước */
  overlapIn: number
  /** Độ dài đoạn chồng với bài sau */
  overlapOut: number
  /** Thời điểm bài được coi là "đang phát" (giữa đoạn crossfade) — dùng cho chữ và chapter */
  displayStart: number
  displayEnd: number
}

export interface Timeline<T extends TimedTrack = Track> {
  entries: TimelineEntry<T>[]
  total: number
}

export function trackPlayLength(t: TimedTrack): number {
  return Math.max(0, t.duration - (t.trimStart || 0) - (t.trimEnd || 0))
}

/**
 * Tính vị trí từng bài trong bản mix tổng. Hàm này phải khớp chính xác
 * với cách bộ ghép âm thanh (main/audio/mix.ts) xếp các bài.
 */
export function buildTimeline<T extends TimedTrack>(tracks: T[], settings: Pick<ProjectSettings, 'transition'>): Timeline<T> {
  const entries: TimelineEntry<T>[] = []
  const { type, duration } = settings.transition
  let cursor = 0
  tracks.forEach((track, index) => {
    const length = trackPlayLength(track)
    let start = cursor
    let overlapIn = 0
    if (index > 0) {
      if (type === 'gap') start = cursor + Math.max(0, duration)
      else if (type === 'crossfade') {
        const prev = entries[index - 1]
        overlapIn = crossfadeLength(duration, prev.length, length)
        start = cursor - overlapIn
        prev.overlapOut = overlapIn
      }
    }
    entries.push({ track, index, start, end: start + length, length, overlapIn, overlapOut: 0, displayStart: 0, displayEnd: 0 })
    cursor = start + length
  })
  for (const e of entries) {
    e.displayStart = e.index === 0 ? 0 : e.start + e.overlapIn / 2
    e.displayEnd = e.end - e.overlapOut / 2
  }
  return { entries, total: cursor }
}

/** Độ dài crossfade thực tế: không quá một nửa bài ngắn hơn. */
export function crossfadeLength(duration: number, prevLength: number, nextLength: number): number {
  return Math.max(0, Math.min(duration, prevLength / 2, nextLength / 2))
}

/** Bài đang được "hiển thị" tại thời điểm t (đổi ở giữa đoạn crossfade). */
export function entryAt<T extends TimedTrack>(tl: Timeline<T>, t: number): TimelineEntry<T> | null {
  const list = tl.entries
  if (list.length === 0) return null
  let lo = 0
  let hi = list.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (list[mid].displayStart <= t) lo = mid
    else hi = mid - 1
  }
  return list[lo]
}

/** Các bài đang phát âm thanh tại thời điểm t (tối đa 2 khi crossfade). */
export function activeEntries<T extends TimedTrack>(tl: Timeline<T>, t: number): TimelineEntry<T>[] {
  const out: TimelineEntry<T>[] = []
  const cur = entryAt(tl, t)
  if (!cur) return out
  for (let i = Math.max(0, cur.index - 1); i <= Math.min(tl.entries.length - 1, cur.index + 1); i++) {
    const e = tl.entries[i]
    if (t >= e.start && t < e.end) out.push(e)
  }
  return out
}

/** Hệ số âm lượng tương đối (0..1) của một bài tại thời điểm t, theo crossfade tuyến tính. */
export function entryWeight(e: TimelineEntry<TimedTrack>, t: number): number {
  if (t < e.start || t >= e.end) return 0
  let w = 1
  if (e.overlapIn > 0 && t < e.start + e.overlapIn) w = Math.min(w, (t - e.start) / e.overlapIn)
  if (e.overlapOut > 0 && t > e.end - e.overlapOut) w = Math.min(w, (e.end - t) / e.overlapOut)
  return w
}
