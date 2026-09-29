// Phần tính toán thuần của timeline (không phụ thuộc giao diện) — để kiểm thử được.
import { ctaStartTimes } from '../../engine/layers/cta'
import { formatTime, formatTimePrecise } from '../../shared/time'
import type { Timeline } from '../../shared/timeline'
import { timingEnd } from '../../shared/timing'
import type { CtaProps, Layer, LayerTiming } from '../../shared/types'

export const HEAD_W = 176
export const RULER_H = 26
export const ROW_H = 28
export const AUDIO_ROW_H = 58
export const MIN_ZOOM = 0.02
export const MAX_ZOOM = 400
/** Layer ngắn nhất (giây) khi kéo mép */
export const MIN_LAYER = 0.5
/** Bài hát sau khi cắt phải còn ít nhất (giây) */
export const MIN_TRACK = 1
export const CTA_MIN_DURATION = 1.5
export const CTA_MAX_DURATION = 30

const STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200]

/** Khoảng vạch chia thước theo mức zoom (px/giây): vạch chính cách nhau ≥ 90px */
export function tickStep(pxPerSec: number): { major: number; minor: number } {
  const major = STEPS.find((s) => s * pxPerSec >= 90) ?? STEPS[STEPS.length - 1]
  const minor = (major / 5) * pxPerSec >= 12 ? major / 5 : (major / 2) * pxPerSec >= 12 ? major / 2 : major
  return { major, minor }
}

export function formatTick(t: number, major: number, withHours: boolean): string {
  return major < 1 ? formatTimePrecise(t, withHours) : formatTime(t, withHours)
}

/** Bắt dính t vào mốc gần nhất trong ngưỡng; trả về mốc đã bắt (hoặc null) */
export function snapTime(t: number, candidates: number[], threshold: number): { t: number; snapped: number | null } {
  let best: number | null = null
  let bestD = threshold
  for (const c of candidates) {
    const d = Math.abs(c - t)
    if (d <= bestD) {
      bestD = d
      best = c
    }
  }
  return best === null ? { t, snapped: null } : { t: best, snapped: best }
}

/** Làm tròn theo bước (0,01 giây…) — chia cho nghịch đảo để không dính sai số kiểu 42.800000000000004 */
const round = (v: number, step = 0.01): number => {
  const inv = Math.round(1 / step)
  return Math.round(v * inv) / inv
}

/** Khoảng thời gian thật [start, end] của layer để vẽ / kéo (end null → hết video) */
export function layerRange(timing: LayerTiming, total: number): { start: number; end: number } {
  const end = timingEnd(timing, total)
  return { start: Math.max(0, timing.start), end: Number.isFinite(end) ? end : Math.max(total, timing.start + 60) }
}

/** Giữ tổng hiện dần + ẩn dần không vượt độ dài layer */
function fitFades(fadeIn: number, fadeOut: number, duration: number): { fadeIn: number; fadeOut: number } {
  const fi = Math.min(Math.max(0, fadeIn), duration)
  return { fadeIn: round(fi, 0.1), fadeOut: round(Math.min(Math.max(0, fadeOut), duration - fi), 0.1) }
}

/** Kết thúc chạm cuối video → lưu null để layer tự dài theo playlist */
function endValue(end: number, total: number): number | null {
  return total > 0 && end >= total - 1e-3 ? null : round(end)
}

export type RangePart = 'move' | 'start' | 'end' | 'fadeIn' | 'fadeOut'

/** Khoảng được phép của một thanh: [min, max] (mặc định cả video; hẹp hơn khi chung hàng với đoạn khác) */
export interface RangeBounds {
  min: number
  max: number
}

/**
 * Kéo layer trên timeline. `delta`/`at` đã được bắt dính.
 * - move: dời cả khoảng (không ra ngoài [0, cuối video]); layer "đến hết video" thì chỉ dời
 *   điểm bắt đầu và vẫn kéo dài đến hết video (kể cả layer đang chạy suốt video)
 * - start / end: kéo mép (giữ độ dài tối thiểu)
 * - fadeIn / fadeOut: kéo núm hiện dần / ẩn dần
 * `bounds`: không cho thanh chồng lên các đoạn khác nằm chung hàng
 */
