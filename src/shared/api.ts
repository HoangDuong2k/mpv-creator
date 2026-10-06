// Hợp đồng IPC giữa renderer (window.api) và main process.
import type { EncoderId, Project, ProjectSettings, Track, TrackLyrics } from './types'
import type { Lang } from './i18n'
import type { StyleTemplate } from './templates'
import type { AsrWord } from './lyricsAlign'

/** 'media': ảnh hoặc video (nhập vào thư viện) */
export type FileKind = 'audio' | 'image' | 'video' | 'media' | 'project' | 'lyrics'
export type SaveKind = 'video' | 'project' | 'text' | 'lyrics'

export interface AppInfo {
  version: string
  platform: NodeJS.Platform
  fontsDir: string
  cacheDir: string
  videosDir: string
}

export interface EncoderOption {
  id: EncoderId
  label: string
  hardware: boolean
  available: boolean
}

export interface ExportProgressEvent {
  stage: 'audio' | 'render' | 'mux' | 'done'
  progress: number
  framesDone: number
  framesTotal: number
  /** Số frame lấy lại từ lần xuất dở trước (không phải render lại) */
  resumedFrames: number
  chunksDone: number
  chunksTotal: number
  fps: number
  eta: number
  elapsed: number
}

export interface ExportResultInfo {
  outputPath: string
  seconds: number
  duration: number
  warnings: string[]
  /** Số frame dùng lại từ lần xuất dở trước */
  resumedFrames: number
  totalFrames: number
}

/** Phần dữ liệu project quyết định âm thanh (gửi kèm mỗi lần xin đoạn âm thanh) */
export interface AudioSpec {
  tracks: Array<Pick<Track, 'analysisKey' | 'duration' | 'trimStart' | 'trimEnd'>>
  transition: ProjectSettings['transition']
  fadeIn: number
  fadeOut: number
}

/** AI căn lời: mô hình Nhanh (Whisper base) hoặc Chính xác (Whisper large-v3-turbo) */
export type AiModelKey = 'fast' | 'accurate'

export interface AiModelInfo {
  key: AiModelKey
  /** Dung lượng tải về */
  bytes: number
  /** Đã tải về máy */
  ready: boolean
}

/** Tiến độ AI căn lời: giải mã âm thanh → tải mô hình (byte) → nạp mô hình → nghe bài (số đoạn 30 giây) */
export interface AiProgress {
  phase: 'decode' | 'download' | 'load' | 'listen'
  done: number
  total: number
}

/** backend: bản ONNX Runtime đã chạy (chỉ có khi vừa nghe, không có khi lấy lại kết quả đã lưu) */
export type AiTranscribeResult = { words: AsrWord[]; backend?: 'native' | 'wasm' } | { cancelled: true }

export interface EventMap {
  'analysis:progress': { path: string; progress: number }
  'lyrics:ai-progress': AiProgress
  'export:progress': ExportProgressEvent
  'app:open-files': string[]
}

export interface PvmApi {
  info(): Promise<AppInfo>
  openFiles(kind: FileKind, multi: boolean): Promise<string[]>
  saveFile(kind: SaveKind, defaultName: string): Promise<string | null>
  importMedia(paths: string[]): Promise<Track[]>
  /** Lời của file nhạc: file .lrc cùng tên cạnh file nhạc, không có thì lời nhúng trong tag; null nếu không có */
  lyricsFor(audioPath: string): Promise<TrackLyrics | null>
  /** Đọc file chữ (lời bài hát .lrc / .txt) */
  readText(path: string): Promise<string>
  /** AI căn lời: các mô hình và đã tải về chưa */
  aiModels(): Promise<AiModelInfo[]>
  /** AI nghe giọng hát cả file nhạc gốc, trả về các từ kèm thời điểm (tải mô hình lần đầu; kết quả được lưu lại) */
  aiTranscribe(audioPath: string, model: AiModelKey, language: 'vi' | 'en' | null): Promise<AiTranscribeResult>
  aiCancel(): Promise<void>
  aiRemoveModel(model: AiModelKey): Promise<void>
  /** Dải khung hình của video (ảnh thu nhỏ trên timeline); null nếu không đọc được */
  thumbStrip(path: string): Promise<string | null>
  ensureAnalysis(path: string, duration: number): Promise<{ analysisKey: string; duration: number }>
  loadAnalysis(key: string): Promise<Uint8Array>
  /** Đoạn âm thanh [fromFrame, fromFrame + frames) của bản mix — PCM stereo 16-bit 48kHz */
  audioChunk(spec: AudioSpec, fromFrame: number, frames: number): Promise<Uint8Array>
  listEncoders(): Promise<EncoderOption[]>
  startExport(project: Project, range?: { start: number; duration: number }): Promise<ExportResultInfo>
  cancelExport(): Promise<void>
  /** Vừa tích "Tắt máy khi xuất xong": xin quyền tắt máy ngay (macOS); false nếu bị từ chối */
  prepareShutdown(): Promise<boolean>
  /** Tắt máy (sau khi xuất xong, người dùng đã chọn và không huỷ) */
  shutdown(): Promise<void>
  /** Ngôn ngữ giao diện → main dùng cho hộp thoại, thông báo, lỗi */
  setLanguage(lang: Lang): Promise<void>
  /** Mẫu phong cách người dùng đã lưu (mới nhất trước) */
  listTemplates(): Promise<StyleTemplate[]>
  saveTemplate(template: StyleTemplate): Promise<void>
  deleteTemplate(id: string): Promise<void>
  readProject(path: string): Promise<Project>
  writeProject(path: string, project: Project): Promise<void>
  writeText(path: string, text: string): Promise<void>
  autosave(project: Project): Promise<void>
  loadAutosave(): Promise<Project | null>
  showItem(path: string): Promise<void>
  /** Copy chữ vào clipboard của hệ điều hành */
  copyText(text: string): Promise<void>
  /** Thư mục và dung lượng cache âm thanh */
  cacheInfo(): Promise<{ dir: string; bytes: number }>
  clearCache(): Promise<void>
  openCacheDir(): Promise<void>
  initialFiles(): Promise<string[]>
  pathForFile(file: File): string
  fileUrl(path: string): string
  on<K extends keyof EventMap>(channel: K, cb: (data: EventMap[K]) => void): () => void
}
