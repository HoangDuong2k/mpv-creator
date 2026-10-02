import { describe, expect, it } from 'vitest'
import { createCanvas, type Canvas } from '@napi-rs/canvas'
import { AudioSampler, Renderer } from '../src/engine'
import { DEMO_KEY, createDemoFeatures } from '../src/engine/demoAudio'
import { NodeAssets } from '../src/main/export/nodeAssets'
import { createDefaultProject, createLayer } from '../src/shared/defaults'
import { presetById } from '../src/shared/filterPresets'
import { builtinTemplates, projectFromTemplate } from '../src/shared/templates'
import { buildTimeline } from '../src/shared/timeline'
import type { Layer, Project, Track } from '../src/shared/types'
import { track } from './helpers'

// Nền gradient / màu đơn tô thẳng một lần (xuất video nhanh hơn) phải ra hình như cách vẽ đầy đủ:
// tô đen khung, vẽ gradient phóng to, rồi phủ đen theo độ tối của nền.

const W = 640
const H = 360
const features = createDemoFeatures(60)

interface RenderOpts {
  assets?: NodeAssets
  tracks?: Track[]
  editLayerId?: string | null
  prebake?: boolean
}

function render(project: Project, t: number, fast: boolean, canvas: Canvas = createCanvas(W, H), opts: RenderOpts = {}): { data: Uint8ClampedArray; renderer: Renderer } {
  const tracks = opts.tracks ?? [track('a', 60, { analysisKey: DEMO_KEY })]
  const p: Project = { ...project, tracks, settings: { ...project.settings, width: W, height: H, transition: { type: 'none', duration: 0 } } }
  const tl = buildTimeline(p.tracks, p.settings)
  const renderer = new Renderer(opts.assets ?? new NodeAssets())
  renderer.fastBackground = fast
  renderer.prebakeFilters = opts.prebake ?? true
  const ctx = canvas.getContext('2d')
  renderer.render({ ctx: ctx as unknown as CanvasRenderingContext2D, project: p, timeline: tl, audio: new AudioSampler(tl, (k) => (k === DEMO_KEY ? features : undefined)), t, editLayerId: opts.editLayerId ?? null })
  return { data: ctx.getImageData(0, 0, W, H).data as unknown as Uint8ClampedArray, renderer }
}

/** Ảnh thử: ô màu sặc sỡ (đổi màu nhiều để lộ sai lệch khi phóng / làm tối), `hole`: có vùng trong suốt như PNG */
function photo(seed: number, hole = false): Canvas {
  const c = createCanvas(800, 500)
  const g = c.getContext('2d')
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `hsl(${(i * 47 + seed * 90) % 360},70%,${30 + ((i * 13) % 50)}%)`
    g.fillRect((i * 37) % 800, (i * 91 + seed * 17) % 500, 60, 40)
  }
  if (hole) g.clearRect(250, 150, 300, 200)
  return c
}

/** Tài nguyên thử: ảnh theo tên đường dẫn (ảnh không có trong danh sách = chưa nạp được) */
class PhotoAssets extends NodeAssets {
  constructor(private readonly photos: Record<string, Canvas>) {
    super()
  }
  image(path: string): CanvasImageSource | null {
    return (this.photos[path] as unknown as CanvasImageSource) ?? null
  }
}

/** Lệch màu lớn nhất giữa hai khung hình (0..255, bỏ kênh alpha) */
function maxDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let m = 0
  for (let i = 0; i < a.length; i++) if ((i & 3) !== 3) m = Math.max(m, Math.abs(a[i] - b[i]))
  return m
}

const TIMES = [0.5, 7.3, 13.1, 29.9, 44.4]
const withBackground = (layers: Layer[], bg: Layer): Layer[] => [bg, ...layers.filter((l) => l.type !== 'background')]
const usedFastPath = (r: Renderer): boolean => !r.cache.has('bg-gradient-lru')

