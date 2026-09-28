import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { mkdir, open, rm, stat, writeFile } from 'fs/promises'
import { cpus } from 'os'
import { basename, dirname, extname, join } from 'path'
import { Worker } from 'worker_threads'
import { SAMPLE_RATE } from '../../shared/featureFormat'
import { buildTimeline } from '../../shared/timeline'
import type { EncoderId, ExportSettings, Project } from '../../shared/types'
import { CancelledError, ffmpegPath, parseFfmpegTime, runFfmpeg, type FfmpegRun } from '../ffmpeg'
import { streamMix } from '../audio/mix'
import type { Workspace } from '../workspace'
import { encoderArgs } from './encoders'
import type { WorkerJob, WorkerMessage } from './worker'

export type ExportStage = 'audio' | 'render' | 'mux' | 'done'

export interface ExportProgress {
  stage: ExportStage
  /** 0..1 cho toàn bộ quá trình */
  progress: number
  framesDone: number
  framesTotal: number
  /** Tốc độ render (frame/giây) */
  fps: number
  /** Ước tính thời gian còn lại (giây) */
  eta: number
  elapsed: number
}

export interface ExportOptions {
  project: Project
  workspace: Workspace
  settings: ExportSettings
  fontsDir: string
  /** File worker đã build (out/main/exportWorker.js) hoặc .ts khi chạy bằng tsx */
  workerPath: string
  workerExecArgv?: string[]
  /** Chỉ render một đoạn (giây) — dùng cho "xuất thử" */
  range?: { start: number; duration: number }
  workers?: number
  onProgress?: (p: ExportProgress) => void
  signal?: AbortSignal
}

export interface ExportResult {
  outputPath: string
  seconds: number
  duration: number
  warnings: string[]
}

/** Báo lỗi dễ hiểu khi không ghi được file video */
export async function ensureWritable(path: string): Promise<void> {
  const explain = (err: NodeJS.ErrnoException): Error => {
    if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES')
      return new Error(`Không ghi được "${path}": file đang được mở ở chương trình khác (trình xem video…) hoặc thư mục không cho phép ghi. Hãy đóng file đó hoặc chọn nơi lưu khác.`)
    if (err.code === 'ENOENT') return new Error(`Thư mục lưu không tồn tại: ${dirname(path)}`)
    return new Error(`Không ghi được "${path}": ${err.message}`)
  }
  await mkdir(dirname(path), { recursive: true }).catch(() => undefined)
  try {
    // File đã có: mở để ghi thử (không đổi nội dung). Chưa có: tạo thử rồi xoá.
    const fh = await open(path, existsSync(path) ? 'r+' : 'wx')
    await fh.close()
    if ((await stat(path)).size === 0) await rm(path, { force: true })
  } catch (err) {
    throw explain(err as NodeJS.ErrnoException)
  }
}

/** Đổi thông báo lỗi FFmpeg thường gặp sang tiếng Việt dễ hiểu */
export function friendlyFfmpegError(message: string, outputPath: string): string {
  if (/Permission denied|being used by another process|Device or resource busy/i.test(message))
    return `Không ghi được "${outputPath}": file đang được mở ở chương trình khác hoặc không có quyền ghi.`
  if (/No space left on device|not enough space/i.test(message)) return 'Ổ đĩa đã đầy — hãy giải phóng dung lượng hoặc chọn ổ khác để lưu video.'
  return message
}

/** Số luồng render song song hợp lý cho bộ mã hoá đã chọn */
export function defaultWorkerCount(encoder: EncoderId): number {
  const n = cpus().length
  if (encoder === 'libx264') return Math.max(1, Math.min(8, Math.floor(n / 2.5)))
  return Math.max(1, Math.min(3, Math.floor(n / 2)))
}

/** Đường dẫn cho file danh sách của concat demuxer: dùng '/' (chạy được cả Windows), thoát dấu nháy đơn */
export function escapeConcatPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/'/g, "'\\''")
}

/**
 * Xuất video: (1) chia video thành nhiều đoạn render song song trong worker thread,
 * (2) nối các đoạn và ghép tiếng — âm thanh được trộn trực tiếp từ PCM trong cache
 * rồi đẩy thẳng vào FFmpeg (không cần file mix trung gian).
 */
