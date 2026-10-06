import { presetById } from './filterPresets'
import type { Layer, LayerPropsMap, LayerTiming, LayerType, Project } from './types'
import { getLang, tr } from './i18n'

export const FULL_TIMING: LayerTiming = { start: 0, end: null, fadeIn: 0, fadeOut: 0 }

export const LAYER_DEFAULTS: LayerPropsMap = {
  background: {
    mode: 'gradient',
    color: '#141e30',
    color2: '#243b55',
    angle: 135,
    src: '',
    blur: 0,
    dim: 0.25,
    beatZoom: 0.04,
    shake: 0,
    kenBurns: 0.05
  },
  visualizer: {
    style: 'bars',
    x: 0.5,
    y: 0.66,
    width: 0.7,
    height: 0.3,
    radius: 0.16,
    barCount: 64,
    barGap: 0.35,
    rounded: true,
    colorMode: 'gradient',
    color: '#00e5ff',
    color2: '#ff3cac',
    glow: 12,
    lineWidth: 4,
    sensitivity: 1,
    smoothing: 0.6,
    minFreq: 40,
    maxFreq: 12000,
    opacity: 1,
    symmetric: false,
    flip: false,
    centerImage: 'cover',
    centerSrc: '',
    centerBeat: 0.06,
    rotateSpeed: 0,
    ledSegments: 18,
    ledPalette: 'hifi',
    peakHold: true
  },
  progress: {
    style: 'bar',
    waveHeight: 40,
    scope: 'track',
    x: 0.5,
    y: 0.84,
    width: 0.7,
    thickness: 6,
    color: '#ffffff',
    trackColor: 'rgba(255,255,255,0.25)',
    showDot: true,
    showTime: true,
    fontSize: 24,
    textColor: '#ffffff'
  },
  text: {
    template: '{title}',
    font: 'Be Vietnam Pro',
    bold: true,
    size: 64,
    color: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 0,
    shadowColor: 'rgba(0,0,0,0.6)',
    shadowBlur: 12,
    align: 'center',
    x: 0.5,
    y: 0.2,
    maxWidth: 0.85,
    uppercase: false,
    animation: 'fade',
    opacity: 1,
    beatScale: 0,
    flicker: 0
  },
  image: {
    source: 'file',
    src: '',
    x: 0.9,
    y: 0.12,
    width: 0.1,
    opacity: 1,
    circle: false,
    rotateSpeed: 0,
    beatScale: 0,
    borderColor: '#ffffff',
    borderWidth: 0
  },
  cta: {
    preset: 'combo',
    lang: 'vi',
    src: '',
    anchor: 'bottom-right',
    x: 0.8,
    y: 0.9,
    margin: 40,
    scale: 1,
    accent: '#e5202a',
    textColor: '#ffffff',
    buttonColor: '#181818',
    iconColor: '#ffffff',
    activeColor: '#3ea6ff',
    labelSub: '',
    labelDone: '',
    schedule: 'interval',
    firstAt: 10,
    every: 5,
    offset: 5,
    times: '0:10, 10:00, 20:00',
    duration: 6
  },
  flicker: {
    trigger: 'beat',
    intensity: 0.25,
    color: '#ffffff',
    decay: 6,
    blend: 'screen'
  },
  particles: {
    style: 'dust',
    x: 0.5,
    y: 0.5,
    width: 1,
    height: 1,
    count: 80,
    size: 3,
    speed: 1,
    color: '#ffffff',
    opacity: 0.7,
    beatReact: 0.5,
    seed: 7,
    multicolor: false
  },
  vignette: {
    amount: 0.55,
    size: 0.65,
    color: '#000000'
  },
  filter: {
    preset: 'warm',
    intensity: 1,
    ...presetById('warm')!.values
  },
  timer: {
    mode: 'elapsed',
    countdownMin: 25,
    repeat: false,
    clockStart: '21:00',
    hour12: false,
    format: 'auto',
    blink: false,
    style: 'box',
    font: 'JetBrains Mono',
    bold: false,
    size: 48,
    x: 0.95,
    y: 0.09,
    align: 'right',
    color: '#ffffff',
    color2: '#c9c3b8',
    boxColor: '#000000',
    boxOpacity: 0.4,
    glow: 0,
    label: '',
    labelPos: 'above',
    opacity: 1,
    beatScale: 0
  },
  vinyl: {
    x: 0.5,
    y: 0.5,
    size: 0.62,
    rpm: 33.3,
    label: 'cover',
    src: '',
    labelSize: 0.36,
    discColor: '#111111',
    labelColor: '#b5412f',
    sheen: 0.6,
    tonearm: true,
    slowOnChange: true,
    beatScale: 0,
    shadow: 0.5,
    opacity: 1
  },
  nowplaying: {
    x: 0.5,
    y: 0.84,
    width: 620,
    size: 112,
    style: 'glass',
    bgColor: '#000000',
    bgOpacity: 0.35,
    blur: 18,
    radius: 22,
    showCover: true,
    showProgress: true,
    showTime: true,
    label: '',
    font: 'Be Vietnam Pro',
    titleColor: '#ffffff',
    textColor: '#cfc9bf',
    accent: '#ffffff',
    opacity: 1
  },
  tracklist: {
    x: 0.97,
    y: 0.5,
    align: 'right',
    width: 0.28,
    rows: 8,
    fontSize: 26,
    font: 'Be Vietnam Pro',
    style: 'glass',
    bgColor: '#000000',
    bgOpacity: 0.35,
    blur: 16,
    title: '',
    showNumber: true,
    showTime: true,
    showArtist: true,
    color: '#ffffff',
    activeColor: '#ffcf7a',
    dimPlayed: true,
    opacity: 1
  },
  vumeter: {
    x: 0.5,
    y: 0.78,
    size: 380,
    layout: 'stereo',
    style: 'classic',
    faceColor: '#f1dfae',
    needleColor: '#1b1b1b',
    accent: '#d8312b',
    textColor: '#2b2118',
    sensitivity: 1,
    backlight: 0.6,
    label: 'VU',
    opacity: 1
  },
  vhs: {
    intensity: 1,
    chroma: 4,
    scanlines: 0.35,
    noise: 0.35,
    tracking: 0.5,
    soft: 0.5,
    osd: true,
    osdText: 'PLAY',
    dateText: 'SEP. 30 1997',
    showTime: true
  },
  glitch: {
    trigger: 'beat',
    amount: 0.7,
    rgbSplit: 14,
    slices: 10,
    threshold: 0.35,
    blocks: true
  },
  crt: {
    curvature: 0.5,
    scanlines: 0.5,
    mask: 0.35,
    flicker: 0.3,
    vignette: 0.6,
    glow: 0.4,
    bezel: true
  },
  light: {
    style: 'leak',
    x: 0.82,
    y: 0.18,
    color: '#ff8a3d',
    color2: '#ff3d7f',
    intensity: 0.6,
    size: 1,
    speed: 1,
    beatReact: 0.4
  },
  camera: {
    style: 'zoom',
    trigger: 'beat',
    amount: 0.6,
    mirror: 'left',
    segments: 6,
    spin: 2,
    pixel: 28,
    ratio: 2.39,
    barColor: '#000000',
    slideIn: 0.8
  },
  lyrics: {
    style: 'line',
    font: 'Be Vietnam Pro',
    bold: false,
    size: 36,
    color: 'rgba(255,255,255,0.55)',
    activeColor: '#ffffff',
    highlight: 'sweep',
    strokeColor: '#000000',
    strokeWidth: 0,
    shadowColor: 'rgba(0,0,0,0.65)',
    shadowBlur: 10,
    align: 'center',
    x: 0.5,
    y: 0.93,
    maxWidth: 0.8,
    uppercase: false,
    opacity: 1,
    transition: 'slide',
    lead: 0.15,
    hold: 6,
    box: 0,
    boxColor: '#000000',
    beatScale: 0
  }
}

