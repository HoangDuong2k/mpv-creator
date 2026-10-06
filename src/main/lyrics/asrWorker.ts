/**
 * Tiến trình nhận dạng giọng hát cho AI căn lời: chạy Whisper (transformers.js + ONNX Runtime) trong một
 * utilityProcess riêng — mô hình lớn ăn tới ~3 GB bộ nhớ, tách riêng thì app không bị ảnh hưởng, và tắt tiến trình
 * là trả lại bộ nhớ ngay.
 *
 * Cửa sổ 30 giây chồng nhau 5 giây, tự ghép theo thời gian (không dùng chunk_length_s của thư viện: cách ghép của nó
 * làm rơi từ quanh đoạn nhạc dạo dài). Cửa sổ nào bị lặp vòng ("I'm a man" ×90) thì giải mã lại với phạt lặp.
 */
import Module from 'module'
import { pathToFileURL } from 'url'
import { deflateSync } from 'zlib'
import type { AsrJob, AsrWorkerMessage } from './asrProtocol'
import type { AsrWord } from '../../shared/lyricsAlign'

const RATE = 16000
const WINDOW = 30
const OVERLAP = 5

type AsrOutput = { text: string; chunks?: Array<{ text: string; timestamp: [number | null, number | null] }> }
type AsrFn = (audio: Float32Array, opts: Record<string, unknown>) => Promise<AsrOutput>

const port = process.parentPort
const post = (m: AsrWorkerMessage): void => port.postMessage(m)

let backend: 'native' | 'wasm' | null = null
let loaded: { model: string; run: AsrFn } | null = null

/**
 * ONNX Runtime bản native (nhanh nhất); máy không nạp được (Mac chip Intel: ONNX Runtime không còn bản cho x64)
 * thì dùng bản WebAssembly chạy ngay trong Node — chậm hơn 1,3–1,9 lần nhưng chạy được mọi nơi.
 */
function pickBackend(job: AsrJob): 'native' | 'wasm' {
  if (backend) return backend
  if (!job.forceWasm) {
    try {
      require('onnxruntime-node')
      return (backend = 'native')
    } catch {
      // không có bản dựng sẵn cho máy này: dùng WebAssembly
    }
  }
  // transformers.js luôn require('onnxruntime-node') khi nạp: trả về đối tượng rỗng để nó dùng bản WebAssembly bên dưới
  const mod = Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown }
  const load = mod._load
  mod._load = function (request: string, ...rest: unknown[]) {
    return request === 'onnxruntime-node' ? {} : load.call(this, request, ...rest)
  }
  const ort = require('onnxruntime-web') as { env: { wasm: { wasmPaths?: string } } }
  ort.env.wasm.wasmPaths = pathToFileURL(job.wasmDir.replace(/[\\/]?$/, '/')).href
  ;(globalThis as Record<symbol, unknown>)[Symbol.for('onnxruntime')] = ort
  return (backend = 'wasm')
}

async function loadModel(job: AsrJob): Promise<AsrFn> {
  if (loaded?.model === job.model) return loaded.run
  loaded = null
  const kind = pickBackend(job)
  const { pipeline, env } = await import('@huggingface/transformers')
  env.cacheDir = job.cacheDir
  env.allowLocalModels = false
  // Tiến độ tải: cộng số byte đã tải của từng file (bên ngoài biết tổng dung lượng mô hình)
  const bytes = new Map<string, number>()
  let lastSent = 0
  const progress_callback = (p: { status: string; file?: string; loaded?: number }): void => {
    if (p.status !== 'progress' || !p.file) return
    bytes.set(p.file, p.loaded ?? 0)
    const now = Date.now()
    if (now - lastSent < 150) return
    lastSent = now
    let sum = 0
    for (const v of bytes.values()) sum += v
    post({ type: 'progress', phase: 'download', done: sum, total: 0 })
  }
  const options =
    kind === 'native'
      ? { dtype: job.dtype, device: 'cpu', progress_callback }
      : { dtype: job.dtype, device: 'auto', session_options: { executionProviders: ['wasm'] }, progress_callback }
  post({ type: 'progress', phase: 'load', done: 0, total: 0 })
  const run = (await pipeline('automatic-speech-recognition', job.model, options as never)) as unknown as AsrFn
  loaded = { model: job.model, run }
  return run
}