export function dragRange(part: RangePart, t0: LayerTiming, total: number, value: number, bounds?: RangeBounds): Partial<LayerTiming> {
  const { start, end } = layerRange(t0, total)
  const limit = total > 0 ? total : Infinity
  const lo = Math.max(0, bounds?.min ?? 0)
  const hi = Math.min(limit, bounds?.max ?? limit)
  const dur = end - start
  switch (part) {
    case 'move': {
      // value = độ dời (giây)
      if (t0.end === null) {
        // Giữ nguyên "đến hết video": kéo sang phải → bắt đầu muộn hơn, sang trái → sớm hơn
        const ns = Math.max(lo, Math.min(start + value, (Number.isFinite(limit) ? limit : start + value + MIN_LAYER) - MIN_LAYER))
        return { start: round(ns), ...fitFades(t0.fadeIn, t0.fadeOut, end - ns) }
      }
      let d = value
      d = Math.max(d, lo - start)
      if (Number.isFinite(hi)) d = Math.min(d, hi - end)
      return { start: round(start + d), end: endValue(end + d, total) }
    }
    case 'start': {
      const ns = Math.min(Math.max(lo, value), end - MIN_LAYER)
      return { start: round(ns), ...fitFades(t0.fadeIn, t0.fadeOut, end - ns) }
    }
    case 'end': {
      const ne = Math.max(start + MIN_LAYER, Math.min(value, hi))
      return { end: endValue(ne, total), ...fitFades(t0.fadeIn, t0.fadeOut, ne - start) }
    }
    case 'fadeIn':
      return { fadeIn: round(Math.min(Math.max(0, value - start), dur - t0.fadeOut), 0.1) }
    case 'fadeOut':
      return { fadeOut: round(Math.min(Math.max(0, end - value), dur - t0.fadeIn), 0.1) }
  }
}

/** Các lần hiện của nút Đăng ký/Like; auto = sinh tự động theo lịch (chưa chỉnh tay) */
export function ctaAppearances(props: CtaProps, tl: Timeline): { starts: number[]; auto: boolean } {
  return { starts: ctaStartTimes(props, tl), auto: props.schedule !== 'times' }
}

/** Danh sách mốc → chuỗi "0:10, 5:02.5" (lưu vào props.times) */
export function formatTimeList(starts: number[], total: number): string {
  const withHours = total >= 3600
  return [...starts]
    .sort((a, b) => a - b)
    .map((s) => formatTimePrecise(s, withHours))
    .join(', ')
}

/** Dời lần hiện thứ `index` tới `to`; trả về chuỗi mốc mới và vị trí mới của nó sau khi sắp xếp */
export function moveAppearance(starts: number[], index: number, to: number, total: number): { times: string; index: number } {
  const v = round(Math.max(0, total > 0 ? Math.min(to, Math.max(0, total - MIN_LAYER)) : to), 0.1)
  const list = starts.map((s, i) => (i === index ? v : s))
  const sorted = [...list].sort((a, b) => a - b)
  return { times: formatTimeList(sorted, total), index: sorted.indexOf(v) }
}

export function addAppearance(starts: number[], at: number, total: number): { times: string; index: number } {
  const v = round(Math.max(0, at), 0.1)
  const sorted = [...starts, v].sort((a, b) => a - b)
  return { times: formatTimeList(sorted, total), index: sorted.indexOf(v) }
}

export function removeAppearance(starts: number[], index: number, total: number): string {
  return formatTimeList(
    starts.filter((_, i) => i !== index),
    total
  )
}

/**
 * Vị trí chèn khi kéo clip nhạc thứ `from` tới thời điểm `t`:
 * số clip khác (không tính clip đang kéo) có điểm giữa nằm trước t.
 */
export function insertionIndex(entries: Array<{ start: number; end: number }>, from: number, t: number): number {
  let n = 0
  entries.forEach((e, i) => {
    if (i !== from && (e.start + e.end) / 2 < t) n++
  })
  return n
}

/** Tất cả mốc để bắt dính: đầu/cuối video, đầu phát, mép các layer, ranh giới bài, các lần hiện CTA */
export function snapCandidates(
  layers: Layer[],
  tl: Timeline,
  playhead: number,
  exclude?: { layerId?: string; ctaIndex?: number; layerIds?: ReadonlySet<string> }
): number[] {
  const out = [0, playhead]
  if (tl.total > 0) out.push(tl.total)
  for (const e of tl.entries) out.push(e.start, e.end, e.displayStart)
  for (const l of layers) {
    if (l.id === exclude?.layerId && exclude.ctaIndex === undefined) continue
    if (exclude?.layerIds?.has(l.id)) continue
    if (l.type === 'cta') {
      ctaStartTimes(l.props, tl).forEach((s, i) => {
        if (!(l.id === exclude?.layerId && i === exclude.ctaIndex)) out.push(s)
      })
    } else {
      const r = layerRange(l.timing, tl.total)
      out.push(r.start, r.end)
    }
  }
  return out
}

