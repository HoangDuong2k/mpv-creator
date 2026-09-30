import {
  BAND_COUNT,
  FEATURE_RATE,
  OFF_BAL,
  OFF_BASS,
  OFF_BEAT,
  OFF_RMS,
  OFF_WAVE,
  WAVE_POINTS,
  decodeFeatures,
  type FeatureHeader
} from '../shared/featureFormat'
import { activeEntries, entryWeight, type Timeline } from '../shared/timeline'

export class TrackFeatures {
  constructor(
    readonly header: FeatureHeader,
    readonly data: Uint8Array
  ) {}

  static parse(buf: Uint8Array): TrackFeatures {
    const { header, data } = decodeFeatures(buf)
    return new TrackFeatures(header, data)
  }

  get frames(): number {
    return this.header.frames
  }
}

interface RawFrame {
  bands: Float32Array
  wave: Float32Array
  rms: number
  bass: number
  beat: number
  /** Cân bằng trái / phải 0..1 (0,5 = giữa) */
  bal: number
}

const DT = 1 / FEATURE_RATE
const MAX_LOOKBACK = 90

/**
 * Lấy mẫu dữ liệu âm thanh đã phân tích theo thời gian của bản mix tổng.
 * Mọi hiệu ứng làm mượt đều tính bằng cách nhìn ngược lại các frame trước
 * (không giữ trạng thái), nên kết quả chỉ phụ thuộc vào t: preview, tua và
 * render song song nhiều đoạn đều cho cùng một hình.
 */
export class AudioSampler {
  private cache = new Map<number, RawFrame>()
  private readonly empty: RawFrame = {
    bands: new Float32Array(BAND_COUNT),
    wave: new Float32Array(WAVE_POINTS),
    rms: 0,
    bass: 0,
    beat: 0,
    bal: 0.5
  }

  constructor(
    readonly timeline: Timeline,
    private readonly lookup: (analysisKey: string) => TrackFeatures | undefined
  ) {}

  /** Chỉ số frame phân tích (60Hz) toàn cục tại thời điểm t */
  static gridIndex(t: number): number {
    return Math.floor(t * FEATURE_RATE + 1e-6)
  }

  private raw(g: number): RawFrame {
    if (g < 0) return this.empty
    const hit = this.cache.get(g)
    if (hit) return hit
    const t = g * DT
    const entries = activeEntries(this.timeline, t)
    let frame = this.empty
    if (entries.length > 0) {
      frame = { bands: new Float32Array(BAND_COUNT), wave: new Float32Array(WAVE_POINTS), rms: 0, bass: 0, beat: 0, bal: 0.5 }
      let balSum = 0
      let wSum = 0
      for (const e of entries) {
        const key = e.track.analysisKey
        const f = key ? this.lookup(key) : undefined
        if (!f) continue
        const w = entryWeight(e, t)
        if (w <= 0) continue
        const local = Math.round((t - e.start + (e.track.trimStart || 0)) * FEATURE_RATE)
        if (local < 0 || local >= f.frames) continue
        const base = local * f.header.stride
        const d = f.data
        for (let b = 0; b < BAND_COUNT; b++) frame.bands[b] += (w * d[base + b]) / 255
        for (let i = 0; i < WAVE_POINTS; i++) frame.wave[i] += (w * (d[base + OFF_WAVE + i] - 128)) / 127
        frame.rms += (w * d[base + OFF_RMS]) / 255
        frame.bass += (w * d[base + OFF_BASS]) / 255
        frame.beat = Math.max(frame.beat, (w * d[base + OFF_BEAT]) / 255)
        // Bản phân tích cũ không có cân bằng (0): coi là giữa
        balSum += w * (d[base + OFF_BAL] === 0 ? 0.5 : d[base + OFF_BAL] / 255)
        wSum += w
      }
      if (wSum > 0) frame.bal = balSum / wSum
    }
    if (this.cache.size > 512) this.cache.clear()
    this.cache.set(g, frame)
    return frame
  }

