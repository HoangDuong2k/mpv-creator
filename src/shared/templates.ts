// Mẫu phong cách: bộ lớp dựng sẵn (nền, cột sóng, chữ, hiệu ứng, bộ lọc…). Áp mẫu cho project
// thì thay các lớp nhưng giữ nguyên nhạc và cài đặt; người dùng lưu được phong cách đang làm thành mẫu riêng.
import { createDefaultProject, createLayer, FULL_TIMING, newId } from './defaults'
import { presetById } from './filterPresets'
import { trKey } from './i18n'
import { buildTimeline } from './timeline'
import type { ExportSettings, Layer, Project, ProjectSettings, TextProps } from './types'

/** Khung hình và chuyển bài của video gốc: video mới làm từ mẫu dùng lại (cùng một series) */
export type TemplateSettings = Pick<ProjectSettings, 'width' | 'height' | 'fps' | 'transition' | 'fadeIn' | 'fadeOut'>
/** Chất lượng xuất đi kèm mẫu (bộ mã hoá tuỳ máy nên không lưu) */
export type TemplateExport = Pick<ExportSettings, 'quality' | 'audioBitrate'>

export interface StyleTemplate {
  id: string
  name: string
  description: string
  /** Mẫu người dùng tự lưu (xoá được) */
  custom?: boolean
  createdAt?: number
  layers: Layer[]
  /** Mẫu tạo từ video: khung hình, chuyển bài, chất lượng xuất (chỉ dùng khi làm video mới từ mẫu) */
  settings?: TemplateSettings
  export?: TemplateExport
}

const filterLayer = (id: string): Layer => createLayer('filter', { ...presetById(id)!.values, preset: id, intensity: 1 })

const title = (props: Partial<TextProps>): Layer => createLayer('text', { template: '{title}', ...props }, 'Tên bài hát')
const artist = (props: Partial<TextProps>): Layer => createLayer('text', { template: '{artist}', bold: false, ...props }, 'Ca sĩ')

interface Builtin {
  id: string
  name: string
  description: string
  build: () => Layer[]
}

