import { join } from 'path'
import { createCanvas } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { AudioSampler, collectAssets, Renderer, TrackFeatures } from '../src/engine'
import { createDemoFeatures, DEMO_KEY } from '../src/engine/demoAudio'
import { glitchStrength } from '../src/engine/layers/screenfx'
import { neonFlicker } from '../src/engine/layers/text'
import { VINYL_SLOW, vinylAngle, vinylLoss } from '../src/engine/layers/vinyl'
import { vuDb, vuPosition } from '../src/engine/layers/vumeter'
import { FeatureAnalyzer } from '../src/main/audio/analyze'
import { NodeAssets, registerFonts } from '../src/main/export/nodeAssets'
import { applyDrag, handlesFor, isMovable } from '../src/renderer/src/editing'
import { createDefaultProject, createLayer, LAYER_DEFAULTS } from '../src/shared/defaults'
import { OFF_BAL, SAMPLE_RATE, STRIDE } from '../src/shared/featureFormat'
import { buildTimeline } from '../src/shared/timeline'
import type { GlitchProps, Layer, LayerPropsMap, LayerType, Project } from '../src/shared/types'
import { track } from './helpers'

describe('đĩa than: góc quay chỉ phụ thuộc t', () => {
  const p = { rpm: 33.3, slowOnChange: true }
  const omega = (33.3 / 60) * Math.PI * 2
  const b = [12, 30]

  it('quay đều khi xa chỗ đổi bài, chậm lại tới dừng đúng lúc đổi bài', () => {
    expect(vinylLoss([], 50)).toBe(0)
    expect(vinylLoss(b, 12 - VINYL_SLOW)).toBeCloseTo(0, 9)
    expect(vinylLoss(b, 12)).toBeCloseTo(VINYL_SLOW / 2, 9)
    expect(vinylLoss(b, 12 + VINYL_SLOW)).toBeCloseTo(VINYL_SLOW, 9)
    expect(vinylLoss(b, 100)).toBeCloseTo(VINYL_SLOW * 2, 9)
    const speed = (t: number): number => (vinylAngle(p, b, t + 1e-4) - vinylAngle(p, b, t - 1e-4)) / 2e-4
    expect(speed(5)).toBeCloseTo(omega, 4)
    expect(speed(20)).toBeCloseTo(omega, 4)
    expect(Math.abs(speed(12))).toBeLessThan(1e-3)
    expect(Math.abs(speed(30))).toBeLessThan(1e-3)
    // Tắt "chậm lại khi đổi bài": quay đều mãi
    expect(vinylAngle({ ...p, slowOnChange: false }, b, 12)).toBeCloseTo(omega * 12, 9)
  })

  it('không giật, không quay ngược quanh chỗ đổi bài', () => {
    let prev = vinylAngle(p, b, 10)
    for (let t = 10 + 1 / 60; t < 14; t += 1 / 60) {
      const a = vinylAngle(p, b, t)
      expect(a).toBeGreaterThanOrEqual(prev)
      expect(a - prev).toBeLessThanOrEqual((omega / 60) * 1.0001)
      prev = a
    }
  })
})

