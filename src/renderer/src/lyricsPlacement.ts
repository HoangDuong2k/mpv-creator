/**
 * Chỗ đặt lớp lời bài hát khi thêm vào: dòng chữ nhỏ cần một dải ngang trống, mà mỗi mẫu phong cách đặt thanh tiến
 * trình, chữ tên bài ở chỗ khác nhau. Thử vài vị trí quen thuộc (sát chân khung, cao hơn chút, sát đỉnh khung…) và
 * chọn vị trí đầu tiên không đè lên lớp nào đang hiện trên preview.
 */
import type { Rect } from '../../engine/env'
import type { Layer, LayerType } from '../../shared/types'

/** Khung bao các lớp ở khung hình preview vừa vẽ (PreviewPanel gán vào) */
export const previewBounds: { current: Map<string, Rect> | null; W: number; H: number } = { current: null, W: 1920, H: 1080 }

/** Lớp phủ cả khung hình (nền, hạt bay, lọc màu…): không tính là "đè" */
const FULL_FRAME: LayerType[] = ['background', 'particles', 'vignette', 'flicker', 'filter', 'camera', 'light', 'vhs', 'glitch', 'crt']

/** Vị trí dọc thử lần lượt (phần chiều cao khung hình) */
export const LYRICS_SPOTS = [0.93, 0.88, 0.07, 0.12, 0.79, 0.5]

/** Vị trí dọc trống cho dòng lời (nửa chiều cao dải ≈ 3,5% khung, rộng 76% ở giữa); không tìm được thì vị trí đầu */
export function freeLyricsY(layers: Layer[], bounds: Map<string, Rect> | null, W: number, H: number): number {
  if (!bounds || bounds.size === 0) return LYRICS_SPOTS[0]
  const solid = layers.filter((l) => l.enabled && !FULL_FRAME.includes(l.type)).map((l) => bounds.get(l.id))
  const boxes = solid.filter((b): b is Rect => !!b && b.w * b.h < W * H * 0.6)
  const x0 = W * 0.12
  const x1 = W * 0.88
  for (const y of LYRICS_SPOTS) {
    const top = (y - 0.035) * H
    const bottom = (y + 0.035) * H
    const hit = boxes.some((b) => b.x < x1 && b.x + b.w > x0 && b.y < bottom && b.y + b.h > top)
    if (!hit) return y
  }
  return LYRICS_SPOTS[0]
}

/** Số bài vừa nhập có sẵn lời; video chưa có lớp lời thì nhắc thêm lớp (lời chỉ hiện khi có lớp này) */
export function lyricsImportHint(tracks: Array<{ lyrics?: unknown }>, layers: Layer[]): number {
  const n = tracks.filter((t) => t.lyrics).length
  return n > 0 && !layers.some((l) => l.type === 'lyrics') ? n : 0
}
