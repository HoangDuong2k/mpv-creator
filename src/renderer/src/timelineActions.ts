// Thao tác trên các thanh đang chọn — dùng chung cho nút trên timeline và phím tắt.
import { player } from './engineHost'
import { useStore } from './store'
import { tr } from '../../shared/i18n'
import { mediaKind } from '../../shared/files'
import { buildTimeline } from '../../shared/timeline'
import { formatTimePrecise } from '../../shared/time'
import { insertionIndexAt } from './timelineModel'

/** Tua tới thời điểm t (đồng bộ đầu phát và store) */
export function seekTo(t: number): void {
  const v = Math.max(0, Math.min(t, player.total || t))
  player.seek(v)
  useStore.getState().setTime(v)
}

/** Ctrl+B: tách các thanh đang chọn tại đầu phát */
export function splitAtPlayhead(): void {
  const st = useStore.getState()
  if (st.selectedLayerIds.length === 0) {
    st.toast('info', tr('Chọn thanh cần tách trên timeline, đặt đầu phát vào giữa thanh rồi bấm Ctrl+B'))
    return
  }
  if (st.splitLayers(st.selectedLayerIds, player.time()) === 0)
    st.toast('info', tr('Không tách được: đầu phát phải nằm trong thanh đang chọn, cách hai mép ít nhất 0,5 giây (lớp đang khoá không tách được)'))
}

/** Ctrl+C: chép các lớp và clip nhạc đang chọn */
export function copySelection(): void {
  const st = useStore.getState()
  const n = st.copyItems(st.selectedLayerIds, st.selectedTrackIds)
  if (n > 0) st.toast('info', tr('Đã chép {n} mục — đặt đầu phát rồi bấm Ctrl+V để dán', { n }))
}

/** Ctrl+V: dán tại đầu phát (bài chèn vào ranh giới gần nhất, lớp đi theo bài) */
export function pasteAtPlayhead(): void {
  const st = useStore.getState()
  if (st.pasteItems(player.time()) === 0) st.toast('info', tr('Chưa chép gì (chọn thanh hoặc clip nhạc trên timeline rồi bấm Ctrl+C)'))
}

/** Delete: xoá các lớp và clip nhạc đang chọn (lớp đang khoá được giữ lại) — một bước hoàn tác */
export function deleteSelection(): boolean {
  const st = useStore.getState()
  const ids = st.selectedLayerIds
  if (ids.length === 0 && st.selectedTrackIds.length === 0) return false
  const locked = st.project.layers.filter((l) => ids.includes(l.id) && l.locked).length
  st.removeItems(ids, st.selectedTrackIds)
  if (locked > 0)
    st.toast('info', locked === ids.length && st.selectedTrackIds.length === 0 ? tr('Lớp đang khoá — mở khoá để xoá') : tr('Đã giữ lại {n} lớp đang khoá', { n: locked }))
  return true
}

/** Tên file để sắp xếp: "2.jpg" trước "10.jpg" */
const byName = (a: string, b: string): number => (a.split(/[\\/]/).pop() ?? a).localeCompare(b.split(/[\\/]/).pop() ?? b, 'vi', { numeric: true })

/**
 * Thả file vào timeline tại thời điểm `at` (như CapCut):
 * - nhạc / thư mục nhạc → chèn vào playlist tại ranh giới gần điểm thả;
 * - ảnh / video → thả trúng hàng của một lớp nền thì thay nguồn của lớp đó, còn lại thêm lớp nền mới
 *   (mỗi file một bài, bắt đầu từ điểm thả).
 */
export async function dropFiles(paths: string[], at: number, targetLayerId: string | null = null): Promise<void> {
  const st = useStore.getState()
  const media = paths
    .filter((p) => mediaKind(p) === 'image' || mediaKind(p) === 'video')
    .sort(byName)
    .map((path) => ({ path, kind: mediaKind(path) as 'image' | 'video' }))
  const others = paths.filter((p) => mediaKind(p) !== 'image' && mediaKind(p) !== 'video' && mediaKind(p) !== 'project')
  if (others.length) {
    const tracks = await window.api.importMedia(others)
    if (tracks.length) {
      const { project } = useStore.getState()
      const k = insertionIndexAt(buildTimeline(project.tracks, project.settings).entries, at)
      useStore.getState().insertTracks(tracks, k)
      st.toast('info', tr('Đã chèn {n} bài vào vị trí {k}', { n: tracks.length, k: k + 1 }))
    } else if (!media.length) st.toast('error', tr('Không tìm thấy file nhạc hợp lệ (mp3, wav, flac, m4a, ogg…)'))
  }
  if (!media.length) return
  const target = useStore.getState().project.layers.find((l) => l.id === targetLayerId)
  if (target?.type === 'background' && media.length === 1 && !others.length) {
    useStore.getState().setBackgroundSource(target.id, media[0])
    st.toast('info', tr('Đã thay nền của lớp "{name}"', { name: tr(target.name) }))
    return
  }
  useStore.getState().addDroppedBackgrounds(media, at)
  const total = useStore.getState().project.tracks.length ? buildTimeline(useStore.getState().project.tracks, useStore.getState().project.settings).total : 0
  st.toast('info', tr('Đã thêm {n} nền từ {time}', { n: media.length, time: formatTimePrecise(Math.max(0, at), total >= 3600) }))
}