/** Một hàng trên timeline: một lớp, hoặc nhiều lớp liền nhau cùng `row` (các đoạn sau khi tách thanh) */
export interface TimelineRow {
  /** Khoá React: id lớp đầu hàng */
  key: string
  /** Theo thứ tự hiển thị (lớp nằm trên trước) */
  layers: Layer[]
}

/** Gom lớp thành các hàng timeline; lớp trên cùng ở hàng đầu (giống danh sách lớp) */
export function timelineRows(layers: Layer[]): TimelineRow[] {
  const rows: TimelineRow[] = []
  let lastGroup: string | null = null
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]
    const group = l.row && l.type !== 'cta' ? l.row : null
    if (group && group === lastGroup) rows[rows.length - 1].layers.push(l)
    else rows.push({ key: l.id, layers: [l] })
    lastGroup = group
  }
  return rows
}

/** Hàng chứa lớp `id` */
export function rowOf(rows: TimelineRow[], id: string): TimelineRow | undefined {
  return rows.find((r) => r.layers.some((l) => l.id === id))
}

/**
 * Tách khoảng thời gian tại `at` thành [phần trước, phần sau] — mỗi phần dài ít nhất MIN_LAYER.
 * Phần trước giữ hiện dần, phần sau giữ ẩn dần (và giữ "đến hết video" nếu có).
 */
export function splitTiming(t0: LayerTiming, total: number, at: number): [LayerTiming, LayerTiming] | null {
  const { start, end } = layerRange(t0, total)
  const t = round(at)
  if (t - start < MIN_LAYER - 1e-6 || end - t < MIN_LAYER - 1e-6) return null
  return [
    { start: t0.start, end: t, fadeIn: round(Math.min(t0.fadeIn, t - start), 0.1), fadeOut: 0 },
    { start: t, end: t0.end, fadeIn: 0, fadeOut: round(Math.min(t0.fadeOut, end - t), 0.1) }
  ]
}

/**
 * Khoảng được phép của lớp `id` khi kéo: không chồng lên các đoạn khác nằm chung hàng
 * (bỏ qua các lớp trong `moving` — chúng được kéo cùng lúc).
 */
export function rowBounds(layers: Layer[], id: string, total: number, moving: ReadonlySet<string> = new Set()): RangeBounds {
  const limit = total > 0 ? total : Infinity
  const row = rowOf(timelineRows(layers), id)
  const me = row?.layers.find((l) => l.id === id)
  if (!row || !me || row.layers.length < 2) return { min: 0, max: limit }
  const r = layerRange(me.timing, total)
  let min = 0
  let max = limit
  for (const o of row.layers) {
    if (o.id === id || moving.has(o.id)) continue
    const or = layerRange(o.timing, total)
    if (or.end <= r.start + 1e-6) min = Math.max(min, or.end)
    else if (or.start >= r.end - 1e-6) max = Math.min(max, or.start)
  }
  return { min, max }
}

/** Độ dời hợp lệ chung khi kéo cùng lúc nhiều lớp: không lớp nào ra ngoài video hay chồng lên đoạn khác cùng hàng */
export function groupDeltaRange(layers: Layer[], ids: string[], total: number): RangeBounds {
  const moving = new Set(ids)
  const limit = total > 0 ? total : Infinity
  let min = -Infinity
  let max = Infinity
  for (const id of ids) {
    const l = layers.find((x) => x.id === id)
    if (!l) continue
    const r = layerRange(l.timing, total)
    const b = rowBounds(layers, id, total, moving)
    min = Math.max(min, b.min - r.start)
    // Lớp "đến hết video" chỉ dời điểm bắt đầu, phải còn ít nhất MIN_LAYER trước cuối video
    max = Math.min(max, l.timing.end === null ? limit - MIN_LAYER - r.start : b.max - r.end)
  }
  return { min: Math.min(0, min), max: Math.max(0, max) }
}

