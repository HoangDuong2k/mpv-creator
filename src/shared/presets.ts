// Mẫu hiệu ứng và mẫu chữ trong thư viện (cột trái): mỗi mẫu là một loại lớp + thuộc tính dựng sẵn.
// Tên dịch lúc hiển thị bằng tr().
import { trKey } from './i18n'
import type { LayerPropsMap, LayerType } from './types'

export interface LayerPreset {
  id: string
  name: string
  type: LayerType
  props: Partial<LayerPropsMap[LayerType]>
}

export interface PresetGroup {
  id: string
  name: string
  items: LayerPreset[]
}

function preset<T extends LayerType>(id: string, name: string, type: T, props: Partial<LayerPropsMap[T]> = {}): LayerPreset {
  return { id, name, type, props: props as Partial<LayerPropsMap[LayerType]> }
}

export const EFFECT_GROUPS: PresetGroup[] = [
  {
    id: 'visualizer',
    name: trKey('Cột sóng nhạc'),
    items: [
      preset('viz-bars', trKey('Cột sóng'), 'visualizer', { style: 'bars' }),
      preset('viz-mirror', trKey('Cột đối xứng'), 'visualizer', { style: 'mirror', y: 0.62 }),
      preset('viz-circle', trKey('Vòng tròn quanh ảnh bìa'), 'visualizer', { style: 'circle', y: 0.5, radius: 0.16, height: 0.18, barCount: 96 }),
      preset('viz-area', trKey('Dải sóng mềm'), 'visualizer', { style: 'area', colorMode: 'solid', color: '#ffffff', opacity: 0.8, glow: 20 }),
      preset('viz-wave', trKey('Đường sóng âm'), 'visualizer', { style: 'wave', colorMode: 'solid', color: '#7cf2ff', lineWidth: 3, glow: 18 }),
      preset('viz-rainbow', trKey('Cột cầu vồng'), 'visualizer', { style: 'bars', colorMode: 'rainbow', barCount: 48 }),
      preset('viz-neon', trKey('Neon đối xứng'), 'visualizer', { style: 'mirror', color: '#ff2bd6', color2: '#00f0ff', glow: 40, barCount: 80, barGap: 0.5 }),
      preset('viz-led', trKey('Equalizer LED hi-fi'), 'visualizer', { style: 'led', barCount: 32, barGap: 0.25, ledSegments: 18, height: 0.34, glow: 8 }),
      preset('viz-led-mono', trKey('Equalizer LED một màu'), 'visualizer', {
        style: 'led',
        ledPalette: 'theme',
        colorMode: 'solid',
        color: '#5fe0ff',
        barCount: 48,
        barGap: 0.3,
        ledSegments: 24,
        height: 0.3,
        glow: 14
      })
    ]
  },
  {
    id: 'particles',
    name: trKey('Hạt bay'),
    items: [
      preset('pt-dust', trKey('Bụi / đom đóm bay lên'), 'particles', { style: 'dust' }),
      preset('pt-snow', trKey('Tuyết rơi'), 'particles', { style: 'snow', count: 140 }),
      preset('pt-bokeh', trKey('Bokeh (đốm sáng mờ)'), 'particles', { style: 'bokeh', count: 36, size: 8, opacity: 0.45 }),
      preset('pt-rain', trKey('Mưa'), 'particles', { style: 'rain', count: 220, opacity: 0.5 }),
      preset('pt-stars', trKey('Sao lấp lánh'), 'particles', { style: 'stars', count: 120 }),
      preset('pt-orbit', trKey('Vòng hạt quanh ảnh bìa'), 'particles', { style: 'orbit', x: 0.5, y: 0.5, width: 0.42, height: 0.75, count: 110, size: 3, color: '#ffd9a0', beatReact: 1.2 }),
      preset('pt-hearts', trKey('Trái tim bay'), 'particles', { style: 'hearts', count: 34, size: 5, color: '#ff5c8a', opacity: 0.8 }),
      preset('pt-petals', trKey('Hoa anh đào rơi'), 'particles', { style: 'petals', count: 70, size: 4, color: '#ffc1d3', opacity: 0.85, speed: 0.8 }),
      preset('pt-fireflies', trKey('Đom đóm lập loè'), 'particles', { style: 'fireflies', count: 45, size: 2.5, color: '#d8ff6b', opacity: 0.9, speed: 0.8 }),
      preset('pt-bubbles', trKey('Bong bóng'), 'particles', { style: 'bubbles', count: 40, size: 6, color: '#bfe9ff', opacity: 0.75 }),
      preset('pt-confetti', trKey('Pháo giấy'), 'particles', { style: 'confetti', count: 120, size: 4, multicolor: true, opacity: 0.95 }),
      preset('pt-fog', trKey('Sương mù trôi'), 'particles', { style: 'fog', count: 14, size: 5, color: '#dfe7f2', opacity: 0.6, speed: 0.6, beatReact: 0 }),
      preset('pt-fireworks', trKey('Pháo hoa'), 'particles', { style: 'fireworks', count: 75, size: 3, multicolor: true, opacity: 1, beatReact: 0.6 })
    ]
  },
  {
    id: 'light',
    name: trKey('Ánh sáng'),
    items: [
      preset('lt-leak', trKey('Rò sáng ấm'), 'light', { style: 'leak' }),
      preset('lt-leak-cool', trKey('Rò sáng xanh tím'), 'light', { style: 'leak', color: '#4d7cff', color2: '#b44dff', intensity: 0.55 }),
      preset('lt-flare', trKey('Lóe sáng ống kính'), 'light', { style: 'flare', color: '#ffb35c', color2: '#5cc8ff', intensity: 0.75, beatReact: 0.2 }),
      preset('lt-flare-beat', trKey('Lóe sáng theo nhịp'), 'light', { style: 'flare', x: 0.5, y: 0.3, color: '#ff6bd5', color2: '#6bf0ff', intensity: 0.5, beatReact: 1.4 }),
      preset('lt-rays', trKey('Tia sáng chiếu xuống'), 'light', { style: 'rays', x: 0.7, y: -0.05, color: '#fff1c9', color2: '#ffcf7a', intensity: 0.7, beatReact: 0.3 }),
      preset('lt-prism', trKey('Cầu vồng lăng kính'), 'light', { style: 'prism', intensity: 0.7, beatReact: 0.2 })
    ]
  },
  {
    id: 'camera',
    name: trKey('Chuyển động và ống kính'),
    items: [
      preset('cam-zoom', trKey('Phóng to theo nhịp'), 'camera', { style: 'zoom', trigger: 'beat', amount: 0.6 }),
      preset('cam-shake', trKey('Rung khung hình'), 'camera', { style: 'shake', trigger: 'beat', amount: 0.55 }),
      preset('cam-zoomblur', trKey('Phóng mờ theo beat'), 'camera', { style: 'zoomblur', trigger: 'beat', amount: 0.8 }),
      preset('cam-chromatic', trKey('Lệch màu ống kính'), 'camera', { style: 'chromatic', trigger: 'bass', amount: 0.7 }),
      preset('cam-pixel', trKey('Khối điểm ảnh theo beat'), 'camera', { style: 'pixelate', trigger: 'beat', amount: 0.8, pixel: 36 }),
      preset('cam-mirror', trKey('Soi gương'), 'camera', { style: 'mirror', mirror: 'left' }),
      preset('cam-kaleido', trKey('Kính vạn hoa'), 'camera', { style: 'kaleido', segments: 8, spin: 3 }),
      preset('cam-bars', trKey('Viền điện ảnh'), 'camera', { style: 'bars', ratio: 2.39, slideIn: 0.8 })
    ]
  },
  {
    id: 'flicker',
    name: trKey('Nháy sáng'),
    items: [
      preset('fl-beat', trKey('Nháy theo beat'), 'flicker', { trigger: 'beat' }),
      preset('fl-bass', trKey('Nháy theo bass'), 'flicker', { trigger: 'bass', intensity: 0.3 }),
      preset('fl-film', trKey('Nhiễu phim cũ'), 'flicker', { trigger: 'random', intensity: 0.18, color: '#fff3d6' }),
      preset('fl-red', trKey('Nháy đỏ mạnh (EDM)'), 'flicker', { trigger: 'beat', color: '#ff2b55', intensity: 0.35, blend: 'lighter' })
    ]
  },
  {
    id: 'overlay',
    name: trKey('Lớp phủ'),
    items: [
      preset('ov-vignette', trKey('Viền tối (vignette)'), 'vignette'),
      preset('ov-progress', trKey('Thanh tiến trình'), 'progress'),
      preset('ov-progress-thin', trKey('Thanh tiến trình mảnh'), 'progress', { thickness: 3, showDot: false, showTime: false, y: 0.95, width: 0.9 }),
      preset('ov-progress-wave', trKey('Thanh tiến trình sóng âm'), 'progress', { style: 'wave', waveHeight: 44, y: 0.86, width: 0.7, trackColor: 'rgba(255,255,255,0.3)' }),
      preset('ov-logo', trKey('Ảnh / Logo'), 'image')
    ]
  },
  {
    id: 'music',
    name: trKey('Đĩa than và thông tin bài'),
    items: [
      preset('vn-cover', trKey('Đĩa than xoay'), 'vinyl'),
      preset('vn-label', trKey('Đĩa than nhãn in tên bài'), 'vinyl', { label: 'text', labelColor: '#b5412f', size: 0.66 }),
      preset('vn-corner', trKey('Đĩa than nhỏ góc màn hình'), 'vinyl', { x: 0.14, y: 0.76, size: 0.34, tonearm: false, shadow: 0.35 }),
      preset('np-glass', trKey('Thẻ đang phát kính mờ'), 'nowplaying'),
      preset('np-solid', trKey('Thẻ đang phát nền tối'), 'nowplaying', { style: 'solid', bgColor: '#121212', bgOpacity: 0.85, accent: '#1ed760', label: trKey('Đang phát') }),
      preset('np-minimal', trKey('Tên bài kèm ảnh bìa'), 'nowplaying', { style: 'minimal', x: 0.24, y: 0.88, showProgress: false, size: 96 }),
      preset('tl-glass', trKey('Danh sách bài bên phải'), 'tracklist', { title: trKey('Danh sách phát') }),
      preset('tl-plain', trKey('Danh sách bài không nền'), 'tracklist', { style: 'plain', x: 0.04, align: 'left', showTime: false, activeColor: '#ffffff', rows: 6 }),
      preset('vu-classic', trKey('Đồng hồ VU cổ điển'), 'vumeter'),
      preset('vu-dark', trKey('Đồng hồ VU mặt tối'), 'vumeter', { style: 'dark', backlight: 0.8 })
    ]
  },
  {
    id: 'timer',
    name: trKey('Đồng hồ đếm giờ'),
    items: [
      preset('tm-elapsed', trKey('Thời gian đã phát'), 'timer', { style: 'box', mode: 'elapsed', label: trKey('Đã phát') }),
      preset('tm-remaining', trKey('Thời gian còn lại'), 'timer', { style: 'plain', mode: 'remaining', font: 'Oswald', size: 56, label: trKey('Còn lại') }),
      preset('tm-flip', trKey('Đồng hồ lật'), 'timer', {
        style: 'flip',
        mode: 'elapsed',
        font: 'Be Vietnam Pro',
        bold: true,
        format: 'ms',
        size: 120,
        x: 0.5,
        y: 0.5,
        align: 'center',
        color: '#f2efe9',
        boxColor: '#1c1a18',
        boxOpacity: 1
      }),
      preset('tm-led', trKey('Đồng hồ LED'), 'timer', { style: 'digital', mode: 'clock', clockStart: '23:30', blink: true, size: 110, x: 0.5, y: 0.5, align: 'center', color: '#ff4d3d', glow: 22 }),
      preset('tm-song', trKey('Vòng thời gian bài hát'), 'timer', {
        style: 'ring',
        mode: 'trackRemaining',
        size: 56,
        x: 0.9,
        y: 0.82,
        align: 'center',
        label: trKey('Bài này còn'),
        color: '#ffffff',
        boxOpacity: 0.35
      }),
      preset('tm-pomodoro', trKey('Pomodoro 25 phút'), 'timer', {
        style: 'ring',
        mode: 'countdown',
        countdownMin: 25,
        repeat: true,
        size: 110,
        x: 0.5,
        y: 0.5,
        align: 'center',
        label: trKey('Tập trung'),
        color: '#ffb35c',
        boxOpacity: 0.45
      }),
      preset('tm-clock', trKey('Giờ trong ngày'), 'timer', { style: 'plain', mode: 'clock', clockStart: '21:00', hour12: true, font: 'Playfair Display', size: 78, x: 0.06, y: 0.12, align: 'left' }),
      preset('tm-stopwatch', trKey('Bấm giờ'), 'timer', { style: 'digital', mode: 'stopwatch', format: 'hms', size: 64, x: 0.06, y: 0.1, align: 'left', color: '#5fe0ff', glow: 16 })
    ]
  },
  {
    id: 'retro',
    name: trKey('Retro và glitch'),
    items: [
      preset('fx-vhs', trKey('VHS / băng từ'), 'vhs'),
      preset('fx-vhs-soft', trKey('VHS nhẹ, không chữ'), 'vhs', { intensity: 0.7, chroma: 3, tracking: 0.25, osd: false }),
      preset('fx-glitch', trKey('Glitch theo beat'), 'glitch'),
      preset('fx-glitch-hard', trKey('Glitch mạnh (EDM)'), 'glitch', { amount: 1, rgbSplit: 26, slices: 18, threshold: 0.2 }),
      preset('fx-crt', trKey('Màn hình CRT cũ'), 'crt')
    ]
  },
  {
    id: 'cta',
    name: trKey('Đăng ký / Like'),
    items: [
      preset('cta-combo', trKey('Đăng ký + Like + Chuông'), 'cta', { preset: 'combo' }),
      preset('cta-sub', trKey('Chỉ nút Đăng ký'), 'cta', { preset: 'subscribe' }),
      preset('cta-like', trKey('Chỉ nút Like'), 'cta', { preset: 'like' }),
      preset('cta-bell', trKey('Chỉ chuông thông báo'), 'cta', { preset: 'bell' })
    ]
  }
]

