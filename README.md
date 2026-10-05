# Playlist Video Maker

Ứng dụng desktop (Windows / macOS / Linux, giao diện **tiếng Việt / English**) dựng **video playlist nhạc cho YouTube**: ghép nhiều bài hát trên một nền, thêm cột sóng nhạc, hiệu ứng nháy theo beat, tên bài tự đổi, nút **Đăng ký / Like / Chuông**, rồi xuất MP4 kèm timestamp cho phần mô tả.

## Tính năng

| Nhóm | Có gì |
|---|---|
| **Playlist** | Kéo thả file/thư mục nhạc (MP3, WAV, FLAC, M4A, OGG…), đọc tên bài/ca sĩ/ảnh bìa từ tag, sắp xếp bằng kéo thả, sửa tên, cắt đầu/cuối bài |
| **Thư viện** (cột trái) | 5 thẻ như CapCut: **Nhạc** (playlist), **Ảnh/video** (nhập hoặc kéo thả vào, ảnh thu nhỏ, đánh dấu file đang dùng; chuột phải: đặt làm nền cả video, làm nền từ đầu phát, làm logo, xoá khỏi thư viện), **Hiệu ứng** (72 mẫu: cột sóng, hạt bay, ánh sáng, chuyển động và ống kính, nháy sáng, lớp phủ, đĩa than và thông tin bài, đồng hồ đếm giờ, retro và glitch, nút Đăng ký), **Bộ lọc** (12 mẫu), **Chữ** (12 mẫu: tên bài, ca sĩ, bài tiếp theo, tên kênh, chữ neon, neon chập chờn…). Ảnh xem trước do chính engine xuất video vẽ trên cảnh mẫu với nhạc giả lập, **rê chuột để xem chuyển động**. Như CapCut: **bấm** một mẫu để **xem thử ngay trên preview** (video chưa đổi, thanh trên preview có nút *Thêm vào video*, Esc hoặc bấm lại để thôi); bấm **+** (hoặc nhấp đúp) để thêm cho cả video; **kéo vào timeline** để đặt từ chỗ thả đến hết bài đó (nút Đăng ký: hiện một lần tại chỗ thả; bộ lọc thả lên hàng bộ lọc có sẵn thì đổi mẫu của lớp đó) |
| **Mẫu phong cách** | 7 mẫu có sẵn — Mặc định, Lofi, EDM, Ballad, Bolero, Thư giãn, Tối giản — gồm nền, bộ lọc, cột sóng, chữ, hiệu ứng phối sẵn. Áp cho project đang làm mà **giữ nguyên nhạc** (tuỳ chọn giữ ảnh / video nền của mình, Ctrl+Z để hoàn tác). **Tạo mẫu từ video vừa làm** (nút trong hộp thoại xuất video khi xuất xong, hoặc trong *Mẫu phong cách*): mẫu chỉ giữ những gì dùng suốt video đó (nền, cột sóng, chữ tên bài, hiệu ứng, logo, nút Đăng ký), bỏ các lớp chỉ hiện một đoạn và lớp đang ẩn, kèm khung hình, fps, kiểu chuyển bài và chất lượng xuất. Làm video mới: *Project mới* → chọn mẫu → chọn ảnh / video nền mới → thêm nhạc là xong. Lưu lại cùng tên để cập nhật mẫu. **Màn hình chào** khi mở app cũng cho chọn mẫu để bắt đầu |
| **Timeline kiểu CapCut** | Thước thời gian, đầu phát kéo để tua, Ctrl + lăn chuột để zoom, "Vừa khung", thanh cuộn ngang dễ kéo (đang phát vẫn tự cuộn đi xem chỗ khác được; timeline tự theo đầu phát lại khi đầu phát chạy tới, khi tua hoặc bấm phát lại); **hàng nhạc** có sóng âm (kéo clip đổi thứ tự, kéo mép để cắt đầu/cuối, crossfade hiện giữa các clip); **mỗi lớp một hàng**: kéo thân thanh để dời (thanh kéo dài đến hết video thì dời điểm bắt đầu), kéo mép để chọn khoảng thời gian hiện, núm hiện dần/ẩn dần; các lần hiện nút Đăng ký kéo thả được, nhấp đúp để thêm, Delete để xoá; bắt dính vào đầu phát, mép clip, ranh giới bài (Shift để tắt). **Ctrl+B tách thanh** tại đầu phát (các đoạn nằm chung một hàng), **khoá lớp** để không kéo / tách / xoá nhầm, đổi **màu hàng**. Thao tác như CapCut: **thả nhạc, ảnh, video thẳng vào timeline** đúng chỗ muốn (nhạc chèn vào vị trí đó; ảnh / video thành nền từ điểm thả, nhiều ảnh thì mỗi ảnh một bài, chuyển cảnh mờ dần; thả vào hàng của một lớp nền thì thay ảnh của lớp đó), **kéo khung trên vùng trống** hoặc **Ctrl/Shift + nhấp** để chọn nhiều thanh và clip nhạc, kéo cả nhóm, **Ctrl+C / Ctrl+V** chép – dán cả lớp lẫn bài (bài chèn vào ranh giới gần đầu phát, lớp đi theo bài), **Delete** xoá cả nhóm; **chuột phải** mở menu thao tác (tách, chép / dán, nhân bản, khoá, ẩn, đổi màu, lên / xuống lớp, xoá); thanh nền ảnh / video và logo hiện **ảnh thu nhỏ** như cuộn phim |
| **Âm thanh** | Crossfade / khoảng lặng / nối liền giữa các bài, fade đầu–cuối video; preview phát theo từng đoạn nên đổi thứ tự, cắt bài là nghe được ngay |
| **Nền** | Gradient, màu đơn, ảnh (làm mờ được), video lặp, ảnh bìa bài hát tự đổi theo bài; zoom đập theo bass, rung theo beat, Ken Burns |
| **Cột sóng** | Cột, cột đối xứng, vòng tròn quanh ảnh bìa (xoay được), dải sóng mềm, đường waveform, **equalizer LED ô vuông** (màu dàn hi-fi xanh – vàng – đỏ hoặc màu tự chọn, đỉnh giữ lại rồi rơi chậm); chỉnh màu/gradient/cầu vồng, glow, độ nhạy, độ mượt, dải tần |
| **Đĩa than và thông tin bài** | **Đĩa than xoay**: nhãn giữa là ảnh bìa bài đang phát (hoặc nhãn in tên bài, ảnh tự chọn), rãnh đĩa có ánh bóng, cần đọc đĩa chạy dần vào trong theo tiến độ bài; đổi bài thì đĩa chậm lại tới dừng rồi quay tiếp. **Thẻ "Đang phát"** kiểu Spotify (kính mờ, nền đặc hoặc không nền): ảnh bìa, tên bài, ca sĩ, thanh tiến trình, thời gian đã phát / còn lại, đổi bài thì nội dung mờ ra rồi trượt lên. **Danh sách bài trên video**: bài đang phát sáng lên kèm biểu tượng cột nhảy, tự cuộn mượt khi đổi bài, làm mờ bài đã phát, mốc thời gian từng bài. **Đồng hồ VU kim** kiểu dàn âm thanh cổ (mặt kem hoặc mặt tối đèn cam), hai kim trái / phải theo âm lượng từng kênh, đèn báo quá mức (bài đã phân tích bằng bản cũ thì hai kim chạy như nhau; xoá *Bộ nhớ đệm âm thanh* trong *Cài đặt project* để phân tích lại cả hai kênh) |
| **Hiệu ứng** | Flicker (nháy sáng theo beat / bass / ngẫu nhiên), hạt bay (bụi, tuyết, bokeh, mưa, sao, **vòng hạt quanh ảnh bìa** bung ra theo bass, **trái tim, hoa anh đào, đom đóm, bong bóng, pháo giấy, sương mù, pháo hoa** — một màu hoặc nhiều màu, giới hạn được vùng). **Ánh sáng**: rò sáng (light leak), lóe sáng ống kính, tia sáng chiếu từ một điểm (kéo nguồn sáng trên preview), cầu vồng lăng kính, sáng bừng theo nhạc. **Chuyển động và ống kính**: phóng to, rung khung hình, phóng mờ, lệch màu ống kính, khối điểm ảnh (theo beat / bass / luôn bật), soi gương, kính vạn hoa, viền điện ảnh trượt vào, viền tối vignette. **Retro**: VHS / băng từ (sọc quét, lệch màu, nhoè, nhiễu kéo băng, chữ PLAY ▶ và ngày giờ ở góc), **glitch theo beat** (tách kênh màu, lát cắt lệch, khối màu lỗi tín hiệu; theo beat, bass hoặc ngẫu nhiên), **màn hình CRT cũ** (mặt cong, sọc quét, lưới điểm màu, phát sáng, nhấp nháy, vỏ bo góc) |
| **Bộ lọc màu** | 13 bộ lọc dựng sẵn như app chỉnh ảnh (Ấm áp, Lạnh, Rực rỡ, Cổ điển, Đen trắng, Phim cũ, Lofi chill, Hoàng hôn, Mơ màng, Neon đêm, Nhạt màu, Tối & sâu), xem trước bằng ảnh mẫu lấy từ chính khung hình; kéo cường độ; tự chỉnh sáng, tương phản, bão hoà, nhiệt độ màu, sắc độ, xoay màu, sepia, nhạt màu, hạt phim, viền tối, làm mờ. Bộ lọc tác động lên mọi lớp nằm dưới nó: chọn *Chỉ lọc ảnh nền* hoặc *Lọc cả khung hình*. Có khoảng thời gian và hiện dần/ẩn dần trên timeline như các lớp khác, thêm nhiều bộ lọc để mỗi đoạn một màu. Bộ lọc chỉ lọc ảnh nền tĩnh được lọc sẵn một lần nên gần như không làm chậm lúc xuất |
| **Đồng hồ đếm giờ** | Đếm thời gian đã phát / còn lại của cả video hoặc của bài đang phát, đếm ngược tự đặt (lặp lại kiểu Pomodoro), bấm giờ, giờ trong ngày (kiểu 24 giờ hoặc 12 giờ AM / PM). 5 kiểu: chữ số, khung nền mờ, **đồng hồ lật** (có hoạt cảnh lật số), **đèn LED** 7 đoạn, **vòng tiến trình**; chọn font (có JetBrains Mono chữ số rộng đều), màu, phát sáng, nhãn ("Còn lại", "Tập trung"…), nhấp nháy dấu hai chấm, nảy theo nhạc; kéo trên preview để dời, kéo góc để đổi cỡ. Chữ số đặt trong ô rộng đều nên không bị "nhảy" khi đổi số. 8 mẫu dựng sẵn trong thư viện |
| **Chữ** | Mẫu có biến tự đổi theo bài: `{title}` `{artist}` `{next}` `{index}/{count}` `{elapsed}`…; 7 font hỗ trợ tiếng Việt; viền, bóng, hiệu ứng khi đổi bài; **neon chập chờn** (rung nhẹ, thỉnh thoảng tắt / chớp, có đoạn chữ bị "hỏng" như đèn neon thật) |
| **Đăng ký / Like** | Hoạt cảnh có con trỏ bấm Đăng ký → Like → Chuông (tiếng Việt / English), hoặc ảnh PNG riêng; đổi chữ trên nút, màu nút/chữ/biểu tượng, đặt ở 9 góc hoặc kéo tự do; hiện lặp mỗi N phút, đầu mỗi bài hoặc tại các mốc tự nhập |
| **Chỉnh trực tiếp** | Nhấp vào lớp trên khung preview để chọn, kéo để di chuyển, kéo ô vuông để đổi kích thước, tự bắt dính vào giữa khung (giữ Shift để tắt); mọi màu sắc, cỡ, độ mạnh chỉnh ở bảng bên phải (thông số tỉ lệ hiện theo %, nhấp đúp thanh trượt để về mặc định, các nhóm thuộc tính đóng / mở được). Máy yếu chọn độ nét preview ½ / ¼ để phát mượt (video xuất vẫn đủ nét) |
| **Bố cục** | Hợp cả màn hình laptop: hai cột bên kéo đổi độ rộng, thu gọn được; **F** tập trung preview (ẩn hai cột, thu gọn timeline); timeline tự thấp lại theo màn hình; vạch chia danh sách lớp / bảng thuộc tính; **?** hoặc F1 mở bảng phím tắt; **F11** xem preview toàn màn hình (có thanh tua: bấm / kéo để tua, rê chuột xem thời điểm và tên bài); bật **vùng an toàn YouTube** (menu cạnh độ phân giải) để thấy chỗ tiêu đề, thanh điều khiển của YouTube — hay cột nút của Shorts — sẽ che, tránh đặt chữ và nút Đăng ký ở đó (chỉ hiện khi xem trước). App nhớ bố cục cho lần mở sau |
| **Khác** | Ảnh/logo (cắt tròn, xoay kiểu đĩa than), thanh tiến trình (thanh thẳng hoặc **sóng âm của cả bài**, phần đã phát sáng lên), undo/redo, lưu/mở project, tự lưu phiên làm việc |
| **Xuất video** | MP4 H.264 + AAC, 720p → 4K, Shorts 9:16, 24–60 fps; render song song nhiều luồng; tự dò NVENC / Quick Sync / AMF / VAAPI; xuất thử 15 giây. Video dài: **xuất tiếp khi bị ngắt** (mất điện, lỡ tắt app — lần sau chỉ render phần còn thiếu), giữ máy không ngủ khi đang xuất, tiến độ trên thanh tác vụ, thông báo khi xong, tuỳ chọn **tắt máy khi xuất xong** (60 giây để huỷ) |
| **YouTube** | Sinh timestamp chương (`0:00 Tên bài - Ca sĩ`) để dán vào mô tả |
| **Ngôn ngữ** | Giao diện tiếng Việt / English: nút **VI / EN** trên thanh trên cùng hoặc trong *Cài đặt project*; hộp thoại, thông báo, lỗi đều theo ngôn ngữ đã chọn |

