/**
 * AI căn lời phía tiến trình chính: quản lý mô hình Whisper đã tải, giải mã âm thanh, chạy tiến trình nhận dạng
 * (asrWorker) và lưu lại kết quả nhận dạng theo file nhạc + mô hình — sửa lời rồi căn lại thì không phải nghe lại bài.
 */
import { utilityProcess, type UtilityProcess } from 'electron'
import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { CancelledError } from '../ffmpeg'
import { decodeForSpeech } from './speechAudio'
import type { AsrJob, AsrWorkerMessage } from './asrProtocol'
import type { AiModelInfo, AiModelKey, AiProgress, AiTranscribeResult } from '../../shared/api'
import type { AsrWord } from '../../shared/lyricsAlign'
import { tr } from '../../shared/i18n'

/** Hai mô hình cho người dùng chọn (dung lượng tải về đo thực tế, gồm cả bộ tách từ) */
export const AI_MODELS: Record<AiModelKey, { id: string; dtype: string; bytes: number }> = {
  // ~30 giây mỗi bài 3–4 phút; 76% dòng lệch ≤ 0,3 giây trên bài hát thật
  fast: { id: 'onnx-community/whisper-base_timestamped', dtype: 'q8', bytes: 80_000_000 },
  // ~1,5–3 phút mỗi bài; 85% dòng lệch ≤ 0,3 giây, nghe tiếng Việt tốt hơn hẳn
  accurate: { id: 'onnx-community/whisper-large-v3-turbo_timestamped', dtype: 'q4', bytes: 762_000_000 }
}

/** Đổi khi cách nhận dạng thay đổi để không dùng lại kết quả cũ */
const ASR_VERSION = 1
/** Tắt tiến trình nhận dạng sau chừng này thời gian không dùng (trả lại bộ nhớ mô hình) */
const IDLE_MS = 120_000

export class LyricsAi {
  private child: UtilityProcess | null = null
  private idleTimer: NodeJS.Timeout | null = null
  private running: { reject: (e: Error) => void } | null = null

  constructor(
    private readonly opts: {
      /** out/main/asrWorker.js (bản giải nén khỏi asar) */
      workerPath: string
      /** Thư mục cache của app: mô hình ở models/, kết quả nhận dạng ở lyrics-asr/ */
      cacheDir: string
      /** Thư mục file .wasm của ONNX Runtime Web */
      wasmDir: string
      onProgress: (p: AiProgress) => void
    }
  ) {}

  private get modelsDir(): string {
    return join(this.opts.cacheDir, 'models')
  }

  private modelDir(key: AiModelKey): string {
    return join(this.modelsDir, ...AI_MODELS[key].id.split('/'))
  }

  /** Mô hình đã tải xong và chạy được ít nhất một lần */
  private readyMarker(key: AiModelKey): string {
    return join(this.modelDir(key), '.pvm-ready')
  }

  async models(): Promise<AiModelInfo[]> {
    return (Object.keys(AI_MODELS) as AiModelKey[]).map((key) => ({ key, bytes: AI_MODELS[key].bytes, ready: existsSync(this.readyMarker(key)) }))
  }

