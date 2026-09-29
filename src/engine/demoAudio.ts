// Âm thanh mẫu tổng hợp (không cần file nhạc): dữ liệu phân tích giả lập một đoạn nhạc 118 BPM,
// dùng để vẽ ảnh xem trước (cột sóng, mẫu phong cách…) trông như đang có nhạc. Tất định: lần nào cũng như nhau.
import { ANALYSIS_VERSION, BAND_COUNT, FEATURE_RATE, OFF_BASS, OFF_BEAT, OFF_RMS, OFF_WAVE, SAMPLE_RATE, STRIDE, WAVE_POINTS } from '../shared/featureFormat'
import { TrackFeatures } from './audio'

/** Khoá phân tích của bài nhạc mẫu */
export const DEMO_KEY = 'demo-audio'

const byte = (v: number): number => Math.max(0, Math.min(255, Math.round(v)))

export function createDemoFeatures(seconds = 12): TrackFeatures {
  const frames = Math.round(seconds * FEATURE_RATE)
  const data = new Uint8Array(frames * STRIDE)
  const beatEvery = 60 / 118
  for (let i = 0; i < frames; i++) {
    const t = i / FEATURE_RATE
    const inBeat = t % beatEvery
    const kick = Math.exp(-(inBeat / beatEvery) * 7)
    const base = i * STRIDE
    for (let b = 0; b < BAND_COUNT; b++) {
      const f = b / BAND_COUNT
      // Phổ nghiêng về bass + một "giai điệu" di chuyển + dao động nhẹ + cú kick
      const tilt = 0.82 - f * 0.55
      const melody = 0.28 * Math.exp(-(((f - (0.36 + 0.14 * Math.sin(t * 0.9))) / 0.07) ** 2))
      const wobble = 0.08 * Math.sin(t * 5.3 + b * 0.7) + 0.06 * Math.sin(t * 11.7 + b * 1.9)
      const punch = (f < 0.18 ? 0.35 : 0.07) * kick
      data[base + b] = byte((tilt + melody + wobble + punch) * 215)
    }
    const rms = 0.45 + 0.25 * kick + 0.08 * Math.sin(t * 1.3)
    for (let k = 0; k < WAVE_POINTS; k++) {
      const x = k / WAVE_POINTS
      const s = 0.6 * Math.sin(2 * Math.PI * (x * 3 + t * 2)) + 0.3 * Math.sin(2 * Math.PI * (x * 7 - t * 3))
      data[base + OFF_WAVE + k] = byte(128 + s * rms * 110)
    }
    data[base + OFF_RMS] = byte(rms * 255)
    data[base + OFF_BASS] = byte((0.35 + 0.6 * kick) * 255)
    // Beat ở frame đầu của mỗi phách
    data[base + OFF_BEAT] = inBeat < 1 / FEATURE_RATE ? 220 : 0
  }
  return new TrackFeatures(
    {
      version: ANALYSIS_VERSION,
      rate: FEATURE_RATE,
      frames,
      bands: BAND_COUNT,
      wave: WAVE_POINTS,
      stride: STRIDE,
      sampleRate: SAMPLE_RATE,
      samples: Math.round(seconds * SAMPLE_RATE),
      duration: seconds
    },
    data
  )
}
