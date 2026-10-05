import { join } from 'path'
import { createCanvas } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { AudioSampler, Renderer } from '../src/engine'
import { createDemoFeatures, DEMO_KEY } from '../src/engine/demoAudio'
import { cameraStrength } from '../src/engine/layers/camera'
import { mixColor, withAlpha } from '../src/engine/util'
import { NodeAssets, registerFonts } from '../src/main/export/nodeAssets'
import { layersWithPreview, PREVIEW_LAYER_ID } from '../src/renderer/src/libraryPreview'
import { createDefaultProject, createLayer, LAYER_DEFAULTS } from '../src/shared/defaults'
import { buildTimeline } from '../src/shared/timeline'
import type { CameraProps, Layer, LayerPropsMap, LayerType, Project } from '../src/shared/types'
import { track } from './helpers'

describe('xem thử mục thư viện trên preview', () => {
  const base = createDefaultProject()
  const layers = base.layers

  it('hiệu ứng: thêm một lớp xem thử lên trên cùng, project không đổi', () => {
    const before = JSON.stringify(layers)
    const r = layersWithPreview(layers, { item: { kind: 'preset', id: 'pt-snow' }, at: 12 }, null)
    expect(r.layers.length).toBe(layers.length + 1)
    const top = r.layers.at(-1)!
    expect(top.id).toBe(PREVIEW_LAYER_ID)
    expect(top.type).toBe('particles')
    expect(top.props).toMatchObject({ style: 'snow' })
    expect(r.editLayerId).toBe(PREVIEW_LAYER_ID)
    expect(JSON.stringify(layers)).toBe(before)
  })

  it('nút Đăng ký: hiện ngay từ lúc bấm xem thử', () => {
    const r = layersWithPreview(layers, { item: { kind: 'preset', id: 'cta-sub' }, at: 75.5 }, null)
    expect(r.layers.at(-1)!.props).toMatchObject({ schedule: 'times', times: '1:15.5' })
  })

  it('bộ lọc: chèn ngay trên lớp nền; đang chọn lớp bộ lọc thì xem thử trên chính lớp đó', () => {
    const r = layersWithPreview(layers, { item: { kind: 'filter', id: 'warm' }, at: 0 }, null)
    const i = r.layers.findIndex((l) => l.id === PREVIEW_LAYER_ID)
    expect(r.layers[i - 1].type).toBe('background')
    expect(r.layers[i].props).toMatchObject({ preset: 'warm', intensity: 1 })
    const filter = { ...createLayer('filter', { preset: 'bw', intensity: 0.7 }), id: 'f1' } as Layer
    const withFilter = [layers[0], filter, ...layers.slice(1)]
    const r2 = layersWithPreview(withFilter, { item: { kind: 'filter', id: 'warm' }, at: 0 }, 'f1')
    expect(r2.layers.length).toBe(withFilter.length)
    expect(r2.layers[1].props).toMatchObject({ preset: 'warm', intensity: 0.7 })
    expect(r2.editLayerId).toBe('f1')
    expect(filter.props).toMatchObject({ preset: 'bw' })
  })

  it('ảnh / video: xem thử làm nền cho cả video (thay ảnh của lớp nền chính)', () => {
    const r = layersWithPreview(layers, { item: { kind: 'media', path: '/anh/nen.jpg' }, at: 0 }, null)
    expect(r.layers.length).toBe(layers.length)
    expect(r.layers[0].props).toMatchObject({ mode: 'image', src: '/anh/nen.jpg' })
    expect(layers[0].props).toMatchObject({ mode: 'gradient' })
    const noBg = layers.filter((l) => l.type !== 'background')
    const r2 = layersWithPreview(noBg, { item: { kind: 'media', path: '/v/clip.mp4' }, at: 0 }, null)
    expect(r2.layers[0]).toMatchObject({ id: PREVIEW_LAYER_ID, type: 'background', props: { mode: 'video', src: '/v/clip.mp4' } })
  })
})

describe('màu pha giữa hai màu dùng tiếp được với độ trong', () => {
  it('mixColor trả về màu hex', () => {
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(withAlpha(mixColor('#ff0000', '#0000ff', 0.5), 0.2)).toBe('rgba(128,0,128,0.2)')
  })
})

