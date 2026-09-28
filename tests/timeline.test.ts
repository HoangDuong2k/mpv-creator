import { describe, expect, it } from 'vitest'
import { activeEntries, buildTimeline, entryAt, entryWeight } from '../src/shared/timeline'
import { track } from './helpers'

const three = [track('a', 40), track('b', 40), track('c', 40)]

describe('buildTimeline', () => {
  it('crossfade chồng các bài và đổi "bài đang phát" ở giữa đoạn chồng', () => {
    const tl = buildTimeline(three, { transition: { type: 'crossfade', duration: 3 } })
    expect(tl.entries.map((e) => e.start)).toEqual([0, 37, 74])
    expect(tl.total).toBe(114)
    expect(tl.entries.map((e) => e.displayStart)).toEqual([0, 38.5, 75.5])
    expect(tl.entries[0].overlapOut).toBe(3)
    expect(tl.entries[2].overlapOut).toBe(0)
  })

  it('khoảng lặng giữa các bài', () => {
    const tl = buildTimeline(three, { transition: { type: 'gap', duration: 2 } })
    expect(tl.entries.map((e) => e.start)).toEqual([0, 42, 84])
    expect(tl.total).toBe(124)
  })

  it('nối liền', () => {
    const tl = buildTimeline(three, { transition: { type: 'none', duration: 5 } })
    expect(tl.entries.map((e) => e.start)).toEqual([0, 40, 80])
  })

  it('crossfade không dài quá nửa bài ngắn', () => {
    const tl = buildTimeline([track('a', 40), track('b', 4)], { transition: { type: 'crossfade', duration: 3 } })
    expect(tl.entries[1].overlapIn).toBe(2)
    expect(tl.total).toBe(42)
  })

  it('tính cả phần cắt đầu / cuối bài', () => {
    const tl = buildTimeline([track('a', 60, { trimStart: 5, trimEnd: 10 }), track('b', 30)], { transition: { type: 'none', duration: 0 } })
    expect(tl.entries[0].length).toBe(45)
    expect(tl.entries[1].start).toBe(45)
  })
})

describe('tra cứu theo thời gian', () => {
  const tl = buildTimeline(three, { transition: { type: 'crossfade', duration: 3 } })

  it('entryAt đổi bài ở displayStart', () => {
    expect(entryAt(tl, 0)?.index).toBe(0)
    expect(entryAt(tl, 38.4)?.index).toBe(0)
    expect(entryAt(tl, 38.5)?.index).toBe(1)
    expect(entryAt(tl, 500)?.index).toBe(2)
  })

  it('trong đoạn crossfade có 2 bài phát, tổng trọng số = 1', () => {
    const act = activeEntries(tl, 38)
    expect(act.map((e) => e.index)).toEqual([0, 1])
    const sum = act.reduce((s, e) => s + entryWeight(e, 38), 0)
    expect(sum).toBeCloseTo(1, 6)
    expect(activeEntries(tl, 20).map((e) => e.index)).toEqual([0])
  })
})
