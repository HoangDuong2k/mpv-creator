/**
 * Nội dung trang landing, tiếng Việt (mặc định) và tiếng Anh. Chỉ ghi điều app làm được thật (kiểm tra với
 * README / CHANGELOG của app), không bịa số liệu, lời khen hay logo khách hàng.
 * Mỗi phần có một mốc thời gian kiểu chương YouTube ("0:42 Tính năng"), giống timestamp app tạo cho video.
 */
export type Lang = 'vi' | 'en'

export type TemplateId = 'default' | 'lofi' | 'edm' | 'ballad' | 'bolero' | 'relax' | 'minimal'
export const TEMPLATE_IDS: TemplateId[] = ['default', 'lofi', 'edm', 'ballad', 'bolero', 'relax', 'minimal']

export interface Chapter {
  id: string
  time: string
  label: string
}

export interface Copy {
  htmlLang: string
  meta: { title: string; description: string }
  nav: { download: string; otherLang: string; otherLangLabel: string; menu: string }
  chapters: {
    intro: Chapter
    demo: Chapter
    features: Chapter
    styles: Chapter
    how: Chapter
    download: Chapter
    changelog: Chapter
    faq: Chapter
  }
  hero: {
    badge: string
    titleStart: string
    titleHighlight: string
    description: string
    secondary: string
    footnote: string
    shotAlt: string
  }
  download: {
    generic: string
    forWindows: string
    forMac: string
    forLinux: string
    macIntel: string
    otherSystems: string
    title: string
    description: string
    version: (v: string, date: string) => string
    noRelease: string
    allReleases: string
    windows: { name: string; requirement: string; setup: string; portable: string; note: string }
    mac: { name: string; requirement: string; arm64: string; x64: string; note: string }
    linux: { name: string; requirement: string; appimage: string; deb: string; note: string }
  }
  features: {
    title: string
    description: string
    items: Array<{ key: 'effects' | 'chapters' | 'timeline' | 'inspector' | 'export' | 'styles'; title: string; description: string; alt: string }>
  }
  demo: { title: string; description: string; play: string; credit: string; creditLicense: string }
  styles: { title: string; description: string; items: Record<TemplateId, { name: string; description: string }> }
  how: { title: string; description: string; steps: Array<{ title: string; description: string }> }
  changelog: { title: string; description: string; all: string }
  faq: { title: string; description: string; items: Array<{ question: string; answer: string }> }
  cta: { title: string; description: string; github: string }
  footer: {
    description: string
    product: string
    resources: string
    github: string
    releases: string
    changelog: string
    copyright: string
  }
}