Hình trong preview và video xuất ra do **cùng một engine** vẽ, nên xuất ra đúng như những gì thấy.

## Cài đặt để phát triển

Yêu cầu: Node.js ≥ 20.19 (khuyên dùng 22), Git.

```bash
npm install          # tự tải Electron và FFmpeg cho hệ điều hành đang dùng
npm run dev          # chạy app ở chế độ phát triển
npm run dev:linux    # trên Linux nếu gặp lỗi "SUID sandbox helper"
```

Không cần cài FFmpeg riêng: app dùng bản đi kèm (`ffmpeg-static`). Muốn dùng bản FFmpeg khác thì đặt biến môi trường `PVM_FFMPEG=đường/dẫn/ffmpeg`.

**Giao diện** dựng bằng thư viện [momi-ui](https://github.com/HoangDuong2k/momi-ui) (React + Tailwind CSS v4 + Radix), cài theo tag git trong `package.json`. Theme thương hiệu (graphite tông ấm, màu nhấn hổ phách) đặt trong `src/renderer/src/index.css`; CSS riêng của app (`styles.css`) nằm trong layer `legacy` nên không đè lên component của momi-ui. Muốn sửa momi-ui và thấy ngay trong app: đặt hai repo cạnh nhau, đổi tạm `"momi-ui": "file:../momi-ui"` rồi chạy `npm run dev:lib` trong momi-ui; trước khi merge, ghim lại tag git mới (CI cài từ git).

## Đóng gói bộ cài

| Hệ điều hành | Lệnh (chạy trên chính hệ điều hành đó) | Kết quả trong `release/` |
|---|---|---|
| **Windows** | `npm ci` rồi `npm run dist:win` | `Playlist Video Maker-Setup-x.y.z.exe` (bộ cài) và bản Portable `.exe` |
| **macOS** | `npm ci` rồi `npm run dist:mac` | `Playlist Video Maker-x.y.z-arm64.dmg` (Mac chip Apple M1 trở lên) hoặc `-x64.dmg` (Mac Intel), theo chip của máy build |
| Linux | `npm ci` rồi `npm run dist:linux` | `.AppImage`, `.deb` |

Bản Windows phải build trên Windows, bản Mac phải build trên Mac (hoặc dùng GitHub Actions), vì `npm ci` tải FFmpeg và thư viện vẽ `@napi-rs/canvas` đúng cho hệ điều hành và loại chip của máy build.

**GitHub Actions** (`.github/workflows/build.yml`) chạy trên **máy Windows, Linux và Mac thật** (Mac chip Apple và Mac Intel) mỗi khi push lên `main`, mở pull request, push tag `v*` hoặc bấm *Run workflow*:

1. Kiểm tra kiểu, unit test, build.
2. Chạy e2e: mở app, điều khiển bằng chuột thật và xuất thử video.
3. Đóng gói bộ cài, rồi chạy e2e lần nữa trên chính bản đã đóng gói.

Bộ cài và ảnh chụp các bước kiểm thử nằm trong mục *Artifacts* của lượt chạy.

## Dùng trên Windows

- **Yêu cầu:** Windows 10/11 64-bit. Chỉ cần chạy bộ cài; FFmpeg, font và mọi thư viện đã đóng gói sẵn, không phải cài thêm gì.
- **Bộ cài:** giao diện tiếng Việt, cài cho người dùng hiện tại (không cần quyền Administrator), tạo lối tắt ở Desktop và Start Menu. Bản **Portable** chạy thẳng không cần cài.
- **Cảnh báo SmartScreen:** lần đầu mở, Windows có thể báo *"Windows protected your PC"* vì app chưa được ký số. Bấm *More info → Run anyway*. Muốn hết cảnh báo cần chứng chỉ ký số code (OV/EV hoặc Azure Trusted Signing), cấu hình trong `electron-builder.yml`.
- **Dữ liệu:**
  - Project tự lưu và các mẫu phong cách bạn lưu (thư mục `templates`) ở `%APPDATA%\Playlist Video Maker`.
  - Bộ nhớ đệm âm thanh ở `%LOCALAPPDATA%\PlaylistVideoMaker\Cache`, không nằm trong Roaming. Xem dung lượng, mở thư mục hoặc xoá ở *Cài đặt project → Bộ nhớ đệm âm thanh*. Gỡ app sẽ xoá luôn thư mục này (cập nhật phiên bản thì giữ lại).
- **Card đồ hoạ:** app tự dò và cho chọn NVIDIA (NVENC), Intel (Quick Sync), AMD (AMF) khi xuất video; máy không có thì dùng CPU (x264).
- **File đang mở ở chương trình khác:** nếu file MP4 định ghi đè đang mở trong trình xem video (Windows khoá file), app báo ngay trước khi render thay vì báo lỗi sau khi render xong.

## Dùng trên macOS

- **Yêu cầu:** macOS 12 trở lên. Tải đúng bản theo chip của máy (menu Apple → *Giới thiệu về máy Mac*): chip Apple (M1, M2, M3…) dùng bản **arm64**, chip Intel dùng bản **x64**.
- **Cài đặt:** mở file `.dmg`, kéo *Playlist Video Maker* vào thư mục *Applications*.
- **Lần đầu mở:** app chưa được ký bằng chứng chỉ Apple Developer nên macOS chặn và báo *"Playlist Video Maker" Not Opened*. Bấm *Done*, rồi vào *Cài đặt hệ thống → Quyền riêng tư & Bảo mật*, kéo xuống bấm **Open Anyway** (Vẫn mở) và xác nhận. Những lần sau mở bình thường. Muốn hết cảnh báo cần tài khoản Apple Developer (99 USD/năm) để ký và notarize, cấu hình ở mục `mac` trong `electron-builder.yml`.
- **Phím tắt:** dùng ⌘ thay cho Ctrl (⌘S lưu, ⌘Z / ⇧⌘Z hoàn tác / làm lại, ⌘B tách thanh…), ⌘ + nhấp để chọn nhiều thanh, **⌃⌘F** xem preview toàn màn hình (phím F11 trên Mac dành cho hệ điều hành). Phím delete trên bàn phím Mac xoá mục đang chọn.
- **Xuất nhanh bằng chip đồ hoạ:** chọn bộ mã hoá *Apple VideoToolbox* trong hộp *Xuất video*.
- **Tắt máy khi xuất xong:** lần đầu tích ô này, macOS hỏi cho phép app điều khiển *System Events*, hãy bấm *OK* (đổi lại ở *Quyền riêng tư & Bảo mật → Tự động hoá*).
- **Dữ liệu:** project tự lưu và mẫu phong cách ở `~/Library/Application Support/Playlist Video Maker`, bộ nhớ đệm âm thanh ở `~/Library/Caches/PlaylistVideoMaker`.

## Cách dùng nhanh

1. Kéo thả file nhạc (hoặc cả thư mục) vào cửa sổ. App phân tích âm thanh và ghép bản mix trong nền.
2. Dùng **timeline** ở dưới: thả thêm nhạc, ảnh, video thẳng vào đúng chỗ trên timeline; kéo clip nhạc để đổi thứ tự, kéo mép để cắt; kéo thanh của từng lớp (flicker, cột sóng, chữ…) để chọn lúc nó xuất hiện; kéo các ô đỏ ở hàng "Đăng ký / Like" để đặt thời điểm hiện nút.
3. Chọn nhanh cả bộ nền, cột sóng, chữ, hiệu ứng bằng **Mẫu phong cách** (thanh trên cùng) — nhạc giữ nguyên. Thêm từng thứ từ **Thư viện** bên trái: bấm một mẫu để thêm cho cả video, hoặc kéo thẳng vào timeline để đặt đúng đoạn; ảnh / video nhập vào thẻ *Ảnh/video* rồi kéo vào timeline làm nền cho từng đoạn.
4. Nhấp vào cột sóng, chữ, nút Đăng ký… ngay trên khung preview (hoặc chọn trong danh sách **Lớp hiệu ứng**) rồi kéo để di chuyển, kéo ô vuông ở góc/cạnh để đổi kích thước; màu sắc và các thông số khác chỉnh ở bảng bên phải. Khi đang dừng, lớp đang chọn luôn hiện (kể cả nút Đăng ký ngoài giờ xuất hiện) để dễ canh. Nút **Thêm lớp** cũng thêm được mọi loại hiệu ứng (mỗi loại thêm được nhiều lần, mỗi lớp một khoảng thời gian riêng); thả một ảnh/video vào cửa sổ để đặt làm nền. Chỉnh màu như app ảnh: thẻ **Bộ lọc** của thư viện (hoặc *Thêm lớp → Bộ lọc màu*), kéo *Cường độ*, rồi chọn *Chỉ lọc ảnh nền* hoặc *Lọc cả khung hình*.
5. **Space** (hoặc nhấp đúp lên preview) phát/dừng, **← →** tua 5 giây (Shift: 30 giây), **Home / End** về đầu/cuối, **Ctrl+Z / Ctrl+Y** hoàn tác/làm lại, **Ctrl+S** lưu, **Ctrl+E** xuất; trên timeline: **Ctrl+B** tách thanh tại đầu phát, **Ctrl/Shift + nhấp** hoặc **kéo khung** trên vùng trống để chọn nhiều thanh và clip nhạc, **Ctrl+A** chọn hết, **Esc** bỏ chọn, **Ctrl+C / Ctrl+V** chép – dán, **Ctrl + lăn chuột** để zoom, **Delete** xoá mục đang chọn; **F** tập trung preview, **?** xem toàn bộ phím tắt.
6. **Xuất video** → chọn nơi lưu → *Xuất thử 15 giây* để kiểm tra, rồi *Xuất video*. Để máy xuất video dài qua đêm thì tích *Tắt máy khi xuất xong*. Nếu việc xuất bị ngắt giữa chừng, cứ xuất lại vào đúng file đó: app tự tiếp tục từ chỗ đã dừng (miễn là chưa sửa project).
7. **Timestamp YouTube** (dưới playlist, thẻ *Nhạc*) → Copy → dán vào mô tả video.
8. Làm nhiều video cùng phong cách: xuất xong bấm **Tạo mẫu từ video này**. Video sau chỉ cần *Project mới* → chọn mẫu → chọn nền mới → thêm nhạc.

## Kiến trúc

```
src/
  shared/     Kiểu dữ liệu project, timeline (vị trí từng bài), định dạng file phân tích, font,
              mẫu hiệu ứng / chữ của thư viện (presets.ts), mẫu phong cách (templates.ts)
  engine/     Engine vẽ một frame từ (project, thời điểm t) — dùng chung cho preview và export;
              demoAudio.ts: nhạc giả lập để vẽ ảnh xem trước trong thư viện
  main/       Electron main: phân tích âm thanh (FFT, beat), trộn âm thanh theo đoạn, export song song, IPC,
              templates.ts (mẫu phong cách người dùng lưu trong thư mục dữ liệu của app)
    audio/      analyze.ts (phổ 64 dải, waveform, beat — 60 frame/giây + PCM đã giải mã), mix.ts (đọc đoạn bất kỳ của bản mix)
    export/     exporter.ts (chia đoạn, ghép), worker.ts (render bằng Skia + FFmpeg), encoders.ts
  preload/    Cầu nối an toàn window.api
  renderer/   Giao diện React: thư viện (nhạc, ảnh/video, hiệu ứng, bộ lọc, chữ), preview, timeline,
              lớp hiệu ứng, mẫu phong cách, hộp thoại xuất
scripts/      cli.ts (render không cần giao diện), e2e-smoke.ts, make-test-audio.sh
tests/        Unit test (vitest)
```

- **Phân tích âm thanh**: mỗi bài được giải mã một lần bằng FFmpeg rồi tính phổ, dạng sóng, bass và beat ở 60 frame/giây, đồng thời lưu bản PCM đã giải mã vào cache. Mở lại project hay đổi thứ tự bài không phải phân tích lại. Cache chiếm khoảng 660 MB mỗi giờ nhạc; khi vượt 10 GB, app tự xoá các bài lâu không dùng.
- **Âm thanh preview và export dùng chung một bộ trộn**: đọc thẳng đoạn cần nghe từ PCM trong cache (crossfade, fade đầu/cuối). Preview xin từng đoạn vài giây qua IPC và phát bằng Web Audio, nên sửa trên timeline là có tiếng ngay (đo được khoảng 44 ms với playlist 75 phút). Khi xuất, cùng bộ trộn đó đẩy thẳng PCM vào FFmpeg.
- **Mọi hiệu ứng chỉ phụ thuộc thời điểm t.** Độ mượt và xung beat được tính bằng cách nhìn lại các frame trước, không giữ trạng thái. Nhờ vậy có thể tua tự do, và chia video thành nhiều đoạn render song song mà vẫn khớp từng frame.
- **Xuất video**: video được chia thành các đoạn khoảng 30 giây, tối đa 8 luồng render cùng lúc. Mỗi luồng tự vẽ các frame trong đoạn của mình bằng Skia (`@napi-rs/canvas`) rồi đưa cho FFmpeg mã hóa. Sau cùng, các đoạn được nối lại (`-c copy`) và ghép tiếng AAC. Màu được chuyển theo chuẩn BT.709. Đoạn nào xong mới được đổi tên thành file hoàn chỉnh, thư mục tạm mang "khoá" của mọi thứ ảnh hưởng tới hình (`src/main/export/plan.ts`), nên xuất lại cùng project sẽ dùng lại các đoạn đã có.
- **Đa ngôn ngữ**: câu tiếng Việt trong code là khoá, `tr('…')` tra bản tiếng Anh trong `src/shared/i18n-en.ts`. `tests/i18n.test.ts` kiểm tra không thiếu câu nào, không có câu thừa và giữ đúng các biến `{…}`.
- Tốc độ đo được trên CPU 20 luồng, 1080p30, mã hóa x264, đủ 9 lớp hiệu ứng mặc định: khoảng **3× thời gian thực** (video 1 giờ ≈ 20 phút). Bộ lọc màu chỉ lọc ảnh nền tĩnh (mặc định khi thêm bộ lọc) được lọc sẵn một lần nên tốc độ gần như không đổi. Bộ lọc phủ cả khung hình thì phải lọc từng frame: khoảng 1,75× thời gian thực với "Ấm áp" (1 giờ ≈ 34 phút) và 1,3× với bộ lọc có làm mờ như "Mơ màng" (1 giờ ≈ 45 phút). Phần vẽ hình chạy trên CPU nên tốc độ tăng theo số nhân CPU; bộ mã hóa phần cứng chỉ giảm phần mã hóa.

## Kiểm thử

Các lệnh dưới đây chạy được trên Windows, macOS và Linux; chỉ cần Node.js, không cần cài FFmpeg hay bash.

```bash
npm test                       # unit test: timeline (tách, chọn nhiều, chép/dán, khoá), FFT, beat, lịch CTA, ghép âm thanh bằng FFmpeg thật, bộ lọc màu, xuất tiếp khi bị ngắt, mẫu thư viện / mẫu phong cách, bản dịch tiếng Anh, đường dẫn Windows
npm run typecheck
npm run build && npm run e2e   # mở app thật, nhập nhạc, phát, tua, kéo thả timeline, tách / chọn nhiều / chép dán / khoá, undo, bộ lọc màu, kéo mục thư viện vào timeline, áp / lưu mẫu phong cách, đổi ngôn ngữ, xuất thử video
npm run test-audio             # tạo 3 bài nhạc tổng hợp để thử (test-output/audio)
npm run cli -- render --audio a.mp3 b.mp3 --out video.mp4 [--start 0 --duration 20]
npm run cli -- frame --audio a.mp3 --time 12.5 --out frame.png
```

## Giấy phép bên thứ ba

- Font trong `resources/fonts` (chữ trên video): SIL Open Font License (Be Vietnam Pro, Oswald, Playfair Display, Dancing Script, Pacifico, Lobster, Bungee, JetBrains Mono).
- Font giao diện trong `src/renderer/src/assets/fonts`: Hanken Grotesk và JetBrains Mono, SIL Open Font License (kèm file giấy phép).
- Biểu tượng: Phosphor Icons (MIT License).
- FFmpeg (`ffmpeg-static`) là bản build GPL (kèm libx264). Nếu phân phối thương mại mã nguồn đóng, cần thay bằng bản FFmpeg LGPL và dùng bộ mã hóa phần cứng hoặc OpenH264.
- Nút "Đăng ký" được thiết kế riêng, không dùng logo YouTube. Bản quyền nhạc trong video thuộc trách nhiệm người dùng.

## Chưa làm (lộ trình tiếp theo)

Keyframe, lời bài hát `.lrc`, chuẩn hóa âm lượng −14 LUFS, tách phông xanh cho CTA, GIF/WebM có kênh alpha, hiệu ứng glitch/VHS, bộ lọc từ file LUT `.cube`, xuất thumbnail, render hàng loạt, upload thẳng lên YouTube.
