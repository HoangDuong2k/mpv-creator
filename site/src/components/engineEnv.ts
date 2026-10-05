// Môi trường vẽ tối thiểu để dùng một lớp hiệu ứng của engine app trên trang (dải sóng, đốm sáng ở đầu trang):
// một bài nhạc mẫu chạy lặp (dữ liệu giả lập 118 BPM của engine), không có nền, ảnh hay video.
import { AudioSampler } from '../../../src/engine/audio'
import { createDemoFeatures, DEMO_KEY } from '../../../src/engine/demoAudio'
import type { EngineAssets, RenderEnv } from '../../../src/engine/env'
import { buildTimeline, entryAt } from '../../../src/shared/timeline'
import type { Project, Track } from '../../../src/shared/types'

/** Khung toạ độ W × H (px của khung), nhạc mẫu dài `loop` giây */
export function createEngineEnv(ctx: CanvasRenderingContext2D, W: number, H: number, fps: number, loop: number): RenderEnv {
  const track: Track = { id: 'site', path: 'site', title: '', artist: '', album: '', duration: loop, analysisKey: DEMO_KEY, trimStart: 0, trimEnd: 0 }
  const settings = { width: W, height: H, fps, transition: { type: 'gap', duration: 0 }, fadeIn: 0, fadeOut: 0 } as Project['settings']
  const timeline = buildTimeline([track], settings)
  const features = createDemoFeatures(loop)
  const assets: EngineAssets = {
    image: () => null,
    video: () => null,
    createSurface: (w, h) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      return { canvas, ctx: canvas.getContext('2d')! }
    },
    path2d: (d) => new Path2D(d)
  }
  return {
    ctx,
    project: { tracks: [track], layers: [], settings } as unknown as Project,
    timeline,
    audio: new AudioSampler(timeline, (k) => (k === DEMO_KEY ? features : undefined)),
    assets,
    cache: new Map(),
    t: 0,
    W,
    H,
    S: 1,
    px: 1,
    entry: entryAt(timeline, 0),
    layerId: 'site',
    timing: { start: 0, end: null, fadeIn: 0, fadeOut: 0 },
    fade: 1,
    editLayerId: null,
    bounds: new Map(),
    bake: null,
    fastBackground: true
  }
}

/** Đặt thời điểm vẽ (giây) cho môi trường */
export function seekEnv(env: RenderEnv, t: number): void {
  env.t = t
  env.entry = entryAt(env.timeline, t)
}
