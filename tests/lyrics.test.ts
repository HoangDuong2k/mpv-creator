import { join } from 'path'
import { createCanvas } from '@napi-rs/canvas'
import { TimestampFormat } from 'music-metadata'
import { describe, expect, it } from 'vitest'
import { AudioSampler, Renderer } from '../src/engine'
import { createDemoFeatures, DEMO_KEY } from '../src/engine/demoAudio'
import { NodeAssets, registerFonts } from '../src/main/export/nodeAssets'
import { lyricsFromTags } from '../src/main/media'
import { createDefaultProject, createLayer } from '../src/shared/defaults'
import { lineAt, looksLikeLrc, nudgeLine, parseLrc, parseLyricsText, parsePlainLyrics, remapLyrics, setLineTime, snapToBeat, timedLines, toLrc, wordTimings } from '../src/shared/lyrics'
import { freeLyricsY } from '../src/renderer/src/lyricsPlacement'
import { buildTimeline } from '../src/shared/timeline'
import type { Layer, LyricsProps, Project, TrackLyrics } from '../src/shared/types'
import { track } from './helpers'

describe('đọc / ghi LRC', () => {
  it('đọc mốc [mm:ss.xx], nhiều mốc một dòng (điệp khúc lặp), sắp theo thời gian', () => {
    const l = parseLrc('[ti:Bài hát]\n[00:12.50]Câu một\n[00:20.00][01:05.25]Điệp khúc\n  [00:15.3]Câu hai\n')
    expect(l.lines.map((x) => [x.t, x.text])).toEqual([
      [12.5, 'Câu một'],
      [15.3, 'Câu hai'],
      [20, 'Điệp khúc'],
      [65.25, 'Điệp khúc']
    ])
    expect(l.offset).toBe(0)
  })
  it('dòng chỉ có mốc là chỗ hết dòng trước; thẻ [offset] đổi sang lệch cả bài', () => {
    const l = parseLrc('[offset:+500]\n[00:10.00]Một\n[00:13.00]\n[00:30.00]Hai')
    expect(l.lines).toEqual([
      { t: 10, end: 13, text: 'Một' },
      { t: 30, text: 'Hai' }
    ])
    // LRC: offset dương = lời hiện sớm hơn; trong app lệch dương = muộn hơn
    expect(l.offset).toBeCloseTo(-0.5)
  })
  it('LRC mở rộng: thời gian từng từ', () => {
    const l = parseLrc('[00:05.00]<00:05.00>Nắng <00:05.40>ấm <00:05.90>xa <00:06.30>dần')
    expect(l.lines[0].text).toBe('Nắng ấm xa dần')
    expect(l.lines[0].words?.map((w) => [w.t, w.text])).toEqual([
      [5, 'Nắng'],
      [5.4, 'ấm'],
      [5.9, 'xa'],
      [6.3, 'dần']
    ])
  })
  it('ghi rồi đọc lại giữ nguyên (đã cộng lệch cả bài), dòng chưa đồng bộ bị bỏ', () => {
    const lyrics: TrackLyrics = {
      lines: [
        { t: 61.5, end: 64, text: 'Một' },
        { t: null, text: 'Chưa đồng bộ' },
        { t: 70, text: 'Hai', words: [{ t: 70, text: 'Hai' }] }
      ],
      offset: 0.25,
      source: 'manual'
    }
    const lrc = toLrc(lyrics, { title: 'T', artist: 'A' })
    expect(lrc).toContain('[01:01.75]Một')
    expect(lrc).toContain('[01:04.25]\n')
    expect(lrc).not.toContain('Chưa đồng bộ')
    const back = parseLrc(lrc)
    expect(back.lines.map((x) => [x.t, x.text])).toEqual([
      [61.75, 'Một'],
      [70.25, 'Hai']
    ])
  })
  it('nhận ra LRC hay lời thường; lời thường thành các dòng chưa đồng bộ', () => {
    expect(looksLikeLrc('[00:01.00]a')).toBe(true)
    expect(looksLikeLrc('Câu một\nCâu hai')).toBe(false)
    expect(parsePlainLyrics('  Câu một \n\n Câu   hai\n').lines).toEqual([
      { t: null, text: 'Câu một' },
      { t: null, text: 'Câu hai' }
    ])
    expect(parseLyricsText('[00:02.00]x').lines[0].t).toBe(2)
  })
})

