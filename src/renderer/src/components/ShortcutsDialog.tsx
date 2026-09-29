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
      ['F11 · Esc', trKey('Xem preview toàn màn hình / thoát')],
      ['? · F1', trKey('Bảng phím tắt này')]
    ]
  ],
  [
    'Timeline',
    [
      [trKey('Chuột phải'), trKey('Menu thao tác: tách, chép, nhân bản, khoá, đổi màu, xoá…')],
      [trKey('Kéo thanh · kéo mép'), trKey('Dời thời gian, hoặc đổi lúc bắt đầu / kết thúc')],
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
      [trKey('Thả file vào timeline'), trKey('Chèn nhạc, ảnh, video đúng chỗ thả')],
      [trKey('Kéo mục thư viện vào timeline'), trKey('Thêm hiệu ứng, bộ lọc, chữ mẫu, ảnh nền từ chỗ thả đến hết bài')]
    ]
  ],
  [
    trKey('Khung preview và bảng thuộc tính'),
    [
      [trKey('Nhấp vào chữ, cột sóng…'), trKey('Chọn lớp đó')],
      [trKey('Kéo · kéo ô vuông'), trKey('Di chuyển, hoặc đổi kích thước (giữ Shift để không bắt dính)')],
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
                      <Keys text={tr(keys)} />
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

/** Phím thật hiện trong ô phím; thao tác chuột ("Chuột phải", "Kéo thanh"…) là chữ thường */
const KEY = /^(Ctrl|Shift|Alt|Cmd|Space|Home|End|Esc|Delete|Enter|Tab|F\d{1,2}|[←→↑↓?]|[A-Z])(\+\S+)*$/

function Keys({ text }: { text: string }): ReactNode {
  // Các cách bấm tương đương cách nhau bằng " · " trong dữ liệu, hiện thành "/"
  const parts = text.split(/\s*·\s*/)
  return (
    <span className="keys">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="keys-or">/</span>}
          {p.split(' ').every((w) => KEY.test(w)) ? p.split(' ').map((w) => <kbd key={w}>{w}</kbd>) : <span className="keys-text">{p}</span>}
        </span>
      ))}
    </span>
  )
}
