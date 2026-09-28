import { describe, expect, it } from 'vitest'
import { createCanvas } from '@napi-rs/canvas'
import { AudioSampler, Renderer } from '../src/engine'
import { NodeAssets } from '../src/main/export/nodeAssets'
import { createDefaultProject, createLayer } from '../src/shared/defaults'
import { FILTER_PRESETS, presetById } from '../src/shared/filterPresets'
import { buildTimeline } from '../src/shared/timeline'
import type { FilterProps, Layer, Project, Track } from '../src/shared/types'
import { track } from './helpers'

// Bộ lọc chỉ tác động lên nền tĩnh được "nướng" sẵn vào ảnh nền; kết quả phải gần như trùng với cách lọc từng frame.

const W = 640
const H = 360

/** Ảnh "phong cảnh" tổng hợp có nhiều chi tiết (trời, mặt trời, núi, sọc nhỏ) */
function makePhoto(seed: number): CanvasImageSource {
  const c = createCanvas(800, 500)
  const g = c.getContext('2d')
  const sky = g.createLinearGradient(0, 0, 0, 500)
  sky.addColorStop(0, seed ? '#3a1c71' : '#1e3c72')
  sky.addColorStop(0.6, seed ? '#d76d77' : '#f2a65a')
  sky.addColorStop(1, '#ffaf7b')
  g.fillStyle = sky
  g.fillRect(0, 0, 800, 500)
  g.fillStyle = '#fff3b0'
  g.beginPath()
  g.arc(560 - seed * 200, 190, 60, 0, Math.PI * 2)
  g.fill()
  const hills: [string, number][] = [['#2d4059', 300], ['#1b262c', 360], ['#0f4c3a', 420]]
  for (const [color, y] of hills) {
    g.fillStyle = color
    g.beginPath()
    g.moveTo(0, 500)
    for (let x = 0; x <= 800; x += 40) g.lineTo(x, y + Math.sin(x / 70 + y + seed) * 35)
    g.lineTo(800, 500)
    g.fill()
  }
  // Cỏ: nét nhỏ tương phản vừa phải (ảnh thật hiếm có cả vùng sọc đen trắng 3 px)
  for (let i = 0; i < 160; i++) {
    g.fillStyle = i % 3 ? '#2f6b3a' : '#5c9a4a'
    g.fillRect(i * 5, 450 + (i % 4) * 6, 3, 50)
  }
  return c as unknown as CanvasImageSource
}

/** Trường hợp xấu nhất: cả vùng sọc đen trắng 3 px — mọi điểm ảnh đều là mép sắc khi phóng to */
function makeStripes(): CanvasImageSource {
  const c = createCanvas(800, 500)
  const g = c.getContext('2d')
  for (let i = 0; i < 800 / 3; i++) {
    g.fillStyle = i % 2 ? '#ffffff' : '#222222'
    g.fillRect(i * 3, 0, 3, 500)
  }
  return c as unknown as CanvasImageSource
}

const IMAGES: Record<string, CanvasImageSource> = { photo: makePhoto(0), coverA: makePhoto(0), coverB: makePhoto(1) }

class TestAssets extends NodeAssets {
  image(path: string): CanvasImageSource | null {
    return IMAGES[path] ?? null
  }
}

interface Frame {
  data: Uint8ClampedArray
  renderer: Renderer
}

function renderFrame(layers: Layer[], opts: { t?: number; prebake?: boolean; renderer?: Renderer; tracks?: Track[]; scale?: number } = {}): Frame {
  const project: Project = { ...createDefaultProject(), layers, tracks: opts.tracks ?? [track('a', 60)] }
  project.settings = { ...project.settings, width: W, height: H }
  const tl = buildTimeline(project.tracks, project.settings)
  const scale = opts.scale ?? 1
  const canvas = createCanvas(Math.round(W * scale), Math.round(H * scale))
  const ctx = canvas.getContext('2d')
  const renderer = opts.renderer ?? new Renderer(new TestAssets())
  renderer.prebakeFilters = opts.prebake ?? true
  renderer.render({ ctx: ctx as unknown as CanvasRenderingContext2D, project, timeline: tl, audio: new AudioSampler(tl, () => undefined), t: opts.t ?? 9, scale })
  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data as unknown as Uint8ClampedArray, renderer }
}

interface Diff {
  max: number
  mean: number
  /** 99,9% kênh màu lệch không quá mức này (bỏ dải viền `margin` px quanh khung) */
  p999: number
}

/**
 * Lệch màu giữa hai khung hình (0..255). Nền phóng / lia (Ken Burns) nên thứ tự "lọc rồi phóng" khác
 * "phóng rồi lọc" ở đúng các cạnh sắc nét (phép soft-light không tuyến tính) và ở dải viền của phép
 * làm mờ — `p999` đo phần bên trong khung, bỏ dải viền đó.
 */
