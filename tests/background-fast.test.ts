import { describe, expect, it } from 'vitest'
import { createCanvas, type Canvas } from '@napi-rs/canvas'
import { AudioSampler, Renderer } from '../src/engine'
import { DEMO_KEY, createDemoFeatures } from '../src/engine/demoAudio'
import { NodeAssets } from '../src/main/export/nodeAssets'
import { createDefaultProject, createLayer } from '../src/shared/defaults'
import { presetById } from '../src/shared/filterPresets'
import { builtinTemplates, projectFromTemplate } from '../src/shared/templates'
import { buildTimeline } from '../src/shared/timeline'
import type { Layer, Project } from '../src/shared/types'
import { track } from './helpers'

// Nền gradient / màu đơn tô thẳng một lần (xuất video nhanh hơn) phải ra hình như cách vẽ đầy đủ:
// tô đen khung, vẽ gradient phóng to, rồi phủ đen theo độ tối của nền.

const W = 640
const H = 360
const features = createDemoFeatures(60)

function render(project: Project, t: number, fast: boolean, canvas: Canvas = createCanvas(W, H)): { data: Uint8ClampedArray; renderer: Renderer } {
  const p: Project = { ...project, tracks: [track('a', 60, { analysisKey: DEMO_KEY })], settings: { ...project.settings, width: W, height: H } }
  const tl = buildTimeline(p.tracks, p.settings)
  const renderer = new Renderer(new NodeAssets())
  renderer.fastBackground = fast
  const ctx = canvas.getContext('2d')
  renderer.render({ ctx: ctx as unknown as CanvasRenderingContext2D, project: p, timeline: tl, audio: new AudioSampler(tl, (k) => (k === DEMO_KEY ? features : undefined)), t })
  return { data: ctx.getImageData(0, 0, W, H).data as unknown as Uint8ClampedArray, renderer }
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
