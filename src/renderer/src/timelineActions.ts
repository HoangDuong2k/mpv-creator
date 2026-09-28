// Thao tác trên các thanh đang chọn — dùng chung cho nút trên timeline và phím tắt.
import { player } from './engineHost'
import { useStore } from './store'

/** Ctrl+B: tách các thanh đang chọn tại đầu phát */
export function splitAtPlayhead(): void {
  const st = useStore.getState()
  if (st.selectedLayerIds.length === 0) {
    st.toast('info', 'Chọn thanh cần tách trên timeline, đặt đầu phát vào giữa thanh rồi bấm Ctrl+B')
    return
  }
  if (st.splitLayers(st.selectedLayerIds, player.time()) === 0)
    st.toast('info', 'Không tách được: đầu phát phải nằm trong thanh đang chọn, cách hai mép ít nhất 0,5 giây (lớp đang khoá không tách được)')
}

/** Ctrl+C: chép các lớp đang chọn */
export function copySelection(): void {
  const st = useStore.getState()
  const n = st.copyLayers(st.selectedLayerIds)
  if (n > 0) st.toast('info', `Đã chép ${n} lớp — đặt đầu phát rồi bấm Ctrl+V để dán`)
}

/** Ctrl+V: dán các lớp đã chép tại đầu phát */
export function pasteAtPlayhead(): void {
  const st = useStore.getState()
  if (st.pasteLayers(player.time()) === 0) st.toast('info', 'Chưa chép lớp nào (chọn thanh trên timeline rồi bấm Ctrl+C)')
}

/** Delete: xoá các lớp đang chọn (lớp đang khoá được giữ lại) */
export function deleteSelection(): boolean {
  const st = useStore.getState()
  const ids = st.selectedLayerIds
  if (ids.length === 0) return false
  const locked = st.project.layers.filter((l) => ids.includes(l.id) && l.locked).length
  st.removeLayers(ids)
  if (locked > 0) st.toast('info', locked === ids.length ? 'Lớp đang khoá — mở khoá để xoá' : `Đã giữ lại ${locked} lớp đang khoá`)
  return true
}
