import { isNeutralFilter } from '../shared/filterPresets'
import type { Layer, LayerPropsMap, LayerType, Project } from '../shared/types'
import { entryAt, type Timeline } from '../shared/timeline'
import { layerFade } from '../shared/timing'
import type { AudioSampler } from './audio'
import type { EngineAssets, FilterBake, Rect, RenderEnv } from './env'
import { drawBackground, isStaticBackground } from './layers/background'
import { drawCta } from './layers/cta'
import { drawFlicker, drawImageLayer, drawParticles, drawVignette } from './layers/effects'
import { drawFilter } from './layers/filter'
import { drawProgress, drawText } from './layers/text'
import { drawTimer } from './layers/timer'
import { drawVisualizer } from './layers/visualizer'

export { AudioSampler, TrackFeatures } from './audio'
export type { EngineAssets, FilterBake, OffscreenSurface, Rect } from './env'

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
  filter: drawFilter,
  timer: drawTimer
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

/** Vẽ nhỏ hơn mức này (ảnh mẫu bộ lọc…) thì lọc từng frame luôn: rẻ hơn nướng ảnh nền cỡ thật */
const BAKE_MIN_SCALE = 0.25

/**
 * Bộ lọc màu nướng sẵn được ở frame này: lớp bộ lọc đầu tiên đang hiện mà mọi lớp đang hiện
 * nằm dưới nó đều là nền tĩnh hiện đủ (ảnh, ảnh bìa, màu, gradient). Trả về vị trí trong `visible`.
 */
function findFilterBake(env: RenderEnv, visible: { layer: Layer; fade: number }[]): { index: number; bake: FilterBake } | null {
  for (let i = 0; i < visible.length; i++) {
    const { layer, fade } = visible[i]
    if (layer.type === 'filter') {
      const p = layer.props
      if (i === 0 || isNeutralFilter(p) || Math.min(1, Math.max(0, p.intensity)) * fade < 0.004) return null
      return { index: i, bake: { filterId: layer.id, props: p, fade, failed: false } }
    }
    if (layer.type !== 'background' || fade < 1 || !isStaticBackground(env, layer.props)) return null
  }
  return null
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
  /**
   * Nướng sẵn bộ lọc màu vào ảnh nền tĩnh khi bộ lọc chỉ tác động lên nền (nhanh hơn nhiều so với
   * lọc cả khung hình mỗi frame). Tắt để so sánh với cách lọc từng frame.
   */
  prebakeFilters = true

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
      timing: { start: 0, end: null, fadeIn: 0, fadeOut: 0 },
      fade: 1,
      editLayerId,
      bounds: this.bounds,
      bake: null
    }
    this.bounds.clear()
    ctx.save()
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, W, H)
    // Ngoài khoảng thời gian của layer thì không vẽ
    const visible: { layer: Layer; fade: number }[] = []
    for (const layer of project.layers) {
      if (!layer.enabled) continue
      const fade = layerFade(layer.timing, t, timeline.total)
      if (fade > 0) visible.push({ layer, fade })
    }
    const baked = this.prebakeFilters && scale >= BAKE_MIN_SCALE ? findFilterBake(env, visible) : null
    for (const [i, { layer, fade }] of visible.entries()) {
      env.layerId = layer.id
      env.timing = layer.timing
      env.fade = fade
      env.bake = baked && i <= baked.index ? baked.bake : null
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
