import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AudioSampler } from '../src/engine/audio'
import { createDemoFeatures, DEMO_KEY } from '../src/engine/demoAudio'
import { TemplateStore, parseTemplate } from '../src/main/templates'
import { FIELDS } from '../src/renderer/src/fields'
import { useStore } from '../src/renderer/src/store'
import { createDefaultProject, createLayer, FULL_TIMING, LAYER_DEFAULTS, normalizeProject } from '../src/shared/defaults'
import { BAND_COUNT, decodeFeatures, encodeFeatures, FEATURE_RATE, OFF_BEAT, STRIDE } from '../src/shared/featureFormat'
import { FILTER_PRESETS } from '../src/shared/filterPresets'
import { setLang } from '../src/shared/i18n'
import { EFFECT_GROUPS, findPreset, LYRIC_PRESETS, TEXT_PRESETS } from '../src/shared/presets'
import { applyTemplate, builtinTemplates, isTemplateId, planTemplate, projectFromTemplate, templateFromProject } from '../src/shared/templates'
import { buildTimeline } from '../src/shared/timeline'
import type { Layer, LayerType, Project } from '../src/shared/types'
import { track } from './helpers'

/** Thuộc tính của lớp hợp lệ: có trong mặc định của loại lớp, giá trị chọn (kiểu cột sóng, font…) nằm trong danh sách */
function invalidProps(type: LayerType, props: Record<string, unknown>): string[] {
  const bad: string[] = []
  const defaults = LAYER_DEFAULTS[type] as unknown as Record<string, unknown>
  for (const [k, v] of Object.entries(props)) {
    if (!(k in defaults)) bad.push(`${type}.${k}: không có thuộc tính này`)
    else if (typeof v !== typeof defaults[k]) bad.push(`${type}.${k}: sai kiểu (${typeof v})`)
    const field = FIELDS[type].find((f) => 'key' in f && f.key === k)
    if (field?.kind === 'select' && !field.options.some(([value]) => value === v)) bad.push(`${type}.${k}: giá trị lạ "${String(v)}"`)
  }
  return bad
}

describe('thư viện: mẫu hiệu ứng và chữ mẫu', () => {
  const all = [...EFFECT_GROUPS.flatMap((g) => g.items), ...TEXT_PRESETS, ...LYRIC_PRESETS]

  it('id không trùng, tìm lại được', () => {
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length)
    for (const p of all) expect(findPreset(p.id)).toBe(p)
    expect(findPreset('không-có')).toBeUndefined()
  })

  it('mọi thuộc tính của mẫu đều hợp lệ (đúng tên, đúng kiểu, đúng lựa chọn, font có sẵn)', () => {
    const bad = all.flatMap((p) => invalidProps(p.type, p.props as Record<string, unknown>).map((b) => `${p.id}: ${b}`))
    expect(bad).toEqual([])
  })

  it('mẫu chữ đều có nội dung; bộ lọc trong thư viện đủ 12 mẫu (bỏ "Gốc")', () => {
    for (const p of TEXT_PRESETS) expect(String((p.props as { template?: string }).template ?? '').length).toBeGreaterThan(0)
    expect(FILTER_PRESETS.filter((p) => p.id !== 'none')).toHaveLength(12)
  })
})

