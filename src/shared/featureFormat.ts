// Định dạng file dữ liệu phân tích âm thanh của một bài (.pvmf):
//   "PVMF" | uint32 LE độ dài header | header JSON (UTF-8) | dữ liệu frame
// Mỗi frame (60 frame/giây) gồm STRIDE byte:
//   [0..63]    năng lượng 64 dải tần (log, 0..255)
//   [64..191]  dạng sóng 128 điểm (int8 + 128)
//   [192]      RMS, [193] bass, [194] độ mạnh beat (0 = không có beat)
//   [195]      cân bằng trái/phải: 1..255 = phải / (trái + phải), 128 ≈ giữa; 0 = chưa có (bản phân tích cũ)
import { tr } from './i18n'

export const FEATURE_RATE = 60
export const SAMPLE_RATE = 48000
export const FFT_SIZE = 2048
export const BAND_COUNT = 64
export const WAVE_POINTS = 128
export const BAND_MIN_HZ = 30
export const BAND_MAX_HZ = 16000
export const OFF_WAVE = BAND_COUNT
export const OFF_RMS = OFF_WAVE + WAVE_POINTS
export const OFF_BASS = OFF_RMS + 1
export const OFF_BEAT = OFF_RMS + 2
export const OFF_BAL = OFF_RMS + 3
export const STRIDE = OFF_RMS + 4
// v2: cache có thêm file PCM stereo (.s16) cạnh file phân tích
export const ANALYSIS_VERSION = 2

export interface FeatureHeader {
  version: number
  rate: number
  frames: number
  bands: number
  wave: number
  stride: number
  sampleRate: number
  /** Số mẫu (mỗi kênh) đã giải mã — dùng để biết thời lượng chính xác */
  samples: number
  duration: number
}

const MAGIC = [0x50, 0x56, 0x4d, 0x46] // "PVMF"

export function encodeFeatures(header: FeatureHeader, data: Uint8Array): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(header))
  const out = new Uint8Array(8 + json.length + data.length)
  out.set(MAGIC, 0)
  new DataView(out.buffer).setUint32(4, json.length, true)
  out.set(json, 8)
  out.set(data, 8 + json.length)
  return out
}

export function decodeFeatures(buf: Uint8Array): { header: FeatureHeader; data: Uint8Array } {
  if (buf.length < 8 || MAGIC.some((m, i) => buf[i] !== m)) throw new Error(tr('File phân tích âm thanh không hợp lệ'))
  const len = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(4, true)
  const header = JSON.parse(new TextDecoder().decode(buf.subarray(8, 8 + len))) as FeatureHeader
  const data = buf.subarray(8 + len)
  if (data.length < header.frames * header.stride) throw new Error(tr('File phân tích âm thanh bị thiếu dữ liệu'))
  return { header, data }
}

const LOG_RANGE = Math.log(BAND_MAX_HZ / BAND_MIN_HZ)

/** Tần số biên dưới của dải thứ b (b = 0..BAND_COUNT) */
export function bandEdgeHz(b: number): number {
  return BAND_MIN_HZ * Math.exp((LOG_RANGE * b) / BAND_COUNT)
}

/** Vị trí (có phần lẻ) của tần số f trên trục dải tần, tính theo tâm các dải. */
export function freqToBandPos(f: number): number {
  const clamped = Math.min(BAND_MAX_HZ, Math.max(BAND_MIN_HZ, f))
  return (BAND_COUNT * Math.log(clamped / BAND_MIN_HZ)) / LOG_RANGE - 0.5
}