describe('phân tích stereo cho đồng hồ VU hai kim', () => {
  /** Tone 440Hz, kênh trái to hơn kênh phải 4 lần (12 dB) */
  function stereoTone(seconds: number, left: number, right: number): Float32Array {
    const n = Math.round(seconds * SAMPLE_RATE)
    const out = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) {
      const s = Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE)
      out[i * 2] = left * s
      out[i * 2 + 1] = right * s
    }
    return out
  }

  it('ghi độ cân bằng trái / phải; bản mono để 0 (coi như giữa)', () => {
    const a = new FeatureAnalyzer()
    const sig = stereoTone(2, 0.5, 0.125)
    // Khối lẻ, cắt đúng ranh giới mẫu stereo
    for (let i = 0; i < sig.length; i += 2 * 3001) a.pushStereo(sig.subarray(i, Math.min(sig.length, i + 2 * 3001)))
    const st = a.finish()
    const mid = Math.floor(st.header.frames / 2) * STRIDE
    // phải / (trái + phải) = 0,125 / 0,625 = 0,2
    expect(st.data[mid + OFF_BAL] / 255).toBeCloseTo(0.2, 1)

    const m = new FeatureAnalyzer()
    m.push(new Float32Array(SAMPLE_RATE).map((_, i) => 0.3 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE)))
    const mono = m.finish()
    for (let f = 0; f < mono.header.frames; f++) expect(mono.data[f * STRIDE + OFF_BAL]).toBe(0)

    const quiet = new FeatureAnalyzer()
    quiet.pushStereo(stereoTone(1, 0.2, 0.2))
    const q = quiet.finish()
    expect(q.data[Math.floor(q.header.frames / 2) * STRIDE + OFF_BAL]).toBeGreaterThanOrEqual(126)
    expect(q.data[Math.floor(q.header.frames / 2) * STRIDE + OFF_BAL]).toBeLessThanOrEqual(130)
  })

  it('kim trái cao hơn kim phải khi tiếng lệch trái; bản phân tích cũ thì hai kim như nhau', () => {
    const a = new FeatureAnalyzer()
    a.pushStereo(stereoTone(3, 0.5, 0.125))
    const r = a.finish()
    const f = new TrackFeatures(r.header, r.data)
    const tl = buildTimeline([track('a', f.header.duration)], { transition: { type: 'none', duration: 0 } })
    const lv = new AudioSampler(tl, () => f).stereo(1.5)
    expect(lv.left).toBeGreaterThan(lv.right + 0.15)

    const old = new TrackFeatures(r.header, r.data.slice())
    for (let i = 0; i < old.header.frames; i++) old.data[i * STRIDE + OFF_BAL] = 0
    const same = new AudioSampler(tl, () => old).stereo(1.5)
    expect(same.left).toBeCloseTo(same.right, 9)
    expect(same.left).toBeGreaterThan(0.5)
  })

  it('thang VU: −20 dB ở mép trái, +3 dB ở mép phải, 0 dB khoảng 2/3', () => {
    expect(vuPosition(-20)).toBeCloseTo(0, 9)
    expect(vuPosition(3)).toBeCloseTo(1, 9)
    expect(vuPosition(0)).toBeGreaterThan(0.6)
    expect(vuPosition(0)).toBeLessThan(0.75)
    for (let db = -20; db < 3; db++) expect(vuPosition(db + 1)).toBeGreaterThan(vuPosition(db))
    expect(vuDb(1, 1)).toBeCloseTo(3, 9)
    expect(vuDb(0.85, 1)).toBeCloseTo(-3, 9)
  })
})

