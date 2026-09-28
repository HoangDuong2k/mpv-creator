// Kết nối engine render với môi trường trình duyệt: font, ảnh, video nền,
// dữ liệu phân tích âm thanh và trình phát preview.
import { TrackFeatures, type EngineAssets, type OffscreenSurface } from '../../engine'
import type { AudioSpec } from '../../shared/api'
import { SAMPLE_RATE } from '../../shared/featureFormat'
import { FONT_FILES } from '../../shared/fonts'

const api = window.api

export async function loadFonts(fontsDir: string): Promise<void> {
  const sep = fontsDir.includes('\\') ? '\\' : '/'
  await Promise.all(
    FONT_FILES.map(async (f) => {
      try {
        const face = new FontFace(f.family, `url("${api.fileUrl(fontsDir + sep + f.file)}")`, { weight: String(f.weight) })
        document.fonts.add(await face.load())
      } catch (err) {
        console.warn('Không nạp được font', f.file, err)
      }
    })
  )
}

/** Dữ liệu phân tích đã nạp, theo analysisKey */
class FeatureStore {
  private map = new Map<string, TrackFeatures>()
  private loading = new Map<string, Promise<TrackFeatures>>()

  get(key: string): TrackFeatures | undefined {
    return this.map.get(key)
  }

  has(key: string): boolean {
    return this.map.has(key)
  }

  load(key: string): Promise<TrackFeatures> {
    const hit = this.map.get(key)
    if (hit) return Promise.resolve(hit)
    let p = this.loading.get(key)
    if (!p) {
      p = api.loadAnalysis(key).then((buf) => {
        const f = TrackFeatures.parse(buf)
        this.map.set(key, f)
        this.loading.delete(key)
        return f
      })
      p.catch(() => this.loading.delete(key))
      this.loading.set(key, p)
    }
    return p
  }
}

export const features = new FeatureStore()

/** Tài nguyên cho engine trong trình duyệt; tự nạp ảnh/video khi được hỏi tới. */
export class BrowserAssets implements EngineAssets {
  private images = new Map<string, HTMLImageElement | null>()
  private videos = new Map<string, HTMLVideoElement>()
  playing = false
  onChange: () => void = () => undefined

  image(path: string): CanvasImageSource | null {
    if (this.images.has(path)) return this.images.get(path) ?? null
    this.images.set(path, null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = api.fileUrl(path)
    img
      .decode()
      .then(() => {
        this.images.set(path, img)
        this.onChange()
      })
      .catch(() => console.warn('Không mở được ảnh', path))
    return null
  }

  video(path: string, t: number): CanvasImageSource | null {
    let v = this.videos.get(path)
    if (!v) {
      v = document.createElement('video')
      v.crossOrigin = 'anonymous'
      v.muted = true
      v.loop = true
      v.playsInline = true
      v.preload = 'auto'
      v.src = api.fileUrl(path)
      v.addEventListener('loadeddata', () => this.onChange())
      v.addEventListener('seeked', () => this.onChange())
      this.videos.set(path, v)
    }
    if (v.readyState < 2 || !v.duration) return null
    // Video nền lặp: thời điểm trong video = t mod thời lượng (giống lúc export)
    const want = t % v.duration
    const drift = Math.abs(v.currentTime - want)
    if (this.playing) {
      if (v.paused) void v.play().catch(() => undefined)
      if (drift > 0.3 && drift < v.duration - 0.3) v.currentTime = want
    } else {
      if (!v.paused) v.pause()
      if (drift > 0.04 && !v.seeking) v.currentTime = want
    }
    return v
  }

  pauseVideos(): void {
    for (const v of this.videos.values()) v.pause()
  }

  createSurface(width: number, height: number): OffscreenSurface {
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(width))
    c.height = Math.max(1, Math.round(height))
    return { canvas: c, ctx: c.getContext('2d')! }
  }

  path2d(d: string): Path2D {
    return new Path2D(d)
  }
}

const SR = SAMPLE_RATE
/** Đoạn đầu ngắn để bấm Play là có tiếng gần như ngay */
const FIRST_CHUNK = 1
const CHUNK = 4
/** Luôn có sẵn trước chừng này giây âm thanh đã lên lịch */
const AHEAD = 8
const START_DELAY = 0.04

/**
 * Trình phát preview: xin từng đoạn âm thanh của bản mix từ main process (đọc PCM
 * đã giải mã sẵn) rồi xếp lịch phát nối tiếp bằng Web Audio — đổi thứ tự, cắt bài
 * trên timeline là nghe được ngay, không phải chờ ghép lại cả playlist.
 * Đồng hồ của AudioContext là đồng hồ chuẩn cho hình preview.
 */