const BUILTINS: Builtin[] = [
  {
    id: 'default',
    name: trKey('Mặc định'),
    description: trKey('Cột sóng gradient, tên bài, hạt bụi bay, nút Đăng ký'),
    build: () => createDefaultProject().layers
  },
  {
    id: 'lofi',
    name: 'Lofi',
    description: trKey('Màu ấm nhạt kiểu phim, sóng âm mảnh, chữ viết tay'),
    build: () => [
      createLayer('background', { mode: 'gradient', color: '#2d1b3d', color2: '#c36f7a', angle: 160, dim: 0.2, beatZoom: 0.015, kenBurns: 0.05 }),
      filterLayer('lofi'),
      createLayer('particles', { style: 'dust', count: 60, opacity: 0.5, color: '#ffe8d6', beatReact: 0.3 }),
      createLayer('visualizer', { style: 'wave', colorMode: 'solid', color: '#ffe8d6', lineWidth: 3, glow: 10, y: 0.74, width: 0.56, height: 0.14, sensitivity: 0.9 }),
      title({ font: 'Dancing Script', bold: false, size: 84, y: 0.42, color: '#fff4ea', shadowBlur: 16 }),
      artist({ size: 34, y: 0.52, color: '#ffd9c2' }),
      createLayer('progress', { thickness: 4, showDot: false, y: 0.88, width: 0.5, color: '#ffe8d6', fontSize: 22 }),
      createLayer('vignette', { amount: 0.5 }),
      createLayer('cta')
    ]
  },
  {
    id: 'edm',
    name: 'EDM',
    description: trKey('Neon đối xứng, nền đập mạnh theo bass, nháy sáng theo beat'),
    build: () => [
      createLayer('background', { mode: 'gradient', color: '#0f0c29', color2: '#302b63', angle: 135, dim: 0.15, beatZoom: 0.08, shake: 6, kenBurns: 0 }),
      createLayer('particles', { style: 'stars', count: 120, beatReact: 1, color: '#c9f6ff' }),
      createLayer('visualizer', { style: 'mirror', color: '#00f0ff', color2: '#ff2bd6', glow: 40, barCount: 80, barGap: 0.5, y: 0.6, height: 0.34, sensitivity: 1.2 }),
      title({ font: 'Bungee', bold: false, size: 70, uppercase: true, y: 0.16, shadowColor: '#00f0ff', shadowBlur: 36 }),
      artist({ font: 'Oswald', size: 38, uppercase: true, y: 0.25, color: '#ff9cf0' }),
      createLayer('progress', { color: '#00f0ff', trackColor: 'rgba(255,255,255,0.18)', y: 0.9, width: 0.6 }),
      createLayer('flicker', { trigger: 'beat', color: '#ff2bd6', intensity: 0.28, blend: 'lighter' }),
      createLayer('vignette', { amount: 0.6 }),
      createLayer('cta', { accent: '#ff2b55' })
    ]
  },
  {
    id: 'ballad',
    name: 'Ballad',
    description: trKey('Vòng sóng quanh ảnh bìa, đốm sáng mờ, chữ cổ điển'),
    build: () => [
      createLayer('background', { mode: 'gradient', color: '#1f1c2c', color2: '#928dab', angle: 150, dim: 0.25, beatZoom: 0, kenBurns: 0.08 }),
      filterLayer('dreamy'),
      createLayer('particles', { style: 'bokeh', count: 30, size: 10, opacity: 0.35, beatReact: 0.2 }),
      createLayer('visualizer', { style: 'circle', y: 0.42, radius: 0.14, height: 0.14, barCount: 90, colorMode: 'solid', color: '#ffffff', opacity: 0.85, glow: 16 }),
      title({ font: 'Playfair Display', bold: false, size: 64, y: 0.77 }),
      artist({ size: 32, y: 0.84, color: '#e0dcf5' }),
      createLayer('progress', { thickness: 3, showDot: false, showTime: false, y: 0.92, width: 0.4 }),
      createLayer('vignette', { amount: 0.5 }),
      createLayer('cta')
    ]
  },
  {
    id: 'bolero',
    name: 'Bolero',
    description: trKey('Tông vàng cổ điển, nhiễu phim cũ, cột sóng ánh kim'),
    build: () => [
      createLayer('background', { mode: 'gradient', color: '#2b1608', color2: '#8a4b22', angle: 120, dim: 0.25, beatZoom: 0.01, kenBurns: 0.06 }),
      filterLayer('vintage'),
      createLayer('particles', { style: 'dust', count: 70, color: '#ffd9a0', opacity: 0.6 }),
      createLayer('visualizer', { style: 'bars', color: '#ffd27f', color2: '#ff8c42', barCount: 48, y: 0.68, height: 0.26, glow: 14 }),
      title({ font: 'Playfair Display', bold: false, size: 72, y: 0.18, color: '#ffe6b3', strokeWidth: 1, strokeColor: '#3b1f0e' }),
      artist({ font: 'Dancing Script', size: 46, y: 0.28, color: '#ffd27f' }),
      createLayer('progress', { color: '#ffd27f', trackColor: 'rgba(255,220,160,0.25)', textColor: '#ffe6b3', y: 0.86 }),
      createLayer('flicker', { trigger: 'random', intensity: 0.12, color: '#fff3d6' }),
      createLayer('vignette', { amount: 0.65, color: '#1a0d04' }),
      createLayer('cta')
    ]
  },
  {
    id: 'relax',
    name: trKey('Thư giãn'),
    description: trKey('Xanh dịu, sóng mềm ở chân khung hình, chữ mảnh'),
    build: () => [
      createLayer('background', { mode: 'gradient', color: '#0b3d4a', color2: '#5fa8a0', angle: 170, dim: 0.2, beatZoom: 0, kenBurns: 0.06 }),
      filterLayer('cool'),
      createLayer('particles', { style: 'bokeh', count: 26, size: 9, opacity: 0.3, speed: 0.6, beatReact: 0.1 }),
      createLayer('visualizer', { style: 'area', colorMode: 'solid', color: '#e8fffb', opacity: 0.55, glow: 18, y: 0.86, width: 1, height: 0.16, sensitivity: 0.9 }),
      title({ bold: false, size: 58, y: 0.44 }),
      artist({ size: 30, y: 0.52, color: '#cdeee9' }),
      createLayer('progress', { thickness: 3, showDot: false, showTime: false, y: 0.62, width: 0.3, color: '#e8fffb' }),
      createLayer('vignette', { amount: 0.4 }),
      createLayer('cta', { preset: 'subscribe' })
    ]
  },
  {
    id: 'minimal',
    name: trKey('Tối giản'),
    description: trKey('Nền đen, cột sóng trắng gọn, không hiệu ứng thừa'),
    build: () => [
      createLayer('background', { mode: 'color', color: '#111111', dim: 0, beatZoom: 0, kenBurns: 0 }),
      createLayer('visualizer', { style: 'bars', colorMode: 'solid', color: '#ffffff', barCount: 40, barGap: 0.5, y: 0.6, width: 0.5, height: 0.16, glow: 0 }),
      title({ size: 48, y: 0.76, shadowBlur: 0 }),
      artist({ size: 28, y: 0.82, color: '#a0a0a0', shadowBlur: 0 }),
      createLayer('progress', { thickness: 3, showDot: false, y: 0.9, width: 0.5, fontSize: 20 }),
      createLayer('cta', { preset: 'subscribe' })
    ]
  }
]

/** Các mẫu có sẵn (mỗi lần gọi tạo lớp mới, id mới) */
export function builtinTemplates(): StyleTemplate[] {
  return BUILTINS.map((b) => ({ id: b.id, name: b.name, description: b.description, layers: b.build() }))
}

/** Bản sao các lớp của mẫu với id mới (các đoạn chung hàng vẫn chung hàng) */
function freshLayers(layers: Layer[]): Layer[] {
  const rows = new Map<string, string>()
  return layers.map((l) => {
    const copy = structuredClone(l)
    copy.id = newId('layer')
    if (copy.row) {
      if (!rows.has(copy.row)) rows.set(copy.row, newId('row'))
      copy.row = rows.get(copy.row)
    }
    return copy
  })
}

