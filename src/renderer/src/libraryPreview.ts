// Xem thử mục thư viện trên preview (như CapCut): bấm một mẫu hiệu ứng, bộ lọc, chữ hay ảnh / video thì preview
// hiện ngay mẫu đó trên video đang làm, nhưng project chưa đổi; bấm + (hoặc nhấp đúp) mới thêm vào video.
import { create } from 'zustand'
import { createLayer, FULL_TIMING } from '../../shared/defaults'
import { mediaKind } from '../../shared/files'
import { presetById } from '../../shared/filterPresets'
import { tr } from '../../shared/i18n'
import { findPreset, localizePresetProps } from '../../shared/presets'
import { formatTimePrecise } from '../../shared/time'
import type { BackgroundProps, Layer } from '../../shared/types'

/** Mục trong thư viện: ảnh / video đã nhập, mẫu hiệu ứng hoặc chữ, mẫu bộ lọc */
export type LibraryItem = { kind: 'media'; path: string } | { kind: 'preset'; id: string } | { kind: 'filter'; id: string }

/** Id của lớp xem thử (không có trong project) */
export const PREVIEW_LAYER_ID = 'lib-preview'

export interface LibraryPreview {
  item: LibraryItem
  /** Thời điểm bắt đầu xem thử (nút Đăng ký hiện từ lúc này) */
  at: number
}

export const useLibPreview = create<{ preview: LibraryPreview | null; set(p: LibraryPreview | null): void }>((set) => ({
  preview: null,
  set: (preview) => set({ preview })
}))

export function sameItem(a: LibraryItem | null | undefined, b: LibraryItem | null | undefined): boolean {
  if (!a || !b || a.kind !== b.kind) return false
  return a.kind === 'media' ? a.path === (b as { path: string }).path : a.id === (b as { id: string }).id
}

/** Bấm một mục: bắt đầu xem thử; bấm lại đúng mục đang xem thử thì thôi */
export function toggleLibraryPreview(item: LibraryItem, at: number): void {
  const st = useLibPreview.getState()
  st.set(sameItem(st.preview?.item, item) ? null : { item, at })
}

export function clearLibraryPreview(): void {
  if (useLibPreview.getState().preview) useLibPreview.getState().set(null)
}

/**
 * Các lớp để vẽ preview khi đang xem thử: giống hệt khi bấm + (addLibraryItem) nhưng không ghi vào project.
 * Trả về `editLayerId`: lớp cần "ghim" hiện khi đang dừng (nút Đăng ký ngoài lịch, chữ mẫu khi chưa có nhạc).
 */
export function layersWithPreview(layers: Layer[], preview: LibraryPreview, selectedLayerId: string | null): { layers: Layer[]; editLayerId: string | null } {
  const { item, at } = preview
  const aboveBackground = (): number => layers.findLastIndex((l) => l.type === 'background') + 1
  if (item.kind === 'media') {
    const kind = mediaKind(item.path)
    if (kind !== 'image' && kind !== 'video') return { layers, editLayerId: null }
    // Như "Đặt làm nền cho cả video": thay ảnh của lớp nền phủ cả video, chưa có thì thêm lớp nền dưới cùng
    const main = layers.find((l) => l.type === 'background' && l.timing.start <= 0 && l.timing.end === null)
    if (main) return { layers: layers.map((l) => (l === main ? ({ ...l, props: { ...l.props, mode: kind, src: item.path } } as Layer) : l)), editLayerId: null }
    const base = layers.find((l) => l.type === 'background')?.props as BackgroundProps | undefined
    const bg = { ...createLayer('background', { ...(base ?? {}), mode: kind, src: item.path }), id: PREVIEW_LAYER_ID } as Layer
    return { layers: [bg, ...layers], editLayerId: null }
  }
  if (item.kind === 'filter') {
    const p = presetById(item.id)
    if (!p) return { layers, editLayerId: null }
    // Đang chọn một lớp bộ lọc: xem thử mẫu mới trên chính lớp đó (như khi bấm + sẽ đổi mẫu của lớp đó)
    const sel = layers.find((l) => l.id === selectedLayerId)
    if (sel?.type === 'filter' && !sel.locked) {
      return { layers: layers.map((l) => (l === sel ? ({ ...l, props: { ...l.props, ...p.values, preset: p.id } } as Layer) : l)), editLayerId: sel.id }
    }
    const layer = { ...createLayer('filter', { ...p.values, preset: p.id, intensity: 1 }), id: PREVIEW_LAYER_ID, timing: { ...FULL_TIMING } } as Layer
    const i = aboveBackground()
    return { layers: [...layers.slice(0, i), layer, ...layers.slice(i)], editLayerId: PREVIEW_LAYER_ID }
  }
  const preset = findPreset(item.id)
  if (!preset) return { layers, editLayerId: null }
  const props = localizePresetProps(preset.type, structuredClone(preset.props) as Record<string, unknown>, tr)
  // Nút Đăng ký: hiện ngay từ lúc bấm xem thử (không đợi tới lịch hiện)
  if (preset.type === 'cta') Object.assign(props, { schedule: 'times', times: formatTimePrecise(Math.max(0, at), at >= 3600) })
  const layer = { ...createLayer(preset.type, props, preset.type === 'text' ? preset.name : undefined), id: PREVIEW_LAYER_ID, timing: { ...FULL_TIMING } } as Layer
  if (layer.type === 'background') return { layers: [layer, ...layers], editLayerId: PREVIEW_LAYER_ID }
  if (layer.type === 'filter') {
    const i = aboveBackground()
    return { layers: [...layers.slice(0, i), layer, ...layers.slice(i)], editLayerId: PREVIEW_LAYER_ID }
  }
  return { layers: [...layers, layer], editLayerId: PREVIEW_LAYER_ID }
}