export class PreviewPlayer {
  playing = false
  total = 0
  onEnded: () => void = () => undefined
  /** Số đoạn âm thanh đã lên lịch phát (dùng cho kiểm thử) */
  chunksScheduled = 0
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private volume = 1
  private spec: AudioSpec | null = null
  private specKey = ''
  /** Thời điểm timeline lúc bắt đầu phát (hoặc lúc dừng) */
  private base = 0
  private baseFrame = 0
  /** ctx.currentTime ứng với `base`; null = đang chờ đoạn âm thanh đầu tiên */
  private ctxStart: number | null = null
  /** Đồng hồ dự phòng khi chưa có âm thanh (bài chưa phân tích xong) */
  private clockStart = 0
  private nextFrame = 0
  private inflight = 0
  private gen = 0
  private readonly sources = new Set<AudioBufferSourceNode>()
  private timer: number | null = null
  /**
   * Đồng hồ cho hình preview: 'audio' = theo AudioContext (khớp tiếng từng mẫu),
   * 'wall' = đồng hồ hệ thống (chưa có âm thanh, hoặc máy không phát được tiếng:
   * không có loa/tai nghe, Remote Desktop không chuyển tiếng…) để hình vẫn chạy.
   */
  private clock: 'audio' | 'wall' = 'wall'
  /** AudioContext có chạy được không (tự kiểm tra lại liên tục) */
  private audioOk = true
  private lastCtx = 0
  private lastCtxWall = 0

