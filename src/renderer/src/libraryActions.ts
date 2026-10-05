// Thư viện (cột trái): bấm một mục để xem thử trên preview, bấm + để thêm vào cả video, hoặc kéo vào timeline
// để đặt đúng chỗ (như CapCut).
import type { DragEvent } from 'react'
import { presetById } from '../../shared/filterPresets'
import { mediaKind } from '../../shared/files'
import { tr } from '../../shared/i18n'
import { findPreset } from '../../shared/presets'
import { buildTimeline } from '../../shared/timeline'
import { formatTimePrecise } from '../../shared/time'
import { clearLibraryPreview, type LibraryItem } from './libraryPreview'
import { useStore } from './store'
import { dropFiles } from './timelineActions'

/** Kiểu dữ liệu kéo thả của mục thư viện (khác file kéo từ ngoài vào) */
export const LIB_MIME = 'application/x-pvm-library'

export type { LibraryItem }

/** Mục đang kéo — lúc kéo ngang qua timeline chưa đọc được dữ liệu kéo thả, chỉ biết kiểu */
let dragging: LibraryItem | null = null

export function startLibraryDrag(e: DragEvent, item: LibraryItem): void {
  dragging = item
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData(LIB_MIME, JSON.stringify(item))
}

export function endLibraryDrag(): void {
  dragging = null
}

/** Mục thư viện đang được kéo qua / thả xuống (null: đang kéo thứ khác) */
export function libraryItemOf(e: DragEvent): LibraryItem | null {
  if (!e.dataTransfer.types.includes(LIB_MIME)) return null
  if (dragging) return dragging
  try {
    return JSON.parse(e.dataTransfer.getData(LIB_MIME)) as LibraryItem
  } catch {
    return null
  }
}

/** Tên hiển thị của mục */
export function itemName(item: LibraryItem): string {
  if (item.kind === 'media') return (item.path.split(/[\\/]/).pop() ?? item.path).replace(/\.[^.]+$/, '')
  const name = item.kind === 'filter' ? presetById(item.id)?.name : findPreset(item.id)?.name
  return name ? tr(name) : item.id
}

const hasTracks = (): boolean => useStore.getState().project.tracks.length > 0
const withHours = (): boolean => {
  const { project } = useStore.getState()
  return buildTimeline(project.tracks, project.settings).total >= 3600
}

/** Chữ gợi ý cạnh vạch thả khi kéo mục thư viện qua timeline */
export function libraryDropTip(item: LibraryItem, t: number, targetLayerId: string | null): string {
  const target = useStore.getState().project.layers.find((l) => l.id === targetLayerId)
  const name = itemName(item)
  const time = formatTimePrecise(t, withHours())
  if (item.kind === 'media') {
    if (target?.type === 'background') return tr('Thả để thay ảnh / video của lớp "{name}"', { name: tr(target.name) })
    return tr('Thêm {n} nền từ {time}', { n: 1, time })
  }
  if (item.kind === 'filter' && target?.type === 'filter' && !target.locked) return tr('Đổi bộ lọc của lớp "{layer}" thành "{name}"', { layer: tr(target.name), name })
  if (item.kind === 'preset' && findPreset(item.id)?.type === 'cta') return tr('Thêm "{name}" hiện lúc {time}', { name, time })
  return hasTracks() ? tr('Thêm "{name}" từ {time} đến hết bài', { name, time }) : tr('Thêm "{name}" cho cả video', { name })
}

/** Thả mục thư viện vào timeline tại `at` (thả trúng hàng của một lớp: `targetLayerId`) */
export function dropLibraryItem(item: LibraryItem, at: number, targetLayerId: string | null): void {
  const st = useStore.getState()
  clearLibraryPreview()
  if (item.kind === 'media') {
    void dropFiles([item.path], at, targetLayerId)
    return
  }
  const name = itemName(item)
  const time = formatTimePrecise(Math.max(0, at), withHours())
  if (item.kind === 'filter') {
    const target = st.project.layers.find((l) => l.id === targetLayerId)
    if (target?.type === 'filter' && !target.locked) {
      applyFilterPreset(target.id, item.id)
      return
    }
    if (st.addFilterLayer(item.id, at)) st.toast('info', hasTracks() ? tr('Đã thêm "{name}" từ {time}', { name, time }) : tr('Đã thêm "{name}"', { name }))
    return
  }
  const preset = findPreset(item.id)
  if (!preset) return
  st.addPresetLayer(preset, at)
  if (preset.type === 'cta') st.toast('info', tr('Đã thêm "{name}" hiện lúc {time}', { name, time }))
  else st.toast('info', hasTracks() ? tr('Đã thêm "{name}" từ {time}', { name, time }) : tr('Đã thêm "{name}"', { name }))
}

/** Đổi mẫu của một lớp bộ lọc */
export function applyFilterPreset(layerId: string, presetId: string): void {
  const st = useStore.getState()
  const p = presetById(presetId)
  if (!p) return
  st.setLayerProps(layerId, { ...p.values, preset: p.id })
  st.selectLayer(layerId)
  st.toast('info', tr('Đã đổi bộ lọc thành "{name}"', { name: tr(p.name) }))
}

/**
 * Bấm + của một mục thư viện: hiệu ứng / chữ → thêm cho cả video; bộ lọc → đổi mẫu của lớp bộ lọc đang chọn,
 * chưa chọn lớp bộ lọc thì thêm mới; ảnh / video → đặt làm nền cho cả video.
 */
export function addLibraryItem(item: LibraryItem): void {
  const st = useStore.getState()
  clearLibraryPreview()
  if (item.kind === 'media') {
    const kind = mediaKind(item.path)
    if (kind !== 'image' && kind !== 'video') return
    st.setMainBackground({ path: item.path, kind })
    st.toast('info', kind === 'image' ? tr('Đã đặt ảnh nền: {file}', { file: itemName(item) }) : tr('Đã đặt video nền: {file}', { file: itemName(item) }))
    return
  }
  if (item.kind === 'filter') {
    const sel = st.project.layers.find((l) => l.id === st.selectedLayerId)
    if (sel?.type === 'filter' && !sel.locked) applyFilterPreset(sel.id, item.id)
    else if (st.addFilterLayer(item.id)) st.toast('info', tr('Đã thêm "{name}"', { name: itemName(item) }))
    return
  }
  const preset = findPreset(item.id)
  if (!preset) return
  st.addPresetLayer(preset)
  st.toast('info', tr('Đã thêm "{name}"', { name: itemName(item) }))
}

/** Thêm ảnh làm lớp Ảnh / Logo (góc trên bên phải) */
export function addImageLayer(path: string): void {
  const st = useStore.getState()
  st.addPresetLayer({ id: 'media-image', name: 'Ảnh / Logo', type: 'image', props: { source: 'file', src: path } })
  st.toast('info', tr('Đã thêm "{name}"', { name: itemName({ kind: 'media', path }) }))
}
