// Nội dung menu chuột phải trên timeline / danh sách lớp (kiểu CapCut).
// Nhấp phải vào mục chưa chọn → chọn riêng mục đó; vào mục đang nằm trong nhóm chọn → áp cho cả nhóm.
import { ctaStartTimes } from '../../engine/layers/cta'
import { tr } from '../../shared/i18n'
import { buildTimeline, type Timeline } from '../../shared/timeline'
import { player } from './engineHost'
import { DELETE_SHORTCUT, type MenuItem } from './components/ContextMenu'
import { hasClipboard, useStore } from './store'
import { copySelection, deleteSelection, pasteAtPlayhead, seekTo, splitAtPlayhead } from './timelineActions'
import { addAppearance, layerRange, removeAppearance, ROW_COLORS, splitTiming } from './timelineModel'

const timeline = (): Timeline => {
  const { project } = useStore.getState()
  return buildTimeline(project.tracks, project.settings)
}

/** Menu cho thanh hiệu ứng (lớp) */
export function layerMenu(layerId: string): MenuItem[] {
  const st = useStore.getState()
  if (!st.selectedLayerIds.includes(layerId)) st.selectLayer(layerId)
  const s = useStore.getState()
  const ids = s.selectedLayerIds
  const layers = s.project.layers.filter((l) => ids.includes(l.id))
  const layer = s.project.layers.find((l) => l.id === layerId)
  if (!layer) return []
  const total = timeline().total
  const t = player.time()
  const canSplit = layers.some((l) => !l.locked && l.type !== 'cta' && splitTiming(l.timing, total, t) !== null)
  const allLocked = layers.every((l) => l.locked)
  const allOn = layers.every((l) => l.enabled)
  const many = layers.length > 1
  const index = s.project.layers.findIndex((l) => l.id === layerId)
  return [
    { label: tr('Tách tại đầu phát'), icon: 'split', shortcut: 'mod+b', onClick: splitAtPlayhead, disabled: !canSplit },
    { kind: 'separator' },
    { label: many ? tr('Chép {n} mục', { n: layers.length }) : tr('Chép'), icon: 'copy', shortcut: 'mod+c', onClick: copySelection },
    { label: tr('Dán tại đầu phát'), shortcut: 'mod+v', onClick: pasteAtPlayhead, disabled: !hasClipboard() },
    { label: tr('Nhân bản'), icon: 'duplicate', onClick: () => useStore.getState().duplicateLayers(ids) },
    { kind: 'separator' },
    {
      label: allLocked ? tr('Mở khoá') : tr('Khoá'),
      icon: allLocked ? 'lockOpen' : 'lock',
      onClick: () => useStore.getState().setLayersLocked(ids, !allLocked)
    },
    {
      label: allOn ? tr('Ẩn lớp') : tr('Hiện lớp'),
      icon: allOn ? 'eyeOff' : 'eye',
      onClick: () => useStore.getState().setLayersEnabled(ids, !allOn)
    },
    { kind: 'swatches', label: tr('Màu hàng'), colors: ROW_COLORS, current: layer.color, onPick: (c) => useStore.getState().setLayersColor(ids, c) },
    { kind: 'separator' },
    { label: tr('Đưa lên trên'), icon: 'up', onClick: () => useStore.getState().moveLayer(layerId, 1), disabled: many || index === s.project.layers.length - 1 },
    { label: tr('Đưa xuống dưới'), icon: 'down', onClick: () => useStore.getState().moveLayer(layerId, -1), disabled: many || index === 0 },
    { label: tr('Tới đầu thanh'), onClick: () => seekTo(layerRange(layer.timing, total).start), disabled: layer.type === 'cta' },
    { kind: 'separator' },
    {
      label: many ? tr('Xoá {n} mục', { n: layers.length }) : tr('Xoá lớp'),
      icon: 'delete',
      shortcut: DELETE_SHORTCUT,
      danger: true,
      onClick: () => void deleteSelection(),
      disabled: allLocked
    }
  ]
}