describe('dòng đang hát', () => {
  const lyrics: TrackLyrics = {
    lines: [
      { t: 10, text: 'Một' },
      { t: 14, text: 'Hai' },
      { t: null, text: 'Chưa đồng bộ' },
      { t: 40, end: 43, text: 'Ba' }
    ],
    offset: 0.5,
    source: 'manual'
  }
  const lines = timedLines(lyrics, 6)
  it('mỗi dòng tới lúc dòng sau bắt đầu, dòng sau đoạn dạo dài chỉ giữ tối đa `hold` giây', () => {
    expect(lines.map((l) => [l.start, l.end])).toEqual([
      [10.5, 14.5],
      [14.5, 20.5],
      [40.5, 43.5]
    ])
  })
  it('tìm dòng theo thời gian file nhạc, hiện sớm `lead` giây; ngoài các dòng thì không có', () => {
    expect(lineAt(lines, 5)).toBeNull()
    expect(lineAt(lines, 10.4)).toBeNull()
    expect(lineAt(lines, 10.4, 0.2)?.line.text).toBe('Một')
    expect(lineAt(lines, 14.6)?.line.text).toBe('Hai')
    expect(lineAt(lines, 25)).toBeNull()
    expect(lineAt(lines, 43)?.line.text).toBe('Ba')
    expect(lineAt(lines, 44)).toBeNull()
  })
  it('chia thời gian dòng cho các từ: tăng dần, trong khoảng của dòng', () => {
    const w = wordTimings(lines[0], lyrics.offset)
    expect(w.words).toEqual(['Một'])
    const long = timedLines({ lines: [{ t: 0, text: 'Nắng ấm xa dần rồi' }, { t: 4, text: 'x' }], offset: 0, source: 'manual' }, 6)
    const ww = wordTimings(long[0], 0)
    expect(ww.words).toHaveLength(5)
    for (let i = 1; i < ww.starts.length; i++) expect(ww.starts[i]).toBeGreaterThan(ww.starts[i - 1])
    expect(ww.starts[0]).toBe(0)
    expect(ww.end).toBeLessThanOrEqual(4)
  })
  it('có thời gian từng từ thì dùng đúng thời gian đó', () => {
    const withWords = timedLines({ lines: [{ t: 5, text: 'a b', words: [{ t: 5, text: 'a' }, { t: 6, text: 'b' }] }], offset: 1, source: 'ai' }, 6)
    const w = wordTimings(withWords[0], 1)
    expect(w.starts).toEqual([6, 7])
  })
  it('bắt dính beat gần nhất trong ±0,12 giây', () => {
    expect(snapToBeat(10.05, [9.5, 10, 10.5])).toBe(10)
    expect(snapToBeat(10.3, [9.5, 10, 10.5])).toBe(10.3)
  })
})

describe('lời nhúng trong tag file nhạc', () => {
  it('ưu tiên lời đã đồng bộ (ms), không có thì lời thường hoặc nội dung LRC', () => {
    const synced = lyricsFromTags([
      { contentType: 1, timeStampFormat: TimestampFormat.milliseconds, syncText: [{ timestamp: 1500, text: 'Một' }, { timestamp: 4200, text: ' Hai ' }] }
    ] as never)
    expect(synced?.lines).toEqual([
      { t: 1.5, text: 'Một' },
      { t: 4.2, text: 'Hai' }
    ])
    expect(synced?.source).toBe('embedded')
    const plain = lyricsFromTags([{ contentType: 1, timeStampFormat: TimestampFormat.notSynchronized, syncText: [], text: 'Câu một\nCâu hai' }] as never)
    expect(plain?.lines.map((l) => l.t)).toEqual([null, null])
    const lrc = lyricsFromTags([{ contentType: 1, timeStampFormat: 0, syncText: [], text: '[00:03.00]Ba' }] as never)
    expect(lrc?.lines[0]).toEqual({ t: 3, text: 'Ba' })
    expect(lyricsFromTags(undefined)).toBeNull()
  })
})

