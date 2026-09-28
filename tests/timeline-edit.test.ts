import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultProject, createLayer, FULL_TIMING } from '../src/shared/defaults'
import type { Layer, LayerTiming, Project } from '../src/shared/types'
import { useStore } from '../src/renderer/src/store'
import { dragRange, groupDeltaRange, pasteTimings, rowBounds, splitTiming, timelineRows } from '../src/renderer/src/timelineModel'
import { track } from './helpers'

const TOTAL = 100

function timing(start: number, end: number | null, fadeIn = 0, fadeOut = 0): LayerTiming {
  return { start, end, fadeIn, fadeOut }
}

function flicker(t: LayerTiming, extra: Partial<Layer> = {}): Layer {
  return { ...createLayer('flicker'), timing: t, ...extra } as Layer
}

function load(layers: Layer[]): void {
  const p: Project = { ...createDefaultProject(), layers, tracks: [track('a', TOTAL)] }
  useStore.getState().loadProject(p, null)
}

const st = (): ReturnType<typeof useStore.getState> => useStore.getState()

describe('tách thanh (Ctrl+B)', () => {
  it('chia thành phần trước (giữ hiện dần) và phần sau (giữ ẩn dần, giữ "đến hết video")', () => {
    expect(splitTiming(timing(0, null, 2, 3), TOTAL, 40)).toEqual([timing(0, 40, 2, 0), timing(40, null, 0, 3)])
    expect(splitTiming(timing(10, 50, 5, 5), TOTAL, 12)).toEqual([timing(10, 12, 2, 0), timing(12, 50, 0, 5)])
  })

  it('không tách khi đầu phát nằm ngoài thanh hoặc quá sát mép', () => {
    expect(splitTiming(timing(10, 50), TOTAL, 5)).toBeNull()
    expect(splitTiming(timing(10, 50), TOTAL, 10.2)).toBeNull()
    expect(splitTiming(timing(10, 50), TOTAL, 49.9)).toBeNull()
  })

  it('store: hai đoạn nằm liền nhau, chung một hàng timeline; hoàn tác được một bước', () => {
    const bg = createLayer('background')
    const f = flicker({ ...FULL_TIMING })
    load([bg, f])
    expect(st().splitLayers([f.id], 30)).toBe(1)
    const layers = st().project.layers
    expect(layers.map((l) => l.type)).toEqual(['background', 'flicker', 'flicker'])
    expect(layers[1].timing).toMatchObject({ start: 0, end: 30 })
    expect(layers[2].timing).toMatchObject({ start: 30, end: null })
    expect(layers[1].row).toBe(f.id)
    expect(layers[2].row).toBe(f.id)
    expect(layers[2].props).toEqual(layers[1].props)
    // Hàng timeline: một hàng chứa cả hai đoạn + hàng nền
    const rows = timelineRows(layers)
    expect(rows.map((r) => r.layers.length)).toEqual([2, 1])
    // Đang chọn đoạn sau → tách tiếp tại 60 được ngay
    expect(st().selectedLayerIds).toEqual([layers[2].id])
    expect(st().splitLayers(st().selectedLayerIds, 60)).toBe(1)
    expect(timelineRows(st().project.layers)[0].layers).toHaveLength(3)
    st().undo()
    st().undo()
    expect(st().project.layers).toHaveLength(2)
    expect(st().project.layers[1].timing).toEqual(FULL_TIMING)
  })

  it('lớp đang khoá và nút Đăng ký không bị tách', () => {
    const f = flicker({ ...FULL_TIMING }, { locked: true })
    const cta = createLayer('cta')
    load([f, cta])
    expect(st().splitLayers([f.id, cta.id], 30)).toBe(0)
    expect(st().project.layers).toHaveLength(2)
  })
})

describe('hàng chung sau khi tách', () => {
  const a = flicker(timing(0, 40), { row: 'R' })
  const b = flicker(timing(40, null), { row: 'R' })
  const c = flicker(timing(10, 20))

  it('chỉ gom các lớp liền nhau cùng khoá hàng; nút Đăng ký luôn một hàng riêng', () => {
    const cta = { ...createLayer('cta'), row: 'R' } as Layer
    expect(timelineRows([a, b, c]).map((r) => r.layers.map((l) => l.id))).toEqual([[c.id], [b.id, a.id]])
    expect(timelineRows([a, c, b]).map((r) => r.layers.length)).toEqual([1, 1, 1])
    expect(timelineRows([a, cta]).map((r) => r.layers.length)).toEqual([1, 1])
  })

  it('kéo một đoạn không chồng lên đoạn bên cạnh cùng hàng', () => {
    const layers = [a, b, c]
    expect(rowBounds(layers, a.id, TOTAL)).toEqual({ min: 0, max: 40 })
    expect(rowBounds(layers, b.id, TOTAL)).toEqual({ min: 40, max: TOTAL })
    expect(rowBounds(layers, c.id, TOTAL)).toEqual({ min: 0, max: TOTAL })
    // Cùng kéo cả hai đoạn → không giới hạn lẫn nhau
    expect(rowBounds(layers, a.id, TOTAL, new Set([a.id, b.id]))).toEqual({ min: 0, max: TOTAL })
    const bounds = rowBounds(layers, a.id, TOTAL)
    expect(dragRange('move', a.timing, TOTAL, 10, bounds)).toEqual({ start: 0, end: 40 })
    expect(dragRange('end', a.timing, TOTAL, 70, bounds)).toMatchObject({ end: 40 })
    expect(dragRange('start', b.timing, TOTAL, 20, rowBounds(layers, b.id, TOTAL))).toMatchObject({ start: 40 })
  })
})