const vi: Copy = {
  htmlLang: 'vi',
  meta: {
    title: 'Playlist Video Maker: biến playlist nhạc thành video YouTube',
    description:
      'App miễn phí cho Windows, macOS và Linux: thả nhạc vào, chọn mẫu phong cách, xuất video playlist có cột sóng, hiệu ứng nhảy theo nhạc và timestamp chương YouTube.'
  },
  nav: { download: 'Tải miễn phí', otherLang: '/en/', otherLangLabel: 'English', menu: 'Mở menu' },
  chapters: {
    intro: { id: 'gioi-thieu', time: '0:00', label: 'Giới thiệu' },
    demo: { id: 'video-demo', time: '0:20', label: 'Video demo' },
    features: { id: 'tinh-nang', time: '0:42', label: 'Tính năng' },
    styles: { id: 'mau-phong-cach', time: '1:10', label: 'Mẫu phong cách' },
    how: { id: 'cach-dung', time: '1:36', label: 'Cách dùng' },
    download: { id: 'tai-ve', time: '2:02', label: 'Tải về' },
    changelog: { id: 'co-gi-moi', time: '2:28', label: 'Có gì mới' },
    faq: { id: 'hoi-dap', time: '2:47', label: 'Hỏi đáp' }
  },
  hero: {
    badge: 'v0.2.0',
    titleStart: 'Biến playlist nhạc thành',
    titleHighlight: 'video YouTube',
    description:
      'Thả nhạc vào, chọn một mẫu phong cách, bấm xuất. Cột sóng, tên bài, hiệu ứng nhảy theo nhịp và timestamp chương cho phần mô tả đều có sẵn.',
    secondary: 'Xem cách làm',
    footnote: 'Miễn phí · Không cần tài khoản · Chạy ngay trên máy bạn',
    shotAlt: 'Cửa sổ Playlist Video Maker: playlist ba bài, khung preview có cột sóng neon, timeline và bảng thuộc tính'
  },
  download: {
    generic: 'Tải về',
    forWindows: 'Tải cho Windows',
    forMac: 'Tải cho Mac',
    forLinux: 'Tải cho Linux',
    macIntel: 'Mac chip Intel',
    otherSystems: 'Hệ điều hành khác',
    title: 'Tải Playlist Video Maker',
    description: 'Miễn phí, không cần tài khoản. Chọn bản cho máy của bạn.',
    version: (v, date) => `Phiên bản ${v} · ${date}`,
    noRelease: 'Chưa lấy được thông tin phiên bản. Xem các bản tải trên GitHub.',
    allReleases: 'Tất cả phiên bản trên GitHub',
    windows: {
      name: 'Windows',
      requirement: 'Windows 10, 11 (64-bit)',
      setup: 'Bộ cài (.exe)',
      portable: 'Bản Portable, không cần cài',
      note: 'Nếu SmartScreen chặn: bấm "More info" rồi "Run anyway".'
    },
    mac: {
      name: 'macOS',
      requirement: 'macOS 12 trở lên',
      arm64: 'Mac chip Apple (M1 trở lên)',
      x64: 'Mac chip Intel',
      note: 'Lần đầu mở: vào Cài đặt hệ thống → Quyền riêng tư & Bảo mật, bấm "Vẫn mở".'
    },
    linux: {
      name: 'Linux',
      requirement: '64-bit',
      appimage: 'AppImage (mọi bản Linux)',
      deb: '.deb (Ubuntu, Debian)',
      note: 'AppImage: cho phép chạy (chmod +x) rồi mở.'
    }
  },
  features: {
    title: 'Mọi thứ một video playlist cần',
    description: 'Từ hiệu ứng theo nhạc đến timestamp cho phần mô tả, làm trong một app, không cần phần mềm dựng phim.',
    items: [
      {
        key: 'effects',
        title: 'Hiệu ứng nhảy theo nhạc',
        description:
          'Cột sóng, sóng tròn, đĩa than, hạt bay, ánh sáng, VHS, glitch… phản ứng theo bass và nhịp của từng bài. Bấm một mẫu trong thư viện để xem trước, nhấn + để thêm.',
        alt: 'Thư viện hiệu ứng của app'
      },
      {
        key: 'chapters',
        title: 'Timestamp chương YouTube',
        description: 'Danh sách "0:00 Tên bài - Ca sĩ" tạo sẵn theo đúng thứ tự trong video. Chép một lần, dán vào mô tả.',
        alt: 'Hộp Timestamp YouTube'
      },
      {
        key: 'timeline',
        title: 'Timeline như app dựng phim',
        description:
          'Kéo để đổi thứ tự bài và cắt đầu cuối, chọn lúc từng hiệu ứng xuất hiện, tách đoạn, chép dán, khoá lớp. Nút Đăng ký / Like hiện đúng lúc bạn muốn.',
        alt: 'Timeline của app với các lớp hiệu ứng và ba clip nhạc'
      },
      {
        key: 'inspector',
        title: 'Chỉnh từng chi tiết',
        description: 'Kéo thẳng trên khung preview để đổi vị trí, cỡ. Màu, độ nhạy với nhạc, thời gian hiện ẩn chỉnh ở bảng thuộc tính.',
        alt: 'Bảng thuộc tính của một lớp'
      },
      {
        key: 'export',
        title: 'Xuất nhanh bằng card đồ hoạ',
        description: 'MP4 H.264 tới 4K. Dùng NVIDIA, Intel, AMD hoặc chip Apple để xuất nhanh hơn; có thể hẹn tắt máy khi xong.',
        alt: 'Hộp Xuất video'
      },
      {
        key: 'styles',
        title: '7 mẫu phong cách',
        description: 'Mặc định, Lofi, EDM, Ballad, Bolero, Thư giãn, Tối giản. Đổi cả bộ nền, cột sóng, chữ bằng một cú bấm, nhạc giữ nguyên.',
        alt: 'Hộp Mẫu phong cách với 7 mẫu'
      }
    ]
  },
  demo: {
    title: 'Video này do chính app dựng',
    description: 'Ba bài nhạc, mẫu EDM, không chỉnh tay gì thêm: cột sóng, tên bài, thanh tiến trình đổi theo từng bài.',
    play: 'Phát video demo (có tiếng)',
    credit: 'Nhạc: "Voxel Revolution", "Local Forecast - Elevator", "Wallpaper" của Kevin MacLeod (incompetech.com)',
    creditLicense: 'giấy phép CC BY 4.0'
  },
  styles: {
    title: '7 mẫu phong cách có sẵn',
    description: 'Cùng một bài nhạc, bảy kiểu video. Bấm vào ảnh để xem lớn.',
    items: {
      default: { name: 'Mặc định', description: 'Cột sóng gradient, tên bài, hạt bụi bay, nút Đăng ký' },
      lofi: { name: 'Lofi', description: 'Màu ấm nhạt kiểu phim, sóng âm mảnh, chữ viết tay' },
      edm: { name: 'EDM', description: 'Neon đối xứng, nền đập mạnh theo bass, nháy sáng theo beat' },
      ballad: { name: 'Ballad', description: 'Vòng sóng quanh ảnh bìa, đốm sáng mờ, chữ cổ điển' },
      bolero: { name: 'Bolero', description: 'Tông vàng cổ điển, nhiễu phim cũ, cột sóng ánh kim' },
      relax: { name: 'Thư giãn', description: 'Xanh dịu, sóng mềm ở chân khung hình, chữ mảnh' },
      minimal: { name: 'Tối giản', description: 'Nền đen, cột sóng trắng gọn, không hiệu ứng thừa' }
    }
  },
  how: {
    title: 'Ba bước là có video',
    description: 'Không cần biết dựng phim.',
    steps: [
      {
        title: 'Thả nhạc vào',
        description: 'Kéo file nhạc hoặc cả thư mục vào cửa sổ. App đọc tên bài, ca sĩ, ảnh bìa và phân tích nhịp trong nền.'
      },
      {
        title: 'Chọn mẫu phong cách',
        description: 'Áp một mẫu có sẵn rồi chỉnh màu, chữ, hiệu ứng theo ý bạn. Bấm Space là xem ngay.'
      },
      {
        title: 'Xuất video và timestamp',
        description: 'Chọn độ phân giải, bấm Xuất. Xong thì chép timestamp chương dán vào mô tả YouTube.'
      }
    ]
  },
  changelog: {
    title: 'Có gì mới',
    description: 'Mỗi bản phát hành đều ghi rõ thay đổi.',
    all: 'Xem mọi phiên bản trên GitHub'
  },
  faq: {
    title: 'Câu hỏi thường gặp',
    description: 'Chưa thấy câu trả lời? Hỏi trên GitHub.',
    items: [
      {
        question: 'Có miễn phí không?',
        answer: 'Có. Tải về và dùng không mất phí, không cần tài khoản, không chèn logo vào video của bạn.'
      },
      {
        question: 'Có cần mạng Internet không?',
        answer: 'Không. Mọi việc chạy ngay trên máy bạn, nhạc và video không bị tải lên đâu cả.'
      },
      {
        question: 'Bản quyền nhạc thì sao?',
        answer:
          'App không kiểm tra bản quyền. Chỉ dùng nhạc bạn sở hữu hoặc được phép đăng, nếu không YouTube có thể chặn video hoặc tắt kiếm tiền.'
      },
      {
        question: 'Vì sao Windows hoặc macOS cảnh báo khi mở app?',
        answer:
          'App chưa được ký số (chứng chỉ ký số tốn phí hằng năm). Windows: bấm "More info" rồi "Run anyway". macOS: vào Cài đặt hệ thống → Quyền riêng tư & Bảo mật, bấm "Vẫn mở". Chỉ cần làm một lần.'
      },
      {
        question: 'Máy cần cấu hình thế nào?',
        answer:
          'Windows 10 / 11 64-bit, macOS 12 trở lên hoặc Linux 64-bit. Video dài xuất nhanh hơn nhiều nếu máy có card đồ hoạ NVIDIA, Intel, AMD hoặc chip Apple.'
      },
      {
        question: 'Có giao diện tiếng Anh không?',
        answer: 'Có. Đổi VI / EN ở góc trên bên phải của app.'
      }
    ]
  },
  cta: {
    title: 'Làm video playlist đầu tiên ngay hôm nay',
    description: 'Tải về, thả nhạc vào và xem kết quả trong vài cú bấm.',
    github: 'Xem trên GitHub'
  },
  footer: {
    description: 'App làm video playlist nhạc cho YouTube.',
    product: 'Sản phẩm',
    resources: 'Tài nguyên',
    github: 'Mã nguồn trên GitHub',
    releases: 'Các phiên bản',
    changelog: 'Nhật ký thay đổi',
    copyright: '© 2026 Hoang Duong'
  }
}