describe('hiệu ứng khung hình: độ mạnh theo nhạc', () => {
  const audio = (v: number): AudioSampler => ({ beat: () => v, bass: () => v }) as unknown as AudioSampler
  const P = (over: Partial<CameraProps>): CameraProps => ({ ...LAYER_DEFAULTS.camera, ...over })
  it('theo beat / bass nhân với độ mạnh; luôn bật thì không phụ thuộc nhạc; xung beat yếu coi như đã tắt', () => {
    expect(cameraStrength(P({ trigger: 'beat', amount: 0.5 }), { t: 1, fade: 1, audio: audio(1) })).toBeCloseTo(0.5, 9)
    expect(cameraStrength(P({ trigger: 'beat', amount: 1 }), { t: 1, fade: 1, audio: audio(0.08) })).toBe(0)
    expect(cameraStrength(P({ trigger: 'bass', amount: 1 }), { t: 1, fade: 0.5, audio: audio(1) })).toBeCloseTo(0.5, 9)
    expect(cameraStrength(P({ trigger: 'always', amount: 0.7 }), { t: 1, fade: 1, audio: audio(0) })).toBeCloseTo(0.7, 9)
  })
})

describe('hiệu ứng mới vẽ bằng Skia (như khi xuất video)', () => {
  registerFonts(join(__dirname, '..', 'resources', 'fonts'))
  const W = 640
  const H = 360
  const demo = createDemoFeatures(12)
  const L = <T extends LayerType>(type: T, props: Partial<LayerPropsMap[T]> = {}): Layer => ({ ...createLayer(type, props), id: type }) as Layer
  const bg = (): Layer => ({ ...L('background', { mode: 'gradient', color: '#1d2a4a', color2: '#5b3a6e', beatZoom: 0, kenBurns: 0 }), id: 'bg' })
  const text = (): Layer => ({ ...L('text', { template: '{title}', size: 120, y: 0.4, x: 0.35 }), id: 'caption' })

  function render(layers: Layer[], t: number): { renderer: Renderer; pixels: Uint8ClampedArray } {
    const project: Project = {
      ...createDefaultProject(),
      settings: { ...createDefaultProject().settings, width: W, height: H, transition: { type: 'none', duration: 0 } },
      tracks: [track('a', 12, { analysisKey: DEMO_KEY }), track('b', 12, { analysisKey: DEMO_KEY })],
      layers
    }
    const tl = buildTimeline(project.tracks, project.settings)
    const renderer = new Renderer(new NodeAssets())
    const canvas = createCanvas(W, H)
    const ctx = canvas.getContext('2d')
    renderer.render({ ctx: ctx as unknown as CanvasRenderingContext2D, project, timeline: tl, audio: new AudioSampler(tl, (k) => (k === DEMO_KEY ? demo : undefined)), t })
    return { renderer, pixels: ctx.getImageData(0, 0, W, H).data }
  }
  const changed = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
    let n = 0
    for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++
    return n
  }

  // [tên, lớp, t, tỉ lệ điểm ảnh tối thiểu phải đổi rõ]
  const cases: Array<[string, Layer, number, number]> = [
    ['trái tim bay', L('particles', { style: 'hearts', count: 40, size: 5, color: '#ff5c8a' }), 5, 0.004],
    ['hoa anh đào rơi', L('particles', { style: 'petals', count: 70, size: 4, color: '#ffc1d3' }), 5, 0.004],
    ['đom đóm', L('particles', { style: 'fireflies', count: 45, size: 2.5, color: '#d8ff6b' }), 5, 0.002],
    ['bong bóng', L('particles', { style: 'bubbles', count: 40, size: 6, color: '#bfe9ff' }), 5, 0.004],
    ['pháo giấy', L('particles', { style: 'confetti', count: 120, size: 4, multicolor: true }), 5, 0.004],
    ['sương mù', L('particles', { style: 'fog', count: 14, size: 5, color: '#dfe7f2', opacity: 0.8 }), 5, 0.2],
    ['pháo hoa', L('particles', { style: 'fireworks', count: 75, size: 3, multicolor: true }), 5.6, 0.002],
    ['rò sáng', L('light', { style: 'leak' }), 5, 0.3],
    ['lóe sáng ống kính', L('light', { style: 'flare' }), 5, 0.05],
    ['tia sáng', L('light', { style: 'rays', x: 0.7, y: 0 }), 5, 0.1],
    ['cầu vồng lăng kính', L('light', { style: 'prism', intensity: 0.8 }), 12, 0.05],
    ['phóng to theo nhịp', L('camera', { style: 'zoom', amount: 1 }), 5.1, 0.01],
    ['rung khung hình', L('camera', { style: 'shake', amount: 1 }), 5.1, 0.01],
    ['phóng mờ', L('camera', { style: 'zoomblur', amount: 1 }), 5.1, 0.01],
    ['lệch màu ống kính', L('camera', { style: 'chromatic', trigger: 'always', amount: 1 }), 5, 0.002],
    ['khối điểm ảnh', L('camera', { style: 'pixelate', amount: 1 }), 5.1, 0.004],
    ['soi gương', L('camera', { style: 'mirror' }), 5, 0.02],
    ['kính vạn hoa', L('camera', { style: 'kaleido' }), 5, 0.05],
    ['viền điện ảnh', L('camera', { style: 'bars' }), 5, 0.1]
  ]

  for (const [name, layer, t, min] of cases)
    it(`${name}: vẽ được, không lỗi, hình chỉ phụ thuộc thời điểm t`, () => {
      const base = render([bg(), text()], t).pixels
      const a = render([bg(), text(), layer], t)
      expect([...a.renderer.errors.values()]).toEqual([])
      expect(changed(base, a.pixels)).toBeGreaterThan(W * H * min)
      // Renderer mới (như một luồng xuất video khác) ra đúng hình đó
      expect(Buffer.from(render([bg(), text(), layer], t).pixels).equals(Buffer.from(a.pixels))).toBe(true)
    })

  it('hiệu ứng theo beat không làm gì giữa hai beat', () => {
    // 118 BPM: beat tại 5,085 giây; 5,45 giây đã tắt hẳn
    const base = render([bg(), text()], 5.45).pixels
    for (const style of ['zoom', 'shake', 'zoomblur', 'pixelate'] as const) expect(changed(base, render([bg(), text(), L('camera', { style, amount: 1 })], 5.45).pixels), style).toBe(0)
  })

  it('soi gương: nửa phải là ảnh phản chiếu của nửa trái', () => {
    const { pixels } = render([bg(), text(), L('camera', { style: 'mirror', mirror: 'left' })], 5)
    let diff = 0
    for (let y = 0; y < H; y += 7)
      for (let x = 0; x < W / 2; x += 5) {
        const a = (y * W + x) * 4
        const b = (y * W + (W - 1 - x)) * 4
        diff = Math.max(diff, Math.abs(pixels[a] - pixels[b]), Math.abs(pixels[a + 1] - pixels[b + 1]), Math.abs(pixels[a + 2] - pixels[b + 2]))
      }
    expect(diff).toBeLessThanOrEqual(2)
  })

  it('viền điện ảnh: dải đen trên / dưới theo tỉ lệ 2.39, trượt vào lúc lớp bắt đầu hiện', () => {
    const bar = Math.round((H - W / 2.39) / 2)
    const px = (d: Uint8ClampedArray, y: number): number => d[(y * W + W / 2) * 4] + d[(y * W + W / 2) * 4 + 1] + d[(y * W + W / 2) * 4 + 2]
    const full = render([bg(), L('camera', { style: 'bars', ratio: 2.39 })], 5).pixels
    expect(px(full, 2)).toBe(0)
    expect(px(full, bar - 3)).toBe(0)
    expect(px(full, bar + 3)).toBeGreaterThan(0)
    expect(px(full, H - 3)).toBe(0)
    // 0,2 giây sau khi lớp hiện: dải mới trượt vào một phần
    const sliding = render([bg(), L('camera', { style: 'bars', ratio: 2.39, slideIn: 0.8 })], 0.2).pixels
    expect(px(sliding, 2)).toBe(0)
    expect(px(sliding, bar - 3)).toBeGreaterThan(0)
  })

  it('lóe sáng, tia sáng kéo được nguồn sáng trên preview; rò sáng phủ cả khung, không có khung chọn', () => {
    expect(render([bg(), L('light', { style: 'flare', x: 0.3, y: 0.4 })], 5).renderer.bounds.get('light')).toBeDefined()
    const b = render([bg(), L('light', { style: 'rays', x: 0.3, y: 0.4 })], 5).renderer.bounds.get('light')!
    expect(b.x + b.w / 2).toBeCloseTo(0.3 * W, 0)
    expect(b.y + b.h / 2).toBeCloseTo(0.4 * H, 0)
    expect(render([bg(), L('light', { style: 'leak' })], 5).renderer.bounds.has('light')).toBe(false)
  })
})
