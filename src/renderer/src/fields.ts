// Mô tả các thuộc tính chỉnh được của từng loại layer để Inspector tự dựng form.
import { FONT_FAMILIES } from '../../shared/fonts'
import type { LayerPropsMap, LayerType } from '../../shared/types'

type Props = Record<string, unknown>

export type Field =
  | { kind: 'range'; key: string; label: string; min: number; max: number; step?: number; unit?: string; show?: (p: Props) => boolean }
  | { kind: 'number'; key: string; label: string; min?: number; max?: number; step?: number; unit?: string; show?: (p: Props) => boolean }
  | { kind: 'select'; key: string; label: string; options: Array<[string, string]>; show?: (p: Props) => boolean }
  | { kind: 'color'; key: string; label: string; show?: (p: Props) => boolean }
  | { kind: 'toggle'; key: string; label: string; show?: (p: Props) => boolean }
  | { kind: 'text'; key: string; label: string; placeholder?: string; show?: (p: Props) => boolean }
  | { kind: 'textarea'; key: string; label: string; hint?: string; show?: (p: Props) => boolean }
  | { kind: 'file'; key: string; label: string; accept: 'image' | 'video'; show?: (p: Props) => boolean }
  | { kind: 'section'; label: string; show?: (p: Props) => boolean }

const is = (key: string, ...values: string[]) => (p: Props) => values.includes(String(p[key]))
const not = (key: string, ...values: string[]) => (p: Props) => !values.includes(String(p[key]))

const position: Field[] = [
  { kind: 'range', key: 'x', label: 'Vị trí ngang', min: 0, max: 1, step: 0.005 },
  { kind: 'range', key: 'y', label: 'Vị trí dọc', min: 0, max: 1, step: 0.005 }
]

const ANCHORS: Array<[string, string]> = [
  ['top-left', 'Góc trên trái'],
  ['top-center', 'Giữa cạnh trên'],
  ['top-right', 'Góc trên phải'],
  ['middle-left', 'Giữa cạnh trái'],
  ['center', 'Chính giữa'],
  ['middle-right', 'Giữa cạnh phải'],
  ['bottom-left', 'Góc dưới trái'],
  ['bottom-center', 'Giữa cạnh dưới'],
  ['bottom-right', 'Góc dưới phải']
]