function diff(a: Uint8ClampedArray, b: Uint8ClampedArray, margin = 16): Diff {
  let max = 0
  let sum = 0
  let n = 0
  const hist = new Uint32Array(256)
  let inner = 0
  for (let i = 0; i < a.length; i += 4) {
    const px = i / 4
    const x = px % W
    const y = Math.floor(px / W)
    const inside = x >= margin && y >= margin && x < W - margin && y < H - margin
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(a[i + c] - b[i + c])
      if (d > max) max = d
      sum += d
      n++
      if (inside) {
        hist[d]++
        inner++
      }
    }
  }
  let p999 = 0
  for (let acc = 0; p999 < 255; p999++) {
    acc += hist[p999]
    if (acc >= inner * 0.999) break
  }
  return { max, mean: sum / n, p999 }
}

const fmt = (d: Diff): string => `max ${d.max}, p99.9 ${d.p999}, mean ${d.mean.toFixed(3)}`

function bakedEntries(r: Renderer): number {
  return (r.cache.get('filter-bake') as Map<string, unknown> | undefined)?.size ?? 0
}

const photoBg = (extra: Record<string, unknown> = {}): Layer =>
  createLayer('background', { mode: 'image', src: 'photo', dim: 0.25, beatZoom: 0.04, kenBurns: 0.05, blur: 0, ...extra })
const filter = (preset: string, extra: Partial<FilterProps> = {}): Layer =>
  createLayer('filter', { ...presetById(preset)!.values, preset, intensity: 1, ...extra })