const en: Copy = {
  htmlLang: 'en',
  meta: {
    title: 'Playlist Video Maker: turn a music playlist into a YouTube video',
    description:
      'A free app for Windows, macOS and Linux: drop in your music, pick a style, and export a playlist video with audio-reactive visualizers, effects and YouTube chapter timestamps.'
  },
  nav: { download: 'Free download', otherLang: '/', otherLangLabel: 'Tiếng Việt', menu: 'Open menu' },
  chapters: {
    intro: { id: 'intro', time: '0:00', label: 'Intro' },
    demo: { id: 'demo-video', time: '0:20', label: 'Demo video' },
    features: { id: 'features', time: '0:42', label: 'Features' },
    styles: { id: 'styles', time: '1:10', label: 'Styles' },
    how: { id: 'how-it-works', time: '1:36', label: 'How it works' },
    download: { id: 'download', time: '2:02', label: 'Download' },
    changelog: { id: 'whats-new', time: '2:28', label: "What's new" },
    faq: { id: 'faq', time: '2:47', label: 'FAQ' }
  },
  hero: {
    badge: 'v0.2.0',
    titleStart: 'Turn a music playlist into a',
    titleHighlight: 'YouTube video',
    description:
      'Drop in your music, pick a style, hit export. Visualizers, song titles, beat-reactive effects and chapter timestamps for the description come built in.',
    secondary: 'See how it works',
    footnote: 'Free · No account · Runs on your computer',
    shotAlt: 'Playlist Video Maker window: a three-song playlist, a preview with a neon visualizer, the timeline and the properties panel'
  },
  download: {
    generic: 'Download',
    forWindows: 'Download for Windows',
    forMac: 'Download for Mac',
    forLinux: 'Download for Linux',
    macIntel: 'Intel Mac',
    otherSystems: 'Other systems',
    title: 'Download Playlist Video Maker',
    description: 'Free, no account needed. Pick the build for your computer.',
    version: (v, date) => `Version ${v} · ${date}`,
    noRelease: 'Could not load the release details. See the downloads on GitHub.',
    allReleases: 'All releases on GitHub',
    windows: {
      name: 'Windows',
      requirement: 'Windows 10, 11 (64-bit)',
      setup: 'Installer (.exe)',
      portable: 'Portable, no install',
      note: 'If SmartScreen blocks it: click "More info", then "Run anyway".'
    },
    mac: {
      name: 'macOS',
      requirement: 'macOS 12 or later',
      arm64: 'Apple silicon (M1 or later)',
      x64: 'Intel Mac',
      note: 'First launch: open System Settings → Privacy & Security and click "Open Anyway".'
    },
    linux: {
      name: 'Linux',
      requirement: '64-bit',
      appimage: 'AppImage (any distro)',
      deb: '.deb (Ubuntu, Debian)',
      note: 'AppImage: make it executable (chmod +x), then run it.'
    }
  },
  features: {
    title: 'Everything a playlist video needs',
    description: 'From music-reactive effects to description timestamps, in one app. No video editor required.',
    items: [
      {
        key: 'effects',
        title: 'Effects that move with the music',
        description:
          'Bar and circle visualizers, vinyl, particles, light, VHS, glitch… reacting to the bass and beat of each song. Click an effect in the library to preview it, press + to add it.',
        alt: 'The effects library'
      },
      {
        key: 'chapters',
        title: 'YouTube chapter timestamps',
        description: 'A ready-made "0:00 Title - Artist" list in video order. Copy it once, paste it into the description.',
        alt: 'The YouTube timestamps dialog'
      },
      {
        key: 'timeline',
        title: 'A real editing timeline',
        description:
          'Drag to reorder and trim songs, choose when each effect appears, split, copy and paste, lock layers. Subscribe / Like buttons show up exactly when you want.',
        alt: 'The timeline with effect layers and three music clips'
      },
      {
        key: 'inspector',
        title: 'Fine-tune every detail',
        description: 'Drag right on the preview to move and resize. Colours, music sensitivity and fades live in the properties panel.',
        alt: 'The properties panel of a layer'
      },
      {
        key: 'export',
        title: 'Fast, GPU-accelerated export',
        description: 'H.264 MP4 up to 4K. Use NVIDIA, Intel, AMD or Apple silicon to export faster, and shut down when it is done.',
        alt: 'The export dialog'
      },
      {
        key: 'styles',
        title: '7 style templates',
        description: 'Default, Lofi, EDM, Ballad, Bolero, Relax, Minimal. Swap the background, visualizer and text in one click, your music stays.',
        alt: 'The style templates dialog with 7 templates'
      }
    ]
  },
  demo: {
    title: 'This video was made by the app',
    description: 'Three songs, the EDM style, no manual tweaks: the visualizer, song title and progress bar follow each song.',
    play: 'Play the demo video (with sound)',
    credit: 'Music: "Voxel Revolution", "Local Forecast - Elevator", "Wallpaper" by Kevin MacLeod (incompetech.com)',
    creditLicense: 'licensed under CC BY 4.0'
  },
  styles: {
    title: '7 ready-made styles',
    description: 'One song, seven looks. Click an image to see it larger.',
    items: {
      default: { name: 'Default', description: 'Gradient bars, song title, floating dust, Subscribe button' },
      lofi: { name: 'Lofi', description: 'Soft warm film look, thin waveform, handwritten title' },
      edm: { name: 'EDM', description: 'Neon mirrored bars, background pumping with the bass, flashes on the beat' },
      ballad: { name: 'Ballad', description: 'Circular bars around the cover, soft bokeh, classic serif text' },
      bolero: { name: 'Bolero', description: 'Vintage golden tones, old film flicker, golden bars' },
      relax: { name: 'Relax', description: 'Soft teal, a gentle wave along the bottom, light text' },
      minimal: { name: 'Minimal', description: 'Black background, clean white bars, no extra effects' }
    }
  },
  how: {
    title: 'Three steps to a video',
    description: 'No editing experience needed.',
    steps: [
      {
        title: 'Drop in your music',
        description: 'Drag files or a whole folder into the window. The app reads titles, artists and cover art, and analyses the beat in the background.'
      },
      {
        title: 'Pick a style',
        description: 'Apply a template, then adjust colours, text and effects. Press Space to preview instantly.'
      },
      {
        title: 'Export the video and timestamps',
        description: 'Choose a resolution and hit Export. Then copy the chapter timestamps into your YouTube description.'
      }
    ]
  },
  changelog: {
    title: "What's new",
    description: 'Every release lists what changed.',
    all: 'See every release on GitHub'
  },
  faq: {
    title: 'Frequently asked questions',
    description: 'Still have a question? Ask on GitHub.',
    items: [
      { question: 'Is it free?', answer: 'Yes. Download and use it at no cost, with no account and no watermark on your videos.' },
      { question: 'Does it need an internet connection?', answer: 'No. Everything runs on your computer; your music and videos are never uploaded.' },
      {
        question: 'What about music copyright?',
        answer: 'The app does not check copyright. Only use music you own or are allowed to publish, or YouTube may block or demonetise the video.'
      },
      {
        question: 'Why does Windows or macOS warn me when I open it?',
        answer:
          'The app is not code-signed yet (signing certificates cost a yearly fee). Windows: click "More info", then "Run anyway". macOS: open System Settings → Privacy & Security and click "Open Anyway". You only need to do this once.'
      },
      {
        question: 'What are the system requirements?',
        answer:
          'Windows 10 / 11 64-bit, macOS 12 or later, or 64-bit Linux. Long videos export much faster with an NVIDIA, Intel or AMD GPU, or Apple silicon.'
      },
      { question: 'Is the interface available in Vietnamese and English?', answer: 'Yes. Switch VI / EN in the top right corner of the app.' }
    ]
  },
  cta: {
    title: 'Make your first playlist video today',
    description: 'Download, drop in your music and see the result in a few clicks.',
    github: 'View on GitHub'
  },
  footer: {
    description: 'Make music playlist videos for YouTube.',
    product: 'Product',
    resources: 'Resources',
    github: 'Source on GitHub',
    releases: 'Releases',
    changelog: 'Changelog',
    copyright: '© 2026 Hoang Duong'
  }
}

export const COPY: Record<Lang, Copy> = { vi, en }

export const REPO_URL = 'https://github.com/HoangDuong2k/mpv-creator'
