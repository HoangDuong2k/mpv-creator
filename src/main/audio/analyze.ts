import { existsSync } from 'fs'
import { mkdir, rename, rm, writeFile } from 'fs/promises'
import { dirname } from 'path'
import {
  ANALYSIS_VERSION,
  BAND_COUNT,
  FEATURE_RATE,
  FFT_SIZE,
  OFF_BAL,
  OFF_BASS,
  OFF_BEAT,
  OFF_RMS,
  OFF_WAVE,
  SAMPLE_RATE,
  STRIDE,
  WAVE_POINTS,
  bandEdgeHz,
  encodeFeatures,
  type FeatureHeader
} from '../../shared/featureFormat'
import { runFfmpeg } from '../ffmpeg'
import { FFT } from './fft'
import { tr } from '../../shared/i18n'

const HOP = SAMPLE_RATE / FEATURE_RATE // 800 mẫu mỗi frame
const N = FFT_SIZE
const HALF = N / 2
const BIN_HZ = SAMPLE_RATE / N
const CHUNK_FRAMES = 4096

/** Dữ liệu tạm theo khối để không phải biết trước số frame */
class ChunkedF32 {
  private chunks: Float32Array[] = []
  constructor(private readonly width: number) {}
  row(frame: number): Float32Array {
    const c = Math.floor(frame / CHUNK_FRAMES)
    while (this.chunks.length <= c) this.chunks.push(new Float32Array(CHUNK_FRAMES * this.width))
    const off = (frame % CHUNK_FRAMES) * this.width
    return this.chunks[c].subarray(off, off + this.width)
  }
}

/** Giá trị ở phân vị q (0..1) bằng histogram, dùng cho dữ liệu lớn */
function percentile(values: Iterable<number>, q: number, lo: number, hi: number, bins = 4000): number {
  const hist = new Uint32Array(bins)
  let count = 0
  for (const v of values) {
    if (!Number.isFinite(v)) continue
    const i = Math.min(bins - 1, Math.max(0, Math.floor(((v - lo) / (hi - lo)) * bins)))
    hist[i]++
    count++
  }
  if (count === 0) return hi
  const target = q * count
  let acc = 0
  for (let i = 0; i < bins; i++) {
    acc += hist[i]
    if (acc >= target) return lo + ((i + 0.5) / bins) * (hi - lo)
  }
  return hi
}

/**
 * Phân tích tín hiệu 48kHz theo luồng: mỗi frame 1/60 giây tính phổ 64 dải (thang log),
 * dạng sóng, RMS, bass và phát hiện beat trên bản mono; nhận thêm hai kênh trái / phải
 * (pushStereo) thì ghi cả độ cân bằng trái / phải (cho đồng hồ VU hai kim).
 */
export class FeatureAnalyzer {
  private readonly fft = new FFT(N)
  private readonly window = new Float64Array(N)
  private readonly re = new Float64Array(N)
  private readonly im = new Float64Array(N)
  private readonly bandBins: Array<{ lo: number; hi: number; center: number; tilt: number }> = []
  private readonly bassLo = Math.max(1, Math.round(30 / BIN_HZ))
  private readonly bassHi = Math.round(150 / BIN_HZ)

  private buf: Float32Array = new Float32Array(N * 8)
  /** Hai kênh trái / phải, cùng chỉ số với buf (chỉ có khi nhận âm thanh stereo) */
  private bufL: Float32Array | null = null
  private bufR: Float32Array | null = null
  private bufStart = 0 // chỉ số mẫu toàn cục của buf[0]
  private bufLen = 0
  private received = 0
  private frame = 0

  private readonly bandsDb = new ChunkedF32(BAND_COUNT)
  private readonly waveRaw = new ChunkedF32(WAVE_POINTS)
  private readonly scalars = new ChunkedF32(2) // [rmsDb, bassDb]
  private readonly balance = new ChunkedF32(1)