describe('mẫu phong cách', () => {
  it('7 mẫu có sẵn, lớp hợp lệ, mỗi mẫu có đúng một nền phủ cả video', () => {
    const list = builtinTemplates()
    expect(list.map((t) => t.id)).toEqual(['default', 'lofi', 'edm', 'ballad', 'bolero', 'relax', 'minimal'])
    for (const t of list) {
      const bad = t.layers.flatMap((l) => invalidProps(l.type, l.props as unknown as Record<string, unknown>))
      expect(bad, t.id).toEqual([])
      const bgs = t.layers.filter((l) => l.type === 'background')
      expect(bgs, t.id).toHaveLength(1)
      expect(t.layers[0].type, `${t.id}: nền nằm dưới cùng`).toBe('background')
      expect(bgs[0].timing).toEqual(FULL_TIMING)
    }
  })

  it('mỗi lần gọi tạo lớp mới (không dùng chung id giữa các project)', () => {
    const a = builtinTemplates()[1].layers.map((l) => l.id)
    const b = builtinTemplates()[1].layers.map((l) => l.id)
    expect(a.some((id) => b.includes(id))).toBe(false)
  })

  const project = (): Project => ({
    ...createDefaultProject(),
    tracks: [track('a', 60), track('b', 90)],
    settings: { ...createDefaultProject().settings, width: 1080, height: 1920 }
  })

  it('áp mẫu: thay lớp (id mới), giữ nguyên nhạc và cài đặt', () => {
    const p = project()
    const lofi = builtinTemplates().find((t) => t.id === 'lofi')!
    const out = applyTemplate(p, lofi)
    expect(out.tracks).toBe(p.tracks)
    expect(out.settings).toBe(p.settings)
    expect(out.layers.map((l) => l.type)).toEqual(lofi.layers.map((l) => l.type))
    expect(out.layers.some((l) => lofi.layers.some((x) => x.id === l.id))).toBe(false)
    expect(out.layers.find((l) => l.type === 'filter')?.props).toMatchObject({ preset: 'lofi' })
  })

  it('áp mẫu giữ nền: giữ các lớp nền của người dùng (ảnh, các đoạn theo bài), bỏ nền của mẫu', () => {
    const p = project()
    const bg1 = { ...createLayer('background', { mode: 'image', src: '/a.jpg' }), row: 'r1', timing: { start: 0, end: 60, fadeIn: 0, fadeOut: 0 } } as Layer
    const bg2 = { ...createLayer('background', { mode: 'video', src: '/b.mp4' }), row: 'r1', timing: { start: 60, end: null, fadeIn: 1, fadeOut: 0 } } as Layer
    p.layers = [bg1, bg2, createLayer('visualizer')]
    const edm = builtinTemplates().find((t) => t.id === 'edm')!
    const out = applyTemplate(p, edm, { keepBackground: true })
    expect(out.layers.slice(0, 2).map((l) => l.props)).toEqual([bg1.props, bg2.props])
    expect(out.layers.filter((l) => l.type === 'background')).toHaveLength(2)
    expect(out.layers.slice(2).map((l) => l.type)).toEqual(edm.layers.filter((l) => l.type !== 'background').map((l) => l.type))
  })

  it('các đoạn chung hàng trong mẫu vẫn chung hàng sau khi áp (khoá hàng mới)', () => {
    const a = { ...createLayer('text'), row: 'row-x' } as Layer
    const b = { ...createLayer('text'), row: 'row-x' } as Layer
    const out = applyTemplate(project(), { id: 't', name: 'T', description: '', layers: [createLayer('background'), a, b] })
    expect(out.layers[1].row).toBe(out.layers[2].row)
    expect(out.layers[1].row).not.toBe('row-x')
  })

  it('project mới theo mẫu; lưu phong cách thành mẫu riêng (bỏ khoá lớp)', () => {
    const t = builtinTemplates().find((x) => x.id === 'minimal')!
    const p = projectFromTemplate(t)
    expect(p.tracks).toEqual([])
    expect(p.layers.map((l) => l.type)).toEqual(t.layers.map((l) => l.type))
    p.layers[1] = { ...p.layers[1], locked: true } as Layer
    const saved = templateFromProject(p, '  Kênh của tôi  ')
    expect(saved).toMatchObject({ name: 'Kênh của tôi', custom: true })
    expect(isTemplateId(saved.id)).toBe(true)
    expect(saved.layers.every((l) => !l.locked)).toBe(true)
  })

  it('id mẫu an toàn để làm tên file', () => {
    expect(isTemplateId('tpl_abc-12')).toBe(true)
    for (const bad of ['', '../x', 'a/b', 'a\\b', 'x'.repeat(65), 5, null]) expect(isTemplateId(bad)).toBe(false)
  })
})

