// Đồng hồ đếm giờ: đã phát / còn lại (cả video hoặc bài đang phát), đếm ngược, bấm giờ, giờ trong ngày.
// Năm kiểu: chữ số, khung nền mờ, đồng hồ lật (có hoạt cảnh lật số), đèn LED 7 đoạn, vòng tiến trình.
// Mỗi chữ số nằm trong một ô rộng bằng nhau nên đồng hồ không bị "nhảy" khi số đổi, với mọi font.
// Chỉ phụ thuộc thời điểm t (không giữ trạng thái): preview, tua và xuất video song song cho cùng một hình.
import { cssFont } from '../../shared/fonts'
import type { TimerProps } from '../../shared/types'
import { cached, recordBounds, type RenderEnv } from '../env'
import { clamp } from '../util'
import { bassPulse } from './background'

export interface TimerContext {
  t: number
  /** Độ dài video */
  total: number
  /** Khoảng thời gian của lớp (end null = tới hết video) */
  start: number
  end: number | null
  /** Bài đang phát */
  entry: { start: number; end: number; length: number } | null
}

export interface TimerReading {
  /** Giá trị hiển thị, giây nguyên (giờ trong ngày: số giây tính từ 0:00) */
  seconds: number
  /** Số giây kể từ lần số đổi gần nhất (0..1): nhấp nháy dấu hai chấm, lật số */
  since: number
  /** Số giảm dần theo thời gian */
  down: boolean
  /** Tiến trình 0..1 cho kiểu vòng */
  progress: number
  /** Giá trị lớn nhất sẽ hiện: kiểu "tự động" giữ cố định có / không có phần giờ */
  max: number
}

/** "21:30", "21:30:15", "9" → số giây từ 0:00; sai định dạng → 0 */
export function parseClock(text: string): number {
  const m = /^\s*(\d{1,2})(?:[:h.](\d{1,2}))?(?::(\d{1,2}))?\s*$/i.exec(text)
  if (!m) return 0
  return Math.min(23, Number(m[1])) * 3600 + Math.min(59, Number(m[2] ?? 0)) * 60 + Math.min(59, Number(m[3] ?? 0))
}