/** Mẫu lời bài hát: một dòng chữ nhỏ, khác nhau ở cách tô màu, nền, font */
export const LYRIC_PRESETS: LayerPreset[] = [
  preset('lyr-line', trKey('Một dòng nhỏ, sáng dần theo lời'), 'lyrics'),
  preset('lyr-word', trKey('Sáng từng từ, chữ vàng'), 'lyrics', { highlight: 'word', bold: true, activeColor: '#ffd36b', color: 'rgba(255,255,255,0.7)' }),
  preset('lyr-box', trKey('Phụ đề có nền mờ'), 'lyrics', { highlight: 'none', color: '#ffffff', box: 0.5, size: 32, transition: 'fade' }),
  preset('lyr-serif', trKey('Chữ nghiêng cổ điển'), 'lyrics', { font: 'Playfair Display', size: 40, color: 'rgba(255,240,220,0.55)', activeColor: '#fff4e0' }),
  preset('lyr-neon', trKey('Neon phát sáng'), 'lyrics', { bold: true, color: 'rgba(170,225,255,0.45)', activeColor: '#e8fbff', shadowColor: '#3fd0ff', shadowBlur: 22 }),
  preset('lyr-top', trKey('Góc trên, căn trái'), 'lyrics', { align: 'left', x: 0.05, y: 0.08, size: 30, maxWidth: 0.6 })
]

