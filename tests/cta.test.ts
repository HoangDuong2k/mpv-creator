import { describe, expect, it } from 'vitest'
import { LAYER_DEFAULTS } from '../src/shared/defaults'
import { buildTimeline } from '../src/shared/timeline'
import { ctaLocalTime, ctaStartTimes } from '../src/engine/layers/cta'
import { track } from './helpers'

const tl = buildTimeline([track('a', 300), track('b', 300), track('c', 300)], { transition: { type: 'crossfade', duration: 4 } })
const base = LAYER_DEFAULTS.cta

describe('lịch hiện nút Đăng ký / Like', () => {
  it('lặp lại mỗi N phút', () => {
    expect(ctaStartTimes({ ...base, schedule: 'interval', firstAt: 10, every: 5 }, tl)).toEqual([10, 310, 610])
  })

  it('đầu mỗi bài', () => {
    expect(ctaStartTimes({ ...base, schedule: 'trackStart', offset: 5 }, tl)).toEqual([5, 303, 599])
  })

  it('các mốc tự nhập, bỏ mốc vượt quá video', () => {
    expect(ctaStartTimes({ ...base, schedule: 'times', times: '1:00, 0:10, 99:00' }, tl)).toEqual([10, 60])
  })

  it('thời gian cục bộ của lần hiện', () => {
    const starts = [10, 310]
    expect(ctaLocalTime(starts, 5, 6)).toBe(-1)
    expect(ctaLocalTime(starts, 12, 6)).toBe(2)
    expect(ctaLocalTime(starts, 17, 6)).toBe(-1)
    expect(ctaLocalTime(starts, 311, 6)).toBe(1)
  })
})
