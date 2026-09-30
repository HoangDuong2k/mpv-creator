import { join } from 'path'
import { createCanvas } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { AudioSampler, Renderer } from '../src/engine'
import { formatTimer, parseClock, readTimer, type TimerContext } from '../src/engine/layers/timer'
import { NodeAssets, registerFonts } from '../src/main/export/nodeAssets'
import { applyDrag, handlesFor, isMovable } from '../src/renderer/src/editing'
import { createDefaultProject, createLayer, LAYER_DEFAULTS } from '../src/shared/defaults'
import { buildTimeline } from '../src/shared/timeline'
import type { Layer, Project, TimerProps } from '../src/shared/types'
import { track } from './helpers'

const P = (over: Partial<TimerProps> = {}): TimerProps => ({ ...LAYER_DEFAULTS.timer, ...over })
const C = (over: Partial<TimerContext> = {}): TimerContext => ({ t: 0, total: 900, start: 0, end: null, entry: null, ...over })
const show = (p: TimerProps, c: TimerContext): string => {
  const f = formatTimer(p, readTimer(p, c))
  return f.suffix ? `${f.text} ${f.suffix}` : f.text
}

describe('đồng hồ đếm giờ: thời gian hiển thị', () => {
  it('đã phát / còn lại của cả video; có phần giờ khi video dài từ 1 giờ', () => {
    expect(show(P(), C({ t: 754.2 }))).toBe('12:34')
    // Quá cuối video: dừng ở độ dài video
    expect(show(P(), C({ t: 1000 }))).toBe('15:00')
    expect(show(P(), C({ t: 754.2, total: 4500 }))).toBe('00:12:34')
    // Đếm lùi làm tròn lên: 774,6 giây còn lại hiện 12:55, về 0 đúng lúc hết video
    expect(show(P({ mode: 'remaining' }), C({ t: 3725.4, total: 4500 }))).toBe('00:12:55')
    expect(show(P({ mode: 'remaining' }), C({ t: 4500, total: 4500 }))).toBe('00:00:00')
    expect(readTimer(P({ mode: 'remaining' }), C({ t: 1125, total: 4500 })).progress).toBeCloseTo(0.75)
  })

  it('đã phát / còn lại của bài đang phát', () => {
    const entry = { start: 100, end: 300, length: 200 }
    expect(show(P({ mode: 'trackElapsed' }), C({ t: 150.5, entry }))).toBe('00:50')
    expect(show(P({ mode: 'trackRemaining' }), C({ t: 150.5, entry }))).toBe('02:30')
    expect(readTimer(P({ mode: 'trackRemaining' }), C({ t: 150, entry })).progress).toBeCloseTo(0.75)
    expect(show(P({ mode: 'trackElapsed' }), C({ t: 50 }))).toBe('00:00')
  })

  it('đếm ngược tính từ lúc lớp hiện; lặp lại kiểu Pomodoro', () => {
    const p = P({ mode: 'countdown', countdownMin: 25 })
    expect(show(p, C({ t: 60, start: 60 }))).toBe('25:00')
    expect(show(p, C({ t: 60.4, start: 60 }))).toBe('25:00')
    expect(show(p, C({ t: 61, start: 60 }))).toBe('24:59')
    expect(show(p, C({ t: 60 + 1500, start: 60 }))).toBe('00:00')
    expect(show(p, C({ t: 60 + 3000, start: 60 }))).toBe('00:00')
    const rep = P({ mode: 'countdown', countdownMin: 25, repeat: true })
    expect(show(rep, C({ t: 60 + 1500.5, start: 60 }))).toBe('25:00')
    expect(show(rep, C({ t: 60 + 1502, start: 60 }))).toBe('24:58')
  })

  it('bấm giờ đếm lên từ lúc lớp hiện; giờ trong ngày qua nửa đêm, kiểu 12 giờ', () => {
    expect(show(P({ mode: 'stopwatch' }), C({ t: 95.5, start: 30 }))).toBe('01:05')
    expect(show(P({ mode: 'clock', clockStart: '23:59:30', format: 'hms' }), C({ t: 45 }))).toBe('00:00:15')
    expect(show(P({ mode: 'clock', clockStart: '23:59:30' }), C({ t: 45 }))).toBe('00:00')
    expect(show(P({ mode: 'clock', clockStart: '13:05', hour12: true }), C({ t: 10 }))).toBe('1:05 PM')
    expect(show(P({ mode: 'clock', clockStart: '0:30', hour12: true }), C({ t: 10 }))).toBe('12:30 AM')
  })

  it('các cách hiện: giờ:phút:giây, phút:giây (phút vượt 60), giờ:phút', () => {
    const c = C({ t: 3725, total: 7200 })
    expect(show(P({ format: 'hms' }), c)).toBe('01:02:05')
    expect(show(P({ format: 'ms' }), c)).toBe('62:05')
    expect(show(P({ format: 'hm' }), c)).toBe('01:02')
    expect(show(P({ format: 'auto' }), c)).toBe('01:02:05')
  })

  it('biết lúc số vừa đổi (lật số, nhấp nháy dấu hai chấm); giây đầu tiên không lật', () => {
    expect(readTimer(P(), C({ t: 754.2 })).since).toBeCloseTo(0.2)
    expect(readTimer(P({ mode: 'countdown' }), C({ t: 61.3, start: 60 })).since).toBeCloseTo(0.3)
    expect(readTimer(P({ mode: 'countdown' }), C({ t: 60.1, start: 60 })).since).toBe(1)
    expect(readTimer(P(), C({ t: 0.2 })).since).toBe(1)
  })

  it('đọc giờ tự nhập', () => {
    expect(parseClock('21:30')).toBe(21 * 3600 + 30 * 60)
    expect(parseClock('9')).toBe(9 * 3600)
    expect(parseClock('7:05:09')).toBe(7 * 3600 + 5 * 60 + 9)
    expect(parseClock('21h15')).toBe(21 * 3600 + 15 * 60)
    expect(parseClock('abc')).toBe(0)
    expect(parseClock('25:99')).toBe(23 * 3600 + 59 * 60)
  })
})

