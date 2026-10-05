// Ảnh xem trước cho thư viện (hiệu ứng, bộ lọc, chữ mẫu) và mẫu phong cách: vẽ bằng chính engine
// dùng khi xuất video, trên một cảnh mẫu (hoàng hôn trên núi) với nhạc giả lập — xem trước giống kết quả thật.
import { AudioSampler, Renderer, type EngineAssets, type OffscreenSurface, type TrackFeatures } from '../../engine'
import { createDemoFeatures, DEMO_KEY } from '../../engine/demoAudio'
import { createDefaultProject, createLayer, FULL_TIMING } from '../../shared/defaults'
import { getLang, tr } from '../../shared/i18n'
import { buildTimeline, type Timeline } from '../../shared/timeline'
import type { Layer, LayerType, Project, Track } from '../../shared/types'
import { assets } from './engineHost'

/** Đường dẫn giả của cảnh mẫu và ảnh bìa mẫu (vẽ bằng code, không cần file) */
export const DEMO_SCENE = 'pvm-demo:scene'
export const DEMO_COVER = 'pvm-demo:cover'

/**
 * Khung vẽ xem trước: nhỏ hơn video thật cho nhanh (engine tính mọi kích thước theo chiều cao
 * khung hình, nên hình thu nhỏ vẫn đúng tỉ lệ như bản xuất 1080p).
 */
const PW = 640
const PH = 360
/** Độ dài mỗi bài mẫu (bằng độ dài dữ liệu âm thanh giả lập) */
const DEMO_LEN = 12
/** Thời điểm vẽ ảnh tĩnh: giữa bài mẫu đầu tiên, ngay sau một nhịp beat */
export const STILL_T = (60 / 118) * 10 + 0.04

let demoFeatures: TrackFeatures | null = null
const demo = (): TrackFeatures => (demoFeatures ??= createDemoFeatures(DEMO_LEN))

function drawScene(c: HTMLCanvasElement): void {
  const ctx = c.getContext('2d')!
  const { width: w, height: h } = c
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.72)
  sky.addColorStop(0, '#1b1f4b')
  sky.addColorStop(0.45, '#6a3d7a')
  sky.addColorStop(0.8, '#e8836a')
  sky.addColorStop(1, '#ffc98a')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
  const sun = ctx.createRadialGradient(w * 0.66, h * 0.6, 0, w * 0.66, h * 0.6, h * 0.16)
  sun.addColorStop(0, '#fff6d0')
  sun.addColorStop(0.6, '#ffd07a')
  sun.addColorStop(1, 'rgba(255,170,90,0)')
  ctx.fillStyle = sun
  ctx.fillRect(0, 0, w, h)
  const ridge = (color: string, base: number, amp: number, seed: number): void => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let x = 0; x <= w; x += w / 48) {
      const k = x / w
      ctx.lineTo(x, h * (base - amp * (0.55 * Math.sin(k * 7 + seed) + 0.3 * Math.sin(k * 17 + seed * 2) + 0.15 * Math.sin(k * 31 + seed * 3))))
    }
    ctx.lineTo(w, h)
    ctx.closePath()
    ctx.fill()
  }
  ridge('#7a4a78', 0.7, 0.08, 1)
  ridge('#4a2f5e', 0.78, 0.09, 4)
  ridge('#2a1b3d', 0.88, 0.07, 9)
  // Mặt hồ phản chiếu ánh mặt trời
  const lake = ctx.createLinearGradient(0, h * 0.88, 0, h)
  lake.addColorStop(0, '#3b2a55')
  lake.addColorStop(1, '#171029')
  ctx.fillStyle = lake
  ctx.fillRect(0, h * 0.9, w, h * 0.1)
  ctx.fillStyle = 'rgba(255,214,150,0.55)'
  for (let i = 0; i < 6; i++) ctx.fillRect(w * (0.6 + Math.sin(i * 2.3) * 0.02), h * (0.915 + i * 0.013), w * (0.12 - i * 0.015), h * 0.004)
}

