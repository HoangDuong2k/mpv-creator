import type { ReactNode } from 'react'
import { tr, trKey } from '../../../shared/i18n'
import { useStore } from '../store'
import { Modal } from './ui'

/** [phím / thao tác, việc làm] — dịch lúc hiển thị */
const GROUPS: Array<[string, Array<[string, string]>]> = [
  [
    trKey('Chung'),
    [
      [trKey('Space · nhấp đúp preview'), trKey('Phát / dừng')],
      ['← →', trKey('Tua 5 giây (giữ Shift: 30 giây)')],
      ['Home · End', trKey('Về đầu / cuối video')],
      ['Ctrl+Z · Ctrl+Y', trKey('Hoàn tác / làm lại')],
      ['Ctrl+S · Ctrl+Shift+S', trKey('Lưu project / lưu thành file khác')],
      ['Ctrl+O', trKey('Mở project')],
      ['Ctrl+E', trKey('Xuất video')],
      ['F', trKey('Tập trung preview (ẩn / hiện hai cột bên)')],
      ['? · F1', trKey('Bảng phím tắt này')]
    ]
  ],
  [
    'Timeline',
    [
      [trKey('Kéo thanh · kéo mép'), trKey('Dời thời gian · đổi lúc bắt đầu / kết thúc')],
      [trKey('Kéo núm tròn'), trKey('Hiện dần / ẩn dần')],
      [trKey('Ctrl/Shift + nhấp'), trKey('Chọn thêm thanh hiệu ứng, clip nhạc')],
      [trKey('Kéo trên vùng trống'), trKey('Khoanh chọn nhiều mục')],
      ['Ctrl+A · Esc', trKey('Chọn hết / bỏ chọn nhóm')],
      ['Ctrl+B', trKey('Tách thanh đang chọn tại đầu phát')],
      ['Ctrl+C · Ctrl+V', trKey('Chép / dán tại đầu phát')],
      ['Delete', trKey('Xoá mục đang chọn')],
      [trKey('Ctrl + lăn chuột'), trKey('Phóng to / thu nhỏ timeline')],
      [trKey('Giữ Shift khi kéo'), trKey('Tạm tắt bắt dính')],
      [trKey('Nhấp đúp hàng Đăng ký'), trKey('Thêm một lần hiện nút Đăng ký')],
      [trKey('Thả file vào timeline'), trKey('Chèn nhạc, ảnh, video đúng chỗ thả')]
    ]
  ],
  [
    trKey('Khung preview và bảng thuộc tính'),
    [
      [trKey('Nhấp vào chữ, cột sóng…'), trKey('Chọn lớp đó')],
      [trKey('Kéo · kéo ô vuông'), trKey('Di chuyển · đổi kích thước (giữ Shift: không bắt dính)')],
      [trKey('Nhấp đúp thanh trượt'), trKey('Đưa thông số về mặc định')]
    ]
  ]
]

export function ShortcutsDialog(): ReactNode {
  return (
    <Modal title={tr('Phím tắt và thao tác chuột')} onClose={() => useStore.getState().openDialog(null)} wide>
      <div className="shortcuts">
        {GROUPS.map(([group, rows]) => (
          <section key={group}>
            <h4>{tr(group)}</h4>
            <table>
              <tbody>
                {rows.map(([keys, what]) => (
                  <tr key={keys}>
                    <td>
                      <kbd>{tr(keys)}</kbd>
                    </td>
                    <td>{tr(what)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </Modal>
  )
}