describe('chọn nhiều thanh', () => {
  it('độ dời chung giữ mọi thanh trong video', () => {
    const l1 = flicker(timing(10, 20))
    const l2 = flicker(timing(50, 90))
    const l3 = flicker(timing(30, null))
    expect(groupDeltaRange([l1, l2], [l1.id, l2.id], TOTAL)).toEqual({ min: -10, max: 10 })
    expect(groupDeltaRange([l1, l3], [l1.id, l3.id], TOTAL)).toEqual({ min: -10, max: 69.5 })
  })

  it('Ctrl/Shift + nhấp thêm / bớt; lớp chính là lớp vừa thêm', () => {
    const x = flicker(timing(0, 10))
    const y = flicker(timing(20, 30))
    load([x, y])
    st().selectLayer(x.id)
    st().toggleLayerSelection(y.id)
    expect(st().selectedLayerIds).toEqual([x.id, y.id])
    expect(st().selectedLayerId).toBe(y.id)
    st().toggleLayerSelection(y.id)
    expect(st().selectedLayerIds).toEqual([x.id])
    expect(st().selectedLayerId).toBe(x.id)
  })

  it('kéo cả nhóm là một bước hoàn tác', () => {
    const x = flicker(timing(0, 10))
    const y = flicker(timing(20, 30))
    load([x, y])
    st().setLayersTiming({ [x.id]: { start: 5, end: 15 }, [y.id]: { start: 25, end: 35 } }, 'drag-g')
    st().setLayersTiming({ [x.id]: { start: 6, end: 16 }, [y.id]: { start: 26, end: 36 } }, 'drag-g')
    expect(st().project.layers.map((l) => l.timing.start)).toEqual([6, 26])
    st().undo()
    expect(st().project.layers.map((l) => l.timing.start)).toEqual([0, 20])
  })

  it('Delete xoá cả nhóm nhưng giữ lớp đang khoá', () => {
    const x = flicker(timing(0, 10))
    const y = flicker(timing(20, 30), { locked: true })
    const z = flicker(timing(40, 50))
    load([x, y, z])
    st().selectLayers([x.id, y.id, z.id])
    expect(st().removeLayers(st().selectedLayerIds)).toBe(2)
    expect(st().project.layers.map((l) => l.id)).toEqual([y.id])
    expect(st().selectedLayerIds).toEqual([y.id])
  })
})

describe('chép / dán (Ctrl+C / Ctrl+V)', () => {
  it('giữ khoảng cách giữa các thanh, dán tại đầu phát, không vượt cuối video', () => {
    expect(pasteTimings([timing(10, 20), timing(15, null)], 50, TOTAL)).toEqual([timing(50, 60), timing(55, null)])
    const [p1, p2] = pasteTimings([timing(10, 20, 2, 2), timing(15, null)], 95, TOTAL)
    expect(p1).toEqual(timing(95, null, 2, 2))
    expect(p2.start).toBe(99.5)
  })

  it('store: bản dán nằm ngay trên lớp gốc, id mới, không khoá, hàng riêng', () => {
    const bg = createLayer('background')
    const filter = { ...createLayer('filter'), timing: timing(10, 20), row: 'R', locked: true } as Layer
    const text = createLayer('text')
    load([bg, filter, text])
    expect(st().copyLayers([filter.id])).toBe(1)
    expect(st().pasteLayers(60)).toBe(1)
    const layers = st().project.layers
    expect(layers.map((l) => l.type)).toEqual(['background', 'filter', 'filter', 'text'])
    const pasted = layers[2]
    expect(pasted.id).not.toBe(filter.id)
    expect(pasted.timing).toMatchObject({ start: 60, end: 70 })
    expect(pasted.locked).toBeUndefined()
    expect(pasted.row).toBeUndefined()
    expect(st().selectedLayerIds).toEqual([pasted.id])
  })
})

describe('khoá lớp, màu hàng', () => {
  it('khoá / mở khoá và đổi màu nhiều lớp cùng lúc', () => {
    const x = flicker(timing(0, 10))
    const y = flicker(timing(20, 30))
    load([x, y])
    st().setLayersLocked([x.id, y.id], true)
    expect(st().project.layers.every((l) => l.locked)).toBe(true)
    st().setLayersLocked([x.id], false)
    expect(st().project.layers.map((l) => !!l.locked)).toEqual([false, true])
    st().setLayersColor([x.id, y.id], '#81c784')
    expect(st().project.layers.map((l) => l.color)).toEqual(['#81c784', '#81c784'])
    st().setLayersColor([y.id], undefined)
    expect(st().project.layers[1].color).toBeUndefined()
  })
})
