/**
 * Con trỏ chuột / ngón tay dùng chung cho các hiệu ứng canvas của trang (dải sóng, đốm sáng): toạ độ màn hình (px
 * CSS). Nghe một lần cho cả trang, sự kiện bị động (không cản cuộn trang). Rời cửa sổ, nhấc ngón tay hay trình duyệt
 * chuyển sang cuộn trang thì `active` = false.
 */
export const pointer = { x: 0, y: 0, active: false }

let listening = false

export function trackPointer(): void {
  if (listening) return
  listening = true
  const move = (e: PointerEvent): void => {
    pointer.x = e.clientX
    pointer.y = e.clientY
    pointer.active = true
  }
  const off = (): void => {
    pointer.active = false
  }
  window.addEventListener('pointermove', move, { passive: true })
  window.addEventListener('pointerdown', move, { passive: true })
  window.addEventListener('pointerup', (e) => e.pointerType !== 'mouse' && off(), { passive: true })
  window.addEventListener('pointercancel', off, { passive: true })
  window.addEventListener('blur', off)
  document.documentElement.addEventListener('mouseleave', off)
}
