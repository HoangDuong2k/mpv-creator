/** Tin nhắn giữa tiến trình chính và tiến trình nhận dạng giọng hát (asrWorker) */
import type { AsrWord } from '../../shared/lyricsAlign'

export interface AsrJob {
  /** Mô hình trên Hugging Face, vd. onnx-community/whisper-base_timestamped */
  model: string
  dtype: string
  /** Thư mục lưu mô hình đã tải */
  cacheDir: string
  /** Âm thanh mono 16 kHz của cả file nhạc gốc */
  audio: Float32Array
  /** 'vi' / 'en'; null = để Whisper tự nhận */
  language: string | null
  /** Thư mục chứa file .wasm của ONNX Runtime Web (máy không có bản native) */
  wasmDir: string
  /** Bắt dùng bản WebAssembly (kiểm thử) */
  forceWasm: boolean
}

export type AsrWorkerMessage =
  | { type: 'progress'; phase: 'download' | 'load' | 'listen'; done: number; total: number }
  | { type: 'result'; words: AsrWord[]; backend: 'native' | 'wasm' }
  | { type: 'error'; message: string }