/**
 * Mẫu chữ. `template` có chữ thường (không chỉ biến {…}) được dịch khi thêm vào video,
 * để giao diện tiếng Anh thêm "Next: {next}" thay vì "Tiếp theo: {next}".
 */
export const TEXT_PRESETS: LayerPreset[] = [
  preset('txt-title', trKey('Tên bài hát (lớn)'), 'text', { template: '{title}', size: 80, y: 0.2 }),
  preset('txt-artist', trKey('Ca sĩ'), 'text', { template: '{artist}', size: 40, bold: false, y: 0.28, color: '#d0d8ff' }),
  preset('txt-now', trKey('Đang phát: tên bài - ca sĩ'), 'text', { template: '♪ {title} - {artist}', size: 36, bold: false, align: 'left', x: 0.05, y: 0.9 }),
  preset('txt-next', trKey('Bài tiếp theo'), 'text', { template: trKey('Tiếp theo: {next}'), size: 30, bold: false, align: 'right', x: 0.95, y: 0.08, opacity: 0.85 }),
  preset('txt-count', trKey('Số thứ tự bài'), 'text', { template: '{index}/{count}', size: 34, align: 'left', x: 0.05, y: 0.08 }),
  preset('txt-time', trKey('Thời gian của bài'), 'text', { template: '{elapsed} / {duration}', size: 30, bold: false, y: 0.9 }),
  preset('txt-channel', trKey('Tên kênh'), 'text', { template: trKey('Tên kênh của bạn'), font: 'Oswald', size: 44, uppercase: true, align: 'left', x: 0.05, y: 0.1 }),
  preset('txt-script', trKey('Chữ viết tay'), 'text', { template: '{title}', font: 'Pacifico', bold: false, size: 84, y: 0.22 }),
  preset('txt-serif', trKey('Chữ cổ điển'), 'text', { template: '{title}', font: 'Playfair Display', size: 76, y: 0.2 }),
  preset('txt-neon', trKey('Chữ neon'), 'text', { template: '{title}', font: 'Bungee', size: 72, shadowColor: '#ff2bd6', shadowBlur: 40, y: 0.2 }),
  preset('txt-neon-flicker', trKey('Chữ neon chập chờn'), 'text', {
    template: '{title}',
    font: 'Pacifico',
    bold: false,
    size: 84,
    color: '#ffe3fb',
    shadowColor: '#ff2bd6',
    shadowBlur: 45,
    flicker: 0.6,
    animation: 'none',
    y: 0.2
  }),
  preset('txt-outline', trKey('Chữ viền đậm'), 'text', { template: '{title}', size: 80, color: '#ffe066', strokeWidth: 6, strokeColor: '#000000', y: 0.2 })
]

export function findPreset(id: string): LayerPreset | undefined {
  for (const g of EFFECT_GROUPS) {
    const p = g.items.find((x) => x.id === id)
    if (p) return p
  }
  return TEXT_PRESETS.find((x) => x.id === id) ?? LYRIC_PRESETS.find((x) => x.id === id)
}

/** Chữ viết sẵn trong mẫu (tiêu đề, nhãn…) theo ngôn ngữ giao diện, dịch lúc thêm vào video */
const LOCALIZED: Partial<Record<LayerType, string[]>> = {
  text: ['template'],
  timer: ['label'],
  nowplaying: ['label'],
  tracklist: ['title']
}

export function localizePresetProps(type: LayerType, props: Record<string, unknown>, translate: (vi: string) => string): Record<string, unknown> {
  const out = { ...props }
  for (const key of LOCALIZED[type] ?? []) if (typeof out[key] === 'string' && out[key]) out[key] = translate(out[key] as string)
  return out
}