describe('tạo mẫu từ video vừa làm', () => {
  // 2 bài × 60 giây, nối liền: video dài 120 giây
  const make = (layers: Layer[]): Project => ({
    ...createDefaultProject(),
    tracks: [track('a', 60), track('b', 60)],
    settings: { ...createDefaultProject().settings, transition: { type: 'none', duration: 0 } },
    layers
  })
  const at = (l: Layer, start: number, end: number | null, extra: Partial<Layer> = {}): Layer => ({ ...l, timing: { start, end, fadeIn: 0, fadeOut: 0 }, ...extra }) as Layer

  it('chỉ giữ lớp dùng suốt video; bỏ lớp một đoạn, các đoạn đã tách, lớp đang ẩn', () => {
    const bg = at(createLayer('background', { mode: 'image', src: '/a.jpg' }), 0, null)
    const viz = at(createLayer('visualizer'), 0, null, { locked: true })
    const nearlyFull = at(createLayer('particles'), 0.5, 119.4)
    const partial = at(createLayer('text', { template: 'Tiếp theo' }), 30, 60)
    const splitA = at(createLayer('flicker'), 0, 45, { row: 'r' })
    const splitB = at(createLayer('flicker'), 45, null, { row: 'r' })
    const hidden = at({ ...createLayer('vignette'), enabled: false } as Layer, 0, null)
    const cta = at(createLayer('cta'), 0, null)
    const plan = planTemplate(make([bg, viz, nearlyFull, partial, splitA, splitB, hidden, cta]))
    expect(plan.layers.map((l) => l.type)).toEqual(['background', 'visualizer', 'particles', 'cta'])
    // Lớp giữ lại hiện tới hết video (tự dài theo bài của video mới), không khoá, không chung hàng
    expect(plan.layers.every((l) => l.timing.end === null && !l.locked && !l.row)).toBe(true)
    expect(plan.layers[2].timing.start).toBe(0.5)
    expect(plan.skipped.map((x) => [x.layer.id, x.reason])).toEqual([
      [partial.id, 'partial'],
      [splitA.id, 'partial'],
      [splitB.id, 'partial'],
      [hidden.id, 'hidden']
    ])
    expect(plan.backgroundFromSegment).toBe(false)
    expect(viz.locked).toBe(true)
  })

  it('video chỉ có nền theo từng bài: mẫu có một nền suốt video theo kiểu nền của đoạn đầu', () => {
    const b1 = at(createLayer('background', { mode: 'image', src: '/1.jpg', dim: 0.4 }), 0, 60, { row: 'r' })
    const b2 = at(createLayer('background', { mode: 'image', src: '/2.jpg', dim: 0.4 }), 60, null, { row: 'r' })
    const plan = planTemplate(make([b1, b2, at(createLayer('visualizer'), 0, null)]))
    expect(plan.backgroundFromSegment).toBe(true)
    expect(plan.layers.map((l) => l.type)).toEqual(['background', 'visualizer'])
    expect(plan.layers[0]).toMatchObject({ timing: FULL_TIMING, props: { src: '/1.jpg', dim: 0.4 } })
    expect(plan.layers[0].row).toBeUndefined()
  })

  it('lưu kèm khung hình, chuyển bài, chất lượng xuất; video mới từ mẫu dùng lại, áp phong cách thì không đổi', () => {
    const p = make([at(createLayer('background'), 0, null)])
    p.settings = { ...p.settings, width: 1080, height: 1920, fps: 60, transition: { type: 'gap', duration: 2 }, fadeIn: 0, fadeOut: 5 }
    p.export = { ...p.export, encoder: 'h264_nvenc', quality: 'high', audioBitrate: 320 }
    const t = templateFromProject(p, 'Shorts lofi')
    expect(t.settings).toEqual({ width: 1080, height: 1920, fps: 60, transition: { type: 'gap', duration: 2 }, fadeIn: 0, fadeOut: 5 })
    expect(t.export).toEqual({ quality: 'high', audioBitrate: 320 })
    const fresh = projectFromTemplate(t)
    expect(fresh.tracks).toEqual([])
    expect(fresh.settings).toMatchObject({ width: 1080, height: 1920, fps: 60, fadeOut: 5, transition: { type: 'gap', duration: 2 } })
    // Bộ mã hoá tuỳ máy: không lấy theo mẫu
    expect(fresh.export).toMatchObject({ quality: 'high', audioBitrate: 320, encoder: 'libx264' })
    const other = make([at(createLayer('background'), 0, null)])
    expect(applyTemplate(other, t).settings).toBe(other.settings)
  })

  it('lưu đè mẫu cũ (giữ id)', () => {
    expect(templateFromProject(make([]), 'A', { id: 'tpl_cu' }).id).toBe('tpl_cu')
  })

  it('kho mẫu: giữ khung hình, chất lượng hợp lệ; bỏ giá trị hỏng', () => {
    const good = templateFromProject(make([at(createLayer('background'), 0, null)]), 'A')
    expect(parseTemplate(good)?.settings).toEqual(good.settings)
    expect(parseTemplate(good)?.export).toEqual(good.export)
    expect(parseTemplate({ ...good, settings: { ...good.settings!, width: 0 } })?.settings).toBeUndefined()
    expect(parseTemplate({ ...good, export: { quality: 'ultra', audioBitrate: 256 } })?.export).toBeUndefined()
    expect(parseTemplate({ ...good, settings: undefined, export: undefined })).not.toHaveProperty('settings')
  })
})