describe('chữ neon chập chờn, glitch theo beat', () => {
  it('neon: tắt hiệu ứng thì sáng đều; bật thì thỉnh thoảng chớp, phần lớn thời gian vẫn sáng', () => {
    for (let t = 0; t < 30; t += 0.37) {
      const f = neonFlicker(t, 0, 5)
      expect(f.k).toBe(1)
      expect(f.slice).toBeNull()
    }
    let dim = 0
    let bright = 0
    let broken = 0
    const N = 60 * 60
    for (let i = 0; i < N; i++) {
      const t = i / 60
      const f = neonFlicker(t, 1, 42)
      expect(f).toEqual(neonFlicker(t, 1, 42))
      if (f.k < 0.6) dim++
      if (f.k > 0.85) bright++
      if (f.slice) broken++
    }
    expect(dim).toBeGreaterThan(20)
    expect(bright / N).toBeGreaterThan(0.8)
    expect(broken).toBeGreaterThan(0)
    // Hai chữ neon khác nhau không chớp cùng lúc
    const a = Array.from({ length: 600 }, (_, i) => neonFlicker(i / 60, 1, 1).k)
    const c = Array.from({ length: 600 }, (_, i) => neonFlicker(i / 60, 1, 2).k)
    expect(a).not.toEqual(c)
  })

  it('glitch: chỉ bật khi beat vượt ngưỡng; ngẫu nhiên thì tất định theo t', () => {
    const audio = (v: number): AudioSampler => ({ beat: () => v, bass: () => v }) as unknown as AudioSampler
    const p: GlitchProps = { ...LAYER_DEFAULTS.glitch, trigger: 'beat', threshold: 0.35, amount: 1 }
    expect(glitchStrength(p, { t: 1, fade: 1, audio: audio(0.3) })).toBe(0)
    expect(glitchStrength(p, { t: 1, fade: 1, audio: audio(1) })).toBeCloseTo(1, 9)
    expect(glitchStrength({ ...p, amount: 0.5 }, { t: 1, fade: 1, audio: audio(0.675) })).toBeCloseTo(0.25, 9)
    expect(glitchStrength({ ...p, trigger: 'bass' }, { t: 1, fade: 0.5, audio: audio(1) })).toBeCloseTo(0.5, 9)
    const rnd = { ...p, trigger: 'random' as const }
    let on = 0
    for (let i = 0; i < 400; i++) {
      const env = { t: i / 20, fade: 1, audio: audio(0) }
      const k = glitchStrength(rnd, env)
      expect(k).toBe(glitchStrength(rnd, env))
      if (k > 0) on++
    }
    expect(on).toBeGreaterThan(20)
    expect(on).toBeLessThan(300)
    expect(glitchStrength({ ...rnd, amount: 0 }, { t: 3, fade: 1, audio: audio(1) })).toBe(0)
  })
})