  /** Hệ số suy giảm mỗi frame phân tích, từ tốc độ rơi (đơn vị: 1/giây) */
  private static decayPerFrame(falloff: number): number {
    return Math.exp(-Math.max(0.1, falloff) * DT)
  }

  private static lookbackFrames(decay: number): number {
    // Nhìn lại đến khi hệ số còn < 2%
    return Math.min(MAX_LOOKBACK, Math.ceil(Math.log(0.02) / Math.log(Math.min(0.999, decay))))
  }

  /** Phổ 64 dải đã làm mượt kiểu "đỉnh rơi dần": out[b] = max_k raw[t-k][b] * decay^k */
  bands(t: number, out: Float32Array, falloff: number): Float32Array {
    const g = AudioSampler.gridIndex(t)
    const decay = AudioSampler.decayPerFrame(falloff)
    const n = AudioSampler.lookbackFrames(decay)
    out.fill(0)
    let k_ = 1
    for (let k = 0; k <= n; k++) {
      const r = this.raw(g - k)
      if (r === this.empty) {
        k_ *= decay
        continue
      }
      for (let b = 0; b < BAND_COUNT; b++) {
        const v = r.bands[b] * k_
        if (v > out[b]) out[b] = v
      }
      k_ *= decay
    }
    return out
  }

  private envelope(t: number, falloff: number, pick: (r: RawFrame) => number): number {
    const g = AudioSampler.gridIndex(t)
    const decay = AudioSampler.decayPerFrame(falloff)
    const n = AudioSampler.lookbackFrames(decay)
    let best = 0
    let k_ = 1
    for (let k = 0; k <= n; k++) {
      const v = pick(this.raw(g - k)) * k_
      if (v > best) best = v
      k_ *= decay
    }
    return best
  }

  /** Mức bass 0..1 (đã làm mượt) */
  bass(t: number, falloff = 8): number {
    return this.envelope(t, falloff, (r) => r.bass)
  }

  /** Âm lượng tổng 0..1 (đã làm mượt) */
  level(t: number, falloff = 8): number {
    return this.envelope(t, falloff, (r) => r.rms)
  }

  /** Xung beat 0..1: bật lên tại beat rồi tắt dần với tốc độ decay (1/giây) */
  beat(t: number, decay = 6): number {
    return this.envelope(t, decay, (r) => r.beat)
  }

  /** Dạng sóng 128 điểm (-1..1) tại t */
  wave(t: number): Float32Array {
    return this.raw(AudioSampler.gridIndex(t)).wave
  }

  /**
   * Mức âm lượng hai kênh trái / phải 0..1 cho đồng hồ VU: trung bình trong `window` giây gần nhất
   * (kim VU thật lên xuống trong khoảng 0,3 giây), lệch theo cân bằng trái / phải của bài.
   * Mức lưu theo thang dB chuẩn hoá 40 dB nên lệch kênh cộng theo dB.
   */
  stereo(t: number, window = 0.3): { left: number; right: number } {
    const g = AudioSampler.gridIndex(t)
    const n = Math.max(1, Math.round(window * FEATURE_RATE))
    let rms = 0
    let bal = 0
    for (let k = 0; k < n; k++) {
      const r = this.raw(g - k)
      rms += r.rms
      bal += r.bal
    }
    rms /= n
    bal /= n
    const db = (v: number): number => (20 * Math.log10(Math.max(1e-3, v))) / 40
    return { left: Math.max(0, Math.min(1, rms + db(2 * (1 - bal)))), right: Math.max(0, Math.min(1, rms + db(2 * bal))) }
  }

  /** Dữ liệu phân tích của một bài (thanh tiến trình dạng sóng âm vẽ từ cả bài) */
  features(analysisKey: string | undefined): TrackFeatures | undefined {
    return analysisKey ? this.lookup(analysisKey) : undefined
  }
}