describe('nướng sẵn bộ lọc vào ảnh nền', () => {
  it('ảnh có vùng sọc đen trắng rất sắc: chỉ lệch ở mép sọc (thứ tự phóng / lọc)', () => {
    IMAGES.stripes = makeStripes()
    const layers = [photoBg({ src: 'stripes' }), filter('sunset')]
    const d = diff(renderFrame(layers).data, renderFrame(layers, { prebake: false }).data)
    console.log(`  sọc đen trắng 3 px: ${fmt(d)}`)
    expect(d.mean).toBeLessThan(3)
    expect(d.max).toBeLessThanOrEqual(24)
  })

  it('mọi mẫu lọc: nướng sẵn ≈ lọc từng frame (nền ảnh có Ken Burns + làm tối)', () => {
    const report: string[] = []
    for (const p of FILTER_PRESETS) {
      if (p.id === 'none') continue
      const layers = [photoBg(), filter(p.id)]
      const baked = renderFrame(layers)
      const perFrame = renderFrame(layers, { prebake: false })
      expect(bakedEntries(baked.renderer), p.id).toBe(1)
      expect(bakedEntries(perFrame.renderer), p.id).toBe(0)
      const d = diff(baked.data, perFrame.data)
      report.push(`${p.id}: ${fmt(d)}`)
      expect(d.mean, p.id).toBeLessThan(1)
      expect(d.p999, p.id).toBeLessThanOrEqual(8)
    }
    console.log('  lệch màu nướng sẵn so với lọc từng frame —', report.join(' · '))
  })

  it('nền đứng yên (không phóng / lia): nướng sẵn trùng khít lọc từng frame', () => {
    for (const id of ['warm', 'dreamy', 'vintage', 'bw', 'neon']) {
      const layers = [photoBg({ kenBurns: 0 }), filter(id)]
      expect(diff(renderFrame(layers).data, renderFrame(layers, { prebake: false }).data).max, id).toBe(0)
    }
  })

  it('cường độ < 1 và lúc bộ lọc đang hiện dần cũng khớp', () => {
    const half = [photoBg(), filter('vintage', { intensity: 0.5 })]
    const d1 = diff(renderFrame(half).data, renderFrame(half, { prebake: false }).data)
    const fading = filter('warm')
    fading.timing = { start: 0, end: null, fadeIn: 20, fadeOut: 0 }
    const d2 = diff(renderFrame([photoBg(), fading]).data, renderFrame([photoBg(), fading], { prebake: false }).data)
    console.log(`  cường độ 0.5: ${fmt(d1)} · đang hiện dần: ${fmt(d2)}`)
    for (const d of [d1, d2]) {
      expect(d.mean).toBeLessThan(1)
      expect(d.p999).toBeLessThanOrEqual(8)
    }
  })

  it('ảnh bìa đổi theo bài: nướng từng ảnh bìa, lúc hai ảnh bìa đan nhau thì lọc từng frame', () => {
    const tracks = [track('a', 30, { coverPath: 'coverA' }), track('b', 30, { coverPath: 'coverB' })]
    const layers = [photoBg({ mode: 'cover' }), filter('sunset')]
    const tl = buildTimeline(tracks, createDefaultProject().settings)
    const renderer = new Renderer(new TestAssets())
    for (const [t, entries] of [[5, 1], [tl.entries[1].displayStart + 3, 2]] as const) {
      const baked = renderFrame(layers, { tracks, t, renderer })
      const d = diff(baked.data, renderFrame(layers, { tracks, t, prebake: false }).data)
      console.log(`  ảnh bìa t=${t.toFixed(1)}: ${fmt(d)}`)
      expect(bakedEntries(renderer)).toBe(entries)
      expect(d.mean).toBeLessThan(1)
      expect(d.p999).toBeLessThanOrEqual(8)
    }
    // Giữa lúc chuyển ảnh bìa: không nướng, trùng khít cách lọc từng frame
    const t = tl.entries[1].displayStart + 0.5
    const mid = renderFrame(layers, { tracks, t })
    expect(bakedEntries(mid.renderer)).toBe(0)
    expect(diff(mid.data, renderFrame(layers, { tracks, t, prebake: false }).data).max).toBe(0)
  })

  it('viền tối và hạt phim vẫn vẽ theo khung hình, hạt phim vẫn chuyển động', () => {
    const still = (extra: Partial<FilterProps>, t = 9): Uint8ClampedArray => renderFrame([photoBg({ kenBurns: 0 }), filter('warm', extra)], { t }).data
    const plain = still({})
    const vignette = still({ vignette: 0.8 })
    const corner = (d: Uint8ClampedArray): number => d[0] + d[1] + d[2]
    const center = (d: Uint8ClampedArray): number => {
      const i = ((H / 2) * W + W / 2) * 4
      return d[i] + d[i + 1] + d[i + 2]
    }
    expect(corner(vignette)).toBeLessThan(corner(plain) * 0.7)
    expect(Math.abs(center(vignette) - center(plain))).toBeLessThanOrEqual(3)
    // Hạt phim đổi 24 lần/giây; nền đứng yên nên khác biệt giữa hai thời điểm chỉ do hạt phim
    expect(diff(still({ grain: 0.6 }, 9), still({ grain: 0.6 }, 9.05)).mean).toBeGreaterThan(1)
    expect(diff(still({}, 9), still({}, 9.05)).max).toBe(0)
  })

  it('bộ lọc nằm trên lớp khác (chữ, cột sóng…) thì vẫn lọc từng frame', () => {
    const text = createLayer('text', { template: 'Xin chào' })
    const layers = [photoBg(), text, filter('warm')]
    const a = renderFrame(layers)
    const b = renderFrame(layers, { prebake: false })
    expect(bakedEntries(a.renderer)).toBe(0)
    expect(diff(a.data, b.data).max).toBe(0)
  })

  it('cường độ 0 hoặc ngoài khoảng thời gian: không đổi gì', () => {
    const orig = renderFrame([photoBg()]).data
    expect(diff(renderFrame([photoBg(), filter('bw', { intensity: 0 })]).data, orig).max).toBe(0)
    const timed = filter('bw')
    timed.timing = { start: 20, end: 30, fadeIn: 0, fadeOut: 0 }
    const outside = renderFrame([photoBg(), timed], { t: 9 })
    expect(diff(outside.data, orig).max).toBe(0)
    expect(bakedEntries(outside.renderer)).toBe(0)
    const inside = renderFrame([photoBg(), timed], { t: 25 }).data
    expect(diff(inside, renderFrame([photoBg()], { t: 25 }).data).mean).toBeGreaterThan(5)
  })

  it('đổi thông số thì nướng lại vào đúng canvas cũ, không sinh thêm', () => {
    const renderer = new Renderer(new TestAssets())
    const f = filter('warm')
    let prev: Uint8ClampedArray | null = null
    for (let i = 0; i < 10; i++) {
      f.props = { ...(f.props as FilterProps), brightness: -0.2 + i * 0.04 }
      const out = renderFrame([photoBg(), f], { renderer }).data
      if (prev) expect(diff(out, prev).mean).toBeGreaterThan(0.5)
      prev = out
      expect(bakedEntries(renderer)).toBe(1)
    }
    // Ảnh mẫu thu nhỏ (khung chọn mẫu lọc) lọc từng frame, không nướng ảnh cỡ thật
    const thumb = renderFrame([photoBg(), filter('warm')], { scale: 0.1 })
    expect(bakedEntries(thumb.renderer)).toBe(0)
  })
})

describe('bộ nhớ đệm nền gradient', () => {
  it('kéo bảng chọn màu không làm bộ nhớ đệm phình ra', () => {
    const r = new Renderer(new NodeAssets())
    const canvas = createCanvas(W, H)
    const bg = createLayer('background', { mode: 'gradient', beatZoom: 0, kenBurns: 0 })
    for (let i = 0; i < 12; i++) {
      const layer = { ...bg, props: { ...bg.props, color: `#${(i * 20).toString(16).padStart(2, '0')}3050` } } as Layer
      const project: Project = { ...createDefaultProject(), layers: [layer], tracks: [track('a', 60)] }
      project.settings = { ...project.settings, width: W, height: H }
      const tl = buildTimeline(project.tracks, project.settings)
      r.render({ ctx: canvas.getContext('2d') as unknown as CanvasRenderingContext2D, project, timeline: tl, audio: new AudioSampler(tl, () => undefined), t: 1 })
    }
    expect((r.cache.get('bg-gradient-lru') as Map<string, unknown>).size).toBeLessThanOrEqual(4)
    expect([...r.cache.keys()].filter((k) => k.startsWith('bg-gradient|'))).toEqual([])
  })
})
