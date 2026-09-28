import { describe, expect, it } from 'vitest'
import { createDefaultProject, createLayer, FULL_TIMING, LAYER_DEFAULTS, normalizeProject } from '../src/shared/defaults'
import type { Project } from '../src/shared/types'
import { buildTimeline } from '../src/shared/timeline'
import { layerFade } from '../src/shared/timing'
import {
  addAppearance,
  dragRange,
  fitZoom,
  insertionIndex,
  layerRange,
  moveAppearance,
  removeAppearance,
  snapCandidates,
  snapTime,
  tickStep
} from '../src/renderer/src/timelineModel'
import { track } from './helpers'

describe('khoảng thời gian của layer', () => {
  it('layerFade: ngoài khoảng = 0, hiện dần / ẩn dần tuyến tính', () => {
    const t = { start: 10, end: 20, fadeIn: 2, fadeOut: 4 }
    expect(layerFade(t, 9.9, 100)).toBe(0)
    expect(layerFade(t, 11, 100)).toBeCloseTo(0.5)
    expect(layerFade(t, 15, 100)).toBe(1)
    expect(layerFade(t, 18, 100)).toBeCloseTo(0.5)
    expect(layerFade(t, 20, 100)).toBe(0)
    // Đến hết video: ẩn dần theo độ dài playlist
    expect(layerFade({ ...FULL_TIMING, fadeOut: 10 }, 95, 100)).toBeCloseTo(0.5)
    // Chưa có bài nào (tổng = 0) vẫn hiện
    expect(layerFade({ ...FULL_TIMING, fadeOut: 3 }, 1, 0)).toBe(1)
  })

  it('kéo thanh: dời trong giới hạn video, kéo tới cuối → "đến hết video"', () => {
    const t0 = { start: 10, end: 30, fadeIn: 0, fadeOut: 0 }
    expect(dragRange('move', t0, 100, 20)).toEqual({ start: 30, end: 50 })
    expect(dragRange('move', t0, 100, -50)).toEqual({ start: 0, end: 20 })
    expect(dragRange('move', t0, 100, 500)).toEqual({ start: 80, end: null })
    expect(dragRange('end', t0, 100, 100)).toMatchObject({ end: null })
    expect(dragRange('end', t0, 100, 5)).toMatchObject({ end: 10.5 })
    expect(dragRange('start', t0, 100, 50)).toMatchObject({ start: 29.5 })
  })

  it('layer chạy suốt video không dời được; layer "đến hết" dời trái thành mốc cụ thể', () => {
    expect(dragRange('move', FULL_TIMING, 100, 10)).toEqual({ start: 0, end: null })
    expect(dragRange('move', { ...FULL_TIMING, start: 40 }, 100, -10)).toEqual({ start: 30, end: 90 })
  })

  it('hiện dần + ẩn dần không vượt độ dài', () => {
    const t0 = { start: 0, end: 10, fadeIn: 3, fadeOut: 4 }
    expect(dragRange('fadeIn', t0, 100, 9)).toEqual({ fadeIn: 6 })
    expect(dragRange('end', t0, 100, 5)).toMatchObject({ end: 5, fadeIn: 3, fadeOut: 2 })
    expect(layerRange(FULL_TIMING, 0)).toEqual({ start: 0, end: 60 })
  })
})

describe('thước, bắt dính, zoom', () => {
  it('vạch chia thưa dần khi thu nhỏ', () => {
    expect(tickStep(100)).toEqual({ major: 1, minor: 0.2 })
    expect(tickStep(10).major).toBe(10)
    expect(tickStep(0.1).major).toBe(900)
  })

  it('bắt dính vào mốc gần nhất trong ngưỡng', () => {
    expect(snapTime(10.3, [0, 10, 20], 0.5)).toEqual({ t: 10, snapped: 10 })
    expect(snapTime(10.8, [0, 10, 20], 0.5)).toEqual({ t: 10.8, snapped: null })
    expect(snapTime(10.8, [0, 10, 20], 0)).toEqual({ t: 10.8, snapped: null })
  })

  it('mốc bắt dính gồm ranh giới bài, mép layer, lần hiện CTA', () => {
    const p = createDefaultProject()
    const tl = buildTimeline([track('a', 40), track('b', 40)], { transition: { type: 'crossfade', duration: 2 } })
    const viz = p.layers.find((l) => l.type === 'visualizer')!
    viz.timing = { start: 15, end: 25, fadeIn: 0, fadeOut: 0 }
    const c = snapCandidates(p.layers, tl, 7)
    expect(c).toEqual(expect.arrayContaining([0, 7, 78, 38, 39, 15, 25, 10]))
    expect(snapCandidates(p.layers, tl, 7, { layerId: viz.id })).not.toContain(15)
  })

  it('vừa khung', () => {
    expect(fitZoom(100, 1040)).toBe(10)
  })
})

describe('lần hiện nút Đăng ký và đổi chỗ bài', () => {
  it('dời / thêm / xoá lần hiện, giữ thứ tự tăng dần', () => {
    expect(moveAppearance([10, 310, 610], 0, 400, 900)).toEqual({ times: '5:10, 6:40, 10:10', index: 1 })
    expect(addAppearance([10, 310], 100.04, 900)).toEqual({ times: '0:10, 1:40, 5:10', index: 1 })
    expect(removeAppearance([10, 310, 610], 1, 900)).toBe('0:10, 10:10')
    expect(moveAppearance([10], 0, 5000, 3600).times).toBe('0:59:59.5')
  })

  it('mặc định lịch CTA dạng mốc vẫn hợp lệ', () => {
    expect(LAYER_DEFAULTS.cta.times).toBe('0:10, 10:00, 20:00')
    expect(createLayer('cta').timing).toEqual(FULL_TIMING)
  })

  it('vị trí chèn khi kéo clip nhạc', () => {
    const e = [
      { start: 0, end: 40 },
      { start: 38, end: 78 },
      { start: 76, end: 116 }
    ]
    expect(insertionIndex(e, 2, 5)).toBe(0)
    expect(insertionIndex(e, 0, 70)).toBe(1)
    expect(insertionIndex(e, 0, 110)).toBe(2)
  })
})

describe('mở project cũ', () => {
  it('layer chưa có thông tin thời gian → chạy suốt video như trước', () => {
    const old = createDefaultProject() as unknown as { layers: Array<Record<string, unknown>> }
    for (const l of old.layers) delete l.timing
    const p = normalizeProject(old as unknown as Project)
    expect(p.layers.every((l) => l.timing.start === 0 && l.timing.end === null)).toBe(true)
  })
})