describe('nền gradient / màu đơn tô thẳng một lần', () => {
  it('project mặc định và 7 mẫu phong cách: hình như cách vẽ đầy đủ (lệch tối đa 2/255)', () => {
    const projects = [{ name: 'Mặc định', project: createDefaultProject() }, ...builtinTemplates().map((tpl) => ({ name: tpl.name, project: projectFromTemplate(tpl) }))]
    let fastCount = 0
    for (const { name, project } of projects) {
      // Mẫu có bộ lọc màu thì nền được nướng bộ lọc — cách vẽ đó giữ nguyên
      const hasFilter = project.layers.some((l) => l.type === 'filter' && l.enabled)
      for (const t of TIMES) {
        const fast = render(project, t, true)
        const full = render(project, t, false)
        if (!hasFilter) expect(usedFastPath(fast.renderer), `${name}: dùng cách tô thẳng`).toBe(true)
        expect(maxDiff(fast.data, full.data), `${name} @ ${t}s`).toBeLessThanOrEqual(2)
      }
      if (!hasFilter) fastCount++
    }
    expect(fastCount).toBeGreaterThanOrEqual(3)
  })

  it('gradient phóng mạnh theo beat, rung, Ken Burns, độ tối cao; màu đơn', () => {
    const base = createDefaultProject()
    const backgrounds = [
      createLayer('background', { mode: 'gradient', color: '#ff3cac', color2: '#2b86c5', angle: 37, dim: 0.4, beatZoom: 0.08, shake: 6, kenBurns: 0.08 }),
      createLayer('background', { mode: 'gradient', color: '#fff', color2: '#000', angle: 90, dim: 0, beatZoom: 0, shake: 0, kenBurns: 0 }),
      createLayer('background', { mode: 'color', color: '#3a7bd5', dim: 0.3, beatZoom: 0.05, shake: 4, kenBurns: 0.05 })
    ]
    for (const bg of backgrounds) {
      const project = { ...base, layers: withBackground(base.layers, bg) }
      for (const t of TIMES) expect(maxDiff(render(project, t, true).data, render(project, t, false).data)).toBeLessThanOrEqual(2)
    }
  })

  it('bỏ tô đen khung vẫn phủ kín: vẽ lên canvas còn hình frame trước ra đúng như canvas mới', () => {
    const base = createDefaultProject()
    // Cả khi nền được nướng bộ lọc có làm mờ (mép ảnh lọc không được để lộ hình cũ)
    const dreamy = { ...base, layers: [base.layers[0], createLayer('filter', { ...presetById('dreamy')!.values, preset: 'dreamy', intensity: 1 }), ...base.layers.slice(1)] }
    for (const project of [base, dreamy]) {
      const canvas = createCanvas(W, H)
      const g = canvas.getContext('2d')
      for (const t of TIMES) {
        g.fillStyle = '#ff00ff'
        g.fillRect(0, 0, W, H)
        expect(maxDiff(render(project, t, true, canvas).data, render(project, t, true).data)).toBe(0)
      }
    }
  })

  it('rung mạnh đúng lúc Ken Burns lia hết cỡ: không lộ mép (không viền đen, không sót hình frame trước)', () => {
    const base = createDefaultProject()
    const bg = createLayer('background', { mode: 'gradient', color: '#3a1c71', color2: '#ffaf7b', angle: 30, dim: 0.3, beatZoom: 0, shake: 40, kenBurns: 0.01 })
    const warm = createLayer('filter', { ...presetById('warm')!.values, preset: 'warm', intensity: 1 })
    // Các khung hình từng lộ một hàng điểm ảnh ở mép trên / dưới (lia dùng cả phần phóng dành cho rung)
    const times = [92 / 30, 900 / 30, 962 / 30]
    for (const layers of [[bg], [bg, warm]]) {
      const project = { ...base, layers }
      const canvas = createCanvas(W, H)
      const g = canvas.getContext('2d')
      for (const t of times) {
        g.fillStyle = '#ff00ff'
        g.fillRect(0, 0, W, H)
        const stale = render(project, t, true, canvas).data
        const full = render(project, t, false).data
        let magenta = 0
        let black = 0
        for (let i = 0; i < stale.length; i += 4) {
          if (stale[i] > 200 && stale[i + 1] < 60 && stale[i + 2] > 200) magenta++
          if (full[i] + full[i + 1] + full[i + 2] < 6) black++
        }
        expect({ t, magenta, black }).toEqual({ t, magenta: 0, black: 0 })
      }
    }
  })

  it('ảnh nền, ảnh bìa: vẽ bản đã tối sẵn ra hình như cách vẽ đầy đủ (cả lúc chuyển ảnh bìa, ảnh có chỗ trong suốt)', () => {
    const assets = new PhotoAssets({ '/p/a.jpg': photo(1), '/p/hole.png': photo(2, true), '/c/a.jpg': photo(3), '/c/b.jpg': photo(4) })
    const base = createDefaultProject()
    const tracks = [track('a', 30, { analysisKey: DEMO_KEY, coverPath: '/c/a.jpg' }), track('b', 30, { analysisKey: DEMO_KEY, coverPath: '/c/b.jpg' })]
    const motion = { dim: 0.35, kenBurns: 0.05, beatZoom: 0.03, shake: 8 }
    const cases: Array<[string, Layer, number[]]> = [
      ['ảnh', createLayer('background', { mode: 'image', src: '/p/a.jpg', ...motion }), TIMES],
      ['ảnh trong suốt, làm mờ', createLayer('background', { mode: 'image', src: '/p/hole.png', blur: 6, ...motion }), TIMES],
      ['ảnh chưa nạp (hiện màu)', createLayer('background', { mode: 'image', src: '/p/missing.jpg', ...motion }), [7.3]],
      // 30,4 giây: đang chuyển từ ảnh bìa bài a sang bài b
      ['ảnh bìa', createLayer('background', { mode: 'cover', blur: 4, ...motion }), [7.3, 30.4, 31, 44.4]]
    ]
    for (const [name, bg, times] of cases) {
      const project = { ...base, layers: withBackground(base.layers, bg) }
      const canvas = createCanvas(W, H)
      const g = canvas.getContext('2d')
      for (const t of times) {
        const full = render(project, t, false, undefined, { assets, tracks })
        const fresh = render(project, t, true, undefined, { assets, tracks })
        expect(fresh.renderer.cache.has('bg-dim-lru') || name.startsWith('ảnh chưa nạp'), `${name}: dùng ảnh đã tối sẵn`).toBe(true)
        expect(maxDiff(fresh.data, full.data), `${name} @ ${t}s`).toBeLessThanOrEqual(2)
        // Không tô đen khung trước: canvas còn hình cũ vẫn ra đúng
        g.fillStyle = '#ff00ff'
        g.fillRect(0, 0, W, H)
        expect(maxDiff(render(project, t, true, canvas, { assets, tracks }).data, fresh.data), `${name} @ ${t}s, canvas cũ`).toBe(0)
      }
    }
  })

  it('nền đục che hết các lớp nằm dưới: không vẽ các lớp đó (trừ lớp đang chỉnh), hình không đổi', () => {
    const assets = new PhotoAssets({ '/p/a.jpg': photo(1) })
    const base = createDefaultProject()
    const viz = { ...createLayer('visualizer', {}), id: 'viz-below' } as Layer
    const below = { ...createLayer('filter', { ...presetById('warm')!.values, preset: 'warm', intensity: 1 }), id: 'filter-below' } as Layer
    const bg = { ...createLayer('background', { mode: 'image', src: '/p/a.jpg', dim: 0.3 }), id: 'photo' } as Layer
    const above = { ...createLayer('filter', { ...presetById('cool')!.values, preset: 'cool', intensity: 1 }), id: 'filter-above' } as Layer
    const text = { ...createLayer('text', { template: 'Trên ảnh' }), id: 'text-above' } as Layer
    const project = { ...base, layers: [base.layers[0], viz, below, bg, text] }
    // Có thêm bộ lọc màu trên ảnh: lớp dưới không còn chặn nên bộ lọc được nướng sẵn vào ảnh nền
    // (nhanh hơn lọc cả khung mỗi frame; sai số của cách nướng xem filter-bake.test)
    const filtered = { ...base, layers: [base.layers[0], viz, below, bg, above, text] }
    for (const t of [3.2, 20]) {
      const fast = render(project, t, true, undefined, { assets })
      const full = render(project, t, false, undefined, { assets })
      expect(maxDiff(fast.data, full.data), `@ ${t}s`).toBeLessThanOrEqual(2)
      expect(render(filtered, t, true, undefined, { assets }).renderer.cache.has('filter-bake')).toBe(true)
      expect(render(filtered, t, false, undefined, { assets }).renderer.cache.has('filter-bake')).toBe(false)
      expect(fast.renderer.bounds.has('viz-below')).toBe(false)
      expect(full.renderer.bounds.has('viz-below')).toBe(true)
      expect(fast.renderer.bounds.has('text-above')).toBe(true)
      // Lớp đang chỉnh trên preview vẫn vẽ (để còn khung chọn) dù bị nền che
      expect(render(project, t, true, undefined, { assets, editLayerId: 'viz-below' }).renderer.bounds.has('viz-below')).toBe(true)
    }
    // Ảnh nền đang hiện dần: lớp dưới vẫn lộ ra nên vẫn vẽ
    const fading = { ...project, layers: project.layers.map((l) => (l.id === 'photo' ? { ...l, timing: { start: 0, end: null, fadeIn: 3, fadeOut: 0 } } : l)) }
    const r = render(fading, 1, true, undefined, { assets })
    expect(r.renderer.bounds.has('viz-below')).toBe(true)
    // Bộ lọc "Ấm áp" (lọc từng frame) khuếch đại sai số làm tròn ≤ 2/255 của nền gradient tô thẳng
    expect(maxDiff(r.data, render(fading, 1, false, undefined, { assets }).data)).toBeLessThanOrEqual(4)
  })

  it('không dùng cách tô thẳng khi nền có độ trong, đang hiện dần, hoặc không phải lớp đục', () => {
    const base = createDefaultProject()
    const cases: Layer[] = [
      createLayer('background', { mode: 'color', color: 'rgba(40,80,160,0.5)', dim: 0.2 }),
      { ...createLayer('background', { mode: 'gradient', color: '#123456', color2: '#abcdef', dim: 0.2 }), timing: { start: 0, end: null, fadeIn: 3, fadeOut: 0 } }
    ]
    for (const bg of cases) {
      const project = { ...base, layers: withBackground(base.layers, bg) }
      const fast = render(project, 1, true)
      expect(maxDiff(fast.data, render(project, 1, false).data)).toBe(0)
    }
  })
})
