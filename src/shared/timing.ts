import type { LayerTiming } from './types'

/** Thời điểm kết thúc thật của layer (null = hết video) */
export function timingEnd(timing: LayerTiming, total: number): number {
  return timing.end ?? (total > 0 ? total : Infinity)
}

/**
 * Độ hiện 0..1 của layer tại thời điểm t: 0 ngoài khoảng [start, end),
 * tăng dần trong fadeIn giây đầu và giảm dần trong fadeOut giây cuối.
 */
export function layerFade(timing: LayerTiming, t: number, total: number): number {
  const start = Math.max(0, timing.start)
  const end = timingEnd(timing, total)
  if (t < start || t >= end) return 0
  let a = 1
  if (timing.fadeIn > 0) a = Math.min(a, (t - start) / timing.fadeIn)
  if (timing.fadeOut > 0 && Number.isFinite(end)) a = Math.min(a, (end - t) / timing.fadeOut)
  return Math.max(0, Math.min(1, a))
}

/** Layer có chạy suốt cả video không */
export function isFullLength(timing: LayerTiming): boolean {
  return timing.start <= 0 && timing.end === null && timing.fadeIn <= 0 && timing.fadeOut <= 0
}