  async removeModel(key: AiModelKey): Promise<void> {
    this.stopWorker()
    await rm(this.modelDir(key), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }

  cancel(): void {
    if (!this.running) return
    this.running.reject(new CancelledError())
    this.running = null
    this.stopWorker()
  }

  async transcribe(audioPath: string, key: AiModelKey, language: string | null): Promise<AiTranscribeResult> {
    if (this.running) throw new Error(tr('AI đang căn lời một bài khác'))
    const model = AI_MODELS[key]
    const info = await stat(audioPath)
    const hash = createHash('sha1').update(`${audioPath}|${info.size}|${info.mtimeMs}|${model.id}|${model.dtype}|${language}|${ASR_VERSION}`).digest('hex')
    const cachePath = join(this.opts.cacheDir, 'lyrics-asr', `${hash}.json`)
    try {
      return { words: JSON.parse(await readFile(cachePath, 'utf8')) as AsrWord[] }
    } catch {
      // chưa nghe bài này bằng mô hình này
    }
    const cancelled = new Promise<never>((_, reject) => (this.running = { reject }))
    cancelled.catch(() => undefined)
    try {
      this.opts.onProgress({ phase: 'decode', done: 0, total: 0 })
      const audio = await Promise.race([decodeForSpeech(audioPath), cancelled])
      await this.removePartialDownloads(key)
      const { words, backend } = await Promise.race([
        this.runWorker({
          model: model.id,
          dtype: model.dtype,
          cacheDir: this.modelsDir,
          audio,
          language,
          wasmDir: this.opts.wasmDir,
          forceWasm: process.env.PVM_AI_WASM === '1'
        }),
        cancelled
      ])
      await writeFile(this.readyMarker(key), '').catch(() => undefined)
      await mkdir(join(this.opts.cacheDir, 'lyrics-asr'), { recursive: true })
      await writeFile(cachePath, JSON.stringify(words))
      return { words, backend }
    } catch (err) {
      if (err instanceof CancelledError) return { cancelled: true }
      throw err
    } finally {
      this.running = null
      this.scheduleIdleStop()
    }
  }

  /** Tải dở (huỷ giữa chừng, mất mạng) để lại file .tmp: xoá đi để không chiếm chỗ */
  private async removePartialDownloads(key: AiModelKey): Promise<void> {
    const walk = async (dir: string): Promise<void> => {
      for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const p = join(dir, e.name)
        if (e.isDirectory()) await walk(p)
        else if (e.name.includes('.tmp.')) await rm(p, { force: true }).catch(() => undefined)
      }
    }
    await walk(this.modelDir(key))
  }

  private runWorker(job: AsrJob): Promise<{ words: AsrWord[]; backend: 'native' | 'wasm' }> {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    const child = (this.child ??= utilityProcess.fork(this.opts.workerPath, [], { serviceName: 'Playlist Video Maker AI', stdio: 'inherit' }))
    const key = (Object.keys(AI_MODELS) as AiModelKey[]).find((k) => AI_MODELS[k].id === job.model) ?? 'fast'
    const total = AI_MODELS[key].bytes
    // Bước "tải" cũng báo cả khi chỉ đọc mô hình đã có trên máy: lỗi lúc đó mới là lỗi tải khi mô hình chưa có
    const downloading = !existsSync(this.readyMarker(key))
    let phase: AiProgress['phase'] = 'load'
    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        child.off('message', onMessage)
        child.off('exit', onExit)
      }
      const onMessage = (m: AsrWorkerMessage): void => {
        if (m.type === 'progress') {
          phase = m.phase
          this.opts.onProgress(m.phase === 'download' ? { phase: 'download', done: Math.min(m.done, total), total } : { phase: m.phase, done: m.done, total: m.total })
        } else if (m.type === 'result') {
          cleanup()
          resolve({ words: m.words, backend: m.backend })
        } else {
          cleanup()
          reject(new Error(this.explain(m.message, phase === 'download' && downloading)))
        }
      }
      const onExit = (code: number): void => {
        cleanup()
        if (this.child === child) this.child = null
        reject(new Error(tr('Tiến trình AI dừng đột ngột (mã {code}), có thể do máy thiếu bộ nhớ. Thử mô hình Nhanh.', { code: String(code) })))
      }
      child.on('message', onMessage)
      child.on('exit', onExit)
      child.postMessage(job)
    })
  }

  private explain(message: string, whileDownloading: boolean): string {
    if (whileDownloading || /fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|network/i.test(message))
      return tr('Không tải được mô hình AI ({detail}). Kiểm tra kết nối mạng rồi thử lại.', { detail: message })
    return tr('AI không nghe được bài này: {detail}', { detail: message })
  }

  private scheduleIdleStop(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.stopWorker(), IDLE_MS)
  }

  stopWorker(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    const child = this.child
    this.child = null
    child?.kill()
  }
}