describe('hiệu ứng mới vẽ bằng Skia (như khi xuất video)', () => {
  registerFonts(join(__dirname, '..', 'resources', 'fonts'))
  const W = 640
  const H = 360
  const demo = createDemoFeatures(12)
  const tracks = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => track(id, 12, { analysisKey: DEMO_KEY }))
  const L = <T extends LayerType>(type: T, props: Partial<LayerPropsMap[T]> = {}): Layer => ({ ...createLayer(type, props), id: type }) as Layer
  const bg = (): Layer => L('background', { mode: 'gradient', color: '#1d2a4a', color2: '#5b3a6e', beatZoom: 0, kenBurns: 0 })
  const text = (): Layer => ({ ...L('text', { template: '{title}', size: 110, y: 0.4 }), id: 'caption' })

  function render(layers: Layer[], t: number): { renderer: Renderer; pixels: Uint8ClampedArray } {
    const project: Project = {
      ...createDefaultProject(),
      settings: { ...createDefaultProject().settings, width: W, height: H, transition: { type: 'none', duration: 0 } },
      tracks,
      layers
    }
    const tl = buildTimeline(project.tracks, project.settings)
    const renderer = new Renderer(new NodeAssets())
    const canvas = createCanvas(W, H)
    const ctx = canvas.getContext('2d')
    renderer.render({ ctx: ctx as unknown as CanvasRenderingContext2D, project, timeline: tl, audio: new AudioSampler(tl, (k) => (k === DEMO_KEY ? demo : undefined)), t })
    return { renderer, pixels: ctx.getImageData(0, 0, W, H).data }
  }

  /** Số điểm ảnh khác nhau rõ giữa hai hình (trong khung nếu có) */
  function changed(a: Uint8ClampedArray, b: Uint8ClampedArray, box = { x: 0, y: 0, w: W, h: H }): number {
    let n = 0
    for (let y = Math.max(0, Math.floor(box.y)); y < Math.min(H, box.y + box.h); y++)
      for (let x = Math.max(0, Math.floor(box.x)); x < Math.min(W, box.x + box.w); x++) {
        const i = (y * W + x) * 4
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) n++
      }
    return n
  }

  const placed: Array<[string, Layer, number]> = [
    ['đĩa than, nhãn ảnh bìa', L('vinyl', {}), 5],
    ['đĩa than nhãn in tên bài, đang đổi bài', L('vinyl', { label: 'text', size: 0.5, x: 0.4 }), 12.1],
    ['thẻ đang phát kính mờ', L('nowplaying', { y: 0.5 }), 5],
    ['thẻ đang phát nền tối, không ảnh bìa', L('nowplaying', { style: 'solid', showCover: false, label: 'Đang phát' }), 5],
    ['danh sách bài bên phải', L('tracklist', { title: 'Danh sách phát' }), 40],
    ['danh sách bài không nền, căn giữa', L('tracklist', { style: 'plain', x: 0.5, align: 'center', rows: 3 }), 64],
    ['đồng hồ VU hai kim', L('vumeter', { y: 0.5 }), 5.1],
    ['đồng hồ VU một kim, mặt tối', L('vumeter', { layout: 'mono', style: 'dark' }), 5.1],
    ['equalizer LED', L('visualizer', { style: 'led', height: 0.4, barCount: 24 }), 5.1],
    ['equalizer LED một màu', L('visualizer', { style: 'led', ledPalette: 'theme', peakHold: false }), 5.1],
    ['thanh tiến trình sóng âm', L('progress', { style: 'wave', y: 0.5, waveHeight: 80 }), 5],
    ['vòng hạt quanh ảnh bìa', L('particles', { style: 'orbit', x: 0.5, y: 0.5, width: 0.4, height: 0.7, count: 150, size: 4, color: '#ffffff' }), 5.1],
    ['chữ neon chập chờn', L('text', { template: 'NEON', size: 140, y: 0.5, color: '#ffe3fb', shadowColor: '#ff2bd6', shadowBlur: 30, flicker: 1 }), 4.4]
  ]

  for (const [name, layer, t] of placed)
    it(`${name}: vẽ được, nằm trong khung chọn`, () => {
      const base = render([bg()], t).pixels
      const { renderer, pixels } = render([bg(), layer], t)
      expect([...renderer.errors.values()]).toEqual([])
      const b = renderer.bounds.get(layer.id)!
      expect(b.w).toBeGreaterThan(20)
      expect(b.h).toBeGreaterThan(8)
      expect(b.x).toBeGreaterThanOrEqual(-1)
      expect(b.y).toBeGreaterThanOrEqual(-1)
      expect(b.x + b.w).toBeLessThanOrEqual(W + 1)
      expect(b.y + b.h).toBeLessThanOrEqual(H + 1)
      // Hình thay đổi, và phần thay đổi nằm trong khung chọn
      const inside = changed(base, pixels, b)
      expect(inside).toBeGreaterThan(150)
      expect(changed(base, pixels)).toBeLessThanOrEqual(inside * 1.15 + 50)
    })

  // [tên, lớp, t, tỉ lệ điểm ảnh tối thiểu phải đổi rõ]
  const screen: Array<[string, Layer, number, number]> = [
    ['VHS / băng từ', L('vhs', {}), 5, 0.02],
    ['VHS nhẹ, không chữ', L('vhs', { intensity: 0.5, osd: false, noise: 0.2 }), 5, 0.005],
    ['glitch theo beat (ngay sau beat)', L('glitch', {}), 5.1, 0.02],
    ['màn hình CRT cũ', L('crt', {}), 5, 0.02]
  ]

  for (const [name, layer, t, min] of screen)
    it(`${name}: xử lý cả khung hình, không lỗi`, () => {
      const base = render([bg(), text()], t).pixels
      const { renderer, pixels } = render([bg(), text(), layer], t)
      expect([...renderer.errors.values()]).toEqual([])
      expect(changed(base, pixels)).toBeGreaterThan(W * H * min)
    })

  it('glitch không làm gì giữa hai beat', () => {
    // 118 BPM: beat tại 5,085 giây; 5,4 giây đã tắt hẳn
    const base = render([bg(), text()], 5.4).pixels
    const { pixels } = render([bg(), text(), L('glitch', {})], 5.4)
    expect(changed(base, pixels)).toBe(0)
  })

  it('thẻ đang phát: nội dung mờ đi rồi hiện lại khi đổi bài', () => {
    // Kiểu không nền: chỉ còn ảnh bìa và chữ
    const np = L('nowplaying', { y: 0.5, style: 'minimal' })
    const amount = (t: number): number => {
      const base = render([bg()], t).pixels
      const px = render([bg(), np], t).pixels
      let sum = 0
      for (let i = 0; i < px.length; i += 4) sum += Math.abs(px[i] - base[i]) + Math.abs(px[i + 1] - base[i + 1]) + Math.abs(px[i + 2] - base[i + 2])
      return sum
    }
    const settled = amount(14)
    expect(amount(12.03)).toBeLessThan(settled * 0.4)
    expect(amount(11.95)).toBeLessThan(settled * 0.6)
    expect(amount(12.6)).toBeGreaterThan(settled * 0.8)
  })
})