export async function exportVideo(opts: ExportOptions): Promise<ExportResult> {
  const { project, workspace, settings, signal } = opts
  const started = Date.now()
  const elapsed = (): number => (Date.now() - started) / 1000
  const report = (p: Partial<ExportProgress> & { stage: ExportStage; progress: number }): void =>
    opts.onProgress?.({ framesDone: 0, framesTotal: 0, fps: 0, eta: 0, elapsed: elapsed(), ...p })
  const check = (): void => {
    if (signal?.aborted) throw new CancelledError()
  }

  if (project.tracks.length === 0) throw new Error('Playlist chưa có bài hát')
  const missing = project.tracks.filter((t) => !t.analysisKey)
  if (missing.length) throw new Error(`Còn ${missing.length} bài chưa phân tích xong âm thanh`)
  const featurePaths: Record<string, string> = {}
  for (const t of project.tracks) {
    if (!workspace.hasAudio(t.analysisKey!)) throw new Error(`Thiếu dữ liệu âm thanh của bài "${t.title}" — hãy mở lại project để phân tích lại`)
    featurePaths[t.analysisKey!] = workspace.featuresPath(t.analysisKey!)
  }

  // 1. Render song song
  const { fps } = project.settings
  const timeline = buildTimeline(project.tracks, project.settings)
  const rangeStart = Math.max(0, Math.min(opts.range?.start ?? 0, timeline.total))
  const rangeDur = Math.max(1 / fps, Math.min(opts.range?.duration ?? timeline.total, timeline.total - rangeStart))
  const firstFrame = Math.round(rangeStart * fps)
  const totalFrames = Math.max(1, Math.ceil(rangeDur * fps))
  const workerCount = Math.max(1, Math.min(opts.workers ?? defaultWorkerCount(settings.encoder), Math.ceil(totalFrames / (fps * 3))))
  const threads = Math.max(2, Math.floor((cpus().length * 1.5) / workerCount))
  const { pre, post } = encoderArgs(settings.encoder, settings.quality, fps)

  const outputPath = settings.outputPath
  if (!outputPath) throw new Error('Chưa chọn nơi lưu video')
  // Kiểm tra ghi được file ngay từ đầu (vd. trên Windows file cũ đang mở trong trình xem video sẽ bị khoá),
  // tránh render xong 20 phút mới báo lỗi
  await ensureWritable(outputPath)
  const partsDir = join(dirname(outputPath), `.${basename(outputPath, extname(outputPath))}.parts-${Date.now().toString(36)}`)
  await mkdir(partsDir, { recursive: true })
  // Windows không tự ẩn thư mục bắt đầu bằng "." — đặt thuộc tính ẩn cho thư mục tạm
  if (process.platform === 'win32') spawn('attrib', ['+h', partsDir], { windowsHide: true, stdio: 'ignore' }).on('error', () => undefined)

  const workers: Worker[] = []
  const warnings: string[] = []
  let muxRun: FfmpegRun | null = null
  const onAbort = (): void => {
    for (const w of workers) w.postMessage({ type: 'cancel' })
    muxRun?.kill()
  }
  signal?.addEventListener('abort', onAbort)

  try {
    const segments: string[] = []
    const done = new Array<number>(workerCount).fill(0)
    const renderStart = Date.now()
    await Promise.all(
      Array.from({ length: workerCount }, (_, i) => {
        const a = firstFrame + Math.floor((totalFrames * i) / workerCount)
        const b = firstFrame + Math.floor((totalFrames * (i + 1)) / workerCount)
        const segPath = join(partsDir, `part${String(i).padStart(3, '0')}.mp4`)
        segments.push(segPath)
        const job: WorkerJob = {
          id: i,
          project,
          featurePaths,
          fontsDir: opts.fontsDir,
          ffmpegPath: ffmpegPath(),
          frameStart: a,
          frameEnd: b,
          outPath: segPath,
          encoderPre: pre,
          encoderPost: post,
          threads
        }
        return new Promise<void>((resolve, reject) => {
          const w = new Worker(opts.workerPath, { workerData: job, execArgv: opts.workerExecArgv })
          workers.push(w)
          let settled = false
          w.on('message', (m: WorkerMessage) => {
            if (m.type === 'progress') {
              done[m.id] = m.frames
              const framesDone = done.reduce((s, v) => s + v, 0)
              const secs = (Date.now() - renderStart) / 1000
              const speed = secs > 0 ? framesDone / secs : 0
              report({
                stage: 'render',
                progress: 0.95 * (framesDone / totalFrames),
                framesDone,
                framesTotal: totalFrames,
                fps: speed,
                eta: speed > 0 ? (totalFrames - framesDone) / speed + 2 : 0
              })
            } else if (m.type === 'done') {
              settled = true
              warnings.push(...m.warnings)
              resolve()
            } else {
              settled = true
              reject(new Error(m.message))
            }
          })
          w.on('error', (e) => {
            settled = true
            reject(e)
          })
          w.on('exit', (code) => {
            if (!settled) reject(signal?.aborted ? new CancelledError() : new Error(`Luồng render dừng bất thường (mã ${code})`))
          })
        })
      })
    ).catch((err) => {
      for (const w of workers) w.postMessage({ type: 'cancel' })
      throw signal?.aborted ? new CancelledError() : err
    })
    check()

    // 2. Nối các đoạn + ghép tiếng (âm thanh trộn trực tiếp, đẩy qua stdin)
    report({ stage: 'mux', progress: 0.95, framesDone: totalFrames, framesTotal: totalFrames })
    const listFile = join(partsDir, 'list.txt')
    await writeFile(listFile, segments.map((s) => `file '${escapeConcatPath(s)}'`).join('\n'))
    await mkdir(dirname(outputPath), { recursive: true })
    muxRun = runFfmpeg(
      [
        '-v', 'error', '-stats', '-y',
        '-f', 'concat', '-safe', '0', '-i', listFile,
        '-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', '2', '-i', 'pipe:0',
        '-map', '0:v:0', '-map', '1:a:0',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', `${settings.audioBitrate}k`,
        '-movflags', '+faststart', '-shortest',
        '-f', 'mp4',
        outputPath
      ],
      {
        stdio: ['pipe', 'ignore', 'pipe'],
        onStderr: (line) => {
          const t = parseFfmpegTime(line)
          if (t !== null) report({ stage: 'mux', progress: 0.95 + 0.05 * Math.min(1, t / rangeDur), framesDone: totalFrames, framesTotal: totalFrames })
        }
      }
    )
    const stdin = muxRun.proc.stdin!
    stdin.on('error', () => undefined) // FFmpeg dừng sớm → lỗi thật lấy từ muxRun.done
    const mix = workspace.mixSource(project.tracks, project.settings)
    const pump = (async () => {
      try {
        await streamMix(mix, Math.round(rangeStart * SAMPLE_RATE), Math.round(rangeDur * SAMPLE_RATE), (pcm) =>
          new Promise<void>((resolve, reject) => {
            if (stdin.destroyed) return reject(new Error('FFmpeg đã dừng'))
            stdin.write(pcm, (err) => (err ? reject(err) : resolve()))
          })
        )
      } finally {
        stdin.end()
        await mix.close()
      }
    })().then(
      () => null,
      (e: Error) => e
    )
    await muxRun.done.catch((err: Error) => {
      throw err instanceof CancelledError ? err : new Error(friendlyFfmpegError(err.message, outputPath))
    })
    const pumpError = await pump
    if (pumpError) throw pumpError
    const size = (await stat(outputPath)).size
    if (size < 1000) throw new Error('File video xuất ra bị rỗng')
    report({ stage: 'done', progress: 1, framesDone: totalFrames, framesTotal: totalFrames })
    return { outputPath, seconds: elapsed(), duration: rangeDur, warnings: [...new Set(warnings)] }
  } finally {
    signal?.removeEventListener('abort', onAbort)
    await Promise.all(workers.map((w) => w.terminate().catch(() => 0)))
    // maxRetries: Windows có thể tạm khoá file vừa đóng (FFmpeg vừa thoát, antivirus quét)
    await rm(partsDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined)
  }
}