/** Project có nền là ảnh / video / ảnh bìa của người dùng (nên giữ khi áp mẫu) */
export function hasMediaBackground(project: Project): boolean {
  return project.layers.some((l) => l.type === 'background' && l.props.mode !== 'color' && l.props.mode !== 'gradient')
}

/**
 * Áp mẫu cho project: thay toàn bộ lớp bằng lớp của mẫu, giữ nguyên nhạc và cài đặt.
 * `keepBackground`: giữ các lớp nền đang có (ảnh / video của người dùng), chỉ lấy phần còn lại của mẫu.
 */
export function applyTemplate(project: Project, template: StyleTemplate, opts: { keepBackground?: boolean } = {}): Project {
  const layers = freshLayers(template.layers)
  if (!opts.keepBackground) return { ...project, layers }
  const own = project.layers.filter((l) => l.type === 'background')
  if (own.length === 0) return { ...project, layers }
  return { ...project, layers: [...structuredClone(own), ...layers.filter((l) => l.type !== 'background')] }
}

/** Project mới theo mẫu: phong cách của mẫu, cùng khung hình / chuyển bài / chất lượng xuất nếu mẫu có lưu */
export function projectFromTemplate(template: StyleTemplate): Project {
  const base = createDefaultProject()
  const p = applyTemplate(base, template)
  const s = template.settings
  return {
    ...p,
    settings: s ? { ...base.settings, ...structuredClone(s) } : base.settings,
    export: template.export ? { ...base.export, ...template.export } : base.export
  }
}

/** Sai số (giây) khi xét một lớp có dùng suốt video hay không */
const WHOLE_SLACK = 1

/** Lớp dùng suốt video: đang bật, hiện từ đầu video tới hết video */
export function coversWholeVideo(layer: Layer, total: number): boolean {
  if (!layer.enabled) return false
  const { start, end } = layer.timing
  if (start > WHOLE_SLACK) return false
  return end === null || (total > 0 && end >= total - WHOLE_SLACK)
}

export interface TemplatePlan {
  /** Các lớp mẫu giữ lại: hiện tới hết video (tự dài theo bài của video mới), không khoá, hàng riêng */
  layers: Layer[]
  /** Các lớp bỏ qua: chỉ hiện một đoạn, hoặc đang ẩn */
  skipped: Array<{ layer: Layer; reason: 'partial' | 'hidden' }>
  /** Video gốc không có nền nào dùng suốt video: nền của mẫu lấy kiểu nền của đoạn đầu tiên */
  backgroundFromSegment: boolean
}

function wholeVideoLayer(l: Layer, timing = l.timing): Layer {
  const copy = { ...structuredClone(l), timing: { ...timing, end: null } } as Layer
  delete copy.locked
  delete copy.row
  return copy
}

/**
 * Mẫu tạo từ một video chỉ giữ những gì dùng suốt video đó (nền, cột sóng, chữ tên bài, hiệu ứng…);
 * lớp chỉ hiện một đoạn (chữ riêng một bài, nền theo từng bài, các đoạn đã tách) và lớp đang ẩn bị bỏ.
 */
export function planTemplate(project: Project): TemplatePlan {
  const total = buildTimeline(project.tracks, project.settings).total
  const layers: Layer[] = []
  const skipped: TemplatePlan['skipped'] = []
  for (const l of project.layers) {
    if (coversWholeVideo(l, total)) layers.push(wholeVideoLayer(l))
    else skipped.push({ layer: l, reason: l.enabled ? 'partial' : 'hidden' })
  }
  let backgroundFromSegment = false
  if (!layers.some((l) => l.type === 'background')) {
    // Video nào cũng cần nền: giữ cách hiển thị (làm tối, mờ, đập theo bass…) của đoạn nền đầu tiên
    const first = project.layers.find((l) => l.type === 'background' && l.enabled) ?? project.layers.find((l) => l.type === 'background')
    if (first) {
      layers.unshift({ ...wholeVideoLayer(first, { ...FULL_TIMING }), enabled: true } as Layer)
      backgroundFromSegment = true
    }
  }
  return { layers, skipped, backgroundFromSegment }
}

/** Tạo mẫu từ video đang làm (xem planTemplate). `id`: ghi đè mẫu đã có */
export function templateFromProject(project: Project, name: string, opts: { id?: string; description?: string } = {}): StyleTemplate {
  const s = project.settings
  return {
    id: opts.id ?? newId('tpl'),
    name: name.trim().slice(0, 80),
    description: opts.description ?? '',
    custom: true,
    createdAt: Date.now(),
    layers: planTemplate(project).layers,
    settings: { width: s.width, height: s.height, fps: s.fps, transition: { ...s.transition }, fadeIn: s.fadeIn, fadeOut: s.fadeOut },
    export: { quality: project.export.quality, audioBitrate: project.export.audioBitrate }
  }
}

/** Id mẫu an toàn để làm tên file */
export function isTemplateId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id)
}