describe('kho mẫu của người dùng (main process)', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pvm-tpl-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('lưu, liệt kê (mới nhất trước), xoá', async () => {
    const store = new TemplateStore(join(dir, 'templates'))
    expect(await store.list()).toEqual([])
    const p = createDefaultProject()
    const a = { ...templateFromProject(p, 'A'), createdAt: 1 }
    const b = { ...templateFromProject(p, 'B'), createdAt: 2 }
    await store.save(a)
    await store.save(b)
    expect((await store.list()).map((t) => t.name)).toEqual(['B', 'A'])
    await store.remove(a.id)
    expect((await store.list()).map((t) => t.name)).toEqual(['B'])
  })

  it('bỏ qua file hỏng / không khớp tên; từ chối id nguy hiểm', async () => {
    const store = new TemplateStore(dir)
    const good = templateFromProject(createDefaultProject(), 'Tốt')
    await store.save(good)
    writeFileSync(join(dir, 'broken.json'), '{not json')
    writeFileSync(join(dir, 'other.json'), JSON.stringify({ ...good, id: 'khac' }))
    writeFileSync(join(dir, 'empty.json'), JSON.stringify({ id: 'empty', name: 'X', layers: [] }))
    expect((await store.list()).map((t) => t.id)).toEqual([good.id])
    await expect(store.save({ ...good, id: '../evil' })).rejects.toThrow()
    await expect(store.remove('../evil')).rejects.toThrow()
    expect(readdirSync(dir).sort()).toEqual(['broken.json', 'empty.json', `${good.id}.json`, 'other.json'].sort())
  })

  it('mẫu cũ thiếu thuộc tính mới được bổ sung như khi mở project cũ', () => {
    const t = parseTemplate({ id: 'old', name: 'Cũ', layers: [{ id: 'l1', type: 'visualizer', name: 'V', enabled: true, props: { style: 'wave' } }] })
    expect(t?.layers[0].props).toMatchObject({ ...LAYER_DEFAULTS.visualizer, style: 'wave' })
    expect(t?.layers[0].timing).toEqual(FULL_TIMING)
    expect(parseTemplate({ id: 'x', name: '  ', layers: [] })).toBeNull()
  })
})

describe('âm thanh mẫu (vẽ ảnh xem trước)', () => {
  it('đúng định dạng, tất định, có beat đều ~118 BPM', () => {
    const f = createDemoFeatures(12)
    expect(f.frames).toBe(12 * FEATURE_RATE)
    expect(f.data.length).toBe(f.frames * STRIDE)
    expect(createDemoFeatures(12).data).toEqual(f.data)
    const beats = [...Array(f.frames).keys()].filter((i) => f.data[i * STRIDE + OFF_BEAT] > 0)
    expect(beats.length).toBeGreaterThanOrEqual(22)
    expect(beats.length).toBeLessThanOrEqual(25)
    const { header, data } = decodeFeatures(encodeFeatures(f.header, f.data))
    expect(header).toEqual(f.header)
    expect(data).toEqual(f.data)
  })

  it('engine đọc được: có phổ, âm lượng, bass khác 0', () => {
    const f = createDemoFeatures(12)
    const tl = buildTimeline([track('demo', 12, { analysisKey: DEMO_KEY })], { ...createDefaultProject().settings, transition: { type: 'none', duration: 0 } })
    const audio = new AudioSampler(tl, (k) => (k === DEMO_KEY ? f : undefined))
    const bands = audio.bands(5.1, new Float32Array(BAND_COUNT), 8)
    expect(Math.max(...bands)).toBeGreaterThan(0.5)
    expect(audio.level(5.1)).toBeGreaterThan(0.3)
    expect(audio.bass(5.1)).toBeGreaterThan(0.3)
  })
})

