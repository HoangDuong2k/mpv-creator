// Hợp đồng IPC giữa renderer (window.api) và main process.
import type { EncoderId, Project, ProjectSettings, Track } from './types'

export type FileKind = 'audio' | 'image' | 'video' | 'project'
export type SaveKind = 'video' | 'project' | 'text'

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
  fps: number
  eta: number
  elapsed: number
}

export interface ExportResultInfo {
  outputPath: string
  seconds: number
  duration: number
  warnings: string[]
}

/** Phần dữ liệu project quyết định âm thanh (gửi kèm mỗi lần xin đoạn âm thanh) */
export interface AudioSpec {
  tracks: Array<Pick<Track, 'analysisKey' | 'duration' | 'trimStart' | 'trimEnd'>>
  transition: ProjectSettings['transition']
  fadeIn: number
  fadeOut: number
}

export interface EventMap {
  'analysis:progress': { path: string; progress: number }
  'export:progress': ExportProgressEvent
  'app:open-files': string[]
}

export interface PvmApi {
  info(): Promise<AppInfo>
  openFiles(kind: FileKind, multi: boolean): Promise<string[]>
  saveFile(kind: SaveKind, defaultName: string): Promise<string | null>
  importMedia(paths: string[]): Promise<Track[]>
  ensureAnalysis(path: string, duration: number): Promise<{ analysisKey: string; duration: number }>
  loadAnalysis(key: string): Promise<Uint8Array>
  /** Đoạn âm thanh [fromFrame, fromFrame + frames) của bản mix — PCM stereo 16-bit 48kHz */
  audioChunk(spec: AudioSpec, fromFrame: number, frames: number): Promise<Uint8Array>
  listEncoders(): Promise<EncoderOption[]>
  startExport(project: Project, range?: { start: number; duration: number }): Promise<ExportResultInfo>
  cancelExport(): Promise<void>
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
