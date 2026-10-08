# Nhật ký thay đổi

Mỗi phiên bản là một mục `## vX.Y.Z — ngày`. Khi đẩy tag `vX.Y.Z`, CI lấy đúng mục đó làm ghi chú của bản phát hành
trên GitHub Releases (trang landing hiện lại ở phần "Có gì mới").

## v0.3.0 — 2026-10-08

Lời bài hát chạy theo nhạc, có AI căn lời ngay trên máy.

- **Lời bài hát chạy theo nhạc:** lớp lời kiểu một dòng chữ nhỏ, chữ sáng dần theo lời hát (lướt mượt hoặc từng
  chữ), dòng mới trượt lên hoặc mờ dần; 6 mẫu trong thư viện (thẻ Chữ). Tự lấy lời có sẵn trong file nhạc hoặc file
  `.lrc` cùng tên đặt cạnh; nhập / lưu file `.lrc`.
- **AI căn lời:** dán lời vào, AI nghe giọng hát và đặt mốc cho từng câu, từng chữ. Chạy ngay trên máy (Whisper), nhạc
  không gửi đi đâu; mô hình *Nhanh* (~80 MB, khoảng nửa phút mỗi bài) hoặc *Chính xác* (~760 MB, 1–3 phút mỗi bài,
  nghe tiếng Việt tốt hơn nhiều), tải một lần ở lần dùng đầu. Dòng AI chưa chắc được tô vàng để nghe lại.
- **Gõ nhịp:** phát nhạc rồi nhấn Space đúng lúc mỗi câu bắt đầu; bắt dính beat, nhích mốc bằng phím mũi tên.

**Cài đặt:** app vẫn chưa ký số. Windows: nếu SmartScreen chặn, bấm *More info → Run anyway*. macOS: lần đầu mở, vào
*Cài đặt hệ thống → Quyền riêng tư & Bảo mật* và chọn *Vẫn mở*. AI căn lời cần mạng ở lần dùng đầu để tải mô hình.

**English:** lyrics that follow the song. A small single-line lyrics layer lights up as each line is sung (a smooth
sweep or word by word) and slides to the next line, with 6 presets in the library; lyrics embedded in the audio file
or in an `.lrc` file with the same name load automatically. AI lyric sync listens to the vocals on your computer
(Whisper) and times every line and word of the lyrics you paste: the Fast model (~80 MB, about half a minute per
song) or the Accurate one (~760 MB, 1–3 minutes, much better with Vietnamese), downloaded once; lines it is unsure
about are marked in yellow. You can also tap along with the Space key. The app is still not code-signed: on Windows
choose *More info → Run anyway*; on macOS allow it once in *System Settings → Privacy & Security*.

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