  constructor() {
    for (let i = 0; i < N; i++) this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))
    for (let b = 0; b < BAND_COUNT; b++) {
      const f0 = bandEdgeHz(b)
      const f1 = bandEdgeHz(b + 1)
      const center = Math.sqrt(f0 * f1)
      // Bù độ dốc phổ tự nhiên của nhạc (+3dB/quãng tám) để dải cao không bị chìm
      const tilt = 3 * Math.log2(center / 1000)
      this.bandBins.push({ lo: f0 / BIN_HZ, hi: f1 / BIN_HZ, center: center / BIN_HZ, tilt })
    }
  }

  get samples(): number {
    return this.received
  }

  push(samples: Float32Array, left?: Float32Array, right?: Float32Array): void {
    const need = this.bufLen + samples.length
    const grow = (b: Float32Array): Float32Array => {
      if (need <= b.length) return b
      const next = new Float32Array(Math.max(b.length * 2, need))
      next.set(b.subarray(0, this.bufLen))
      return next
    }
    this.buf = grow(this.buf)
    this.buf.set(samples, this.bufLen)
    if (left && right) {
      this.bufL = grow(this.bufL ?? new Float32Array(this.buf.length))
      this.bufR = grow(this.bufR ?? new Float32Array(this.buf.length))
      this.bufL.set(left, this.bufLen)
      this.bufR.set(right, this.bufLen)
    }
    this.bufLen += samples.length
    this.received += samples.length
    this.process(false)
  }

  /** Mẫu stereo xen kẽ trái, phải (mono = trung bình hai kênh, như FFmpeg trộn về 1 kênh) */
  pushStereo(interleaved: Float32Array): void {
    const n = interleaved.length >> 1
    const mono = new Float32Array(n)
    const l = new Float32Array(n)
    const r = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      l[i] = interleaved[i * 2]
      r[i] = interleaved[i * 2 + 1]
      mono[i] = (l[i] + r[i]) / 2
    }
    this.push(mono, l, r)
  }

  private sample(global: number): number {
    const i = global - this.bufStart
    return i >= 0 && i < this.bufLen ? this.buf[i] : 0
  }

  private process(final: boolean): void {
    for (;;) {
      const center = this.frame * HOP
      if (final ? center >= this.received : center + HALF > this.received) break
      this.analyzeFrame(center)
      this.frame++
    }
    // Bỏ các mẫu không còn cần
    const keepFrom = this.frame * HOP - HALF
    const drop = keepFrom - this.bufStart
    if (drop > N * 4) {
      this.buf.copyWithin(0, drop, this.bufLen)
      this.bufL?.copyWithin(0, drop, this.bufLen)
      this.bufR?.copyWithin(0, drop, this.bufLen)
      this.bufLen -= drop
      this.bufStart += drop
    }
  }

  private analyzeFrame(center: number): void {
    const { re, im, window } = this
    let sumSq = 0
    for (let i = 0; i < N; i++) {
      const x = this.sample(center - HALF + i)
      sumSq += x * x
      re[i] = x * window[i]
      im[i] = 0
    }
    const wave = this.waveRaw.row(this.frame)
    const group = N / WAVE_POINTS
    for (let p = 0; p < WAVE_POINTS; p++) {
      let s = 0
      for (let j = 0; j < group; j++) s += this.sample(center - HALF + p * group + j)
      wave[p] = s / group
    }
    this.fft.transform(re, im)
    const norm = 4 / N
    const mag2 = (k: number): number => {
      const r = re[k] * norm
      const m = im[k] * norm
      return r * r + m * m
    }
    const bands = this.bandsDb.row(this.frame)
    for (let b = 0; b < BAND_COUNT; b++) {
      const { lo, hi, center: c, tilt } = this.bandBins[b]
      const k0 = Math.ceil(lo)
      const k1 = Math.min(HALF - 1, Math.floor(hi))
      let power: number
      if (k1 >= k0) {
        let s = 0
        for (let k = k0; k <= k1; k++) s += mag2(k)
        power = s / (k1 - k0 + 1)
      } else {
        // Dải hẹp hơn 1 bin: nội suy theo tần số tâm
        const kf = Math.min(HALF - 2, Math.max(0, c))
        const k = Math.floor(kf)
        power = mag2(k) + (mag2(k + 1) - mag2(k)) * (kf - k)
      }
      bands[b] = 10 * Math.log10(power + 1e-14) + tilt
    }
    let bass = 0
    for (let k = this.bassLo; k <= this.bassHi; k++) bass += mag2(k)
    const sc = this.scalars.row(this.frame)
    sc[0] = 10 * Math.log10(sumSq / N + 1e-14)
    sc[1] = 10 * Math.log10(bass + 1e-14)
    if (this.bufL && this.bufR) {
      let sl = 0
      let sr = 0
      const from = center - HALF - this.bufStart
      for (let i = 0; i < N; i++) {
        const j = from + i
        if (j < 0 || j >= this.bufLen) continue
        sl += this.bufL[j] * this.bufL[j]
        sr += this.bufR[j] * this.bufR[j]
      }
      const al = Math.sqrt(sl)
      const ar = Math.sqrt(sr)
      this.balance.row(this.frame)[0] = al + ar > 1e-9 ? ar / (al + ar) : 0.5
    }
  }

  finish(): { header: FeatureHeader; data: Uint8Array } {
    this.process(true)
    const frames = this.frame
    const data = new Uint8Array(frames * STRIDE)
    const self = this
    function* allBands(): Generator<number> {
      for (let f = 0; f < frames; f++) yield* self.bandsDb.row(f)
    }
    function* col(i: number): Generator<number> {
      for (let f = 0; f < frames; f++) yield self.scalars.row(f)[i]
    }
    function* waveAbs(): Generator<number> {
      for (let f = 0; f < frames; f++) for (const v of self.waveRaw.row(f)) yield Math.abs(v)
    }

    // Chuẩn hoá theo từng bài để bài nhỏ tiếng vẫn hiển thị đầy đủ
    const bandTop = percentile(allBands(), 0.995, -160, 40)
    const BAND_RANGE = 50
    const rmsTop = percentile(col(0), 0.99, -160, 20)
    const bassTop = percentile(col(1), 0.99, -160, 40)
    const wavePeak = Math.max(1e-4, percentile(waveAbs(), 0.999, 0, 1.5))
    const q = (v: number): number => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255))

    for (let f = 0; f < frames; f++) {
      const base = f * STRIDE
      const bands = this.bandsDb.row(f)
      for (let b = 0; b < BAND_COUNT; b++) data[base + b] = q((bands[b] - (bandTop - BAND_RANGE)) / BAND_RANGE)
      const wave = this.waveRaw.row(f)
      for (let p = 0; p < WAVE_POINTS; p++) {
        const v = Math.max(-1, Math.min(1, wave[p] / wavePeak))
        data[base + OFF_WAVE + p] = Math.round(v * 127) + 128
      }
      const sc = this.scalars.row(f)
      data[base + OFF_RMS] = q((sc[0] - (rmsTop - 40)) / 40)
      data[base + OFF_BASS] = q((sc[1] - (bassTop - 30)) / 30)
      // 0 = không có thông tin (bản mono / phân tích cũ): engine coi là cân giữa
      if (this.bufL) data[base + OFF_BAL] = Math.max(1, q(this.balance.row(f)[0]))
    }
    this.detectBeats(frames, bassTop, data)

    const header: FeatureHeader = {
      version: ANALYSIS_VERSION,
      rate: FEATURE_RATE,
      frames,
      bands: BAND_COUNT,
      wave: WAVE_POINTS,
      stride: STRIDE,
      sampleRate: SAMPLE_RATE,
      samples: this.received,
      duration: this.received / SAMPLE_RATE
    }
    return { header, data }
  }

  /** Phát hiện beat từ độ tăng năng lượng dải bass (onset), ngưỡng thích nghi cục bộ. */
  private detectBeats(frames: number, bassTop: number, data: Uint8Array): void {
    const L = new Float32Array(frames)
    for (let f = 0; f < frames; f++) L[f] = this.scalars.row(f)[1]
    const odf = new Float32Array(frames)
    for (let f = 3; f < frames; f++) odf[f] = Math.max(0, L[f] - Math.max(L[f - 3], L[f - 2] - 1))

    const W = 30 // ±0.5 giây
    const minGap = Math.round(0.22 * FEATURE_RATE)
    const candidates: number[] = []
    // Tổng trượt để tính trung bình / độ lệch chuẩn cục bộ nhanh
    const pre = new Float64Array(frames + 1)
    const pre2 = new Float64Array(frames + 1)
    for (let f = 0; f < frames; f++) {
      pre[f + 1] = pre[f] + odf[f]
      pre2[f + 1] = pre2[f] + odf[f] * odf[f]
    }
    let last = -minGap
    for (let f = 1; f < frames - 1; f++) {
      const v = odf[f]
      if (v < 2.5) continue
      if (L[f] < bassTop - 24) continue
      let isPeak = true
      for (let j = Math.max(0, f - 4); j <= Math.min(frames - 1, f + 4); j++) {
        if (odf[j] > v || (odf[j] === v && j < f)) {
          isPeak = false
          break
        }
      }
      if (!isPeak) continue
      const a = Math.max(0, f - W)
      const b = Math.min(frames, f + W + 1)
      const n = b - a
      const mean = (pre[b] - pre[a]) / n
      const std = Math.sqrt(Math.max(0, (pre2[b] - pre2[a]) / n - mean * mean))
      if (v < mean + 1.2 * std) continue
      if (f - last < minGap) continue
      candidates.push(f)
      last = f
    }
    if (candidates.length === 0) return
    const ref = percentile(
      candidates.map((f) => odf[f]),
      0.8,
      0,
      60,
      1200
    )
    for (const f of candidates) {
      const loud = Math.min(1, Math.max(0.3, (L[f] - (bassTop - 24)) / 14))
      const s = Math.min(1, Math.max(0.25, odf[f] / Math.max(1e-3, ref))) * loud
      data[f * STRIDE + OFF_BEAT] = Math.max(1, Math.round(s * 255))
    }
  }
}