describe('lớp lời bài hát vẽ bằng Skia (như khi xuất video)', () => {
  registerFonts(join(__dirname, '..', 'resources', 'fonts'))
  const W = 640
  const H = 360
  const demo = createDemoFeatures(12)
  const lyrics: TrackLyrics = {
    lines: [
      { t: 1, text: 'Nắng ấm xa dần rồi' },
      { t: 5, text: 'Câu thứ hai' }
    ],
    offset: 0,
    source: 'manual'
  }
  const layer = (props: Partial<LyricsProps> = {}): Layer => ({ ...createLayer('lyrics', { size: 60, y: 0.5, color: '#404040', activeColor: '#ffffff', shadowBlur: 0, ...props }), id: 'lyr' }) as Layer

  function render(layers: Layer[], t: number, trimStart = 0, withLyrics = true): Uint8ClampedArray {
    const project: Project = {
      ...createDefaultProject(),
      settings: { ...createDefaultProject().settings, width: W, height: H, transition: { type: 'none', duration: 0 } },
      tracks: [track('a', 12, { analysisKey: DEMO_KEY, trimStart, ...(withLyrics ? { lyrics } : {}) })],
      layers
    }
    const tl = buildTimeline(project.tracks, project.settings)
    const canvas = createCanvas(W, H)
    const ctx = canvas.getContext('2d')
    new Renderer(new NodeAssets()).render({ ctx: ctx as unknown as CanvasRenderingContext2D, project, timeline: tl, audio: new AudioSampler(tl, (k) => (k === DEMO_KEY ? demo : undefined)), t })
    return ctx.getImageData(0, 0, W, H).data
  }
  /** Số điểm ảnh sáng (chữ đã hát, trắng) và mờ (chữ chưa hát, xám) trong dải giữa khung hình */
  function ink(px: Uint8ClampedArray): { bright: number; dim: number; brightRight: number } {
    let bright = 0
    let dim = 0
    let brightRight = 0
    for (let y = H / 2 - 30; y < H / 2 + 30; y++)
      for (let x = 0; x < W; x++) {
        const v = px[(y * W + x) * 4]
        if (v > 200) {
          bright++
          if (x > W * 0.62) brightRight++
        } else if (v > 45 && v < 90) dim++
      }
    return { bright, dim, brightRight }
  }

  it('chưa tới lời: không vẽ gì; đang hát: chữ sáng dần từ trái sang', () => {
    expect(ink(render([layer()], 0.5)).bright + ink(render([layer()], 0.5)).dim).toBe(0)
    const start = ink(render([layer()], 1.4))
    const later = ink(render([layer()], 3.2))
    expect(start.dim).toBeGreaterThan(200)
    expect(later.bright).toBeGreaterThan(start.bright)
    // Đầu câu: phần bên phải chưa sáng
    expect(start.brightRight).toBe(0)
  })
  it('không tô màu: cả dòng một màu', () => {
    const px = ink(render([layer({ highlight: 'none', color: '#ffffff' })], 1.4))
    expect(px.bright).toBeGreaterThan(300)
    expect(px.dim).toBeLessThan(px.bright / 4)
  })
  it('cắt đầu bài: lời vẫn khớp với file nhạc gốc', () => {
    // Cắt 2 giây đầu: câu hai (5 giây trong file) hát lúc 3 giây trên timeline
    const before = ink(render([layer({ highlight: 'none', color: '#ffffff' })], 2.9, 2))
    const after = ink(render([layer({ highlight: 'none', color: '#ffffff' })], 3.6, 2))
    expect(before.bright).toBeGreaterThan(0)
    expect(after.bright).toBeGreaterThan(0)
    expect(after.bright).not.toBe(before.bright)
  })
  it('bài không có lời: không vẽ; lớp đang chỉnh thì hiện chữ mẫu để canh vị trí', () => {
    const none = render([layer({ highlight: 'none', color: '#ffffff' })], 3, 0, false)
    expect(ink(none).bright).toBe(0)
    const project: Project = {
      ...createDefaultProject(),
      settings: { ...createDefaultProject().settings, width: W, height: H },
      tracks: [track('a', 12, { analysisKey: DEMO_KEY })],
      layers: [layer({ highlight: 'none', color: '#ffffff' })]
    }
    const tl = buildTimeline(project.tracks, project.settings)
    const canvas = createCanvas(W, H)
    const ctx = canvas.getContext('2d')
    const r = new Renderer(new NodeAssets())
    r.render({ ctx: ctx as unknown as CanvasRenderingContext2D, project, timeline: tl, audio: new AudioSampler(tl, () => demo), t: 3, editLayerId: 'lyr' })
    expect(ink(ctx.getImageData(0, 0, W, H).data).bright).toBeGreaterThan(200)
    expect(r.bounds.get('lyr')?.w).toBeGreaterThan(100)
  })
})