export const LAYER_LABELS: Record<LayerType, string> = {
  background: 'Nền',
  visualizer: 'Cột sóng nhạc',
  progress: 'Thanh tiến trình',
  text: 'Chữ',
  image: 'Ảnh / Logo',
  cta: 'Đăng ký / Like',
  flicker: 'Flicker (nháy sáng)',
  particles: 'Hạt bay (bụi/tuyết)',
  vignette: 'Viền tối (vignette)',
  filter: 'Bộ lọc màu',
  timer: 'Đồng hồ đếm giờ',
  vinyl: 'Đĩa than xoay',
  nowplaying: 'Thẻ đang phát',
  tracklist: 'Danh sách bài',
  vumeter: 'Đồng hồ VU',
  vhs: 'VHS / băng từ',
  glitch: 'Glitch theo beat',
  crt: 'Màn hình CRT',
  light: 'Ánh sáng',
  camera: 'Hiệu ứng khung hình',
  lyrics: 'Lời bài hát'
}

let idCounter = 0
export function newId(prefix = 'id'): string {
  idCounter = (idCounter + 1) % 1e6
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function createLayer<T extends LayerType>(type: T, overrides: Partial<LayerPropsMap[T]> = {}, name?: string): Layer<T> {
  return {
    id: newId('layer'),
    type,
    name: name ?? LAYER_LABELS[type],
    enabled: true,
    timing: { ...FULL_TIMING },
    // Nút Đăng ký mới: chữ trên nút theo ngôn ngữ giao diện (ĐĂNG KÝ / SUBSCRIBE)
    props: { ...structuredClone(LAYER_DEFAULTS[type]), ...(type === 'cta' ? { lang: getLang() } : {}), ...overrides }
  } as Layer<T>
}

export function createDefaultProject(): Project {
  return {
    version: 1,
    name: 'Playlist mới',
    settings: {
      width: 1920,
      height: 1080,
      fps: 30,
      transition: { type: 'crossfade', duration: 3 },
      fadeIn: 1,
      fadeOut: 3
    },
    tracks: [],
    layers: [
      createLayer('background'),
      createLayer('particles'),
      createLayer('visualizer'),
      createLayer('text', { template: '{title}', y: 0.16, size: 72 }, 'Tên bài hát'),
      createLayer('text', { template: '{artist}', y: 0.24, size: 40, bold: false, color: '#d0d8ff' }, 'Ca sĩ'),
      createLayer('progress'),
      createLayer('flicker'),
      createLayer('vignette'),
      createLayer('cta')
    ],
    export: {
      encoder: 'libx264',
      quality: 'balanced',
      audioBitrate: 256,
      outputPath: ''
    },
    library: []
  }
}

/** Bổ sung các field mới (khi mở project cũ) bằng giá trị mặc định. */
export function normalizeProject(p: Project): Project {
  const def = createDefaultProject()
  return {
    ...def,
    ...p,
    settings: { ...def.settings, ...p.settings, transition: { ...def.settings.transition, ...p.settings?.transition } },
    export: { ...def.export, ...p.export },
    tracks: (p.tracks ?? []).map((t) => ({ ...t, trimStart: t.trimStart ?? 0, trimEnd: t.trimEnd ?? 0, album: t.album ?? '', artist: t.artist ?? '' })),
    library: Array.isArray(p.library) ? p.library.filter((x): x is string => typeof x === 'string' && x.length > 0) : [],
    layers: (p.layers ?? [])
      .filter((l) => l && l.type in LAYER_DEFAULTS)
      .map((l) => ({ ...l, timing: { ...FULL_TIMING, ...l.timing }, props: { ...structuredClone(LAYER_DEFAULTS[l.type]), ...l.props } }) as Layer)
  }
}

export const RESOLUTION_PRESETS = [
  { id: '720p', label: '720p HD (1280×720)', width: 1280, height: 720 },
  { id: '1080p', label: '1080p Full HD (1920×1080)', width: 1920, height: 1080 },
  { id: '1440p', label: '1440p 2K (2560×1440)', width: 2560, height: 1440 },
  { id: '2160p', label: '2160p 4K (3840×2160)', width: 3840, height: 2160 },
  { id: 'shorts', label: 'Dọc 1080×1920 (Shorts / TikTok)', width: 1080, height: 1920 },
  { id: 'square', label: 'Vuông 1080×1080', width: 1080, height: 1080 }
]

/** Tên ngắn của độ phân giải theo cách YouTube gọi (cạnh ngắn): "1080p", "1080p dọc", "1080p vuông" */
export function resolutionName(width: number, height: number): string {
  if (width > height) return `${height}p`
  return width < height ? tr('{n}p dọc', { n: width }) : tr('{n}p vuông', { n: width })
}
