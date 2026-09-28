import type { FilterProps, Project } from '../shared/types'
import type { Timeline, TimelineEntry } from '../shared/timeline'
import type { AudioSampler } from './audio'

/** Hình chữ nhật theo px của project */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface OffscreenSurface {
  canvas: CanvasImageSource
  ctx: CanvasRenderingContext2D
}

/**
 * Nguồn tài nguyên do môi trường chạy cung cấp:
 * - Preview (Chromium): HTMLImageElement, HTMLVideoElement, canvas DOM
 * - Export (Node + Skia): @napi-rs/canvas, frame video giải mã bằng FFmpeg
 */
export interface EngineAssets {
  /** Ảnh đã nạp theo đường dẫn file, null nếu chưa sẵn sàng */
  image(path: string): CanvasImageSource | null
  /** Frame video nền tại thời điểm t (giây, theo timeline) */
  video(path: string, t: number): CanvasImageSource | null
  createSurface(width: number, height: number): OffscreenSurface
  path2d(d: string): Path2D
}

export interface RenderEnv {
  ctx: CanvasRenderingContext2D
  project: Project
  timeline: Timeline
  audio: AudioSampler
  assets: EngineAssets
  cache: Map<string, unknown>
  t: number
  W: number
  H: number
  /** Hệ số quy đổi "px ở khung 1080p" sang px của project */
  S: number
  /** Tỉ lệ px thiết bị / px project (preview thu nhỏ < 1). shadowBlur không theo ma trận biến đổi nên phải nhân thêm. */
  px: number
  /** Bài đang hiển thị tại t */
  entry: TimelineEntry | null
  /** Layer đang vẽ */
  layerId: string
  /** Độ hiện của layer theo khoảng thời gian (hiện dần / ẩn dần), 0..1 — nhân vào mọi globalAlpha */
  fade: number
  /** Layer đang được chỉnh trên preview: luôn hiện (vd. nút Đăng ký ngoài lịch) để dễ canh chỉnh */
  editLayerId: string | null
  /** Khung bao của từng layer ở frame vừa vẽ (để chọn / kéo thả trên preview) */
  bounds: Map<string, Rect>
  /**
   * Bộ lọc màu đã "nướng" sẵn vào ảnh nền ở frame này (chỉ có khi đang vẽ các lớp nền nằm dưới
   * bộ lọc và chính lớp bộ lọc đó), null nếu không.
   */
  bake: FilterBake | null
}

/**
 * Bộ lọc màu chỉ tác động lên các lớp nền tĩnh (ảnh, ảnh bìa, màu, gradient): các phép chỉnh màu
 * được làm một lần trên ảnh nền rồi dùng lại mỗi frame, lớp bộ lọc chỉ còn vẽ viền tối + hạt phim.
 */
export interface FilterBake {
  /** Layer bộ lọc */
  filterId: string
  props: FilterProps
  /** Độ hiện của lớp bộ lọc ở frame này (hiện dần / ẩn dần) */
  fade: number
  /** Lớp nền lỡ vẽ nội dung chưa lọc → lớp bộ lọc quay về cách lọc từng frame */
  failed: boolean
}

/** Ghi lại khung bao (vị trí bố cục, không tính hiệu ứng nảy/rung) của layer đang vẽ */
export function recordBounds(env: RenderEnv, x: number, y: number, w: number, h: number): void {
  env.bounds.set(env.layerId, { x, y, w, h })
}

export function cached<T>(env: RenderEnv, key: string, make: () => T): T {
  if (env.cache.has(key)) return env.cache.get(key) as T
  const v = make()
  env.cache.set(key, v)
  return v
}
