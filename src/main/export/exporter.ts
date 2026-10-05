import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { mkdir, open, readdir, rename, rm, stat, writeFile } from 'fs/promises'
import { cpus } from 'os'
import { basename, dirname, extname, join, posix, win32 } from 'path'
import { Worker } from 'worker_threads'
import { SAMPLE_RATE } from '../../shared/featureFormat'
import { buildTimeline } from '../../shared/timeline'
import type { EncoderId, ExportSettings, Project } from '../../shared/types'
import { CancelledError, ffmpegPath, parseFfmpegTime, runFfmpeg, type FfmpegRun } from '../ffmpeg'
import { streamMix } from '../audio/mix'
import type { Workspace } from '../workspace'
import { encoderArgs } from './encoders'
import { chunkFramesFor, completedPartIndex, isPartsDirOf, partialName, partName, partsDirName, planChunks, renderKey, type Chunk } from './plan'
import type { WorkerJob, WorkerMessage } from './worker'
import { getLang, tr } from '../../shared/i18n'

export type ExportStage = 'audio' | 'render' | 'mux' | 'done'

export interface ExportProgress {
  stage: ExportStage
  /** 0..1 cho toàn bộ quá trình */
  progress: number
  framesDone: number
  framesTotal: number
  /** Số frame lấy lại từ lần xuất dở trước (không phải render lại) */
  resumedFrames: number
  /** Số đoạn đã render xong / tổng số đoạn */
  chunksDone: number
  chunksTotal: number
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
  /** Số frame mỗi đoạn — mặc định khoảng 30 giây (kiểm thử đặt nhỏ hơn) */
  chunkFrames?: number
  /** Phiên bản app — đưa vào khoá của bản xuất dở (bản mới có thể vẽ khác) */
  appVersion?: string
  onProgress?: (p: ExportProgress) => void
  signal?: AbortSignal
}

export interface ExportResult {
  outputPath: string
  seconds: number
  duration: number
  warnings: string[]
  /** Số frame dùng lại từ lần xuất dở trước */
  resumedFrames: number
  totalFrames: number
}