/**
 * Thời gian của các lớp dán tại `at`: giữ khoảng cách tương đối giữa chúng (lớp bắt đầu sớm nhất
 * đặt tại `at`), giữ độ dài; lớp "đến hết video" vẫn đến hết video; không vượt quá cuối video.
 */
export function pasteTimings(timings: LayerTiming[], at: number, total: number): LayerTiming[] {
  if (timings.length === 0) return []
  const base = Math.min(...timings.map((t) => t.start))
  const limit = total > 0 ? total : Infinity
  return timings.map((t0) => {
    const r = layerRange(t0, total)
    const start = round(Math.max(0, Math.min(at + (t0.start - base), Number.isFinite(limit) ? limit - MIN_LAYER : Infinity)))
    const end = t0.end === null ? null : endValue(Math.min(start + (r.end - r.start), limit), total)
    const len = (end === null ? (Number.isFinite(limit) ? limit : start + (r.end - r.start)) : end) - start
    return { start, end, ...fitFades(t0.fadeIn, t0.fadeOut, len) }
  })
}

/**
 * Vị trí chèn (0…n) ứng với thời điểm `t`: số clip nhạc (trừ các clip trong `exclude` — đang được kéo)
 * có điểm giữa nằm trước `t`.
 */
export function insertionIndexAt(entries: Array<{ start: number; end: number }>, t: number, exclude: ReadonlySet<number> = new Set()): number {
  let n = 0
  entries.forEach((e, i) => {
    if (!exclude.has(i) && (e.start + e.end) / 2 < t) n++
  })
  return n
}

/** Dời các bài `ids` (giữ thứ tự giữa chúng) tới vị trí `to` — tính trong danh sách các bài còn lại */
export function moveTracksOrder<T extends { id: string }>(tracks: T[], ids: ReadonlySet<string>, to: number): T[] {
  const moved = tracks.filter((t) => ids.has(t.id))
  const rest = tracks.filter((t) => !ids.has(t.id))
  const k = Math.max(0, Math.min(to, rest.length))
  return [...rest.slice(0, k), ...moved, ...rest.slice(k)]
}

/**
 * Thời gian của `n` ảnh / video nền thả vào timeline tại `at`:
 * - đủ bài phía sau → mỗi file một bài (file đầu từ điểm thả tới hết bài đó, các file sau theo từng bài kế tiếp);
 * - nhiều file hơn số bài còn lại (hoặc chưa có nhạc) → chia đều khoảng từ điểm thả tới cuối video.
 * Đoạn sau chồng lên đoạn trước `fade` giây và hiện dần trong khoảng đó (chuyển cảnh không bị tối giữa chừng).
 */
export function dropSegments(
  entries: Array<{ displayStart: number; displayEnd: number }>,
  total: number,
  at: number,
  n: number,
  fade = 1
): LayerTiming[] {
  if (n <= 0) return []
  const limit = total > 0 ? total : Math.max(at, 0) + 30 * n
  const start0 = Math.max(0, Math.min(at, limit - MIN_LAYER))
  let k = entries.findIndex((e) => start0 < e.displayEnd - MIN_LAYER)
  if (k < 0) k = entries.length
  const bounds: Array<[number, number]> = []
  if (total > 0 && n <= entries.length - k) {
    for (let i = 0; i < n; i++) {
      const e = entries[k + i]
      bounds.push([i === 0 ? start0 : e.displayStart, k + i === entries.length - 1 ? limit : e.displayEnd])
    }
  } else {
    const step = (limit - start0) / n
    for (let i = 0; i < n; i++) bounds.push([start0 + step * i, i === n - 1 ? limit : start0 + step * (i + 1)])
  }
  return bounds.map(([s, e], i) => {
    const len = e - s
    const f = round(Math.min(fade, len / 3), 0.1)
    const last = i === n - 1
    // Chồng sang đoạn kế tiếp đúng bằng thời gian hiện dần của nó
    const end = last ? e : Math.min(limit, e + f)
    return {
      start: round(s),
      end: total > 0 && end >= total - 1e-3 ? null : round(end),
      fadeIn: f,
      fadeOut: last && !(total > 0 && end >= total - 1e-3) ? f : 0
    }
  })
}

/** Mức zoom vừa khít cả video trong bề ngang `width` px */
export function fitZoom(total: number, width: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (width - 40) / Math.max(total, 10)))
}