function drawCoverArt(c: HTMLCanvasElement): void {
  const ctx = c.getContext('2d')!
  const s = c.width
  const bg = ctx.createLinearGradient(0, 0, s, s)
  bg.addColorStop(0, '#ff5e62')
  bg.addColorStop(1, '#6a3d7a')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, s, s)
  // Đĩa than
  ctx.fillStyle = '#141018'
  ctx.beginPath()
  ctx.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = s * 0.004
  for (let r = 0.18; r < 0.39; r += 0.03) {
    ctx.beginPath()
    ctx.arc(s / 2, s / 2, s * r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.fillStyle = '#ffb347'
  ctx.beginPath()
  ctx.arc(s / 2, s / 2, s * 0.13, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#141018'
  ctx.beginPath()
  ctx.arc(s / 2, s / 2, s * 0.02, 0, Math.PI * 2)
  ctx.fill()
}

/** Tài nguyên cho engine xem trước: ảnh mẫu vẽ bằng code, ảnh thật dùng chung với preview chính */
class PreviewAssets implements EngineAssets {
  /** Lần vẽ gần nhất có ảnh chưa nạp xong → cần vẽ lại sau */
  missing = false
  private demo = new Map<string, HTMLCanvasElement>()

  image(path: string): CanvasImageSource | null {
    if (path === DEMO_SCENE || path === DEMO_COVER) {
      let c = this.demo.get(path)
      if (!c) {
        c = document.createElement('canvas')
        c.width = path === DEMO_SCENE ? PW : 400
        c.height = path === DEMO_SCENE ? PH : 400
        if (path === DEMO_SCENE) drawScene(c)
        else drawCoverArt(c)
        this.demo.set(path, c)
      }
      return c
    }
    const img = assets.image(path)
    if (!img) this.missing = true
    return img
  }

  video(): CanvasImageSource | null {
    // Không dùng chung thẻ video với preview chính (tua qua lại làm giật hình đang xem): nền video hiện màu nền
    return null
  }

  createSurface(width: number, height: number): OffscreenSurface {
    return assets.createSurface(width, height)
  }

  path2d(d: string): Path2D {
    return assets.path2d(d)
  }
}

const previewAssets = new PreviewAssets()
const renderer = new Renderer(previewAssets)

function demoTracks(): Track[] {
  const base = { album: '', duration: DEMO_LEN, analysisKey: DEMO_KEY, coverPath: DEMO_COVER, trimStart: 0, trimEnd: 0 }
  return [
    { ...base, id: 'demo-1', path: 'demo-1', title: tr('Tên bài hát'), artist: tr('Ca sĩ') },
    { ...base, id: 'demo-2', path: 'demo-2', title: tr('Bài kế tiếp'), artist: tr('Ca sĩ') }
  ]
}

let demoProjectCache: { lang: string; project: Project; timeline: Timeline } | null = null

/** Project mẫu (2 bài nhạc giả lập) — tên bài theo ngôn ngữ giao diện */
function demoProject(): { project: Project; timeline: Timeline } {
  const lang = getLang()
  if (demoProjectCache?.lang !== lang) {
    const p = createDefaultProject()
    const project: Project = {
      ...p,
      name: 'Playlist',
      settings: { ...p.settings, width: PW, height: PH, transition: { type: 'none', duration: 0 }, fadeIn: 0, fadeOut: 0 },
      tracks: demoTracks(),
      layers: []
    }
    demoProjectCache = { lang, project, timeline: buildTimeline(project.tracks, project.settings) }
  }
  return demoProjectCache
}

/** Nền cảnh mẫu (làm tối bớt để chữ, cột sóng nổi rõ) */
export function sceneLayer(dim: number): Layer {
  return { ...createLayer('background', { mode: 'image', src: DEMO_SCENE, dim, beatZoom: 0, kenBurns: 0, blur: 0 }), id: `pv-scene-${dim}` }
}

/**
 * Chỉnh thuộc tính cho vừa ô xem trước nhỏ: chữ, nút Đăng ký, thanh tiến trình… phóng to và đặt giữa
 * khung (cỡ thật trong video 1080p sẽ nhỏ tới mức không đọc được trong ô).
 */
export function zoomForPreview(type: LayerType, props: Record<string, unknown>): Record<string, unknown> {
  const n = (k: string): number => Number(props[k]) || 0
  switch (type) {
    case 'text':
      return { ...props, x: 0.5, y: 0.5, align: 'center', size: Math.max(n('size') * 2.4, 150), maxWidth: 0.9, animation: 'none' }
    case 'cta':
      return { ...props, anchor: 'free', x: 0.5, y: 0.5, scale: props.preset === 'combo' ? 2.2 : 3.2, schedule: 'times', times: '0', duration: DEMO_LEN }
    case 'progress':
      return { ...props, x: 0.5, y: 0.5, width: 0.8, thickness: n('thickness') * 3, fontSize: n('fontSize') * 2.6, waveHeight: n('waveHeight') * 3 }
    case 'particles':
      // Sương mù: cỡ là độ lớn mảng sương theo vùng, không cần phóng; pháo hoa phóng vừa phải
      if (props.style === 'fog') return props
      if (props.style === 'fireworks') return { ...props, size: n('size') * 2.5 }
      return { ...props, size: Math.max(n('size') * 5, 14) }
    case 'image':
      return { ...props, source: 'cover', x: 0.5, y: 0.5, width: 0.32, circle: true }
    case 'vinyl':
      return { ...props, x: 0.5, y: 0.5, size: 0.78 }
    case 'nowplaying':
      return { ...props, x: 0.5, y: 0.5, size: 250, width: 1500 }
    case 'tracklist':
      return { ...props, x: 0.5, y: 0.5, align: 'center', width: 0.78, fontSize: 56, rows: 4 }
    case 'vumeter':
      return { ...props, x: 0.5, y: 0.5, size: props.layout === 'mono' ? 1100 : 780 }
    case 'vhs':
      return { ...props, chroma: n('chroma') * 3 }
    case 'glitch':
      // Ảnh tĩnh vẽ ngay sau một beat: hạ ngưỡng, tách màu mạnh hơn để thấy rõ trong ô nhỏ
      return { ...props, threshold: Math.min(n('threshold'), 0.1), rgbSplit: n('rgbSplit') * 3 }
    case 'timer':
      return { ...props, x: 0.5, y: 0.5, align: 'center', size: props.style === 'ring' ? 165 : props.style === 'flip' ? 190 : 230 }
    default:
      return props
  }
}

export interface PreviewScene {
  /** Các lớp vẽ (dưới → trên); id cố định để engine dùng lại cache */
  layers: Layer[]
  /** Lớp luôn hiện như đang chỉnh (nút Đăng ký hiện suốt, chữ mẫu khi trống) */
  editLayerId?: string
}

/** Lớp của một mẫu trong thư viện, đặt trên cảnh mẫu */
export function presetScene(id: string, type: LayerType, props: Record<string, unknown>, dim = 0.4): PreviewScene {
  const layer = { ...createLayer(type, zoomForPreview(type, props)), id: `pv-${id}`, timing: { ...FULL_TIMING } } as Layer
  // Hiệu ứng xử lý cả khung hình (VHS, glitch, CRT): thêm tên bài lên cảnh mẫu để thấy rõ tác dụng
  const caption = type === 'vhs' || type === 'glitch' || type === 'crt' || (type === 'camera' && props.style !== 'bars') ? [{ ...createLayer('text', { y: 0.45, size: 170, animation: 'none' }), id: 'pv-caption', timing: { ...FULL_TIMING } } as Layer] : []
  return { layers: [sceneLayer(dim), ...caption, layer], editLayerId: layer.id }
}

/**
 * Vẽ một khung hình xem trước lên canvas (kích thước bất kỳ, tỉ lệ 16:9). Trả về false nếu còn ảnh
 * chưa nạp xong (nên vẽ lại sau).
 */
export function renderPreview(canvas: HTMLCanvasElement, scene: PreviewScene, t = STILL_T): boolean {
  const ctx = canvas.getContext('2d')
  if (!ctx) return true
  const { project, timeline } = demoProject()
  previewAssets.missing = false
  const audio = new AudioSampler(timeline, (k) => (k === DEMO_KEY ? demo() : undefined))
  renderer.render({ ctx, project: { ...project, layers: scene.layers }, timeline, audio, t, scale: canvas.width / PW, editLayerId: scene.editLayerId ?? null })
  return !previewAssets.missing
}

/** Thời lượng vòng lặp khi xem trước chuyển động (rê chuột lên ô) */
export const LOOP_LEN = DEMO_LEN - 0.5

const cache = new Map<string, string>()
/** Ảnh đang chờ vẽ: khoá → các nơi đang đợi */
const waiting = new Map<string, Array<(url: string) => void>>()
const queue: Array<{ key: string; build: () => PreviewScene; w: number; h: number; tries: number }> = []
let pumping = false
let fontsLoaded: () => void = () => undefined
/** Ảnh xem trước chờ font của app nạp xong (chữ mẫu); quá 4 giây thì vẽ luôn */
const fontsReady = new Promise<void>((resolve) => {
  fontsLoaded = resolve
  setTimeout(resolve, 4000)
})

/** Gọi khi font của app đã nạp xong */
export function previewFontsLoaded(): void {
  fontsLoaded()
}

function pump(): void {
  if (pumping) return
  pumping = true
  void fontsReady.then(() => {
    const step = (): void => {
      const started = performance.now()
      // Vẽ vài ô mỗi nhịp để không làm giật giao diện
      while (queue.length && performance.now() - started < 12) {
        const job = queue.shift()!
        const c = document.createElement('canvas')
        c.width = job.w
        c.height = job.h
        let complete = true
        try {
          complete = renderPreview(c, job.build())
        } catch (err) {
          console.warn('Không vẽ được ảnh xem trước', job.key, err)
        }
        const url = c.toDataURL('image/jpeg', 0.86)
        for (const done of waiting.get(job.key) ?? []) done(url)
        if (complete || job.tries >= 8) {
          cache.set(job.key, url)
          waiting.delete(job.key)
        } else {
          // Ảnh thật chưa nạp xong: tạm hiện bản này, vẽ lại sau
          setTimeout(() => {
            queue.push({ ...job, tries: job.tries + 1 })
            pump()
          }, 350)
        }
      }
      if (queue.length) setTimeout(step, 16)
      else pumping = false
    }
    step()
  })
}

/**
 * Ảnh xem trước (data URL) theo khoá, có cache. Chưa có thì xếp hàng vẽ và gọi `done` khi xong
 * (có thể gọi nhiều lần nếu ảnh thật nạp chậm).
 */
export function previewImage(key: string, build: () => PreviewScene, w: number, h: number, done: (url: string) => void): string | null {
  const full = `${key}|${getLang()}|${w}x${h}`
  const hit = cache.get(full)
  if (hit) return hit
  const list = waiting.get(full)
  if (list) list.push(done)
  else {
    waiting.set(full, [done])
    queue.push({ key: full, build, w, h, tries: 0 })
    pump()
  }
  return null
}

/** Bỏ nơi đang đợi ảnh (ô xem trước đã đóng) */
export function cancelPreview(key: string, w: number, h: number, done: (url: string) => void): void {
  const full = `${key}|${getLang()}|${w}x${h}`
  const list = waiting.get(full)
  if (list) waiting.set(full, list.filter((d) => d !== done))
}

/** Xoá ảnh xem trước đã lưu theo tiền tố khoá (mẫu người dùng vừa lưu lại) */
export function forgetPreviews(prefix: string): void {
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k)
}