export function readTimer(p: TimerProps, c: TimerContext): TimerReading {
  const since = Math.max(0, c.t - c.start)
  const layerLen = Math.max(0, (c.end === null ? c.total : c.end) - c.start)
  const e = c.entry
  let v: number
  let down = false
  let progress: number
  let max: number
  /** Đồng hồ đã chạy được bao lâu (giây đầu tiên chưa có lần đổi số nào để lật) */
  let running = c.t
  switch (p.mode) {
    case 'remaining':
      v = Math.max(0, c.total - c.t)
      down = true
      max = c.total
      progress = c.total > 0 ? v / c.total : 0
      break
    case 'trackElapsed':
    case 'trackRemaining': {
      const len = e?.length ?? 0
      const pos = e ? clamp(c.t - e.start, 0, len) : 0
      down = p.mode === 'trackRemaining'
      v = down ? (e ? clamp(e.end - c.t, 0, len) : 0) : pos
      max = len
      progress = len > 0 ? v / len : 0
      running = pos
      break
    }
    case 'countdown': {
      const d = Math.max(1, Math.round(p.countdownMin * 60))
      const u = p.repeat ? since % d : Math.min(since, d)
      v = d - u
      down = true
      max = d
      progress = v / d
      running = since
      break
    }
    case 'stopwatch':
      v = since
      max = Math.max(layerLen, v)
      progress = (v % 60) / 60
      running = since
      break
    case 'clock':
      v = (parseClock(p.clockStart) + Math.max(0, c.t)) % 86400
      max = 86400
      progress = (v % 60) / 60
      break
    default:
      v = Math.max(0, c.total > 0 ? Math.min(c.t, c.total) : c.t)
      max = c.total
      progress = c.total > 0 ? v / c.total : 0
  }
  const seconds = Math.max(0, down ? Math.ceil(v - 1e-6) : Math.floor(v + 1e-6))
  const changed = down ? seconds - v : v - seconds
  return { seconds, since: running < 1 ? 1 : clamp(changed), down, progress: clamp(progress), max }
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** Chữ hiển thị (chữ số và dấu hai chấm) + hậu tố AM / PM của kiểu 12 giờ */
export function formatTimer(p: TimerProps, r: Pick<TimerReading, 'seconds' | 'max'>): { text: string; suffix: string } {
  const s = Math.max(0, Math.floor(r.seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (p.mode === 'clock') {
    const h24 = h % 24
    const hh = p.hour12 ? String(h24 % 12 || 12) : pad(h24)
    const suffix = p.hour12 ? (h24 < 12 ? 'AM' : 'PM') : ''
    if (p.format === 'hms') return { text: `${hh}:${pad(m)}:${pad(sec)}`, suffix }
    if (p.format === 'ms') return { text: `${pad(m)}:${pad(sec)}`, suffix: '' }
    return { text: `${hh}:${pad(m)}`, suffix }
  }
  if (p.format === 'hms') return { text: `${pad(h)}:${pad(m)}:${pad(sec)}`, suffix: '' }
  if (p.format === 'ms') return { text: `${pad(Math.floor(s / 60))}:${pad(sec)}`, suffix: '' }
  if (p.format === 'hm') return { text: `${pad(h)}:${pad(m)}`, suffix: '' }
  return { text: r.max >= 3600 || h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`, suffix: '' }
}

/** Thời gian hoạt cảnh lật số (giây) */
const FLIP_TIME = 0.34

/** Các đoạn sáng của từng chữ số trên đèn LED 7 đoạn (a trên, b trên phải, c dưới phải, d dưới, e dưới trái, f trên trái, g giữa) */
const SEGMENTS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgedc',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg'
}

interface DigitMetrics {
  /** Bề ngang ô chữ số (chữ số rộng nhất của font) */
  cell: number
  colon: number
  /** Chiều cao chữ số tính từ đường chân chữ */
  asc: number
}

function digitMetrics(env: RenderEnv, font: string, size: number): DigitMetrics {
  return cached(env, `timer-metrics|${font}`, () => {
    const { ctx } = env
    ctx.font = font
    let cell = 0
    for (let d = 0; d <= 9; d++) cell = Math.max(cell, ctx.measureText(String(d)).width)
    const zero = ctx.measureText('0')
    const asc = zero.actualBoundingBoxAscent > 0 ? zero.actualBoundingBoxAscent : size * 0.72
    return { cell, colon: ctx.measureText(':').width, asc }
  })
}

export function drawTimer(env: RenderEnv, p: TimerProps): void {
  const { ctx, W, H, S } = env
  const e = env.entry
  const r = readTimer(p, { t: env.t, total: env.timeline.total, start: env.timing.start, end: env.timing.end, entry: e ? { start: e.start, end: e.end, length: e.length } : null })
  const { text, suffix } = formatTimer(p, r)
  const flipK = p.style === 'flip' && r.since < FLIP_TIME ? r.since / FLIP_TIME : 1
  const prevText = flipK < 1 ? formatTimer(p, { seconds: r.down ? r.seconds + 1 : r.seconds - 1, max: r.max }).text : text
  const colonOn = !p.blink || r.since < 0.5
  const size = Math.max(4, p.size * S)
  const A = clamp(p.opacity) * env.fade
  const label = p.label.trim()

  const setGlow = (on: boolean): void => {
    if (on && p.glow > 0) {
      ctx.shadowColor = p.color
      ctx.shadowBlur = p.glow * S * env.px
      ctx.shadowOffsetY = 0
    } else if (on && p.style === 'plain') {
      // Chữ số trần trên nền ảnh: bóng mờ nhẹ để luôn đọc được
      ctx.shadowColor = 'rgba(0,0,0,0.55)'
      ctx.shadowBlur = 10 * S * env.px
      ctx.shadowOffsetY = 2 * S * env.px
    } else {
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0
    }
  }

  // ---- Kích thước khối chữ số theo từng kiểu ----
  const ring = p.style === 'ring'
  const R = size * 1.25
  const ringLw = Math.max(2 * S, size * 0.1)
  // Kiểu vòng: chữ số nhỏ lại cho vừa lòng vòng
  let fs = size
  if (ring) {
    ctx.font = cssFont(p.font, size, p.bold)
    const m = digitMetrics(env, ctx.font, size)
    const unit = (text.replace(/:/g, '').length * m.cell + (text.split(':').length - 1) * Math.min(m.colon, m.cell * 0.55) * 1.15) / size
    fs = Math.min(size * 0.62, ((R - ringLw) * 1.62) / Math.max(0.1, unit))
  }
  const font = cssFont(p.font, fs, p.bold)
  ctx.font = font
  const m = digitMetrics(env, font, fs)
  const digital = p.style === 'digital'
  const flip = p.style === 'flip'
  const dh = digital ? fs * 0.92 : flip ? fs * 1.2 : m.asc
  const segW = dh * 0.52
  const cardW = m.cell * 1.28 + fs * 0.06
  const digitW = digital ? segW : flip ? cardW : m.cell
  const digitGap = digital ? dh * 0.14 : flip ? fs * 0.07 : 0
  // Font chữ số rộng đều (JetBrains Mono…): dấu hai chấm cũng rộng bằng chữ số, thu hẹp lại cho gọn
  const colonW = digital ? dh * 0.34 : flip ? fs * 0.42 : Math.min(m.colon, m.cell * 0.55) * 1.15
  const glyphs: Array<{ ch: string; x: number; w: number }> = []
  let dw = 0
  for (const ch of text) {
    const w = ch === ':' ? colonW : digitW
    if (glyphs.length && ch !== ':' && glyphs[glyphs.length - 1].ch !== ':') dw += digitGap
    glyphs.push({ ch, x: dw, w })
    dw += w
  }
  const suffixSize = fs * 0.36
  const suffixFont = cssFont(p.font, suffixSize, p.bold)
  ctx.font = suffixFont
  const suffixW = suffix ? ctx.measureText(suffix).width + fs * 0.14 : 0
  const labelSize = Math.max(8 * S, (ring ? fs : size) * (ring ? 0.34 : 0.3))
  const labelFont = cssFont(p.font, labelSize, false)
  ctx.font = labelFont
  const labelW = label ? ctx.measureText(label).width : 0
  const labelH = label ? labelSize * 1.2 : 0
  const labelGap = label ? (ring ? fs * 0.12 : size * 0.16) : 0
  const rowW = dw + suffixW
  const contentW = Math.max(rowW, labelW)
  const contentH = dh + labelH + labelGap
  const padX = p.style === 'box' ? size * 0.4 : 0
  const padY = p.style === 'box' ? size * 0.28 : 0
  const blockW = ring ? 2 * R + ringLw : contentW + padX * 2
  const blockH = ring ? 2 * R + ringLw : contentH + padY * 2

  const X = p.x * W
  const x0 = p.align === 'left' ? X : p.align === 'right' ? X - blockW : X - blockW / 2
  const y0 = p.y * H - blockH / 2
  recordBounds(env, x0, y0, blockW, blockH)

  ctx.globalAlpha = A
  if (p.beatScale > 0) {
    const k = 1 + p.beatScale * bassPulse(env)
    const cx = x0 + blockW / 2
    const cy = y0 + blockH / 2
    ctx.translate(cx, cy)
    ctx.scale(k, k)
    ctx.translate(-cx, -cy)
  }

  // ---- Nền: khung mờ / lòng vòng ----
  if (p.style === 'box' && p.boxOpacity > 0) {
    ctx.globalAlpha = A * clamp(p.boxOpacity)
    ctx.fillStyle = p.boxColor
    ctx.beginPath()
    ctx.roundRect(x0, y0, blockW, blockH, size * 0.2)
    ctx.fill()
    ctx.globalAlpha = A * 0.5
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'
    ctx.lineWidth = Math.max(1, S)
    ctx.stroke()
    ctx.globalAlpha = A
  }
  const cxR = x0 + blockW / 2
  const cyR = y0 + blockH / 2
  if (ring) {
    if (p.boxOpacity > 0) {
      ctx.globalAlpha = A * clamp(p.boxOpacity)
      ctx.fillStyle = p.boxColor
      ctx.beginPath()
      ctx.arc(cxR, cyR, R - ringLw / 2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.lineWidth = ringLw
    ctx.globalAlpha = A * 0.3
    ctx.strokeStyle = p.color2
    ctx.beginPath()
    ctx.arc(cxR, cyR, R, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = A
    if (r.progress > 0.001) {
      const a0 = -Math.PI / 2
      const a1 = a0 + Math.PI * 2 * r.progress
      setGlow(true)
      ctx.strokeStyle = p.color
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(cxR, cyR, R, a0, a1)
      ctx.stroke()
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(cxR + Math.cos(a1) * R, cyR + Math.sin(a1) * R, ringLw * 0.85, 0, Math.PI * 2)
      ctx.fill()
      setGlow(false)
    }
  }

  // ---- Vị trí hàng chữ số và nhãn ----
  const innerX = ring ? cxR - contentW / 2 : x0 + padX
  const innerY = ring ? cyR - contentH / 2 : y0 + padY
  const rowX = p.align === 'left' && !ring ? innerX : p.align === 'right' && !ring ? innerX + contentW - rowW : innerX + (contentW - rowW) / 2
  const rowY = label && p.labelPos === 'above' ? innerY + labelH + labelGap : innerY
  if (label) {
    ctx.font = labelFont
    ctx.fillStyle = p.color2
    ctx.textBaseline = 'middle'
    ctx.textAlign = p.align === 'left' && !ring ? 'left' : p.align === 'right' && !ring ? 'right' : 'center'
    const lx = ctx.textAlign === 'left' ? innerX : ctx.textAlign === 'right' ? innerX + contentW : innerX + contentW / 2
    const ly = p.labelPos === 'above' ? innerY + labelH / 2 : innerY + dh + labelGap + labelH / 2
    setGlow(p.style === 'plain')
    ctx.fillText(label, lx, ly)
  }

  // ---- Chữ số ----
  ctx.fillStyle = p.color
  if (digital) drawSegments(env, p, glyphs, rowX, rowY, dh, colonOn, A, setGlow)
  else if (flip) drawFlip(env, p, glyphs, prevText, flipK, rowX, rowY, dh, m, font, colonOn, A, setGlow)
  else {
    ctx.font = font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    setGlow(true)
    const base = rowY + m.asc
    for (const g of glyphs) {
      if (g.ch === ':' && !colonOn) continue
      ctx.fillText(g.ch, rowX + g.x + g.w / 2, base)
    }
  }
  if (suffix) {
    ctx.font = suffixFont
    ctx.fillStyle = p.color
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    setGlow(true)
    ctx.fillText(suffix, rowX + dw + fs * 0.14, rowY + dh)
  }
  setGlow(false)
}

/** Đèn LED 7 đoạn: đoạn tắt mờ, đoạn sáng có thể phát sáng */
function drawSegments(
  env: RenderEnv,
  p: TimerProps,
  glyphs: Array<{ ch: string; x: number; w: number }>,
  x0: number,
  y0: number,
  h: number,
  colonOn: boolean,
  A: number,
  setGlow: (on: boolean) => void
): void {
  const { ctx } = env
  const th = h * 0.13
  const g = th * 0.16
  const horiz = (x1: number, x2: number, cy: number): void => {
    ctx.moveTo(x1, cy)
    ctx.lineTo(x1 + th / 2, cy - th / 2)
    ctx.lineTo(x2 - th / 2, cy - th / 2)
    ctx.lineTo(x2, cy)
    ctx.lineTo(x2 - th / 2, cy + th / 2)
    ctx.lineTo(x1 + th / 2, cy + th / 2)
    ctx.closePath()
  }
  const vert = (cx: number, y1: number, y2: number): void => {
    ctx.moveTo(cx, y1)
    ctx.lineTo(cx + th / 2, y1 + th / 2)
    ctx.lineTo(cx + th / 2, y2 - th / 2)
    ctx.lineTo(cx, y2)
    ctx.lineTo(cx - th / 2, y2 - th / 2)
    ctx.lineTo(cx - th / 2, y1 + th / 2)
    ctx.closePath()
  }
  const seg = (s: string, x: number, w: number): void => {
    const y = y0
    const mid = y + h / 2
    const l = x + th / 2
    const r = x + w - th / 2
    if (s === 'a') horiz(l + g, r - g, y + th / 2)
    else if (s === 'g') horiz(l + g, r - g, mid)
    else if (s === 'd') horiz(l + g, r - g, y + h - th / 2)
    else if (s === 'f') vert(l, y + th / 2 + g, mid - g)
    else if (s === 'b') vert(r, y + th / 2 + g, mid - g)
    else if (s === 'e') vert(l, mid + g, y + h - th / 2 - g)
    else if (s === 'c') vert(r, mid + g, y + h - th / 2 - g)
  }
  const skew = (cx: number, cy: number): void => {
    // Nghiêng nhẹ như đồng hồ LED thật
    ctx.translate(cx, cy)
    ctx.transform(1, 0, -0.08, 1, 0, 0)
    ctx.translate(-cx, -cy)
  }
  ctx.fillStyle = p.color
  for (const gl of glyphs) {
    const x = x0 + gl.x
    ctx.save()
    skew(x + gl.w / 2, y0 + h / 2)
    if (gl.ch === ':') {
      ctx.globalAlpha = A * (colonOn ? 1 : 0.1)
      setGlow(colonOn)
      const s = th * 1.05
      ctx.fillRect(x + gl.w / 2 - s / 2, y0 + h * 0.3 - s / 2, s, s)
      ctx.fillRect(x + gl.w / 2 - s / 2, y0 + h * 0.7 - s / 2, s, s)
    } else {
      const on = SEGMENTS[gl.ch] ?? ''
      // Đoạn tắt: mờ, không phát sáng
      ctx.globalAlpha = A * 0.1
      setGlow(false)
      ctx.beginPath()
      for (const s of 'abcdefg') if (!on.includes(s)) seg(s, x, gl.w)
      ctx.fill()
      ctx.globalAlpha = A
      setGlow(true)
      ctx.beginPath()
      for (const s of on) seg(s, x, gl.w)
      ctx.fill()
    }
    ctx.restore()
  }
  ctx.globalAlpha = A
}

/** Đồng hồ lật: mỗi chữ số một thẻ; số vừa đổi thì nửa trên của thẻ cũ gập xuống */
function drawFlip(
  env: RenderEnv,
  p: TimerProps,
  glyphs: Array<{ ch: string; x: number; w: number }>,
  prevText: string,
  k: number,
  x0: number,
  y0: number,
  h: number,
  m: DigitMetrics,
  font: string,
  colonOn: boolean,
  A: number,
  setGlow: (on: boolean) => void
): void {
  const { ctx, S } = env
  const prev = prevText.length === glyphs.length ? prevText : glyphs.map((g) => g.ch).join('')
  const faceAlpha = A * clamp(Math.max(p.boxOpacity, 0.2))
  const mid = y0 + h / 2
  const half = (x: number, w: number, top: boolean, ch: string, scaleY: number, shade: number): void => {
    ctx.save()
    if (scaleY !== 1) {
      ctx.translate(0, mid)
      ctx.scale(1, Math.max(0.001, scaleY))
      ctx.translate(0, -mid)
    }
    ctx.beginPath()
    ctx.rect(x - 2, top ? y0 - 2 : mid, w + 4, h / 2 + 2)
    ctx.clip()
    const rr = Math.min(w, h) * 0.12
    ctx.globalAlpha = faceAlpha
    ctx.fillStyle = p.boxColor
    setGlow(false)
    ctx.beginPath()
    ctx.roundRect(x, y0, w, h, rr)
    ctx.fill()
    // Nửa trên sáng hơn một chút, như thẻ thật dưới đèn
    if (top) {
      ctx.globalAlpha = faceAlpha * 0.08
      ctx.fillStyle = '#ffffff'
      ctx.fill()
    }
    ctx.globalAlpha = A
    ctx.fillStyle = p.color
    ctx.font = font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    setGlow(true)
    ctx.fillText(ch, x + w / 2, mid + m.asc / 2)
    if (shade > 0) {
      setGlow(false)
      ctx.globalAlpha = A * shade
      ctx.fillStyle = '#000000'
      ctx.beginPath()
      ctx.roundRect(x, y0, w, h, rr)
      ctx.fill()
    }
    ctx.restore()
  }
  glyphs.forEach((g, i) => {
    const x = x0 + g.x
    if (g.ch === ':') {
      if (!colonOn) return
      ctx.globalAlpha = A * clamp(Math.max(p.boxOpacity, 0.6))
      ctx.fillStyle = p.color
      setGlow(true)
      const r = h * 0.055
      for (const fy of [0.34, 0.66]) {
        ctx.beginPath()
        ctx.arc(x + g.w / 2, y0 + h * fy, r, 0, Math.PI * 2)
        ctx.fill()
      }
      return
    }
    const old = prev[i]
    if (k >= 1 || old === g.ch) {
      half(x, g.w, true, g.ch, 1, 0)
      half(x, g.w, false, g.ch, 1, 0)
    } else {
      half(x, g.w, true, g.ch, 1, 0)
      half(x, g.w, false, old, 1, 0)
      if (k < 0.5) half(x, g.w, true, old, 1 - k * 2, 0.4 * k * 2)
      else half(x, g.w, false, g.ch, k * 2 - 1, 0.4 * (2 - k * 2))
    }
    // Khe gập giữa thẻ
    setGlow(false)
    ctx.globalAlpha = A * 0.55
    ctx.fillStyle = '#000000'
    ctx.fillRect(x, mid - Math.max(1, S * 1.5) / 2, g.w, Math.max(1, S * 1.5))
  })
  ctx.globalAlpha = A
}
