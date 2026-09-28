// Các mẫu bộ lọc màu (kiểu Instagram / CapCut). Mỗi mẫu là một bộ giá trị chỉnh màu,
// chọn mẫu xong vẫn tinh chỉnh tay được.
import type { FilterProps } from './types'

export type FilterValues = Omit<FilterProps, 'preset' | 'intensity'>

export const NEUTRAL_FILTER: FilterValues = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  hue: 0,
  sepia: 0,
  fade: 0,
  grain: 0,
  vignette: 0,
  blur: 0
}

export const FILTER_KEYS = Object.keys(NEUTRAL_FILTER) as Array<keyof FilterValues>

export interface FilterPreset {
  id: string
  name: string
  values: FilterValues
}

const preset = (id: string, name: string, v: Partial<FilterValues>): FilterPreset => ({ id, name, values: { ...NEUTRAL_FILTER, ...v } })

export const FILTER_PRESETS: FilterPreset[] = [
  preset('none', 'Gốc', {}),
  preset('warm', 'Ấm áp', { temperature: 0.45, saturation: 0.1, contrast: 0.05, brightness: 0.03 }),
  preset('cool', 'Lạnh', { temperature: -0.45, tint: 0.05, saturation: -0.05, contrast: 0.05 }),
  preset('vivid', 'Rực rỡ', { saturation: 0.45, contrast: 0.15, brightness: 0.02 }),
  preset('vintage', 'Cổ điển', { sepia: 0.35, contrast: -0.08, saturation: -0.2, fade: 0.25, temperature: 0.2, vignette: 0.4, grain: 0.25 }),
  preset('bw', 'Đen trắng', { saturation: -1, contrast: 0.15 }),
  preset('film', 'Phim cũ', { sepia: 0.25, fade: 0.35, grain: 0.45, vignette: 0.5, contrast: -0.1, saturation: -0.35 }),
  preset('lofi', 'Lofi chill', { temperature: 0.15, tint: 0.12, saturation: -0.15, fade: 0.3, contrast: -0.12, grain: 0.2, vignette: 0.3 }),
  preset('sunset', 'Hoàng hôn', { temperature: 0.6, tint: 0.15, saturation: 0.2, contrast: 0.08, vignette: 0.25 }),
  preset('dreamy', 'Mơ màng', { brightness: 0.08, contrast: -0.15, saturation: -0.1, fade: 0.2, blur: 3, tint: 0.08 }),
  preset('neon', 'Neon đêm', { contrast: 0.25, saturation: 0.5, temperature: -0.35, tint: 0.35, vignette: 0.35 }),
  preset('pastel', 'Nhạt màu', { saturation: -0.35, contrast: -0.2, fade: 0.35, brightness: 0.05 }),
  preset('moody', 'Tối & sâu', { brightness: -0.12, contrast: 0.25, saturation: -0.2, temperature: -0.1, vignette: 0.5 })
]

export function presetById(id: string): FilterPreset | undefined {
  return FILTER_PRESETS.find((p) => p.id === id)
}

/** Bộ lọc không làm gì (bỏ qua để không tốn thời gian render) */
export function isNeutralFilter(p: FilterValues): boolean {
  return FILTER_KEYS.every((k) => Math.abs(p[k]) < 1e-4)
}

/** Chuỗi CSS filter cho phần chỉnh màu cơ bản — preview (Chromium) và export (Skia) cho kết quả như nhau */
export function cssFilterOf(p: FilterValues, blurPx: number): string {
  const parts: string[] = []
  if (p.brightness) parts.push(`brightness(${round(1 + p.brightness)})`)
  if (p.contrast) parts.push(`contrast(${round(1 + p.contrast)})`)
  if (p.saturation) parts.push(`saturate(${round(Math.max(0, 1 + p.saturation))})`)
  if (p.hue) parts.push(`hue-rotate(${round(p.hue)}deg)`)
  if (p.sepia) parts.push(`sepia(${round(Math.min(1, Math.max(0, p.sepia)))})`)
  if (blurPx > 0.05) parts.push(`blur(${round(blurPx)}px)`)
  return parts.length ? parts.join(' ') : 'none'
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000
}
