import { describe, expect, it } from 'vitest'
import { createCanvas } from '@napi-rs/canvas'
import { AudioSampler, Renderer } from '../src/engine'
import { NodeAssets } from '../src/main/export/nodeAssets'
import { createDefaultProject, createLayer, LAYER_DEFAULTS } from '../src/shared/defaults'
import { FILTER_KEYS, FILTER_PRESETS, cssFilterOf, isNeutralFilter, presetById } from '../src/shared/filterPresets'
import { buildTimeline } from '../src/shared/timeline'
import type { Layer, Project } from '../src/shared/types'
import { FIELDS } from '../src/renderer/src/fields'
import { track } from './helpers'

const W = 320
const H = 180

/** Vẽ một frame (320×180) và trả về màu điểm giữa khung */
function renderCenter(layers: Layer[], t = 1): [number, number, number] {
  const project: Project = { ...createDefaultProject(), layers, tracks: [track('a', 60)] }
  project.settings = { ...project.settings, width: W, height: H }
  const tl = buildTimeline(project.tracks, project.settings)
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  new Renderer(new NodeAssets()).render({ ctx: ctx as unknown as CanvasRenderingContext2D, project, timeline: tl, audio: new AudioSampler(tl, () => undefined), t })
  const d = ctx.getImageData(W / 2, H / 2, 1, 1).data
  return [d[0], d[1], d[2]]
}

const red = (): Layer => createLayer('background', { mode: 'color', color: '#ff2020', dim: 0, beatZoom: 0, kenBurns: 0 })
const green = (): Layer => createLayer('background', { mode: 'color', color: '#20c040', dim: 0, beatZoom: 0, kenBurns: 0 })
const bw = (extra: Partial<Layer['props']> = {}): Layer => createLayer('filter', { ...presetById('bw')!.values, preset: 'bw', intensity: 1, ...extra })

describe('bộ lọc màu', () => {
  it('đen trắng làm mất màu các lớp bên dưới', () => {
    const [r, g, b] = renderCenter([red(), bw()])
    expect(Math.abs(r - g)).toBeLessThanOrEqual(1)
    expect(Math.abs(g - b)).toBeLessThanOrEqual(1)
  })

  it('cường độ 0 = không đổi gì; 0.5 = nửa chừng', () => {
    const orig = renderCenter([red()])
    expect(renderCenter([red(), bw({ intensity: 0 })])).toEqual(orig)
    const half = renderCenter([red(), bw({ intensity: 0.5 })])
    const full = renderCenter([red(), bw()])
    expect(half[0]).toBeGreaterThan(full[0])
    expect(half[0]).toBeLessThan(orig[0])
  })

  it('chỉ tác động lên lớp nằm dưới (lớp phía trên giữ nguyên màu)', () => {
    const above = renderCenter([red(), bw(), green()])
    expect(above).toEqual(renderCenter([green()]))
  })

  it('theo khoảng thời gian trên timeline: ngoài khoảng thì không lọc', () => {
    const f = bw()
    f.timing = { start: 10, end: 20, fadeIn: 0, fadeOut: 0 }
    const orig = renderCenter([red()])
    expect(renderCenter([red(), f], 5)).toEqual(orig)
    const inside = renderCenter([red(), f], 15)
    expect(Math.abs(inside[0] - inside[1])).toBeLessThanOrEqual(1)
  })

  it('mẫu mặc định và mọi mẫu nằm trong giới hạn của ô chỉnh', () => {
    expect(LAYER_DEFAULTS.filter.preset).toBe('warm')
    for (const p of FILTER_PRESETS) {
      for (const k of FILTER_KEYS) {
        const f = FIELDS.filter.find((x) => x.kind === 'range' && x.key === k) as { min: number; max: number }
        expect(p.values[k], `${p.id}.${k}`).toBeGreaterThanOrEqual(f.min)
        expect(p.values[k], `${p.id}.${k}`).toBeLessThanOrEqual(f.max)
      }
    }
    expect(isNeutralFilter(presetById('none')!.values)).toBe(true)
  })

  it('chuỗi CSS filter', () => {
    expect(cssFilterOf(presetById('none')!.values, 0)).toBe('none')
    expect(cssFilterOf({ ...presetById('none')!.values, brightness: 0.1, saturation: -1, hue: 30 }, 2)).toBe('brightness(1.1) saturate(0) hue-rotate(30deg) blur(2px)')
  })
})