describe('soạn và đồng bộ lời', () => {
  const base: TrackLyrics = {
    lines: [
      { t: 1, text: 'Một' },
      { t: 2, text: 'Hai', words: [{ t: 2, text: 'Hai' }] },
      { t: 3, text: 'Ba' }
    ],
    offset: 0.5,
    source: 'lrc-file'
  }
  it('soạn lại: dòng giữ nguyên chữ giữ nguyên mốc, dòng mới / đã sửa chưa đồng bộ', () => {
    const r = remapLyrics(base, 'Một\nMới thêm\nHai\nBa sửa')
    expect(r.lines.map((l) => [l.text, l.t])).toEqual([
      ['Một', 1],
      ['Mới thêm', null],
      ['Hai', 2],
      ['Ba sửa', null]
    ])
    expect(r.lines[2].words).toHaveLength(1)
    expect(r.offset).toBe(0.5)
    expect(remapLyrics(undefined, 'a\nb').lines.every((l) => l.t === null)).toBe(true)
  })
  it('chốt mốc làm tròn 1/100 giây, bỏ thời gian từ cũ; xoá mốc; nhích cả dòng', () => {
    const s = setLineTime(base, 1, 2.3456)
    expect(s.lines[1]).toEqual({ t: 2.35, text: 'Hai' })
    expect(setLineTime(base, 0, null).lines[0].t).toBeNull()
    const n = nudgeLine(base, 1, -0.05)
    expect(n.lines[1].t).toBeCloseTo(1.95)
    expect(n.lines[1].words?.[0].t).toBeCloseTo(1.95)
    expect(nudgeLine(base, 0, -5).lines[0].t).toBe(0)
  })
})

describe('chỗ đặt lớp lời khi thêm vào', () => {
  const L = (id: string, type: Layer['type']): Layer => ({ ...createLayer(type), id }) as Layer
  it('tránh dải đã có lớp khác (thanh tiến trình sát chân khung), lớp phủ cả khung không tính', () => {
    const layers = [L('bg', 'background'), L('prog', 'progress'), L('title', 'text')]
    expect(freeLyricsY(layers, null, 1920, 1080)).toBe(0.93)
    const bounds = new Map([
      ['bg', { x: 0, y: 0, w: 1920, h: 1080 }],
      ['prog', { x: 400, y: 0.88 * 1080, w: 1100, h: 60 }],
      ['title', { x: 600, y: 0.12 * 1080, w: 700, h: 80 }]
    ])
    // 0,93 và 0,88 đụng thanh tiến trình; 0,07 trống (tên bài ở 0,12–0,19)
    expect(freeLyricsY(layers, bounds, 1920, 1080)).toBe(0.07)
  })
})