/** Báo lỗi dễ hiểu khi không ghi được file video */
export async function ensureWritable(path: string): Promise<void> {
  const explain = (err: NodeJS.ErrnoException): Error => {
    if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES')
      return new Error(
        tr('Không ghi được "{path}": file đang được mở ở chương trình khác (trình xem video…) hoặc thư mục không cho phép ghi. Hãy đóng file đó hoặc chọn nơi lưu khác.', { path })
      )
    if (err.code === 'ENOENT') return new Error(tr('Thư mục lưu không tồn tại: {dir}', { dir: dirname(path) }))
    return new Error(tr('Không ghi được "{path}": {err}', { path, err: err.message }))
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
    return tr('Không ghi được "{path}": file đang được mở ở chương trình khác hoặc không có quyền ghi.', { path: outputPath })
  if (/No space left on device|not enough space/i.test(message)) return tr('Ổ đĩa đã đầy. Hãy giải phóng dung lượng hoặc chọn ổ khác để lưu video.')
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

/** Chuỗi trông như đường dẫn tuyệt đối (kiểu Windows hoặc POSIX) */
function looksLikePath(v: string): boolean {
  return v.length < 1024 && (posix.isAbsolute(v) || win32.isAbsolute(v))
}

/** Kích thước + thời điểm sửa của các file ảnh/video project dùng — thay file thì bản xuất dở không còn khớp */
async function mediaStamps(project: Project): Promise<Record<string, string>> {
  const paths = new Set<string>()
  const visit = (v: unknown): void => {
    if (typeof v === 'string') {
      if (looksLikePath(v)) paths.add(v)
    } else if (Array.isArray(v)) v.forEach(visit)
    else if (v && typeof v === 'object') Object.values(v).forEach(visit)
  }
  for (const l of project.layers) visit(l.props)
  for (const t of project.tracks) if (t.coverPath) paths.add(t.coverPath)
  const out: Record<string, string> = {}
  for (const p of [...paths].sort()) {
    try {
      const s = await stat(p)
      out[p] = `${s.size}:${Math.round(s.mtimeMs)}`
    } catch {
      out[p] = '-'
    }
  }
  return out
}

/**
 * File MP4 hoàn chỉnh: các hộp cấp ngoài cùng nối liền tới đúng cuối file và có hộp "moov"
 * (FFmpeg ghi "moov" sau cùng — file bị cắt ngang khi mất điện sẽ thiếu).
 */
export async function isCompleteMp4(path: string): Promise<boolean> {
  let fh: Awaited<ReturnType<typeof open>> | null = null
  try {
    fh = await open(path, 'r')
    const size = (await fh.stat()).size
    const head = Buffer.alloc(16)
    let pos = 0
    let moov = false
    while (pos + 8 <= size) {
      const { bytesRead } = await fh.read(head, 0, 16, pos)
      if (bytesRead < 8) return false
      let len = head.readUInt32BE(0)
      if (len === 1) {
        if (bytesRead < 16) return false
        len = Number(head.readBigUInt64BE(8))
      } else if (len === 0) len = size - pos // hộp kéo tới hết file
      if (len < 8) return false
      if (head.toString('latin1', 4, 8) === 'moov') moov = true
      pos += len
    }
    return moov && pos === size
  } catch {
    return false
  } finally {
    await fh?.close()
  }
}

/** Ghi hẳn xuống đĩa rồi mới đổi sang tên "đã xong" — mất điện ngay sau đó cũng không có đoạn hỏng mang tên đã xong */
async function commitPart(from: string, to: string): Promise<void> {
  const fh = await open(from, 'r+')
  try {
    await fh.sync()
  } finally {
    await fh.close()
  }
  // Windows có thể tạm khoá file vừa đóng (FFmpeg vừa thoát, antivirus quét) → thử lại vài lần
  for (let i = 0; ; i++) {
    try {
      await rename(from, to)
      return
    } catch (err) {
      if (i >= 5) throw err
      await new Promise((r) => setTimeout(r, 200))
    }
  }
}

const RM_OPTS = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 } as const

/** Xoá thư mục tạm của các lần xuất trước ra cùng tên file (project đã đổi nên không dùng lại được) */
async function removeStaleParts(dir: string, base: string, keep: string): Promise<void> {
  const names = await readdir(dir).catch(() => [] as string[])
  for (const n of names) if (n !== keep && isPartsDirOf(n, base)) await rm(join(dir, n), RM_OPTS).catch(() => undefined)
}

/** Giữ các đoạn đã xong, xoá phần dở dang (đoạn đang render lúc bị ngắt, danh sách nối) */
async function removePartials(dir: string): Promise<void> {
  const names = await readdir(dir).catch(() => [] as string[])
  for (const n of names) if (completedPartIndex(n) === null) await rm(join(dir, n), RM_OPTS).catch(() => undefined)
}

/**
 * Xuất video: (1) chia video thành các đoạn khoảng 30 giây, nhiều worker thread render song song,
 * mỗi luồng xong đoạn này thì nhận đoạn kế tiếp; (2) nối các đoạn và ghép tiếng — âm thanh được trộn
 * trực tiếp từ PCM trong cache rồi đẩy thẳng vào FFmpeg (không cần file mix trung gian).
 *
 * Xuất cả video: các đoạn đã xong được giữ lại khi bị ngắt (huỷ, lỗi, tắt app, mất điện). Lần xuất sau
 * của cùng project (chưa sửa gì) ra cùng file chỉ render phần còn thiếu. Xuất thử thì luôn làm mới.
 */
export async function exportVideo(opts: ExportOptions): Promise<ExportResult> {
  const { project, workspace, settings, signal } = opts
  const started = Date.now()
  const elapsed = (): number => (Date.now() - started) / 1000
  let resumedFrames = 0
  let chunksDone = 0
  let chunksTotal = 0
  const report = (p: Partial<ExportProgress> & { stage: ExportStage; progress: number }): void =>
    opts.onProgress?.({ framesDone: 0, framesTotal: 0, fps: 0, eta: 0, elapsed: elapsed(), resumedFrames, chunksDone, chunksTotal, ...p })
  const check = (): void => {
    if (signal?.aborted) throw new CancelledError()
  }

  if (project.tracks.length === 0) throw new Error(tr('Playlist chưa có bài hát'))
  const missing = project.tracks.filter((t) => !t.analysisKey)
  if (missing.length) throw new Error(tr('Còn {n} bài chưa phân tích xong âm thanh', { n: missing.length }))
  const featurePaths: Record<string, string> = {}
  for (const t of project.tracks) {
    if (!workspace.hasAudio(t.analysisKey!)) throw new Error(tr('Thiếu dữ liệu âm thanh của bài "{title}". Hãy mở lại project để phân tích lại.', { title: t.title }))
    featurePaths[t.analysisKey!] = workspace.featuresPath(t.analysisKey!)
  }

  // 1. Chia đoạn
  const { fps } = project.settings
  const timeline = buildTimeline(project.tracks, project.settings)
  const rangeStart = Math.max(0, Math.min(opts.range?.start ?? 0, timeline.total))
  const rangeDur = Math.max(1 / fps, Math.min(opts.range?.duration ?? timeline.total, timeline.total - rangeStart))
  const firstFrame = Math.round(rangeStart * fps)
  const totalFrames = Math.max(1, Math.ceil(rangeDur * fps))
  const workerCount = Math.max(1, Math.min(opts.workers ?? defaultWorkerCount(settings.encoder), Math.ceil(totalFrames / (fps * 3))))
  const threads = Math.max(2, Math.floor((cpus().length * 1.5) / workerCount))
  const { pre, post } = encoderArgs(settings.encoder, settings.quality, fps, project.settings.width * project.settings.height)

  const outputPath = settings.outputPath
  if (!outputPath) throw new Error(tr('Chưa chọn nơi lưu video'))
  // Kiểm tra ghi được file ngay từ đầu (vd. trên Windows file cũ đang mở trong trình xem video sẽ bị khoá),
  // tránh render xong 20 phút mới báo lỗi
  await ensureWritable(outputPath)

  const chunkFrames = Math.max(1, Math.round(opts.chunkFrames ?? chunkFramesFor(totalFrames, fps, workerCount)))
  const chunks = planChunks(firstFrame, totalFrames, chunkFrames)
  chunksTotal = chunks.length
  const resumable = !opts.range
  const outDir = dirname(outputPath)
  const base = basename(outputPath, extname(outputPath))
  const key = resumable
    ? renderKey({ project, settings, firstFrame, totalFrames, chunkFrames, appVersion: opts.appVersion, media: await mediaStamps(project) })
    : Date.now().toString(36)
  const partsDir = join(outDir, partsDirName(base, key))
  await removeStaleParts(outDir, base, basename(partsDir))
  await mkdir(partsDir, { recursive: true })
  // Windows không tự ẩn thư mục bắt đầu bằng "." — đặt thuộc tính ẩn cho thư mục tạm
  if (process.platform === 'win32') spawn('attrib', ['+h', partsDir], { windowsHide: true, stdio: 'ignore' }).on('error', () => undefined)

  // Đoạn đã xong từ lần xuất trước được dùng lại; phần dở dang (đang render lúc bị ngắt) thì xoá
  const reused = new Set<number>()
  for (const name of await readdir(partsDir)) {
    const i = completedPartIndex(name)
    if (resumable && i !== null && i < chunks.length && (await isCompleteMp4(join(partsDir, name)))) reused.add(i)
    else await rm(join(partsDir, name), RM_OPTS).catch(() => undefined)
  }
  for (const c of chunks) if (reused.has(c.index)) resumedFrames += c.end - c.start
  chunksDone = reused.size
  report({ stage: 'render', progress: 0.95 * (resumedFrames / totalFrames), framesDone: resumedFrames, framesTotal: totalFrames })

  const active = new Set<Worker>()
  const warnings: string[] = []
  let muxRun: FfmpegRun | null = null
  let success = false
  const onAbort = (): void => {
    for (const w of active) w.postMessage({ type: 'cancel' })
    muxRun?.kill()
  }
  signal?.addEventListener('abort', onAbort)

  try {
    // 2. Render các đoạn còn thiếu: mỗi luồng xong đoạn này thì nhận đoạn kế tiếp
    const fresh = new Map<number, number>() // số frame đã render trong lần này, theo đoạn
    const renderStart = Date.now()
    const onFrames = (): void => {
      let n = 0
      for (const v of fresh.values()) n += v
      const framesDone = resumedFrames + n
      const secs = (Date.now() - renderStart) / 1000
      const speed = secs > 0 ? n / secs : 0
      report({
        stage: 'render',
        progress: 0.95 * (framesDone / totalFrames),
        framesDone,
        framesTotal: totalFrames,
        fps: speed,
        eta: speed > 0 ? (totalFrames - framesDone) / speed + 2 : 0
      })
    }
    const renderChunk = (c: Chunk): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        const job: WorkerJob = {
          id: c.index,
          project,
          featurePaths,
          fontsDir: opts.fontsDir,
          ffmpegPath: ffmpegPath(),
          frameStart: c.start,
          frameEnd: c.end,
          outPath: join(partsDir, partialName(c.index)),
          encoderPre: pre,
          encoderPost: post,
          threads,
          // Cảnh báo từ luồng render hiện theo ngôn ngữ giao diện
          lang: getLang()
        }
        const w = new Worker(opts.workerPath, { workerData: job, execArgv: opts.workerExecArgv })
        active.add(w)
        let settled = false
        const finish = (err?: Error): void => {
          if (settled) return
          settled = true
          active.delete(w)
          // Worker còn giữ cổng tin nhắn nên không tự thoát — đóng luôn khi đã xong đoạn
          void w.terminate().catch(() => 0)
          if (err) reject(err)
          else resolve()
        }
        w.on('message', (m: WorkerMessage) => {
          if (m.type === 'progress') {
            fresh.set(c.index, m.frames)
            onFrames()
          } else if (m.type === 'done') {
            warnings.push(...m.warnings)
            finish()
          } else finish(new Error(m.message))
        })
        w.on('error', (e) => finish(e))
        w.on('exit', (code) => finish(signal?.aborted ? new CancelledError() : new Error(tr('Luồng render dừng bất thường (mã {code})', { code }))))
      })

    const pending = chunks.filter((c) => !reused.has(c.index))
    let next = 0
    let failure = null as Error | null
    const lane = async (): Promise<void> => {
      while (!failure && next < pending.length) {
        check()
        const c = pending[next++]
        await renderChunk(c)
        await commitPart(join(partsDir, partialName(c.index)), join(partsDir, partName(c.index)))
        chunksDone++
        onFrames()
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(workerCount, pending.length) }, () =>
        lane().catch((err: Error) => {
          // Một đoạn lỗi → dừng các luồng khác; các đoạn đã xong vẫn được giữ để xuất tiếp
          failure ??= err
          for (const w of active) w.postMessage({ type: 'cancel' })
        })
      )
    )
    check()
    if (failure) throw failure

    // 3. Nối các đoạn + ghép tiếng (âm thanh trộn trực tiếp, đẩy qua stdin)
    report({ stage: 'mux', progress: 0.95, framesDone: totalFrames, framesTotal: totalFrames })
    const listFile = join(partsDir, 'list.txt')
    await writeFile(listFile, chunks.map((c) => `file '${escapeConcatPath(join(partsDir, partName(c.index)))}'`).join('\n'))
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
            if (stdin.destroyed) return reject(new Error(tr('FFmpeg đã dừng')))
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
    if (size < 1000) throw new Error(tr('File video xuất ra bị rỗng'))
    report({ stage: 'done', progress: 1, framesDone: totalFrames, framesTotal: totalFrames })
    success = true
    return { outputPath, seconds: elapsed(), duration: rangeDur, warnings: [...new Set(warnings)], resumedFrames, totalFrames }
  } finally {
    signal?.removeEventListener('abort', onAbort)
    await Promise.all([...active].map((w) => w.terminate().catch(() => 0)))
    // Xong, hoặc chỉ là xuất thử: xoá thư mục tạm. Xuất cả video bị ngắt: giữ các đoạn đã xong để lần sau xuất tiếp
    if (success || !resumable) await rm(partsDir, RM_OPTS).catch(() => undefined)
    else await removePartials(partsDir)
  }
}