function compressionRatio(text: string): number {
  const b = Buffer.from(text, 'utf8')
  return b.length ? b.length / deflateSync(b).length : 0
}

/**
 * Cửa sổ bị lặp vòng? Phép thử quen thuộc của Whisper (tỉ lệ nén > 2,4) không dùng được cho lời bài hát: điệp khúc
 * lặp lại thật cũng ra 2,6–3,4. Lặp vòng thật thì tỉ lệ nén rất cao, > 5 từ mỗi giây, mốc thời gian dồn về một chỗ.
 */
function loopStats(out: AsrOutput, seconds: number): { degenerate: boolean; badness: number } {
  const chunks = out.chunks ?? []
  const text = chunks.map((c) => c.text).join('')
  const cr = text.length > 40 ? compressionRatio(text) : 1
  const collapsed = chunks.length ? chunks.filter((c) => c.timestamp[1] != null && c.timestamp[0] != null && c.timestamp[1] - c.timestamp[0] < 0.05).length / chunks.length : 0
  const wps = chunks.length / Math.max(1, seconds)
  return { degenerate: wps > 5 || (chunks.length >= 20 && collapsed > 0.4) || cr > 6, badness: cr * (1 + collapsed) }
}

/** Cách giải mã thử lần lượt khi cửa sổ bị lặp vòng (giải mã tham lam trước, giống Whisper gốc) */
const FALLBACKS: Array<Record<string, unknown>> = [{}, { repetition_penalty: 1.2, no_repeat_ngram_size: 4 }, { repetition_penalty: 1.5, no_repeat_ngram_size: 3 }]

const LANG_NAMES: Record<string, string> = { vi: 'vietnamese', en: 'english' }

async function transcribe(run: AsrFn, audio: Float32Array, language: string | null): Promise<AsrWord[]> {
  const total = audio.length / RATE
  const hop = WINDOW - OVERLAP
  const starts: number[] = []
  for (let s = 0; ; s += hop) {
    starts.push(s)
    if (s + WINDOW >= total) break
  }
  const words: AsrWord[] = []
  const base: Record<string, unknown> = { task: 'transcribe', return_timestamps: 'word' }
  if (language && LANG_NAMES[language]) base.language = LANG_NAMES[language]
  post({ type: 'progress', phase: 'listen', done: 0, total: starts.length })
  for (let k = 0; k < starts.length; k++) {
    const ws = starts[k]
    const seg = audio.subarray(Math.round(ws * RATE), Math.min(audio.length, Math.round((ws + WINDOW) * RATE)))
    // Mỗi cửa sổ "sở hữu" một khoảng; chỉ giữ từ có điểm giữa nằm trong khoảng đó
    const ownStart = k === 0 ? -Infinity : ws + OVERLAP / 2
    const ownEnd = k === starts.length - 1 ? Infinity : ws + hop + OVERLAP / 2
    let out: AsrOutput | null = null
    let best: { out: AsrOutput; badness: number } | null = null
    for (const fb of FALLBACKS) {
      const o = await run(seg, { ...base, ...fb })
      const ls = loopStats(o, seg.length / RATE)
      if (!ls.degenerate) {
        out = o
        break
      }
      if (!best || ls.badness < best.badness) best = { out: o, badness: ls.badness }
    }
    // Lần nào cũng lặp: giữ lần ít lặp nhất (bộ lọc câu bịa và bước khớp lời sẽ loại phần còn lại)
    out ??= best!.out
    for (const c of out.chunks ?? []) {
      let [a, b] = c.timestamp
      if (a == null) continue
      if (b == null) b = a + 0.3
      a += ws
      b += ws
      const mid = (a + Math.min(b, a + 1)) / 2 // từ cuối hay bị kéo dài quá mức
      const text = c.text.trim()
      if (text && mid >= ownStart && mid < ownEnd) words.push({ text, start: Math.round(a * 100) / 100, end: Math.round(b * 100) / 100 })
    }
    post({ type: 'progress', phase: 'listen', done: k + 1, total: starts.length })
  }
  return words
}

port.on('message', async (e: { data: AsrJob }) => {
  const job = e.data
  try {
    const run = await loadModel(job)
    const words = await transcribe(run, job.audio, job.language)
    post({ type: 'result', words, backend: backend ?? 'native' })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
})