/** Đổi tên file tạm thành file đích. Trên Windows không đè được file đang mở (preview đang đọc PCM) —
 * khi đó nội dung như nhau nên giữ file cũ. */
async function replaceFile(tmp: string, dest: string): Promise<void> {
  try {
    await rename(tmp, dest)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if ((code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') && existsSync(dest)) {
      await rm(tmp, { force: true })
      return
    }
    throw err
  }
}

/**
 * Giải mã một file nhạc bằng FFmpeg một lần, ra hai đầu:
 *  - mono float 48kHz qua pipe → phân tích (phổ, beat…) → file .pvmf
 *  - stereo 16-bit 48kHz → file PCM thô (.s16) để phát preview và ghép khi xuất video
 * Ghi ra file tạm rồi đổi tên để không bao giờ để lại file hỏng trong cache.
 */
export async function analyzeFile(
  inputPath: string,
  outPath: string,
  pcmPath: string,
  opts: { expectedDuration?: number; onProgress?: (p: number) => void; signal?: AbortSignal } = {}
): Promise<FeatureHeader> {
  const analyzer = new FeatureAnalyzer()
  await mkdir(dirname(outPath), { recursive: true })
  await mkdir(dirname(pcmPath), { recursive: true })
  const pcmTmp = `${pcmPath}.${process.pid}.tmp`
  const sr = String(SAMPLE_RATE)
  const run = runFfmpeg([
    '-v', 'error', '-y',
    '-i', inputPath,
    '-map', '0:a:0', '-vn', '-ac', '2', '-ar', sr, '-f', 'f32le', 'pipe:1',
    '-map', '0:a:0', '-vn', '-ac', '2', '-ar', sr, '-f', 's16le', pcmTmp
  ])
  const onAbort = (): void => run.kill()
  opts.signal?.addEventListener('abort', onAbort)
  let leftover: Buffer | null = null
  let lastReport = 0
  run.proc.stdout!.on('data', (chunk: Buffer) => {
    let buf = leftover ? Buffer.concat([leftover, chunk]) : chunk
    // Mỗi mẫu stereo = 2 kênh × 4 byte
    const usable = buf.length - (buf.length % 8)
    leftover = usable < buf.length ? Buffer.from(buf.subarray(usable)) : null
    buf = buf.subarray(0, usable)
    if (usable === 0) return
    // Copy sang vùng nhớ căn lề 4 byte trước khi đọc Float32
    const aligned = new Float32Array(usable / 4)
    new Uint8Array(aligned.buffer).set(buf)
    analyzer.pushStereo(aligned)
    if (opts.onProgress && opts.expectedDuration) {
      const p = Math.min(0.99, analyzer.samples / SAMPLE_RATE / opts.expectedDuration)
      if (p - lastReport > 0.02) {
        lastReport = p
        opts.onProgress(p)
      }
    }
  })
  try {
    await run.done
    if (analyzer.samples === 0) throw new Error(tr('Không đọc được âm thanh từ file: {file}', { file: inputPath }))
    const { header, data } = analyzer.finish()
    const tmp = `${outPath}.${process.pid}.tmp`
    await writeFile(tmp, encodeFeatures(header, data))
    await replaceFile(pcmTmp, pcmPath)
    await replaceFile(tmp, outPath)
    opts.onProgress?.(1)
    return header
  } catch (err) {
    await rm(pcmTmp, { force: true })
    throw err
  } finally {
    opts.signal?.removeEventListener('abort', onAbort)
  }
}
