import { describe, expect, it } from 'vitest'
import { FeatureAnalyzer } from '../src/main/audio/analyze'
import { AudioSampler, TrackFeatures } from '../src/engine/audio'
import { BAND_COUNT, FEATURE_RATE, OFF_BEAT, SAMPLE_RATE, STRIDE, bandEdgeHz, decodeFeatures, encodeFeatures } from '../src/shared/featureFormat'
import { buildTimeline } from '../src/shared/timeline'
import { track } from './helpers'

/** Tiếng kick trống 120 BPM (mỗi 0.5 giây) trên nền nhạc nhỏ */
function kickSignal(seconds: number): Float32Array {
  const n = Math.round(seconds * SAMPLE_RATE)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE
    const tm = t % 0.5
    const kick = Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-tm * 30)) * tm) * Math.exp(-tm * 9) * 0.8
    const pad = 0.05 * Math.sin(2 * Math.PI * 440 * t)
    out[i] = kick + pad
  }
  return out
}

function analyze(signal: Float32Array): TrackFeatures {
  const a = new FeatureAnalyzer()
  // Đẩy theo từng khối lẻ để thử nhánh xử lý luồng
  for (let i = 0; i < signal.length; i += 7777) a.push(signal.subarray(i, Math.min(signal.length, i + 7777)))
  const { header, data } = a.finish()
  return new TrackFeatures(header, data)
}

describe('FeatureAnalyzer', () => {
  it('số frame và thời lượng chính xác', () => {
    const f = analyze(new Float32Array(SAMPLE_RATE * 2 + 123))
    expect(f.header.samples).toBe(SAMPLE_RATE * 2 + 123)
    expect(f.frames).toBe(Math.ceil((SAMPLE_RATE * 2 + 123) / (SAMPLE_RATE / FEATURE_RATE)))
    expect(f.header.duration).toBeCloseTo(2 + 123 / SAMPLE_RATE, 9)
  })

  it('phát hiện beat 120 BPM đúng vị trí', () => {
    const f = analyze(kickSignal(10))
    const beats: number[] = []
    for (let i = 0; i < f.frames; i++) if (f.data[i * STRIDE + OFF_BEAT] > 0) beats.push(i / FEATURE_RATE)
    // Bỏ qua beat đầu tiên (chưa có frame trước để so sánh)
    const expected = Array.from({ length: 19 }, (_, k) => 0.5 * (k + 1))
    const matched = expected.filter((e) => beats.some((b) => Math.abs(b - e) < 0.06))
    expect(matched.length).toBeGreaterThanOrEqual(18)
    expect(beats.length).toBeLessThanOrEqual(21)
  })

  it('tone 1kHz rơi vào đúng dải tần', () => {
    const n = SAMPLE_RATE
    const s = new Float32Array(n)
    for (let i = 0; i < n; i++) s[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / SAMPLE_RATE)
    const f = analyze(s)
    const mid = Math.floor(f.frames / 2) * STRIDE
    let best = 0
    for (let b = 1; b < BAND_COUNT; b++) if (f.data[mid + b] > f.data[mid + best]) best = b
    expect(bandEdgeHz(best)).toBeLessThanOrEqual(1000)
    expect(bandEdgeHz(best + 1)).toBeGreaterThanOrEqual(1000)
  })

  it('ghi / đọc file .pvmf giữ nguyên dữ liệu', () => {
    const f = analyze(kickSignal(1))
    const decoded = decodeFeatures(encodeFeatures(f.header, f.data))
    expect(decoded.header).toEqual(f.header)
    expect(Buffer.from(decoded.data).equals(Buffer.from(f.data))).toBe(true)
  })
})

describe('AudioSampler', () => {
  const f = analyze(kickSignal(6))
  const tl = buildTimeline([track('a', f.header.duration)], { transition: { type: 'none', duration: 0 } })

  it('kết quả chỉ phụ thuộc thời điểm t (tua / render song song vẫn khớp)', () => {
    const s1 = new AudioSampler(tl, () => f)
    const s2 = new AudioSampler(tl, () => f)
    const out1 = new Float32Array(BAND_COUNT)
    const out2 = new Float32Array(BAND_COUNT)
    // s1 đi tuần tự, s2 nhảy thẳng tới t
    for (let t = 0; t < 3.2; t += 1 / 30) s1.bands(t, out1, 8)
    s1.bands(3.2, out1, 8)
    s2.bands(3.2, out2, 8)
    expect(Array.from(out1)).toEqual(Array.from(out2))
    expect(s1.beat(3.21)).toBe(s2.beat(3.21))
  })

  it('xung beat bật lên ngay sau beat rồi giảm dần', () => {
    const s = new AudioSampler(tl, () => f)
    const peak = s.beat(2.52, 6)
    expect(peak).toBeGreaterThan(0.3)
    expect(s.beat(2.8, 6)).toBeLessThan(peak)
  })

  it('ngoài timeline trả về 0', () => {
    const s = new AudioSampler(tl, () => f)
    expect(s.bass(100)).toBe(0)
  })
})
