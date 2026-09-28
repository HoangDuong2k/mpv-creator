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

const round = (v: number, step = 0.01): number => Math.round(v / step) * step

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

/**
 * Kéo layer trên timeline. `delta`/`at` đã được bắt dính.
 * - move: dời cả khoảng (không ra ngoài [0, cuối video]); layer "đến hết video" thì chỉ dời
 *   điểm bắt đầu và vẫn kéo dài đến hết video (kể cả layer đang chạy suốt video)
 * - start / end: kéo mép (giữ độ dài tối thiểu)
 * - fadeIn / fadeOut: kéo núm hiện dần / ẩn dần
 */
export function dragRange(part: RangePart, t0: LayerTiming, total: number, value: number): Partial<LayerTiming> {
  const { start, end } = layerRange(t0, total)
  const limit = total > 0 ? total : Infinity
  const dur = end - start
  switch (part) {
    case 'move': {
      // value = độ dời (giây)
      if (t0.end === null) {
        // Giữ nguyên "đến hết video": kéo sang phải → bắt đầu muộn hơn, sang trái → sớm hơn
        const ns = Math.max(0, Math.min(start + value, (Number.isFinite(limit) ? limit : start + value + MIN_LAYER) - MIN_LAYER))
        return { start: round(ns), ...fitFades(t0.fadeIn, t0.fadeOut, end - ns) }
      }
      let d = value
      d = Math.max(d, -start)
      if (Number.isFinite(limit)) d = Math.min(d, limit - end)
      return { start: round(start + d), end: endValue(end + d, total) }
    }
    case 'start': {
      const ns = Math.min(Math.max(0, value), end - MIN_LAYER)
      return { start: round(ns), ...fitFades(t0.fadeIn, t0.fadeOut, end - ns) }
    }
    case 'end': {
      const ne = Math.max(start + MIN_LAYER, Math.min(value, limit))
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
export function snapCandidates(layers: Layer[], tl: Timeline, playhead: number, exclude?: { layerId?: string; ctaIndex?: number }): number[] {
  const out = [0, playhead]
  if (tl.total > 0) out.push(tl.total)
  for (const e of tl.entries) out.push(e.start, e.end, e.displayStart)
  for (const l of layers) {
    if (l.id === exclude?.layerId && exclude.ctaIndex === undefined) continue
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

/** Mức zoom vừa khít cả video trong bề ngang `width` px */
export function fitZoom(total: number, width: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (width - 40) / Math.max(total, 10)))
}
