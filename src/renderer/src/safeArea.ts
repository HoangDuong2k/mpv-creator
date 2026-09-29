// Vùng an toàn YouTube: những chỗ trên khung hình thường bị giao diện YouTube che (ước lượng),
// hiện trên preview để canh chữ, nút Đăng ký… — không vẽ vào video xuất ra.
import { trKey } from '../../shared/i18n'

/** Một vùng bị che, toạ độ theo tỉ lệ khung hình (0…1) */
export interface SafeZone {
  x: number
  y: number
  w: number
  h: number
  label: string
}

export function youtubeSafeZones(width: number, height: number): SafeZone[] {
  if (height > width)
    // Shorts / TikTok (khung dọc)
    return [
      { x: 0, y: 0, w: 1, h: 0.08, label: trKey('Thanh trên cùng của Shorts') },
      { x: 0.84, y: 0.35, w: 0.16, h: 0.45, label: trKey('Nút thích, bình luận, chia sẻ') },
      { x: 0, y: 0.8, w: 1, h: 0.2, label: trKey('Tên kênh, mô tả, tên bài nhạc') }
    ]
  return [
    { x: 0, y: 0, w: 1, h: 0.1, label: trKey('Tiêu đề video (khi dừng, khi nhúng)') },
    { x: 0, y: 0.86, w: 1, h: 0.14, label: trKey('Thanh tiến trình và nút điều khiển') }
  ]
}
