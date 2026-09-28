import type { Layer, LayerPropsMap, LayerType, Project } from '../shared/types'
import { entryAt, type Timeline } from '../shared/timeline'
import { layerFade } from '../shared/timing'
import type { AudioSampler } from './audio'
import type { EngineAssets, Rect, RenderEnv } from './env'
import { drawBackground } from './layers/background'
import { drawCta } from './layers/cta'
import { drawFlicker, drawImageLayer, drawParticles, drawVignette } from './layers/effects'
import { drawFilter } from './layers/filter'
import { drawProgress, drawText } from './layers/text'
import { drawVisualizer } from './layers/visualizer'

export { AudioSampler, TrackFeatures } from './audio'
export type { EngineAssets, OffscreenSurface, Rect } from './env'

type LayerDrawer<T extends LayerType> = (env: RenderEnv, props: LayerPropsMap[T]) => void

const DRAWERS: { [K in LayerType]: LayerDrawer<K> } = {
  background: drawBackground,
  visualizer: drawVisualizer,
  progress: drawProgress,
  text: drawText,
  image: drawImageLayer,
  cta: drawCta,
  flicker: drawFlicker,
  particles: drawParticles,
  vignette: drawVignette,
  filter: drawFilter
}

export interface RenderArgs {
  ctx: CanvasRenderingContext2D
  project: Project
  timeline: Timeline
  audio: AudioSampler
  t: number
  /** Vẽ thu nhỏ (preview): canvas có kích thước project × scale */
  scale?: number
  /** Layer đang chỉnh trên preview (chỉ dùng khi xem trước, không dùng khi export) */
  editLayerId?: string | null
}

/**
 * Engine vẽ một frame. Dùng chung cho preview (Chromium) và export (Skia trong Node),
 * nên hình xem trước và video xuất ra giống nhau.
 */
export class Renderer {
  readonly cache = new Map<string, unknown>()
  /** Lỗi theo từng layer (báo một lần), để UI / export hiển thị cảnh báo */
  readonly errors = new Map<string, string>()
  /** Khung bao của các layer ở frame vừa vẽ */
  readonly bounds = new Map<string, Rect>()

  constructor(readonly assets: EngineAssets) {}

  render({ ctx, project, timeline, audio, t, scale = 1, editLayerId = null }: RenderArgs): void {
    const { width: W, height: H } = project.settings
    const env: RenderEnv = {
      ctx,
      project,
      timeline,
      audio,
      assets: this.assets,
      cache: this.cache,
      t,
      W,
      H,
      S: Math.min(W, H) / 1080,
      px: scale,
      entry: entryAt(timeline, t),
      layerId: '',
      fade: 1,
      editLayerId,
      bounds: this.bounds
    }
    this.bounds.clear()
    ctx.save()
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, W, H)
    for (const layer of project.layers) {
      if (!layer.enabled) continue
      // Ngoài khoảng thời gian của layer thì không vẽ
      const fade = layerFade(layer.timing, t, timeline.total)
      if (fade <= 0) continue
      env.layerId = layer.id
      env.fade = fade
      ctx.save()
      ctx.globalAlpha = fade
      try {
        ;(DRAWERS[layer.type] as LayerDrawer<LayerType>)(env, layer.props)
      } catch (err) {
        if (!this.errors.has(layer.id)) this.errors.set(layer.id, `${layer.name}: ${(err as Error).message}`)
      }
      ctx.restore()
    }
    ctx.restore()
  }
}

/** Tất cả file ảnh / video mà project cần (để nạp trước khi render) */
export function collectAssets(project: Project): { images: string[]; videos: string[] } {
  const images = new Set<string>()
  const videos = new Set<string>()
  const needsCovers = project.layers.some(
    (l) =>
      l.enabled &&
      ((l.type === 'background' && l.props.mode === 'cover') ||
        (l.type === 'visualizer' && l.props.style === 'circle' && l.props.centerImage === 'cover') ||
        (l.type === 'image' && l.props.source === 'cover'))
  )
  for (const l of project.layers as Layer[]) {
    if (!l.enabled) continue
    if (l.type === 'background') {
      if (l.props.mode === 'image' && l.props.src) images.add(l.props.src)
      if (l.props.mode === 'video' && l.props.src) videos.add(l.props.src)
    } else if (l.type === 'visualizer' && l.props.centerImage === 'custom' && l.props.centerSrc) images.add(l.props.centerSrc)
    else if (l.type === 'image' && l.props.source === 'file' && l.props.src) images.add(l.props.src)
    else if (l.type === 'cta' && l.props.preset === 'image' && l.props.src) images.add(l.props.src)
  }
  if (needsCovers) for (const t of project.tracks) if (t.coverPath) images.add(t.coverPath)
  return { images: [...images], videos: [...videos] }
}