/** Menu cho clip nhạc */
export function trackMenu(trackId: string): MenuItem[] {
  const st = useStore.getState()
  if (!st.selectedTrackIds.includes(trackId)) st.selectTrack(trackId)
  const s = useStore.getState()
  const ids = s.selectedTrackIds
  const many = ids.length + s.selectedLayerIds.length > 1
  const tl = timeline()
  const entry = tl.entries.find((e) => e.track.id === trackId)
  const trimmed = !!entry && (entry.track.trimStart > 0 || entry.track.trimEnd > 0)
  return [
    { label: many ? tr('Chép {n} mục', { n: ids.length + s.selectedLayerIds.length }) : tr('Chép'), icon: 'copy', shortcut: 'mod+c', onClick: copySelection },
    { label: tr('Dán tại đầu phát'), shortcut: 'mod+v', onClick: pasteAtPlayhead, disabled: !hasClipboard() },
    { label: ids.length > 1 ? tr('Nhân bản {n} bài', { n: ids.length }) : tr('Nhân bản bài'), icon: 'duplicate', onClick: () => useStore.getState().duplicateTracks(ids) },
    { kind: 'separator' },
    { label: tr('Tới đầu bài'), onClick: () => entry && seekTo(entry.index === 0 ? 0 : entry.displayStart), disabled: !entry },
    { label: tr('Bỏ cắt'), onClick: () => useStore.getState().updateTrack(trackId, { trimStart: 0, trimEnd: 0 }), disabled: !trimmed },
    { kind: 'separator' },
    { label: many ? tr('Xoá {n} mục', { n: ids.length + s.selectedLayerIds.length }) : tr('Xoá khỏi playlist'), icon: 'delete', shortcut: DELETE_SHORTCUT, danger: true, onClick: () => void deleteSelection() }
  ]
}

/** Menu cho một lần hiện của nút Đăng ký */
export function ctaMenu(layerId: string, index: number): MenuItem[] {
  const st = useStore.getState()
  st.selectCta({ layerId, index })
  const layer = st.project.layers.find((l) => l.id === layerId)
  if (layer?.type !== 'cta') return []
  const tl = timeline()
  const starts = ctaStartTimes(layer.props, tl)
  return [
    { label: tr('Tới lần hiện này'), onClick: () => seekTo(starts[index] ?? 0) },
    {
      label: tr('Xoá lần hiện này'),
      icon: 'delete',
      danger: true,
      onClick: () => {
        useStore.getState().setLayerProps(layerId, { schedule: 'times', times: removeAppearance(starts, index, tl.total) })
        useStore.getState().selectCta(null)
      }
    }
  ]
}

/** Menu cho vùng trống của timeline (t: thời điểm tại chỗ nhấp; row: id lớp của hàng, 'audio' hoặc null) */
export function laneMenu(t: number, row: string | null): MenuItem[] {
  const s = useStore.getState()
  const layer = row && row !== 'audio' ? s.project.layers.find((l) => l.id === row) : undefined
  const items: MenuItem[] = [
    {
      label: tr('Dán tại đây'),
      shortcut: 'mod+v',
      onClick: () => {
        seekTo(t)
        pasteAtPlayhead()
      },
      disabled: !hasClipboard()
    },
    {
      label: tr('Chọn tất cả'),
      shortcut: 'mod+a',
      onClick: () =>
        useStore.getState().setSelection(
          s.project.layers.filter((l) => l.type !== 'cta').map((l) => l.id),
          s.project.tracks.map((x) => x.id)
        )
    }
  ]
  if (layer?.type === 'cta') {
    const tl = timeline()
    items.push({
      label: tr('Thêm lần hiện nút Đăng ký tại đây'),
      icon: 'add',
      onClick: () => {
        const r = addAppearance(ctaStartTimes(layer.props, tl), t, tl.total)
        useStore.getState().setLayerProps(layer.id, { schedule: 'times', times: r.times })
        useStore.getState().selectCta({ layerId: layer.id, index: r.index })
      }
    })
  }
  return items
}