export const FIELDS: { [K in LayerType]: Field[] } = {
  background: [
    {
      kind: 'select',
      key: 'mode',
      label: 'Loại nền',
      options: [
        ['gradient', 'Màu chuyển (gradient)'],
        ['color', 'Màu đơn'],
        ['image', 'Ảnh'],
        ['video', 'Video (lặp lại)'],
        ['cover', 'Ảnh bìa bài hát (tự đổi theo bài)']
      ]
    },
    { kind: 'file', key: 'src', label: 'File ảnh', accept: 'image', show: is('mode', 'image') },
    { kind: 'file', key: 'src', label: 'File video', accept: 'video', show: is('mode', 'video') },
    { kind: 'color', key: 'color', label: 'Màu 1' },
    { kind: 'color', key: 'color2', label: 'Màu 2', show: is('mode', 'gradient') },
    { kind: 'range', key: 'angle', label: 'Góc gradient', min: 0, max: 360, step: 1, unit: '°', show: is('mode', 'gradient') },
    { kind: 'range', key: 'blur', label: 'Làm mờ', min: 0, max: 60, step: 1, show: is('mode', 'image', 'cover') },
    { kind: 'range', key: 'dim', label: 'Làm tối', min: 0, max: 0.9, step: 0.01 },
    { kind: 'section', label: 'Chuyển động theo nhạc' },
    { kind: 'range', key: 'beatZoom', label: 'Đập theo bass (zoom)', min: 0, max: 0.2, step: 0.005 },
    { kind: 'range', key: 'shake', label: 'Rung theo beat', min: 0, max: 40, step: 1 },
    { kind: 'range', key: 'kenBurns', label: 'Zoom chậm (Ken Burns)', min: 0, max: 0.2, step: 0.005 }
  ],
  visualizer: [
    {
      kind: 'select',
      key: 'style',
      label: 'Kiểu',
      options: [
        ['bars', 'Cột sóng'],
        ['mirror', 'Cột đối xứng trên dưới'],
        ['circle', 'Vòng tròn quanh ảnh'],
        ['area', 'Dải sóng mềm'],
        ['wave', 'Đường sóng âm (waveform)']
      ]
    },
    ...position,
    { kind: 'range', key: 'width', label: 'Chiều rộng', min: 0.1, max: 1, step: 0.01, show: not('style', 'circle') },
    { kind: 'range', key: 'radius', label: 'Bán kính vòng', min: 0.05, max: 0.4, step: 0.005, show: is('style', 'circle') },
    { kind: 'range', key: 'height', label: 'Độ cao cột', min: 0.02, max: 0.8, step: 0.01 },
    { kind: 'range', key: 'barCount', label: 'Số cột', min: 8, max: 180, step: 1, show: not('style', 'wave') },
    { kind: 'range', key: 'barGap', label: 'Khoảng cách cột', min: 0, max: 0.9, step: 0.01, show: is('style', 'bars', 'mirror', 'circle') },
    { kind: 'toggle', key: 'rounded', label: 'Bo tròn đầu cột', show: is('style', 'bars', 'mirror', 'circle') },
    { kind: 'toggle', key: 'symmetric', label: 'Đối xứng hai bên (bass ở giữa)', show: is('style', 'bars', 'mirror', 'area') },
    { kind: 'toggle', key: 'flip', label: 'Lật ngược (cột mọc xuống dưới)', show: is('style', 'bars') },
    { kind: 'toggle', key: 'flip', label: 'Lật ngược sóng', show: is('style', 'wave') },
    { kind: 'toggle', key: 'flip', label: 'Bass ở phía trên vòng', show: is('style', 'circle') },
    { kind: 'range', key: 'lineWidth', label: 'Độ dày đường', min: 1, max: 20, step: 0.5, show: is('style', 'wave') },
    { kind: 'section', label: 'Màu sắc' },
    {
      kind: 'select',
      key: 'colorMode',
      label: 'Kiểu màu',
      options: [
        ['gradient', 'Chuyển 2 màu'],
        ['solid', 'Một màu'],
        ['rainbow', 'Cầu vồng']
      ]
    },
    { kind: 'color', key: 'color', label: 'Màu chính', show: not('colorMode', 'rainbow') },
    { kind: 'color', key: 'color2', label: 'Màu phụ', show: is('colorMode', 'gradient') },
    { kind: 'range', key: 'glow', label: 'Phát sáng (glow)', min: 0, max: 60, step: 1 },
    { kind: 'range', key: 'opacity', label: 'Độ trong suốt', min: 0, max: 1, step: 0.01 },
    { kind: 'section', label: 'Phản ứng với nhạc' },
    { kind: 'range', key: 'sensitivity', label: 'Độ nhạy', min: 0.3, max: 3, step: 0.05 },
    { kind: 'range', key: 'smoothing', label: 'Độ mượt', min: 0, max: 1, step: 0.01 },
    { kind: 'number', key: 'minFreq', label: 'Tần số thấp nhất', min: 20, max: 4000, step: 10, unit: 'Hz' },
    { kind: 'number', key: 'maxFreq', label: 'Tần số cao nhất', min: 500, max: 16000, step: 100, unit: 'Hz' },
    { kind: 'section', label: 'Ảnh ở tâm', show: is('style', 'circle') },
    {
      kind: 'select',
      key: 'centerImage',
      label: 'Ảnh ở giữa',
      options: [
        ['cover', 'Ảnh bìa bài hát'],
        ['custom', 'Ảnh tự chọn'],
        ['none', 'Không có']
      ],
      show: is('style', 'circle')
    },
    { kind: 'file', key: 'centerSrc', label: 'File ảnh', accept: 'image', show: (p) => p.style === 'circle' && p.centerImage === 'custom' },
    { kind: 'range', key: 'centerBeat', label: 'Nảy theo bass', min: 0, max: 0.3, step: 0.005, show: is('style', 'circle') },
    { kind: 'range', key: 'rotateSpeed', label: 'Tốc độ xoay', min: -90, max: 90, step: 1, unit: '°/s', show: is('style', 'circle') }
  ],
  progress: [
    {
      kind: 'select',
      key: 'scope',
      label: 'Tiến trình của',
      options: [
        ['track', 'Bài đang phát'],
        ['playlist', 'Cả playlist']
      ]
    },
    ...position,
    { kind: 'range', key: 'width', label: 'Chiều dài', min: 0.1, max: 1, step: 0.01 },
    { kind: 'range', key: 'thickness', label: 'Độ dày', min: 1, max: 24, step: 0.5 },
    { kind: 'color', key: 'color', label: 'Màu đã chạy' },
    { kind: 'color', key: 'trackColor', label: 'Màu nền thanh' },
    { kind: 'toggle', key: 'showDot', label: 'Hiện chấm tròn' },
    { kind: 'toggle', key: 'showTime', label: 'Hiện thời gian' },
    { kind: 'range', key: 'fontSize', label: 'Cỡ chữ thời gian', min: 10, max: 60, step: 1, show: (p) => !!p.showTime },
    { kind: 'color', key: 'textColor', label: 'Màu chữ', show: (p) => !!p.showTime }
  ],
  text: [
    {
      kind: 'textarea',
      key: 'template',
      label: 'Nội dung',
      hint: 'Biến tự đổi theo bài: {title} tên bài, {artist} ca sĩ, {album}, {index}/{count} số thứ tự, {next} bài kế tiếp, {elapsed} {duration} {remaining} thời gian, {playlist} tên project'
    },
    { kind: 'select', key: 'font', label: 'Font', options: FONT_FAMILIES.map((f) => [f, f]) },
    { kind: 'toggle', key: 'bold', label: 'Chữ đậm (Be Vietnam Pro)' },
    { kind: 'range', key: 'size', label: 'Cỡ chữ', min: 10, max: 220, step: 1 },
    { kind: 'toggle', key: 'uppercase', label: 'VIẾT HOA' },
    { kind: 'color', key: 'color', label: 'Màu chữ' },
    {
      kind: 'select',
      key: 'align',
      label: 'Căn lề',
      options: [
        ['left', 'Trái'],
        ['center', 'Giữa'],
        ['right', 'Phải']
      ]
    },
    ...position,
    { kind: 'range', key: 'maxWidth', label: 'Rộng tối đa (tự thu nhỏ chữ)', min: 0.1, max: 1, step: 0.01 },
    { kind: 'section', label: 'Hiệu ứng' },
    {
      kind: 'select',
      key: 'animation',
      label: 'Khi đổi bài',
      options: [
        ['fade', 'Mờ dần vào / ra'],
        ['slide', 'Trượt lên'],
        ['typewriter', 'Gõ từng chữ'],
        ['none', 'Không']
      ]
    },
    { kind: 'range', key: 'strokeWidth', label: 'Viền chữ', min: 0, max: 10, step: 0.5 },
    { kind: 'color', key: 'strokeColor', label: 'Màu viền', show: (p) => Number(p.strokeWidth) > 0 },
    { kind: 'range', key: 'shadowBlur', label: 'Bóng / phát sáng', min: 0, max: 60, step: 1 },
    { kind: 'color', key: 'shadowColor', label: 'Màu bóng', show: (p) => Number(p.shadowBlur) > 0 },
    { kind: 'range', key: 'beatScale', label: 'Nảy theo nhạc', min: 0, max: 0.3, step: 0.005 },
    { kind: 'range', key: 'opacity', label: 'Độ trong suốt', min: 0, max: 1, step: 0.01 }
  ],
  image: [
    {
      kind: 'select',
      key: 'source',
      label: 'Nguồn ảnh',
      options: [
        ['file', 'File ảnh (logo, avatar...)'],
        ['cover', 'Ảnh bìa bài đang phát']
      ]
    },
    { kind: 'file', key: 'src', label: 'File ảnh', accept: 'image', show: is('source', 'file') },
    ...position,
    { kind: 'range', key: 'width', label: 'Kích thước', min: 0.02, max: 1, step: 0.005 },
    { kind: 'toggle', key: 'circle', label: 'Cắt hình tròn' },
    { kind: 'range', key: 'rotateSpeed', label: 'Xoay (đĩa than)', min: -180, max: 180, step: 1, unit: '°/s' },
    { kind: 'range', key: 'beatScale', label: 'Nảy theo nhạc', min: 0, max: 0.3, step: 0.005 },
    { kind: 'range', key: 'borderWidth', label: 'Viền', min: 0, max: 20, step: 0.5 },
    { kind: 'color', key: 'borderColor', label: 'Màu viền', show: (p) => Number(p.borderWidth) > 0 },
    { kind: 'range', key: 'opacity', label: 'Độ trong suốt', min: 0, max: 1, step: 0.01 }
  ],
  cta: [
    {
      kind: 'select',
      key: 'preset',
      label: 'Mẫu',
      options: [
        ['combo', 'Đăng ký + Like + Chuông'],
        ['subscribe', 'Chỉ nút Đăng ký'],
        ['like', 'Chỉ nút Like'],
        ['bell', 'Chỉ chuông thông báo'],
        ['image', 'Ảnh tự chọn (PNG trong suốt)']
      ]
    },
    { kind: 'file', key: 'src', label: 'File ảnh', accept: 'image', show: is('preset', 'image') },
    {
      kind: 'select',
      key: 'lang',
      label: 'Ngôn ngữ',
      options: [
        ['vi', 'Tiếng Việt (ĐĂNG KÝ)'],
        ['en', 'English (SUBSCRIBE)']
      ],
      show: is('preset', 'combo', 'subscribe')
    },
    { kind: 'select', key: 'anchor', label: 'Vị trí', options: [...ANCHORS, ['free', 'Tự do (kéo trên khung hình)']] },
    { kind: 'range', key: 'x', label: 'Vị trí ngang', min: 0, max: 1, step: 0.005, show: is('anchor', 'free') },
    { kind: 'range', key: 'y', label: 'Vị trí dọc', min: 0, max: 1, step: 0.005, show: is('anchor', 'free') },
    { kind: 'range', key: 'margin', label: 'Cách mép', min: 0, max: 300, step: 1, show: not('anchor', 'free') },
    { kind: 'range', key: 'scale', label: 'Kích thước', min: 0.3, max: 3, step: 0.05 },
    { kind: 'section', label: 'Màu sắc & chữ', show: not('preset', 'image') },
    { kind: 'color', key: 'accent', label: 'Màu nút Đăng ký', show: is('preset', 'combo', 'subscribe') },
    { kind: 'color', key: 'textColor', label: 'Màu chữ Đăng ký', show: is('preset', 'combo', 'subscribe') },
    { kind: 'text', key: 'labelSub', label: 'Chữ trên nút', placeholder: 'Mặc định: ĐĂNG KÝ / SUBSCRIBE', show: is('preset', 'combo', 'subscribe') },
    { kind: 'text', key: 'labelDone', label: 'Chữ sau khi bấm', placeholder: 'Mặc định: ĐÃ ĐĂNG KÝ / SUBSCRIBED', show: is('preset', 'combo', 'subscribe') },
    { kind: 'color', key: 'buttonColor', label: 'Màu nút Like / Chuông', show: is('preset', 'combo', 'like', 'bell') },
    { kind: 'color', key: 'iconColor', label: 'Màu biểu tượng', show: is('preset', 'combo', 'like', 'bell') },
    { kind: 'color', key: 'activeColor', label: 'Màu Like sau khi bấm', show: is('preset', 'combo', 'like') },
    { kind: 'section', label: 'Thời điểm xuất hiện' },
    {
      kind: 'select',
      key: 'schedule',
      label: 'Hiện khi',
      options: [
        ['interval', 'Lặp lại mỗi N phút'],
        ['trackStart', 'Đầu mỗi bài hát'],
        ['times', 'Tại các mốc thời gian']
      ]
    },
    { kind: 'number', key: 'firstAt', label: 'Lần đầu tại giây', min: 0, step: 1, unit: 's', show: is('schedule', 'interval') },
    { kind: 'number', key: 'every', label: 'Lặp lại mỗi', min: 0.5, step: 0.5, unit: 'phút', show: is('schedule', 'interval') },
    { kind: 'number', key: 'offset', label: 'Sau khi bài bắt đầu', min: 0, step: 1, unit: 's', show: is('schedule', 'trackStart') },
    { kind: 'text', key: 'times', label: 'Các mốc (phút:giây)', placeholder: '0:10, 12:30, 1:05:00', show: is('schedule', 'times') },
    { kind: 'range', key: 'duration', label: 'Hiển thị trong', min: 2, max: 15, step: 0.5, unit: 's' }
  ],
  flicker: [
    {
      kind: 'select',
      key: 'trigger',
      label: 'Nháy theo',
      options: [
        ['beat', 'Beat (tiếng trống)'],
        ['bass', 'Âm bass mạnh'],
        ['random', 'Ngẫu nhiên (phim cũ)']
      ]
    },
    { kind: 'range', key: 'intensity', label: 'Cường độ', min: 0, max: 1, step: 0.01 },
    { kind: 'range', key: 'decay', label: 'Tốc độ tắt', min: 1, max: 25, step: 0.5 },
    { kind: 'color', key: 'color', label: 'Màu' },
    {
      kind: 'select',
      key: 'blend',
      label: 'Hoà trộn',
      options: [
        ['screen', 'Screen (sáng dịu)'],
        ['lighter', 'Cộng sáng (mạnh)'],
        ['normal', 'Thường']
      ]
    }
  ],
  particles: [
    {
      kind: 'select',
      key: 'style',
      label: 'Kiểu',
      options: [
        ['dust', 'Bụi / đom đóm bay lên'],
        ['snow', 'Tuyết rơi'],
        ['bokeh', 'Bokeh (đốm sáng mờ)'],
        ['rain', 'Mưa'],
        ['stars', 'Sao lấp lánh']
      ]
    },
    { kind: 'range', key: 'count', label: 'Số lượng', min: 0, max: 400, step: 1 },
    { kind: 'range', key: 'size', label: 'Kích thước', min: 1, max: 12, step: 0.5 },
    { kind: 'range', key: 'speed', label: 'Tốc độ', min: 0.1, max: 4, step: 0.05 },
    { kind: 'color', key: 'color', label: 'Màu' },
    { kind: 'range', key: 'opacity', label: 'Độ trong suốt', min: 0, max: 1, step: 0.01 },
    { kind: 'range', key: 'beatReact', label: 'Phản ứng theo nhạc', min: 0, max: 2, step: 0.05 },
    { kind: 'number', key: 'seed', label: 'Kiểu phân bố (seed)', min: 0, step: 1 },
    { kind: 'section', label: 'Vùng có hạt' },
    ...position,
    { kind: 'range', key: 'width', label: 'Chiều rộng vùng', min: 0.05, max: 1, step: 0.01 },
    { kind: 'range', key: 'height', label: 'Chiều cao vùng', min: 0.05, max: 1, step: 0.01 }
  ],
  // Bộ lọc màu: chọn mẫu ở lưới ảnh xem trước (Inspector), các ô dưới để tinh chỉnh
  filter: [
    { kind: 'range', key: 'intensity', label: 'Cường độ', min: 0, max: 1, step: 0.01 },
    { kind: 'section', label: 'Chỉnh màu' },
    { kind: 'range', key: 'brightness', label: 'Độ sáng', min: -1, max: 1, step: 0.01 },
    { kind: 'range', key: 'contrast', label: 'Tương phản', min: -1, max: 1, step: 0.01 },
    { kind: 'range', key: 'saturation', label: 'Bão hoà màu', min: -1, max: 1, step: 0.01 },
    { kind: 'range', key: 'temperature', label: 'Nhiệt độ màu (lạnh ↔ ấm)', min: -1, max: 1, step: 0.01 },
    { kind: 'range', key: 'tint', label: 'Sắc độ (xanh lá ↔ hồng)', min: -1, max: 1, step: 0.01 },
    { kind: 'range', key: 'hue', label: 'Xoay màu', min: -180, max: 180, step: 1, unit: '°' },
    { kind: 'range', key: 'sepia', label: 'Nâu cổ điển (sepia)', min: 0, max: 1, step: 0.01 },
    { kind: 'section', label: 'Hiệu ứng phim' },
    { kind: 'range', key: 'fade', label: 'Nhạt màu (nâng vùng tối)', min: 0, max: 1, step: 0.01 },
    { kind: 'range', key: 'grain', label: 'Hạt phim', min: 0, max: 1, step: 0.01 },
    { kind: 'range', key: 'vignette', label: 'Viền tối', min: 0, max: 1, step: 0.01 },
    { kind: 'range', key: 'blur', label: 'Mờ mơ màng', min: 0, max: 20, step: 0.5 }
  ],
  vignette: [
    { kind: 'range', key: 'amount', label: 'Độ tối viền', min: 0, max: 1, step: 0.01 },
    { kind: 'range', key: 'size', label: 'Vùng sáng ở giữa', min: 0, max: 0.95, step: 0.01 },
    { kind: 'color', key: 'color', label: 'Màu' }
  ]
}

export type AnyProps = LayerPropsMap[LayerType]
