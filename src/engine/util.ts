import type { Anchor } from '../shared/types'

export const clamp = (v: number, lo = 0, hi = 1): number => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const smoothstep = (t: number): number => {
  const x = clamp(t)
  return x * x * (3 - 2 * x)
}
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp(t), 3)
export const easeInCubic = (t: number): number => Math.pow(clamp(t), 3)
export const easeInOutCubic = (t: number): number => {
  const x = clamp(t)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}
export const easeOutBack = (t: number): number => {
  const x = clamp(t)
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}
/** Tiến độ 0..1 của đoạn [a, b] tại thời điểm u */
export const span = (u: number, a: number, b: number): number => clamp((u - a) / (b - a))

/** Số giả ngẫu nhiên 0..1 xác định theo (i, seed) — không phụ thuộc thứ tự gọi */
export function hash01(i: number, seed = 0): number {
  let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul((seed | 0) + 0x9e3779b9, 0x165667b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h / 4294967296
}

/** Nhiễu 1 chiều mượt (value noise) trong khoảng 0..1 */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x)
  const f = x - i
  return lerp(hash01(i, seed), hash01(i + 1, seed), smoothstep(f))
}

export function parseHex(color: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return null
  let hex = m[1]
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
  const n = parseInt(hex, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function withAlpha(color: string, alpha: number): string {
  const rgb = parseHex(color)
  if (!rgb) return color
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${clamp(alpha)})`
}

/** Pha màu giữa hai màu hex (t = 0..1); kết quả là màu hex (dùng tiếp được với withAlpha) */
export function mixColor(a: string, b: string, t: number): string {
  const ca = parseHex(a)
  const cb = parseHex(b)
  if (!ca || !cb) return t < 0.5 ? a : b
  const hex = (i: number): string => Math.round(lerp(ca[i], cb[i], t)).toString(16).padStart(2, '0')
  return `#${hex(0)}${hex(1)}${hex(2)}`
}

export interface Size {
  width: number
  height: number
}

/** Kích thước thật của ảnh / video / canvas */
export function sourceSize(src: CanvasImageSource): Size {
  const s = src as unknown as { videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number; width: number; height: number }
  if (s.videoWidth) return { width: s.videoWidth, height: s.videoHeight ?? 0 }
  if (s.naturalWidth) return { width: s.naturalWidth, height: s.naturalHeight ?? 0 }
  return { width: s.width, height: s.height }
}

/** Vẽ ảnh phủ kín khung (object-fit: cover) */
export function drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, w: number, h: number): void {
  const { width: iw, height: ih } = sourceSize(img)
  if (!iw || !ih) return
  const scale = Math.max(w / iw, h / ih)
  const sw = w / scale
  const sh = h / scale
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h)
}

/** Toạ độ góc trên-trái của một khối kích thước (w,h) đặt theo neo + lề */
export function anchorPosition(anchor: Anchor, w: number, h: number, W: number, H: number, margin: number): { x: number; y: number } {
  const [v, hz] = anchor === 'center' ? ['middle', 'center'] : anchor.split('-')
  const x = hz === 'left' ? margin : hz === 'right' ? W - margin - w : (W - w) / 2
  const y = v === 'top' ? margin : v === 'bottom' ? H - margin - h : (H - h) / 2
  return { x, y }
}