  private audioCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: SR, latencyHint: 'interactive' })
      this.gain = this.ctx.createGain()
      this.gain.gain.value = this.volume
      this.gain.connect(this.ctx.destination)
    }
    return this.ctx
  }

  /** Độ trễ từ lúc âm thanh được xử lý tới lúc phát ra loa */
  private latency(): number {
    const c = this.ctx
    return c ? (c.outputLatency || 0) + (c.baseLatency || 0) : 0
  }

  time(): number {
    if (!this.playing) return this.base
    if (this.clock === 'audio') {
      const c = this.ctx
      if (this.ctxStart !== null && c) return this.endCheck(this.base + Math.max(0, c.currentTime - this.ctxStart - this.latency()))
      // Đang chờ đoạn âm thanh đầu tiên; AudioContext không khởi động được sau 1 giây → dùng đồng hồ hệ thống
      if (!(c && c.state !== 'running' && performance.now() - this.clockStart > 1000)) return this.base
      this.useWallClock(this.base)
    }
    return this.endCheck(this.base + (performance.now() - this.clockStart) / 1000)
  }

  private endCheck(t: number): number {
    if (this.total > 0 && t >= this.total) {
      this.finish()
      return this.total
    }
    return t
  }

  private useWallClock(t: number): void {
    this.base = t
    this.clockStart = performance.now()
    this.clock = 'wall'
  }

  /** Phát hiện đồng hồ âm thanh đứng yên (không có thiết bị phát, driver lỗi) → chuyển sang đồng hồ hệ thống */
  private watchdog(): void {
    const c = this.ctx
    if (!c || !this.playing) return
    const now = performance.now()
    if (c.currentTime > this.lastCtx + 1e-4) {
      this.lastCtx = c.currentTime
      this.lastCtxWall = now
      this.audioOk = true
    } else if (this.clock === 'audio' && this.ctxStart !== null && now - this.lastCtxWall > 700) {
      this.audioOk = false
      this.useWallClock(this.time())
    }
  }

  /** Trạng thái để kiểm thử / chẩn đoán */
  get debug(): { clock: string; audioOk: boolean; state: string; ctxTime: number; chunks: number } {
    return { clock: this.clock, audioOk: this.audioOk, state: this.ctx?.state ?? 'none', ctxTime: this.ctx?.currentTime ?? 0, chunks: this.chunksScheduled }
  }

  /** Dữ liệu âm thanh của project thay đổi (thêm/xoá/đổi chỗ/cắt bài…) */
  setSpec(spec: AudioSpec | null): void {
    const key = spec ? JSON.stringify(spec) : ''
    if (key === this.specKey) return
    const t = this.time()
    this.spec = spec
    this.specKey = key
    // Khởi động sẵn thiết bị âm thanh để lần bấm Play đầu tiên có tiếng ngay (khởi động có thể mất gần 1 giây)
    if (spec && !this.ctx) void this.audioCtx().resume().catch(() => undefined)
    if (this.playing) this.restart(t)
  }

  get hasAudio(): boolean {
    return this.spec !== null
  }

  play(): void {
    if (this.total > 0 && this.base >= this.total - 0.05) this.base = 0
    this.playing = true
    this.restart(this.base)
  }

  pause(): void {
    this.base = this.time()
    this.playing = false
    this.gen++
    this.stopSources()
    this.stopTimer()
  }

  seek(t: number): void {
    const v = Math.max(0, this.total > 0 ? Math.min(t, this.total) : t)
    if (this.playing) this.restart(v)
    else this.base = v
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v))
    if (this.gain) this.gain.gain.value = this.volume
  }

  private finish(): void {
    this.gen++
    this.stopSources()
    this.stopTimer()
    this.playing = false
    this.base = this.total
    this.onEnded()
  }

  private restart(t: number): void {
    this.gen++
    this.stopSources()
    this.base = t
    this.baseFrame = Math.round(t * SR)
    this.nextFrame = this.baseFrame
    this.inflight = 0
    this.ctxStart = null
    this.clockStart = performance.now()
    // Máy đã biết không phát được tiếng → hình chạy theo đồng hồ hệ thống ngay (vẫn thử phát tiếng)
    this.clock = this.spec && this.audioOk ? 'audio' : 'wall'
    this.lastCtxWall = performance.now()
    this.lastCtx = this.ctx?.currentTime ?? 0
    if (this.spec) {
      void this.audioCtx()
        .resume()
        .catch(() => undefined)
      this.pump()
    }
    if (this.timer === null) this.timer = window.setInterval(() => this.pump(), 150)
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private pump(): void {
    this.watchdog()
    if (!this.playing || !this.spec) return
    const totalFrames = Math.round(this.total * SR)
    const playing = Math.round(this.time() * SR)
    if (!this.playing) return
    // Chờ đoạn đầu về rồi mới xin tiếp, để mốc thời gian bắt đầu luôn đúng
    const maxInflight = this.ctxStart === null ? 1 : 2
    while (this.inflight < maxInflight && this.nextFrame < totalFrames && this.nextFrame < playing + AHEAD * SR) {
      const from = this.nextFrame
      const len = Math.min(Math.round((from === this.baseFrame ? FIRST_CHUNK : CHUNK) * SR), totalFrames - from)
      this.nextFrame = from + len
      this.inflight++
      const gen = this.gen
      api.audioChunk(this.spec, from, len).then(
        (bytes) => {
          if (gen !== this.gen) return
          this.inflight--
          this.schedule(from, bytes)
          this.pump()
        },
        (err) => {
          if (gen !== this.gen) return
          this.inflight--
          console.warn('Không đọc được âm thanh', err)
          // Không có đoạn đầu thì hình vẫn phải chạy
          if (this.ctxStart === null && this.clock === 'audio') this.useWallClock(this.base)
        }
      )
    }
  }

  private schedule(from: number, bytes: Uint8Array): void {
    const ctx = this.ctx
    const frames = Math.floor(bytes.byteLength / 4)
    if (!ctx || !this.gain || frames <= 0) return
    const aligned = bytes.byteOffset % 2 === 0 ? bytes : bytes.slice()
    const pcm = new Int16Array(aligned.buffer, aligned.byteOffset, frames * 2)
    const buf = ctx.createBuffer(2, frames, SR)
    const left = buf.getChannelData(0)
    const right = buf.getChannelData(1)
    for (let i = 0; i < frames; i++) {
      left[i] = pcm[i * 2] / 32768
      right[i] = pcm[i * 2 + 1] / 32768
    }
    if (this.ctxStart === null) this.ctxStart = ctx.currentTime + START_DELAY
    const when = this.ctxStart + (from - this.baseFrame) / SR
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(this.gain)
    const now = ctx.currentTime
    if (when >= now) src.start(when)
    else {
      // Đoạn về trễ: bỏ phần đã qua để vẫn khớp hình
      const late = now - when
      if (late >= frames / SR) return
      src.start(now, late)
    }
    src.onended = () => {
      this.sources.delete(src)
      src.disconnect()
    }
    this.sources.add(src)
    this.chunksScheduled++
  }

  private stopSources(): void {
    for (const s of this.sources) {
      try {
        s.stop()
      } catch {
        // chưa start
      }
      s.disconnect()
    }
    this.sources.clear()
  }
}

export const player = new PreviewPlayer()
export const assets = new BrowserAssets()

// Cho kiểm thử tự động đọc trạng thái trình phát
;(window as unknown as { __pvm: unknown }).__pvm = { player }
