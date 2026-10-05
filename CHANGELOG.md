# Nhật ký thay đổi

Mỗi phiên bản là một mục `## vX.Y.Z — ngày`. Khi đẩy tag `vX.Y.Z`, CI lấy đúng mục đó làm ghi chú của bản phát hành
trên GitHub Releases (trang landing hiện lại ở phần "Có gì mới").

## v0.2.0 — 2026-10-05

Bản phát hành đầu tiên cho Windows, macOS (chip Apple và Intel) và Linux.

- **Playlist thành video:** thêm nhạc (MP3, WAV, FLAC, M4A, OGG), kéo để đổi thứ tự, cắt đầu / cuối bài, chuyển bài
  bằng crossfade hoặc khoảng lặng; tự tạo timestamp chương cho mô tả YouTube.
- **Hiệu ứng theo nhạc:** cột sóng, sóng tròn, đĩa than, đồng hồ VU, hạt bay, ánh sáng, nháy theo nhịp, rung khung
  hình, VHS, glitch, CRT, bộ lọc màu… 20 loại lớp, kèm thư viện hiệu ứng mẫu: bấm để xem trước, nhấn + để thêm.
- **Mẫu phong cách:** 7 mẫu có sẵn (Mặc định, Lofi, EDM, Ballad, Bolero, Thư giãn, Tối giản); lưu phong cách của
  bạn thành mẫu để dùng lại.
- **Timeline:** kéo thanh để dời, kéo mép để đổi thời gian, tách, chép / dán, khoá lớp, nút Đăng ký / Like hiện theo
  lịch.
- **Xuất video:** MP4 H.264 tới 4K, xuất nhanh bằng card đồ hoạ (NVIDIA NVENC, Intel Quick Sync, AMD AMF, Apple
  VideoToolbox), tuỳ chọn tắt máy khi xuất xong.
- **Giao diện:** tiếng Việt và tiếng Anh, chọn màu giao diện (Tím, Hồng, Xanh neon), phím tắt theo hệ điều hành.

**Cài đặt:** app chưa ký số. Windows: nếu SmartScreen chặn, bấm *More info → Run anyway*. macOS: lần đầu mở, vào
*Cài đặt hệ thống → Quyền riêng tư & Bảo mật* và chọn *Vẫn mở*.

**English:** first public release for Windows, macOS (Apple silicon and Intel) and Linux. Turn a music playlist into
a YouTube video: audio-reactive visualizers and effects (20 layer types), 7 style templates, a timeline editor,
YouTube chapter timestamps, and fast H.264 export with hardware encoders. The app is not code-signed yet: on Windows
choose *More info → Run anyway*; on macOS allow it once in *System Settings → Privacy & Security*.
