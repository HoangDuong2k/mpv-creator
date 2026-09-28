// Worker render một đoạn frame [frameStart, frameEnd) của video và mã hoá bằng FFmpeg.
// Mỗi worker chạy trong một luồng riêng nên nhiều đoạn được render song song.
import { readFileSync } from 'fs'
import { parentPort, workerData } from 'worker_threads'
import { createCanvas, type Canvas } from '@napi-rs/canvas'
import { AudioSampler, Renderer, TrackFeatures } from '../../engine'
import { buildTimeline } from '../../shared/timeline'
import type { Project } from '../../shared/types'
import { runFfmpeg, type FfmpegRun } from '../ffmpeg'
import { NodeAssets, registerFonts } from './nodeAssets'
import { setLang, type Lang } from '../../shared/i18n'

export interface WorkerJob {
  id: number
  project: Project
  featurePaths: Record<string, string>
  fontsDir: string
  ffmpegPath: string
  frameStart: number
  frameEnd: number
  outPath: string
  encoderPre: string[]
  encoderPost: string[]
  threads: number
  lang: Lang
}

export type WorkerMessage =
  | { type: 'progress'; id: number; frames: number }
  | { type: 'done'; id: number; warnings: string[] }
  | { type: 'error'; id: number; message: string }

const job = workerData as WorkerJob
setLang(job.lang)
let encoder: FfmpegRun | null = null
let assets: NodeAssets | null = null
let cancelled = false

parentPort?.on('message', (msg: { type: string }) => {
  if (msg.type === 'cancel') {
    cancelled = true
    encoder?.kill()
    assets?.close()
    // Trong worker thread, process.exit() chỉ kết thúc luồng này
    setImmediate(() => process.exit(0))
  }
})

function post(msg: WorkerMessage): void {
  parentPort?.postMessage(msg)
}

async function main(): Promise<void> {
  process.env.PVM_FFMPEG = job.ffmpegPath
  registerFonts(job.fontsDir)
  const { project } = job
  const { width: W, height: H, fps } = project.settings
  const timeline = buildTimeline(project.tracks, project.settings)
  // Chỉ nạp dữ liệu phân tích của các bài nằm trong đoạn này
  const t0 = job.frameStart / fps - 2
  const t1 = job.frameEnd / fps + 2
  const features = new Map<string, TrackFeatures>()
  for (const e of timeline.entries) {
    const key = e.track.analysisKey
    if (!key || e.end < t0 || e.start > t1 || features.has(key)) continue
    features.set(key, TrackFeatures.parse(new Uint8Array(readFileSync(job.featurePaths[key]))))
  }
  const audio = new AudioSampler(timeline, (k) => features.get(k))
  assets = new NodeAssets()
  await assets.preload(project, job.frameStart / fps, job.frameEnd / fps)
  const renderer = new Renderer(assets)
  const canvas: Canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D

  const count = job.frameEnd - job.frameStart
  encoder = runFfmpeg(
    [
      '-v', 'error', '-y',
      ...job.encoderPre,
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps),
      '-i', 'pipe:0',
      ...job.encoderPost,
      '-threads', String(job.threads),
      '-frames:v', String(count),
      // Ghi ra tên tạm (".partial.mp4") — nói rõ định dạng thay vì để FFmpeg đoán theo đuôi file
      '-an', '-f', 'mp4', job.outPath
    ],
    { stdio: ['pipe', 'ignore', 'pipe'] }
  )
  encoder.done.catch(() => undefined)
  const stdin = encoder.proc.stdin!
  let writeError: Error | null = null
  stdin.on('error', (e) => (writeError = e))

  let lastPost = 0
  for (let f = job.frameStart; f < job.frameEnd; f++) {
    if (cancelled) return
    if (writeError) break
    await assets.advance()
    renderer.render({ ctx, project, timeline, audio, t: f / fps })
    const pixels = canvas.data()
    // Chờ FFmpeg nhận xong frame trước khi vẽ frame sau (không cần copy buffer)
    await new Promise<void>((resolve) => stdin.write(pixels, () => resolve()))
    const done = f - job.frameStart + 1
    if (done - lastPost >= 10 || done === count) {
      lastPost = done
      post({ type: 'progress', id: job.id, frames: done })
    }
  }
  stdin.end()
  await encoder.done
  assets.close()
  const warnings = [...assets.warnings, ...renderer.errors.values()]
  post({ type: 'done', id: job.id, warnings })
}

main().catch((err: Error) => {
  assets?.close()
  encoder?.kill()
  if (!cancelled) post({ type: 'error', id: job.id, message: err.message })
})