describe('xuất video: nạp sẵn ảnh cho các lớp mới', () => {
  it('đĩa than nhãn ảnh bìa, thẻ đang phát có ảnh bìa cần ảnh bìa các bài; nhãn tự chọn cần file ảnh đó', () => {
    const base = createDefaultProject()
    const tracks = [track('a', 60, { coverPath: '/covers/a.jpg' }), track('b', 60)]
    const only = (layers: Layer[]): string[] => collectAssets({ ...base, tracks, layers }).images.sort()
    expect(only([createLayer('vinyl', { label: 'cover' }) as Layer])).toEqual(['/covers/a.jpg'])
    expect(only([createLayer('vinyl', { label: 'custom', src: '/img/label.png' }) as Layer])).toEqual(['/img/label.png'])
    expect(only([createLayer('vinyl', { label: 'text' }) as Layer])).toEqual([])
    expect(only([createLayer('nowplaying', { showCover: true }) as Layer])).toEqual(['/covers/a.jpg'])
    expect(only([createLayer('nowplaying', { showCover: false }) as Layer, createLayer('tracklist') as Layer])).toEqual([])
  })
})

describe('kéo thả các lớp mới trên preview', () => {
  it('đĩa than, đồng hồ VU: kéo góc đổi cỡ; thẻ đang phát, danh sách bài: kéo cạnh đổi bề ngang', () => {
    for (const type of ['vinyl', 'nowplaying', 'tracklist', 'vumeter'] as const) expect(isMovable(createLayer(type))).toBe(true)
    expect(handlesFor(createLayer('vinyl'))).toEqual(['nw', 'ne', 'sw', 'se'])
    expect(handlesFor(createLayer('nowplaying'))).toEqual(['nw', 'ne', 'sw', 'se', 'e', 'w'])
    const box = { x: 100, y: 100, w: 200, h: 100 }
    const drag = (layer: Layer, handle: 'se' | 'e', start: { x: number; y: number }, px: number, py: number): Record<string, unknown> =>
      applyDrag(layer, { layerId: layer.id, mode: 'resize', handle, start, box, props: { ...(layer.props as unknown as Record<string, unknown>) }, undoKey: 'k' }, px, py, 1920, 1080, 0).patch
    const vinyl = createLayer('vinyl', { size: 0.5 }) as Layer
    expect(Number(drag(vinyl, 'se', { x: 300, y: 200 }, 400, 250).size)).toBeCloseTo(1, 2)
    const np = createLayer('nowplaying', { width: 600, size: 100 }) as Layer
    const wide = drag(np, 'e', { x: 300, y: 150 }, 400, 150)
    expect(Number(wide.width)).toBeCloseTo(1200, 0)
    expect(wide.size).toBeUndefined()
    const tl = createLayer('tracklist', { width: 0.3, fontSize: 26 }) as Layer
    const big = drag(tl, 'se', { x: 300, y: 200 }, 400, 250)
    expect(Number(big.fontSize)).toBeCloseTo(52, 0)
    expect(Number(big.width)).toBeCloseTo(0.6, 2)
  })
})
