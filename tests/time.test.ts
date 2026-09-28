import { describe, expect, it } from 'vitest'
import { buildChapters, formatTime, parseTime, parseTimeList } from '../src/shared/time'
import { buildTimeline } from '../src/shared/timeline'
import { track } from './helpers'

describe('định dạng thời gian', () => {
  it('formatTime', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(75.9)).toBe('1:15')
    expect(formatTime(3725)).toBe('1:02:05')
    expect(formatTime(65, true)).toBe('0:01:05')
  })

  it('parseTime / parseTimeList', () => {
    expect(parseTime('1:30')).toBe(90)
    expect(parseTime('1:02:05')).toBe(3725)
    expect(parseTime('45')).toBe(45)
    expect(parseTime('abc')).toBeNaN()
    expect(parseTimeList('10:00, 0:10; 1:00:00\nxx')).toEqual([10, 600, 3600])
  })
})

describe('timestamp YouTube', () => {
  it('bắt đầu 0:00, lấy mốc giữa crossfade', () => {
    const tl = buildTimeline([track('a', 40), track('b', 40, { artist: '' })], { transition: { type: 'crossfade', duration: 3 } })
    expect(buildChapters(tl)).toBe('0:00 Bài a - Ca sĩ a\n0:38 Bài b')
  })

  it('video từ 1 giờ dùng h:mm:ss cho mọi dòng', () => {
    const tl = buildTimeline([track('a', 1800), track('b', 1900)], { transition: { type: 'none', duration: 0 } })
    expect(buildChapters(tl, { template: '{time} {title}' })).toBe('0:00:00 Bài a\n0:30:00 Bài b')
  })
})
