// Mô hình dữ liệu dùng chung cho main process, renderer và engine render.
// Mọi kích thước "px" trong props được tính theo khung chuẩn cao 1080px và
// được engine nhân tỉ lệ theo chiều cao thật của video.

export type TransitionType = 'none' | 'gap' | 'crossfade'

export interface Track {
  id: string
  path: string
  title: string
  artist: string
  album: string
  /** Thời lượng (giây). Chính xác sau khi phân tích âm thanh xong. */
  duration: number
  coverPath?: string
  /** Khóa cache của dữ liệu phân tích (FFT, beat...) */
  analysisKey?: string
  trimStart: number
  trimEnd: number
}

export interface ProjectSettings {
  width: number
  height: number
  fps: number
  transition: { type: TransitionType; duration: number }
  fadeIn: number
  fadeOut: number
}

export type Anchor =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

export interface BackgroundProps {
  mode: 'color' | 'gradient' | 'image' | 'video' | 'cover'
  color: string
  color2: string
  angle: number
  src: string
  blur: number
  dim: number
  /** Độ "đập" (phóng to) theo bass, 0..0.2 */
  beatZoom: number
  /** Độ rung theo beat (px) */
  shake: number
  /** Zoom chậm liên tục (Ken Burns), 0..0.2 */
  kenBurns: number
}

export type VisualizerStyle = 'bars' | 'mirror' | 'wave' | 'area' | 'circle'

export interface VisualizerProps {
  style: VisualizerStyle
  x: number
  y: number
  width: number
  height: number
  radius: number
  barCount: number
  barGap: number
  rounded: boolean
  colorMode: 'solid' | 'gradient' | 'rainbow'
  color: string
  color2: string
  glow: number
  lineWidth: number
  sensitivity: number
  smoothing: number
  minFreq: number
  maxFreq: number
  opacity: number
  symmetric: boolean
  /** Cột mọc xuống dưới (đặt visualizer ở mép trên khung hình) */
  flip: boolean
  centerImage: 'none' | 'cover' | 'custom'
  centerSrc: string
  centerBeat: number
  rotateSpeed: number
}

export interface ProgressProps {
  scope: 'track' | 'playlist'
  x: number
  y: number
  width: number
  thickness: number
  color: string
  trackColor: string
  showDot: boolean
  showTime: boolean
  fontSize: number
  textColor: string
}

export interface TextProps {
  template: string
  font: string
  bold: boolean
  size: number
  color: string
  strokeColor: string
  strokeWidth: number
  shadowColor: string
  shadowBlur: number
  align: 'left' | 'center' | 'right'
  x: number
  y: number
  maxWidth: number
  uppercase: boolean
  animation: 'none' | 'fade' | 'slide' | 'typewriter'
  opacity: number
  beatScale: number
}

export interface ImageProps {
  source: 'file' | 'cover'
  src: string
  x: number
  y: number
  width: number
  opacity: number
  circle: boolean
  rotateSpeed: number
  beatScale: number
  borderColor: string
  borderWidth: number
}

export type CtaPreset = 'subscribe' | 'like' | 'bell' | 'combo' | 'image'

export interface CtaProps {
  preset: CtaPreset
  lang: 'vi' | 'en'
  src: string
  /** 'free': đặt tự do theo x, y (tâm khối nút) — dùng khi kéo thả trên preview */
  anchor: Anchor | 'free'
  x: number
  y: number
  margin: number
  scale: number
  accent: string
  textColor: string
  buttonColor: string
  iconColor: string
  activeColor: string
  /** Chữ trên nút; để trống = mặc định theo ngôn ngữ */
  labelSub: string
  labelDone: string
  schedule: 'interval' | 'trackStart' | 'times'
  firstAt: number
  every: number
  offset: number
  times: string
  duration: number
}

export interface FlickerProps {
  trigger: 'beat' | 'bass' | 'random'
  intensity: number
  color: string
  decay: number
  blend: 'normal' | 'screen' | 'lighter'
}

export interface ParticlesProps {
  style: 'dust' | 'snow' | 'bokeh' | 'rain' | 'stars'
  /** Vùng có hạt (tâm và kích thước, tỉ lệ theo khung hình) */
  x: number
  y: number
  width: number
  height: number
  count: number
  size: number
  speed: number
  color: string
  opacity: number
  beatReact: number
  seed: number
}

export interface VignetteProps {
  amount: number
  size: number
  color: string
}

/** Bộ lọc màu: tác động lên mọi lớp nằm dưới nó (đặt ngay trên Nền = chỉ lọc ảnh nền) */
export interface FilterProps {
  /** Mẫu đang dùng ('custom' = đã chỉnh tay) */
  preset: string
  /** Mức áp dụng 0..1 (trộn giữa ảnh gốc và ảnh đã lọc) */
  intensity: number
  /** Các chỉnh −1..1 (0 = giữ nguyên) */
  brightness: number
  contrast: number
  saturation: number
  /** Âm = lạnh (xanh), dương = ấm (cam) */
  temperature: number
  /** Âm = ngả xanh lá, dương = ngả hồng tím */
  tint: number
  /** Xoay màu (độ) */
  hue: number
  /** 0..1 */
  sepia: number
  /** Nâng vùng tối, kiểu ảnh phim nhạt màu (0..1) */
  fade: number
  /** Hạt phim (0..1) */
  grain: number
  /** Viền tối (0..1) */
  vignette: number
  /** Làm mờ mơ màng (px ở khung 1080p) */
  blur: number
}

export interface LayerPropsMap {
  background: BackgroundProps
  visualizer: VisualizerProps
  progress: ProgressProps
  text: TextProps
  image: ImageProps
  cta: CtaProps
  flicker: FlickerProps
  particles: ParticlesProps
  vignette: VignetteProps
  filter: FilterProps
}

export type LayerType = keyof LayerPropsMap

/** Khoảng thời gian một layer hiện trong video */
export interface LayerTiming {
  /** Giây bắt đầu hiện */
  start: number
  /** Giây kết thúc; null = đến hết video (tự dài ra khi thêm bài) */
  end: number | null
  /** Hiện dần trong N giây đầu */
  fadeIn: number
  /** Ẩn dần trong N giây cuối */
  fadeOut: number
}

export type Layer<T extends LayerType = LayerType> = T extends LayerType
  ? { id: string; type: T; name: string; enabled: boolean; timing: LayerTiming; props: LayerPropsMap[T] }
  : never

export type EncoderId = 'libx264' | 'h264_nvenc' | 'h264_qsv' | 'h264_amf' | 'h264_vaapi'

export interface ExportSettings {
  encoder: EncoderId
  quality: 'fast' | 'balanced' | 'high'
  audioBitrate: number
  outputPath: string
}

export interface Project {
  version: 1
  name: string
  settings: ProjectSettings
  tracks: Track[]
  layers: Layer[]
  export: ExportSettings
}
