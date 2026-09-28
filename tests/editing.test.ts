import { describe, expect, it } from 'vitest'
import { createCanvas } from '@napi-rs/canvas'
import { AudioSampler, Renderer } from '../src/engine'
import { NodeAssets } from '../src/main/export/nodeAssets'
import { createLayer } from '../src/shared/defaults'
import { createDefaultProject } from '../src/shared/defaults'
import { buildTimeline } from '../src/shared/timeline'
import { applyDrag, hitTest, type DragSession } from '../src/renderer/src/editing'
import type { Layer } from '../src/shared/types'
import { track } from './helpers'

const W = 1920
const H = 1080

function session(layer: Layer, box: DragSession['box'], start: { x: number; y: number }, mode: DragSession['mode'] = 'move', handle?: DragSession['handle']): DragSession {
  return { layerId: layer.id, mode, handle, start, box, props: { ...(layer.props as unknown as Record<string, unknown>) }, undoKey: 'drag-test' }
}

describe('kéo thả trên preview', () => {
  const viz = createLayer('visualizer', { x: 0.5, y: 0.66, width: 0.7, height: 0.3 })
  const box = { x: 288, y: 550.8, w: 1344, h: 324 }

  it('di chuyển: đổi x/y theo độ dời chuột', () => {
    const { patch } = applyDrag(viz, session(viz, box, { x: 900, y: 700 }), 900 + 192, 700 - 108, W, H, 0)
    expect(patch).toEqual({ x: 0.6, y: 0.56 })
  })

  it('bắt dính vào giữa khung khi gần tâm', () => {
    const v = createLayer('visualizer', { x: 0.45, y: 0.66 })
    const b = { x: 0.45 * W - 672, y: 550.8, w: 1344, h: 324 }
    const { patch, guides } = applyDrag(v, session(v, b, { x: 800, y: 700 }), 800 + 92, 700, W, H, 10)
    expect(patch.x).toBe(0.5)
    expect(guides.x).toBe(W / 2)
  })

  it('nút Đăng ký: kéo → chuyển sang đặt tự do theo tâm', () => {
    const cta = createLayer('cta')
    const b = { x: 1400, y: 964, w: 480, h: 76 }
    const { patch } = applyDrag(cta, session(cta, b, { x: 1500, y: 1000 }), 1500 - 680, 1000 - 462, W, H, 0)
    expect(patch.anchor).toBe('free')
    expect(patch.x).toBeCloseTo((1640 - 680) / W, 3)
    expect(patch.y).toBeCloseTo((1002 - 462) / H, 3)
  })

  it('vòng tròn: kéo góc phóng to đều bán kính và độ dài cột', () => {
    const c = createLayer('visualizer', { style: 'circle', radius: 0.16, height: 0.3 })
    const b = { x: 760, y: 340, w: 400, h: 400 }
    const { patch } = applyDrag(c, session(c, b, { x: 1160, y: 740 }, 'resize', 'se'), 1360, 940, W, H, 0)
    expect(patch.radius).toBeCloseTo(0.32, 3)
    expect(patch.height).toBeCloseTo(0.6, 3)
  })

  it('không vượt giới hạn của thuộc tính', () => {
    const { patch } = applyDrag(viz, session(viz, box, { x: 1632, y: 712 }, 'resize', 'e'), 5000, 712, W, H, 0)
    expect(patch.width).toBe(1)
    expect(patch.height).toBeUndefined()
  })

  it('chọn layer trên cùng; layer phủ kín khung chỉ là lựa chọn cuối', () => {
    const particles = createLayer('particles')
    const text = createLayer('text')
    const layers = [particles, viz, text] as Layer[]
    const bounds = new Map([
      [particles.id, { x: 0, y: 0, w: W, h: H }],
      [viz.id, box],
      [text.id, { x: 700, y: 600, w: 500, h: 90 }]
    ])
    expect(hitTest(layers, bounds, 900, 640, W, H)?.id).toBe(text.id)
    expect(hitTest(layers, bounds, 400, 700, W, H)?.id).toBe(viz.id)
    expect(hitTest(layers, bounds, 50, 50, W, H)?.id).toBe(particles.id)
  })
})

describe('engine ghi khung bao layer', () => {
  const project = createDefaultProject()
  project.tracks = [track('a', 60)]
  const tl = buildTimeline(project.tracks, project.settings)
  const audio = new AudioSampler(tl, () => undefined)
  const renderer = new Renderer(new NodeAssets())
  const ctx = createCanvas(W, H).getContext('2d') as unknown as CanvasRenderingContext2D
  const viz = project.layers.find((l) => l.type === 'visualizer')!
  const cta = project.layers.find((l) => l.type === 'cta')!

  it('cột sóng: khung đúng theo x, y, rộng, cao', () => {
    renderer.render({ ctx, project, timeline: tl, audio, t: 1 })
    const b = renderer.bounds.get(viz.id)!
    expect(b.x).toBeCloseTo(W * 0.15, 3)
    expect(b.w).toBeCloseTo(W * 0.7, 3)
    expect(b.y + b.h / 2).toBeCloseTo(H * 0.66, 3)
  })

  it('nút Đăng ký ngoài lịch: ẩn khi xuất, luôn hiện khi đang chỉnh', () => {
    renderer.render({ ctx, project, timeline: tl, audio, t: 1 })
    expect(renderer.bounds.has(cta.id)).toBe(false)
    renderer.render({ ctx, project, timeline: tl, audio, t: 1, editLayerId: cta.id })
    expect(renderer.bounds.has(cta.id)).toBe(true)
  })
})
