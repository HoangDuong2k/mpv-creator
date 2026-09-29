import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { GlobalFonts, ImageData, Path2D, createCanvas, loadImage, type Canvas, type Image, type SKRSContext2D } from '@napi-rs/canvas'
import { FONT_FILES } from '../../shared/fonts'
import { buildTimeline } from '../../shared/timeline'
import type { Project } from '../../shared/types'
import type { EngineAssets, OffscreenSurface } from '../../engine/env'
import { collectAssets } from '../../engine'
import { probeDuration, runFfmpeg, type FfmpegRun } from '../ffmpeg'
import { tr } from '../../shared/i18n'

let fontsRegistered = false

export function registerFonts(fontsDir: string): void {
  if (fontsRegistered) return
  fontsRegistered = true
  const available = existsSync(fontsDir) ? new Set(readdirSync(fontsDir)) : new Set<string>()
  for (const f of FONT_FILES) {
    if (available.has(f.file)) GlobalFonts.registerFromPath(join(fontsDir, f.file), f.family)
  }
}

/** Thu nhỏ ảnh lớn hơn maxSide (vẽ ảnh 4000px mỗi frame bằng CPU rất chậm và tốn RAM) */
function fitImage(img: Image, maxSide: number): Image | Canvas {
  const k = maxSide / Math.max(img.width, img.height)
  if (k >= 1) return img
  const c = createCanvas(Math.max(1, Math.round(img.width * k)), Math.max(1, Math.round(img.height * k)))
  const ctx = c.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return c
}


/**
 * Đọc lần lượt từng frame của video nền (lặp vô hạn) đã được FFmpeg co giãn
 * về đúng kích thước khung hình và đúng fps của project.
 */
class VideoFrameReader {
  private run: FfmpegRun
  private chunks: Buffer[] = []
  private buffered = 0
  private ended = false
  private waiter: (() => void) | null = null
  private readonly frameBytes: number
  readonly surface: OffscreenSurface
  private readonly imageData: ImageData

  constructor(path: string, startOffset: number, W: number, H: number, fps: number) {
    this.frameBytes = W * H * 4
    const surf = createCanvas(W, H)
    this.surface = { canvas: surf as unknown as CanvasImageSource, ctx: surf.getContext('2d') as unknown as CanvasRenderingContext2D }
    this.imageData = new ImageData(W, H)
    this.run = runFfmpeg([
      '-v', 'error',
      '-stream_loop', '-1',
      '-ss', startOffset.toFixed(3),
      '-i', path,
      '-an',
      '-vf', `fps=${fps},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`,
      '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'
    ])
    this.run.done.catch(() => undefined)
    const out = this.run.proc.stdout!
    out.on('data', (c: Buffer) => {
      this.chunks.push(c)
      this.buffered += c.length
      if (this.buffered > this.frameBytes * 3) out.pause()
      this.wake()
    })
    out.on('end', () => {
      this.ended = true
      this.wake()
    })
  }

  private wake(): void {
    const w = this.waiter
    this.waiter = null
    w?.()
  }

  /** Đọc frame kế tiếp vào surface. Trả về false nếu hết dữ liệu (lỗi video). */
  async next(): Promise<boolean> {
    while (this.buffered < this.frameBytes) {
      if (this.ended) return false
      this.run.proc.stdout!.resume()
      await new Promise<void>((r) => (this.waiter = r))
    }
    const dst = this.imageData.data
    let filled = 0
    while (filled < this.frameBytes) {
      const c = this.chunks[0]
      const take = Math.min(c.length, this.frameBytes - filled)
      dst.set(c.subarray(0, take), filled)
      filled += take
      if (take === c.length) this.chunks.shift()
      else this.chunks[0] = c.subarray(take)
    }
    this.buffered -= this.frameBytes
    if (this.buffered < this.frameBytes * 2) this.run.proc.stdout!.resume()
    ;(this.surface.ctx as unknown as SKRSContext2D).putImageData(this.imageData, 0, 0)
    return true
  }

  close(): void {
    this.run.kill()
  }
}

/** Tài nguyên cho engine khi render trong Node (Skia) */
export class NodeAssets implements EngineAssets {
  private images = new Map<string, Image | Canvas>()
  private videos = new Map<string, VideoFrameReader>()
  readonly warnings: string[] = []

  /**
   * Nạp trước ảnh/video cho đoạn [startTime, endTime]. Ảnh bìa chỉ nạp cho các bài
   * nằm trong đoạn này và ảnh quá lớn được thu nhỏ — playlist dài không làm tràn RAM.
   */
  async preload(project: Project, startTime: number, endTime = Infinity): Promise<void> {
    const { images, videos } = collectAssets(project)
    const { width: W, height: H, fps } = project.settings
    const tl = buildTimeline(project.tracks, project.settings)
    const covers = new Set(project.tracks.map((t) => t.coverPath).filter(Boolean))
    const coversInRange = new Set<string>()
    tl.entries.forEach((e, i) => {
      if (e.end < startTime - 2 || e.start > endTime + 2) return
      for (const x of [e, tl.entries[i - 1]]) if (x?.track.coverPath) coversInRange.add(x.track.coverPath)
    })
    for (const p of images) {
      if (covers.has(p) && !coversInRange.has(p)) continue
      try {
        this.images.set(p, fitImage(await loadImage(p), Math.max(W, H)))
      } catch (err) {
        this.warnings.push(tr('Không mở được ảnh {file}: {err}', { file: p, err: (err as Error).message }))
      }
    }
    for (const p of videos) {
      const dur = await probeDuration(p)
      if (dur <= 0) {
        this.warnings.push(tr('Không đọc được video nền {file}', { file: p }))
        continue
      }
      this.videos.set(p, new VideoFrameReader(p, startTime % dur, W, H, fps))
    }
  }

  /** Gọi trước mỗi frame: đẩy video nền sang frame kế tiếp */
  async advance(): Promise<void> {
    for (const [p, r] of this.videos) {
      if (!(await r.next())) {
        r.close()
        this.videos.delete(p)
        this.warnings.push(tr('Video nền bị dừng giữa chừng: {file}', { file: p }))
      }
    }
  }

  close(): void {
    for (const r of this.videos.values()) r.close()
    this.videos.clear()
  }

  image(path: string): CanvasImageSource | null {
    return (this.images.get(path) as unknown as CanvasImageSource) ?? null
  }

  video(path: string): CanvasImageSource | null {
    return this.videos.get(path)?.surface.canvas ?? null
  }

  createSurface(width: number, height: number): OffscreenSurface {
    const c = createCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)))
    return { canvas: c as unknown as CanvasImageSource, ctx: c.getContext('2d') as unknown as CanvasRenderingContext2D }
  }

  path2d(d: string): globalThis.Path2D {
    return new Path2D(d) as unknown as globalThis.Path2D
  }
}