describe('store: thêm từ thư viện, áp phong cách', () => {
  const st = (): ReturnType<typeof useStore.getState> => useStore.getState()
  const load = (layers?: Layer[]): void => {
    const p = { ...createDefaultProject(), tracks: [track('a', 60), track('b', 90)], settings: { ...createDefaultProject().settings, transition: { type: 'none' as const, duration: 0 } } }
    if (layers) p.layers = layers
    st().loadProject(p, null)
  }
  afterEach(() => setLang('vi'))

  it('bấm +: hiện suốt video, nằm trên cùng, được chọn; chữ mẫu theo ngôn ngữ giao diện', () => {
    load()
    setLang('en')
    const id = st().addPresetLayer(findPreset('txt-next')!)
    const layer = st().project.layers.at(-1)!
    expect(layer.id).toBe(id)
    expect(st().selectedLayerId).toBe(id)
    expect(layer.timing).toEqual(FULL_TIMING)
    expect(layer.props).toMatchObject({ template: 'Next: {next}', align: 'right' })
    expect(layer.name).toBe('Bài tiếp theo')
  })

  it('kéo vào timeline: từ chỗ thả đến hết bài đó; bài cuối thì đến hết video', () => {
    load()
    st().addPresetLayer(findPreset('pt-snow')!, 20)
    expect(st().project.layers.at(-1)!.timing).toMatchObject({ start: 20, end: 60 })
    st().addPresetLayer(findPreset('pt-rain')!, 100)
    expect(st().project.layers.at(-1)!.timing).toMatchObject({ start: 100, end: null })
  })

  it('kéo nút Đăng ký vào timeline: hiện một lần tại chỗ thả', () => {
    load()
    st().addPresetLayer(findPreset('cta-sub')!, 75.5)
    expect(st().project.layers.at(-1)!.props).toMatchObject({ preset: 'subscribe', schedule: 'times', times: '1:15.5' })
  })

  it('bộ lọc: thêm ngay trên lớp nền, đúng mẫu; kéo vào timeline thì lọc một đoạn', () => {
    load([createLayer('background'), createLayer('visualizer')])
    const id = st().addFilterLayer('bw')!
    expect(st().project.layers.map((l) => l.type)).toEqual(['background', 'filter', 'visualizer'])
    expect(st().project.layers[1]).toMatchObject({ id, props: { preset: 'bw', saturation: -1 } })
    st().addFilterLayer('warm', 65)
    expect(st().project.layers[1].timing).toMatchObject({ start: 65, end: null })
    expect(st().addFilterLayer('không-có')).toBeNull()
  })

  it('đặt làm nền cả video: thay nguồn của nền phủ cả video; chưa có thì thêm dưới cùng; ghi vào thư viện', () => {
    load([createLayer('background'), createLayer('visualizer')])
    const main = st().project.layers[0].id
    expect(st().setMainBackground({ path: '/p/a.jpg', kind: 'image' })).toBe(main)
    expect(st().project.layers[0].props).toMatchObject({ mode: 'image', src: '/p/a.jpg' })
    expect(st().project.library).toEqual(['/p/a.jpg'])
    load([{ ...createLayer('background'), timing: { start: 10, end: 30, fadeIn: 0, fadeOut: 0 } } as Layer])
    const id = st().setMainBackground({ path: '/p/b.mp4', kind: 'video' })
    expect(st().project.layers[0]).toMatchObject({ id, props: { mode: 'video', src: '/p/b.mp4' }, timing: FULL_TIMING })
    expect(st().project.layers).toHaveLength(2)
  })

  it('thư viện ảnh / video: chỉ nhận ảnh, video; không trùng; xoá được; thả nền vào timeline cũng ghi vào thư viện', () => {
    load()
    expect(st().addLibraryMedia(['/x/a.jpg', '/x/b.mp4', '/x/c.mp3', '/x/a.jpg'])).toBe(2)
    expect(st().addLibraryMedia(['/x/a.jpg'])).toBe(0)
    st().removeLibraryMedia('/x/a.jpg')
    expect(st().project.library).toEqual(['/x/b.mp4'])
    st().addDroppedBackgrounds([{ path: '/x/d.png', kind: 'image' }], 5)
    expect(st().project.library).toEqual(['/x/b.mp4', '/x/d.png'])
  })

  it('áp phong cách: thay lớp, giữ nhạc; một bước hoàn tác', () => {
    load()
    const before = st().project
    st().applyStyle(builtinTemplates().find((t) => t.id === 'bolero')!, false)
    expect(st().project.tracks).toBe(before.tracks)
    expect(st().project.layers.find((l) => l.type === 'filter')?.props).toMatchObject({ preset: 'vintage' })
    expect(st().selectedLayerIds.every((id) => st().project.layers.some((l) => l.id === id))).toBe(true)
    st().undo()
    expect(st().project.layers).toBe(before.layers)
  })

  it('mở project cũ: thư viện mặc định rỗng, bỏ giá trị lạ', () => {
    const p = normalizeProject({ ...createDefaultProject(), library: undefined })
    expect(p.library).toEqual([])
    const q = normalizeProject({ ...createDefaultProject(), library: ['/a.jpg', 5, ''] as unknown as string[] })
    expect(q.library).toEqual(['/a.jpg'])
  })
})
