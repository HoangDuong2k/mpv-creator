// Mẫu hiệu ứng và mẫu chữ trong thư viện (cột trái): mỗi mẫu là một loại lớp + thuộc tính dựng sẵn.
// Tên dịch lúc hiển thị bằng tr().
import { trKey } from './i18n'
import type { LayerPropsMap, LayerType } from './types'

export interface LayerPreset {
  id: string
  name: string
  type: LayerType
  props: Partial<LayerPropsMap[LayerType]>
}

export interface PresetGroup {
  id: string
  name: string
  items: LayerPreset[]
}

function preset<T extends LayerType>(id: string, name: string, type: T, props: Partial<LayerPropsMap[T]> = {}): LayerPreset {
  return { id, name, type, props: props as Partial<LayerPropsMap[LayerType]> }
}

export const EFFECT_GROUPS: PresetGroup[] = [
  {
    id: 'visualizer',
    name: trKey('Cột sóng nhạc'),
    items: [
      preset('viz-bars', trKey('Cột sóng'), 'visualizer', { style: 'bars' }),
      preset('viz-mirror', trKey('Cột đối xứng'), 'visualizer', { style: 'mirror', y: 0.62 }),
      preset('viz-circle', trKey('Vòng tròn quanh ảnh bìa'), 'visualizer', { style: 'circle', y: 0.5, radius: 0.16, height: 0.18, barCount: 96 }),
      preset('viz-area', trKey('Dải sóng mềm'), 'visualizer', { style: 'area', colorMode: 'solid', color: '#ffffff', opacity: 0.8, glow: 20 }),
      preset('viz-wave', trKey('Đường sóng âm'), 'visualizer', { style: 'wave', colorMode: 'solid', color: '#7cf2ff', lineWidth: 3, glow: 18 }),
      preset('viz-rainbow', trKey('Cột cầu vồng'), 'visualizer', { style: 'bars', colorMode: 'rainbow', barCount: 48 }),
      preset('viz-neon', trKey('Neon đối xứng'), 'visualizer', { style: 'mirror', color: '#ff2bd6', color2: '#00f0ff', glow: 40, barCount: 80, barGap: 0.5 })
    ]
  },
  {
    id: 'particles',
    name: trKey('Hạt bay'),
    items: [
      preset('pt-dust', trKey('Bụi / đom đóm bay lên'), 'particles', { style: 'dust' }),
      preset('pt-snow', trKey('Tuyết rơi'), 'particles', { style: 'snow', count: 140 }),
      preset('pt-bokeh', trKey('Bokeh (đốm sáng mờ)'), 'particles', { style: 'bokeh', count: 36, size: 8, opacity: 0.45 }),
      preset('pt-rain', trKey('Mưa'), 'particles', { style: 'rain', count: 220, opacity: 0.5 }),
      preset('pt-stars', trKey('Sao lấp lánh'), 'particles', { style: 'stars', count: 120 })
    ]
  },
  {
    id: 'flicker',
    name: trKey('Nháy sáng'),
    items: [
      preset('fl-beat', trKey('Nháy theo beat'), 'flicker', { trigger: 'beat' }),
      preset('fl-bass', trKey('Nháy theo bass'), 'flicker', { trigger: 'bass', intensity: 0.3 }),
      preset('fl-film', trKey('Nhiễu phim cũ'), 'flicker', { trigger: 'random', intensity: 0.18, color: '#fff3d6' }),
      preset('fl-red', trKey('Nháy đỏ mạnh (EDM)'), 'flicker', { trigger: 'beat', color: '#ff2b55', intensity: 0.35, blend: 'lighter' })
    ]
  },
  {
    id: 'overlay',
    name: trKey('Lớp phủ'),
    items: [
      preset('ov-vignette', trKey('Viền tối (vignette)'), 'vignette'),
      preset('ov-progress', trKey('Thanh tiến trình'), 'progress'),
      preset('ov-progress-thin', trKey('Thanh tiến trình mảnh'), 'progress', { thickness: 3, showDot: false, showTime: false, y: 0.95, width: 0.9 }),
      preset('ov-logo', trKey('Ảnh / Logo'), 'image')
    ]
  },
  {
    id: 'cta',
    name: trKey('Đăng ký / Like'),
    items: [
      preset('cta-combo', trKey('Đăng ký + Like + Chuông'), 'cta', { preset: 'combo' }),
      preset('cta-sub', trKey('Chỉ nút Đăng ký'), 'cta', { preset: 'subscribe' }),
      preset('cta-like', trKey('Chỉ nút Like'), 'cta', { preset: 'like' }),
      preset('cta-bell', trKey('Chỉ chuông thông báo'), 'cta', { preset: 'bell' })
    ]
  }
]

/**
 * Mẫu chữ. `template` có chữ thường (không chỉ biến {…}) được dịch khi thêm vào video,
 * để giao diện tiếng Anh thêm "Next: {next}" thay vì "Tiếp theo: {next}".
 */
export const TEXT_PRESETS: LayerPreset[] = [
  preset('txt-title', trKey('Tên bài hát (lớn)'), 'text', { template: '{title}', size: 80, y: 0.2 }),
  preset('txt-artist', trKey('Ca sĩ'), 'text', { template: '{artist}', size: 40, bold: false, y: 0.28, color: '#d0d8ff' }),
  preset('txt-now', trKey('Đang phát: tên bài — ca sĩ'), 'text', { template: '♪ {title} — {artist}', size: 36, bold: false, align: 'left', x: 0.05, y: 0.9 }),
  preset('txt-next', trKey('Bài tiếp theo'), 'text', { template: trKey('Tiếp theo: {next}'), size: 30, bold: false, align: 'right', x: 0.95, y: 0.08, opacity: 0.85 }),
  preset('txt-count', trKey('Số thứ tự bài'), 'text', { template: '{index}/{count}', size: 34, align: 'left', x: 0.05, y: 0.08 }),
  preset('txt-time', trKey('Thời gian của bài'), 'text', { template: '{elapsed} / {duration}', size: 30, bold: false, y: 0.9 }),
  preset('txt-channel', trKey('Tên kênh'), 'text', { template: trKey('Tên kênh của bạn'), font: 'Oswald', size: 44, uppercase: true, align: 'left', x: 0.05, y: 0.1 }),
  preset('txt-script', trKey('Chữ viết tay'), 'text', { template: '{title}', font: 'Pacifico', bold: false, size: 84, y: 0.22 }),
  preset('txt-serif', trKey('Chữ cổ điển'), 'text', { template: '{title}', font: 'Playfair Display', size: 76, y: 0.2 }),
  preset('txt-neon', trKey('Chữ neon'), 'text', { template: '{title}', font: 'Bungee', size: 72, shadowColor: '#ff2bd6', shadowBlur: 40, y: 0.2 }),
  preset('txt-outline', trKey('Chữ viền đậm'), 'text', { template: '{title}', size: 80, color: '#ffe066', strokeWidth: 6, strokeColor: '#000000', y: 0.2 })
]

export function findPreset(id: string): LayerPreset | undefined {
  for (const g of EFFECT_GROUPS) {
    const p = g.items.find((x) => x.id === id)
    if (p) return p
  }
  return TEXT_PRESETS.find((x) => x.id === id)
}