describe('đồng hồ đếm giờ: vẽ bằng Skia (như khi xuất video)', () => {
  registerFonts(join(__dirname, '..', 'resources', 'fonts'))
  const W = 640
  const H = 360
  const project = (timer: Layer): Project => ({
    ...createDefaultProject(),
    settings: { ...createDefaultProject().settings, width: W, height: H, transition: { type: 'none', duration: 0 } },
    tracks: [track('a', 900), track('b', 900)],
    layers: [createLayer('background', { mode: 'color', color: '#101010', beatZoom: 0, kenBurns: 0 }), timer]
  })
  const styles: Array<[string, Partial<TimerProps>, number]> = [
    ['plain', { style: 'plain', label: 'Còn lại', mode: 'remaining' }, 125.3],
    ['box', { style: 'box', label: 'Đã phát' }, 754.2],
    ['flip đang lật', { style: 'flip', format: 'ms', boxColor: '#2a2a2a', boxOpacity: 1 }, 759.15],
    ['digital', { style: 'digital', mode: 'clock', clockStart: '23:30', glow: 20, blink: true }, 100.2],
    ['ring', { style: 'ring', mode: 'countdown', repeat: true, label: 'Tập trung' }, 420.3],
    ['12 giờ', { style: 'plain', mode: 'clock', hour12: true, font: 'Playfair Display' }, 30]
  ]

  for (const [name, over, t] of styles)
    it(`kiểu ${name}: vẽ được, nằm trong khung chọn, không lỗi`, () => {
      const layer = { ...createLayer('timer', { size: 60, x: 0.5, y: 0.5, align: 'center', ...over }), id: 'timer' } as Layer
      const p = project(layer)
      const tl = buildTimeline(p.tracks, p.settings)
      const renderer = new Renderer(new NodeAssets())
      const canvas = createCanvas(W, H)
      const ctx = canvas.getContext('2d')
      renderer.render({ ctx: ctx as unknown as CanvasRenderingContext2D, project: p, timeline: tl, audio: new AudioSampler(tl, () => undefined), t })
      expect(renderer.errors.size).toBe(0)
      const b = renderer.bounds.get('timer')!
      expect(b.w).toBeGreaterThan(20)
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.x + b.w).toBeLessThanOrEqual(W)
      // Có điểm sáng (chữ số) bên trong khung chọn
      const data = ctx.getImageData(Math.floor(b.x), Math.floor(b.y), Math.ceil(b.w), Math.ceil(b.h)).data
      let bright = 0
      for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 300) bright++
      expect(bright).toBeGreaterThan(40)
    })

  it('kéo trên preview: dời được, kéo góc thì đổi cỡ', () => {
    const layer = createLayer('timer', { size: 50 }) as Layer
    expect(isMovable(layer)).toBe(true)
    expect(handlesFor(layer)).toEqual(['nw', 'ne', 'sw', 'se'])
    const box = { x: 100, y: 100, w: 200, h: 60 }
    const s = { layerId: layer.id, mode: 'resize' as const, handle: 'se' as const, start: { x: 300, y: 160 }, box, props: { ...layer.props }, undoKey: 'k' }
    const r = applyDrag(layer, s, 500, 220, 1920, 1080, 0)
    expect(Number(r.patch.size)).toBeGreaterThan(80)
  })
})
