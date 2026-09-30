import { produce } from 'immer'
import { create } from 'zustand'
import { createDefaultProject, createLayer, FULL_TIMING, newId, normalizeProject } from '../../shared/defaults'
import { buildTimeline } from '../../shared/timeline'
import type { BackgroundProps, Layer, LayerPropsMap, LayerTiming, LayerType, Project, ProjectSettings, Track } from '../../shared/types'
import { dropSegments, insertionIndexAt, moveTracksOrder, pasteTimings, splitTiming } from './timelineModel'
import { isLang, setLang, tr, type Lang } from '../../shared/i18n'
import { mediaKind } from '../../shared/files'
import { presetById } from '../../shared/filterPresets'
import type { LayerPreset } from '../../shared/presets'
import { applyTemplate, type StyleTemplate } from '../../shared/templates'
import { formatTimePrecise } from '../../shared/time'

/** Độ nét preview: giảm để phát mượt trên máy yếu (không ảnh hưởng video xuất) */
export type PreviewQuality = 'high' | 'medium' | 'low'
export const PREVIEW_QUALITY_SCALE: Record<PreviewQuality, number> = { high: 1, medium: 0.5, low: 0.25 }
const PREVIEW_QUALITY_KEY = 'pvm.previewQuality'

function loadPreviewQuality(): PreviewQuality {
  try {
    const v = localStorage.getItem(PREVIEW_QUALITY_KEY)
    if (v === 'high' || v === 'medium' || v === 'low') return v
  } catch {
    // bộ nhớ trình duyệt không dùng được (hoặc chạy trong kiểm thử)
  }
  return 'high'
}

const LANG_KEY = 'pvm.lang'

/** Ngôn ngữ giao diện đã chọn (mặc định tiếng Việt) */
function loadLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY)
    if (isLang(v)) return v
  } catch {
    // bỏ qua
  }
  return 'vi'
}

/**
 * Những gì đã chép (Ctrl+C) — chỉ trong phiên làm việc. `anchor`: thời điểm bắt đầu của bài
 * đầu tiên được chép, để lớp dán ra vẫn khớp với bài dán ra.
 */
let clipboard: { layers: Layer[]; tracks: Track[]; anchor: number } = { layers: [], tracks: [], anchor: 0 }

export interface TrackStatus {
  state: 'pending' | 'analyzing' | 'ready' | 'error'
  progress: number
  error?: string
}

/** Một lần hiện của nút Đăng ký/Like đang chọn trên timeline */
export interface CtaSelection {
  layerId: string
  index: number
}

/** 'welcome': màn hình chào lúc mở app, 'new-project': chọn mẫu cho project mới, 'styles': áp / tạo mẫu, 'save-template': tạo mẫu từ video vừa xuất */
export type DialogName = 'export' | 'settings' | 'chapters' | 'shortcuts' | 'welcome' | 'new-project' | 'styles' | 'save-template' | null

export interface Toast {
  id: number
  kind: 'info' | 'error' | 'success'
  text: string
}

interface UpdateOptions {
  /** Gộp các thay đổi liên tiếp cùng khoá (kéo thanh trượt) thành một bước undo; khoá bắt đầu bằng "drag-" gộp không giới hạn thời gian */
  coalesce?: string
  /** Thay đổi dữ liệu suy ra (thời lượng sau phân tích...): không ghi lịch sử, không đánh dấu chưa lưu */
  silent?: boolean
}

interface State {
  project: Project
  filePath: string | null
  dirty: boolean
  past: Project[]
  future: Project[]
  lastCoalesce: { key: string; at: number } | null
  /** Lớp chính đang chọn (bảng thuộc tính, khung chọn trên preview) */
  selectedLayerId: string | null
  /** Mọi lớp đang chọn (chọn thêm bằng Ctrl/Shift + nhấp); luôn chứa selectedLayerId nếu có */
  selectedLayerIds: string[]
  /** Clip nhạc chính đang chọn (bảng thuộc tính của bài) */
  selectedTrackId: string | null
  /** Mọi clip nhạc đang chọn (chọn thêm bằng Ctrl/Shift + nhấp, kéo khung) — chọn lẫn được với các lớp */
  selectedTrackIds: string[]
  selectedCta: CtaSelection | null
  trackStatus: Record<string, TrackStatus>
  featuresVersion: number
  currentTime: number
  playing: boolean
  dialog: DialogName
  toasts: Toast[]
  previewQuality: PreviewQuality
  lang: Lang

  update(fn: (p: Project) => void, opts?: UpdateOptions): void
  undo(): void
  redo(): void
  loadProject(project: Project, filePath: string | null, dirty?: boolean): void
  newProject(): void
  markSaved(filePath: string): void

  addTracks(tracks: Track[]): void
  /** Chèn bài vào vị trí `index` của playlist (thả file vào timeline); chọn các bài vừa chèn */
  insertTracks(tracks: Track[], index: number): void
  removeTrack(id: string): void
  moveTrack(from: number, to: number): void
  /** Dời cả nhóm bài tới vị trí `to` (tính trong các bài còn lại) — một bước hoàn tác */
  moveTracks(ids: string[], to: number): void
  /** Nhân bản các bài (bản sao nằm ngay sau bài gốc, dùng lại dữ liệu âm thanh) — một bước hoàn tác */
  duplicateTracks(ids: string[]): void
  updateTrack(id: string, patch: Partial<Track>, opts?: UpdateOptions): void
  setTrackStatus(path: string, status: TrackStatus): void
  setSettings(patch: Partial<ProjectSettings>): void

  addLayer(type: LayerType): void
  removeLayer(id: string): void
  duplicateLayer(id: string): void
  /** Nhân bản nhiều lớp (bản sao ngay trên lớp gốc) — một bước hoàn tác */
  duplicateLayers(ids: string[]): void
  moveLayer(id: string, dir: 1 | -1): void
  /** Đưa layer tới vị trí `index` (0 = dưới cùng) */
  moveLayerTo(id: string, index: number): void
  toggleLayer(id: string): void
  renameLayer(id: string, name: string): void
  setLayerProps<T extends LayerType>(id: string, patch: Partial<LayerPropsMap[T]>, coalesceKey?: string): void
  setLayerTiming(id: string, patch: Partial<LayerTiming>, coalesceKey?: string): void
  /** Đổi thời gian nhiều lớp trong một bước hoàn tác (kéo cả nhóm) */
  setLayersTiming(patches: Record<string, Partial<LayerTiming>>, coalesceKey?: string): void
  selectLayer(id: string | null): void
  /** Ctrl/Shift + nhấp: thêm / bớt lớp khỏi nhóm đang chọn */
  toggleLayerSelection(id: string): void
  selectLayers(ids: string[]): void
  selectTrack(id: string | null): void
  /** Ctrl/Shift + nhấp clip nhạc: thêm / bớt khỏi nhóm đang chọn (giữ các lớp đang chọn) */
  toggleTrackSelection(id: string): void
  /** Chọn đúng các lớp và clip nhạc này (kéo khung, Ctrl+A) */
  setSelection(layerIds: string[], trackIds: string[]): void
  selectCta(sel: CtaSelection | null): void

  /** Xoá các lớp (bỏ qua lớp đang khoá); trả về số lớp đã xoá */
  removeLayers(ids: string[]): number
  /** Tách các lớp tại thời điểm `t` thành hai đoạn chung hàng; trả về số lớp đã tách */
  splitLayers(ids: string[], t: number): number
  /** Chép các lớp (Ctrl+C); trả về số lớp đã chép */
  copyLayers(ids: string[]): number
  /** Dán những gì đã chép tại thời điểm `at` (Ctrl+V); trả về số mục đã dán */
  pasteLayers(at: number): number
  /** Chép cùng lúc lớp và clip nhạc */
  copyItems(layerIds: string[], trackIds: string[]): number
  /** Dán: bài chèn vào ranh giới gần `at` nhất, lớp đặt theo đúng khoảng cách với bài như lúc chép */
  pasteItems(at: number): number
  /** Xoá cùng lúc lớp (bỏ qua lớp khoá) và clip nhạc — một bước hoàn tác; trả về số mục đã xoá */
  removeItems(layerIds: string[], trackIds: string[]): number
  /** Thêm ảnh / video nền thả vào timeline tại `at` (mỗi file một bài, chung một hàng); trả về id lớp mới */
  addDroppedBackgrounds(files: Array<{ path: string; kind: 'image' | 'video' }>, at: number): string[]
  /** Đổi ảnh / video của một lớp nền (thả file vào hàng của lớp đó) */
  setBackgroundSource(layerId: string, file: { path: string; kind: 'image' | 'video' }): void
  /**
   * Thêm lớp từ mẫu trong thư viện. Không có `at` (bấm +): hiện suốt video. Có `at` (kéo vào timeline):
   * hiện từ chỗ thả đến hết bài đó; nút Đăng ký thì hiện một lần tại chỗ thả. Trả về id lớp mới.
   */
  addPresetLayer(preset: LayerPreset, at?: number): string
  /** Thêm bộ lọc màu theo mẫu, ngay trên lớp nền (`at` như addPresetLayer); trả về id lớp mới */
  addFilterLayer(presetId: string, at?: number): string | null
  /** Đặt ảnh / video làm nền cho cả video (thay nguồn của lớp nền phủ cả video, chưa có thì thêm); trả về id lớp nền */
  setMainBackground(file: { path: string; kind: 'image' | 'video' }): string
  /** Nhập ảnh / video vào thư viện; trả về số file mới thêm */
  addLibraryMedia(paths: string[]): number
  removeLibraryMedia(path: string): void
  /** Áp mẫu phong cách: thay các lớp, giữ nguyên nhạc — một bước hoàn tác */
  applyStyle(template: StyleTemplate, keepBackground: boolean): void
  setLayersLocked(ids: string[], locked: boolean): void
  setLayersColor(ids: string[], color: string | undefined): void
  setLayersEnabled(ids: string[], enabled: boolean): void
  setPreviewQuality(q: PreviewQuality): void
  setLanguage(lang: Lang): void

  bumpFeatures(): void
  setTime(t: number): void
  setPlaying(p: boolean): void
  openDialog(d: DialogName): void
  toast(kind: Toast['kind'], text: string): void
  dismissToast(id: number): void
}

const HISTORY_LIMIT = 100
let toastId = 0

/** Layer chọn sẵn khi mở project: cột sóng (hay chỉnh nhất), nếu không có thì lớp trên cùng */
function defaultSelection(p: Project): string | null {
  return (p.layers.find((l) => l.type === 'visualizer') ?? p.layers[p.layers.length - 1])?.id ?? null
}

// Nạp ngôn ngữ trước khi tạo project mặc định (tên project, chữ trên nút Đăng ký…)
setLang(loadLang())
const initialProject = createDefaultProject()

export const useStore = create<State>((set, get) => ({
  project: initialProject,
  filePath: null,
  dirty: false,
  past: [],
  future: [],
  lastCoalesce: null,
  selectedLayerId: defaultSelection(initialProject),
  selectedLayerIds: [defaultSelection(initialProject)].filter((x): x is string => !!x),
  selectedTrackId: null,
  selectedTrackIds: [],
  selectedCta: null,
  trackStatus: {},
  featuresVersion: 0,
  currentTime: 0,
  playing: false,
  dialog: null,
  toasts: [],
  previewQuality: loadPreviewQuality(),
  lang: loadLang(),

  update(fn, opts = {}) {
    const { project, past, lastCoalesce } = get()
    // immer: chỉ tạo object mới cho phần thay đổi → timeline/inspector vẽ lại tối thiểu
    const next = produce(project, fn)
    if (next === project) return
    if (opts.silent) {
      set({ project: next })
      return
    }
    const now = Date.now()
    // Khoá "drag-…" là một phiên kéo thả trên preview: gộp trọn thành một bước dù kéo lâu
    const merge =
      !!opts.coalesce && lastCoalesce?.key === opts.coalesce && (opts.coalesce.startsWith('drag-') || now - lastCoalesce.at < 1000)
    set({
      project: next,
      dirty: true,
      past: merge ? past : [...past.slice(-HISTORY_LIMIT + 1), project],
      future: [],
      lastCoalesce: opts.coalesce ? { key: opts.coalesce, at: now } : null
    })
  },

  undo() {
    const { past, project, future } = get()
    const prev = past[past.length - 1]
    if (!prev) return
    const restored = keepDerived(prev, project)
    set({ project: restored, past: past.slice(0, -1), future: [project, ...future], dirty: true, lastCoalesce: null, ...prunedSelection(get(), restored) })
  },

  redo() {
    const { past, project, future } = get()
    const next = future[0]
    if (!next) return
    const restored = keepDerived(next, project)
    set({ project: restored, past: [...past, project], future: future.slice(1), dirty: true, lastCoalesce: null, ...prunedSelection(get(), restored) })
  },

  loadProject(project, filePath, dirty = false) {
    const p = normalizeProject(project)
    const sel = defaultSelection(p)
    set({
      project: p,
      filePath,
      dirty,
      past: [],
      future: [],
      lastCoalesce: null,
      selectedLayerId: sel,
      selectedLayerIds: sel ? [sel] : [],
      selectedTrackId: null,
      selectedTrackIds: [],
      selectedCta: null,
      currentTime: 0,
      playing: false
    })
  },

  newProject() {
    get().loadProject(createDefaultProject(), null)
  },

  markSaved(filePath) {
    set({ filePath, dirty: false })
  },

  addTracks(tracks) {
    get().update((p) => {
      p.tracks.push(...tracks)
    })
  },

  insertTracks(tracks, index) {
    if (tracks.length === 0) return
    get().update((p) => {
      p.tracks.splice(Math.max(0, Math.min(index, p.tracks.length)), 0, ...tracks)
    })
    get().setSelection([], tracks.map((t) => t.id))
  },

  removeTrack(id) {
    get().update((p) => {
      p.tracks = p.tracks.filter((t) => t.id !== id)
    })
    const { selectedTrackId, selectedTrackIds } = get()
    set({ selectedTrackIds: selectedTrackIds.filter((x) => x !== id), ...(selectedTrackId === id ? { selectedTrackId: null } : {}) })
  },

  moveTrack(from, to) {
    if (from === to) return
    get().update((p) => {
      const [t] = p.tracks.splice(from, 1)
      p.tracks.splice(to, 0, t)
    })
  },

  duplicateTracks(ids) {
    const copies = new Map<string, Track>()
    for (const t of get().project.tracks) if (ids.includes(t.id)) copies.set(t.id, { ...structuredClone(t), id: newId('track') })
    if (copies.size === 0) return
    get().update((p) => {
      for (const [src, copy] of copies) {
        const i = p.tracks.findIndex((t) => t.id === src)
        p.tracks.splice(i + 1, 0, copy)
      }
    })
    get().setSelection([], [...copies.values()].map((t) => t.id))
  },

  moveTracks(ids, to) {
    const set0 = new Set(ids)
    const next = moveTracksOrder(get().project.tracks, set0, to)
    if (next.every((t, i) => t === get().project.tracks[i])) return
    get().update((p) => {
      p.tracks = moveTracksOrder(p.tracks, set0, to)
    })
  },

  updateTrack(id, patch, opts) {
    get().update((p) => {
      const t = p.tracks.find((x) => x.id === id)
      if (t) Object.assign(t, patch)
    }, opts)
  },

  setTrackStatus(path, status) {
    set((s) => ({ trackStatus: { ...s.trackStatus, [path]: status } }))
  },

  setSettings(patch) {
    get().update((p) => {
      p.settings = { ...p.settings, ...patch }
    })
  },

  addLayer(type) {
    const layer = createLayer(type)
    get().update((p) => {
      // Nền thêm ở dưới cùng; bộ lọc màu thêm ngay trên lớp nền (lọc ảnh nền); các lớp khác ở trên cùng
      if (type === 'background') p.layers.unshift(layer)
      else if (type === 'filter') p.layers.splice(aboveBackground(p.layers), 0, layer)
      else p.layers.push(layer)
    })
    get().selectLayer(layer.id)
  },

  moveLayerTo(id, index) {
    get().update((p) => {
      const from = p.layers.findIndex((l) => l.id === id)
      if (from < 0) return
      const [l] = p.layers.splice(from, 1)
      p.layers.splice(Math.max(0, Math.min(index, p.layers.length)), 0, l)
    })
  },

  removeLayer(id) {
    get().update((p) => {
      p.layers = p.layers.filter((l) => l.id !== id)
    })
    const { selectedLayerId, selectedLayerIds } = get()
    set({
      selectedLayerIds: selectedLayerIds.filter((x) => x !== id),
      ...(selectedLayerId === id ? { selectedLayerId: null, selectedCta: null } : {})
    })
  },

  duplicateLayer(id) {
    const src = get().project.layers.find((l) => l.id === id)
    if (!src) return
    // Bản sao nằm hàng riêng trên timeline, không khoá
    const copy = { ...structuredClone(src), id: createLayer(src.type).id, name: `${tr(src.name)} ${tr('(bản sao)')}`, row: undefined, locked: undefined } as Layer
    get().update((p) => {
      const i = p.layers.findIndex((l) => l.id === id)
      p.layers.splice(i + 1, 0, copy)
    })
    get().selectLayer(copy.id)
  },

  duplicateLayers(ids) {
    const copies = new Map<string, Layer>()
    for (const l of get().project.layers)
      if (ids.includes(l.id)) copies.set(l.id, { ...structuredClone(l), id: createLayer(l.type).id, name: `${tr(l.name)} ${tr('(bản sao)')}`, row: undefined, locked: undefined } as Layer)
    if (copies.size === 0) return
    get().update((p) => {
      for (const [src, copy] of copies) {
        const i = p.layers.findIndex((l) => l.id === src)
        p.layers.splice(i + 1, 0, copy)
      }
    })
    get().selectLayers([...copies.values()].map((l) => l.id))
  },

  moveLayer(id, dir) {
    get().update((p) => {
      const i = p.layers.findIndex((l) => l.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= p.layers.length) return
      ;[p.layers[i], p.layers[j]] = [p.layers[j], p.layers[i]]
    })
  },

  toggleLayer(id) {
    get().update((p) => {
      const l = p.layers.find((x) => x.id === id)
      if (l) l.enabled = !l.enabled
    })
  },

  renameLayer(id, name) {
    get().update(
      (p) => {
        const l = p.layers.find((x) => x.id === id)
        if (l) l.name = name
      },
      { coalesce: `rename-${id}` }
    )
  },

  setLayerProps(id, patch, coalesceKey) {
    get().update(
      (p) => {
        const l = p.layers.find((x) => x.id === id)
        if (l) Object.assign(l.props, patch)
      },
      { coalesce: coalesceKey }
    )
  },

  setLayerTiming(id, patch, coalesceKey) {
    get().update(
      (p) => {
        const l = p.layers.find((x) => x.id === id)
        if (l) Object.assign(l.timing, patch)
      },
      { coalesce: coalesceKey }
    )
  },

  setLayersTiming(patches, coalesceKey) {
    get().update(
      (p) => {
        for (const l of p.layers) if (patches[l.id]) Object.assign(l.timing, patches[l.id])
      },
      { coalesce: coalesceKey }
    )
  },

  selectLayer(id) {
    set({ selectedLayerId: id, selectedLayerIds: id ? [id] : [], selectedTrackId: null, selectedTrackIds: [], selectedCta: null })
  },

  toggleLayerSelection(id) {
    const { selectedLayerIds, selectedLayerId } = get()
    const has = selectedLayerIds.includes(id)
    const ids = has ? selectedLayerIds.filter((x) => x !== id) : [...selectedLayerIds, id]
    // Lớp chính: lớp vừa thêm; bỏ lớp chính thì lấy lớp chọn gần nhất còn lại
    const primary = has ? (selectedLayerId === id ? (ids[ids.length - 1] ?? null) : selectedLayerId) : id
    // Giữ các clip nhạc đang chọn (chọn lẫn); bảng thuộc tính chuyển sang lớp
    set({ selectedLayerIds: ids, selectedLayerId: primary, selectedTrackId: null, selectedCta: null })
  },

  selectLayers(ids) {
    set({ selectedLayerIds: ids, selectedLayerId: ids[ids.length - 1] ?? null, selectedTrackId: null, selectedTrackIds: [], selectedCta: null })
  },

  selectTrack(id) {
    const keep = id ? null : get().selectedLayerId
    set({ selectedTrackId: id, selectedTrackIds: id ? [id] : [], selectedLayerId: keep, selectedLayerIds: keep ? [keep] : [], selectedCta: null })
  },

  toggleTrackSelection(id) {
    const { selectedTrackIds, selectedTrackId } = get()
    const has = selectedTrackIds.includes(id)
    const ids = has ? selectedTrackIds.filter((x) => x !== id) : [...selectedTrackIds, id]
    const primary = has ? (selectedTrackId === id ? (ids[ids.length - 1] ?? null) : selectedTrackId) : id
    set({ selectedTrackIds: ids, selectedTrackId: primary, selectedCta: null })
  },

  setSelection(layerIds, trackIds) {
    set({
      selectedLayerIds: layerIds,
      selectedLayerId: layerIds[layerIds.length - 1] ?? null,
      selectedTrackIds: trackIds,
      // Bảng thuộc tính: ưu tiên lớp (nhiều thuộc tính hơn), chỉ chọn nhạc thì hiện bài
      selectedTrackId: layerIds.length === 0 ? (trackIds[trackIds.length - 1] ?? null) : null,
      selectedCta: null
    })
  },

  selectCta(sel) {
    const keep = sel ? sel.layerId : get().selectedLayerId
    set({ selectedCta: sel, selectedLayerId: keep, selectedLayerIds: keep ? [keep] : [], selectedTrackId: null, selectedTrackIds: [] })
  },

  removeLayers(ids) {
    const drop = new Set(get().project.layers.filter((l) => ids.includes(l.id) && !l.locked).map((l) => l.id))
    if (drop.size === 0) return 0
    get().update((p) => {
      p.layers = p.layers.filter((l) => !drop.has(l.id))
    })
    const { selectedLayerId, selectedLayerIds } = get()
    const rest = selectedLayerIds.filter((x) => !drop.has(x))
    set({
      selectedLayerIds: rest,
      selectedLayerId: selectedLayerId && drop.has(selectedLayerId) ? (rest[rest.length - 1] ?? null) : selectedLayerId,
      selectedCta: null
    })
    return drop.size
  },

  splitLayers(ids, t) {
    const { project } = get()
    const total = timelineTotal(project)
    const jobs: Array<{ id: string; row: string; left: LayerTiming; right: Layer }> = []
    for (const l of project.layers) {
      if (!ids.includes(l.id) || l.locked || l.type === 'cta') continue
      const parts = splitTiming(l.timing, total, t)
      if (!parts) continue
      const row = l.row ?? l.id
      // Đoạn sau: cùng thuộc tính, nằm ngay trên đoạn trước trong danh sách lớp → chung một hàng timeline
      jobs.push({ id: l.id, row, left: parts[0], right: { ...structuredClone(l), id: createLayer(l.type).id, timing: parts[1], row } as Layer })
    }
    if (jobs.length === 0) return 0
    get().update((p) => {
      for (const j of jobs) {
        const i = p.layers.findIndex((l) => l.id === j.id)
        p.layers[i].row = j.row
        p.layers[i].timing = j.left
        p.layers.splice(i + 1, 0, j.right)
      }
    })
    get().selectLayers(jobs.map((j) => j.right.id))
    return jobs.length
  },

  copyLayers(ids) {
    return get().copyItems(ids, [])
  },

  pasteLayers(at) {
    return get().pasteItems(at)
  },

  copyItems(layerIds, trackIds) {
    const { project } = get()
    const tl = buildTimeline(project.tracks, project.settings)
    // Giữ thứ tự chồng lớp (dưới → trên) và thứ tự bài trong playlist
    const layers = project.layers.filter((l) => layerIds.includes(l.id)).map((l) => structuredClone(l))
    const entries = tl.entries.filter((e) => trackIds.includes(e.track.id))
    const tracks = entries.map((e) => structuredClone(e.track))
    clipboard = { layers, tracks, anchor: entries.length ? entries[0].start : 0 }
    return layers.length + tracks.length
  },

  pasteItems(at) {
    const { layers: srcLayers, tracks: srcTracks, anchor } = clipboard
    if (srcLayers.length + srcTracks.length === 0) return 0
    const { project } = get()
    let total = timelineTotal(project)
    let layerAt = at
    let insertAt = -1
    const tracks = srcTracks.map((t) => ({ ...structuredClone(t), id: newId('track') }))
    if (tracks.length) {
      // Bài dán vào ranh giới gần đầu phát nhất; lớp đi kèm giữ đúng khoảng cách với bài như lúc chép
      insertAt = insertionIndexAt(buildTimeline(project.tracks, project.settings).entries, at)
      const next = [...project.tracks.slice(0, insertAt), ...tracks, ...project.tracks.slice(insertAt)]
      const tl = buildTimeline(next, project.settings)
      total = tl.total
      if (srcLayers.length) layerAt = tl.entries[insertAt].start + (Math.min(...srcLayers.map((l) => l.timing.start)) - anchor)
    }
    const timings = pasteTimings(
      srcLayers.map((l) => l.timing),
      layerAt,
      total
    )
    const pasted = srcLayers.map((src, i) => ({
      src: src.id,
      layer: { ...structuredClone(src), id: createLayer(src.type).id, timing: timings[i], row: undefined, locked: undefined } as Layer
    }))
    get().update((p) => {
      if (tracks.length) p.tracks.splice(insertAt, 0, ...tracks)
      for (const { src, layer } of pasted) {
        // Ngay trên lớp gốc nếu còn (giữ phạm vi của bộ lọc…), nếu không thì theo quy tắc thêm lớp
        const i = p.layers.findIndex((l) => l.id === src)
        if (i >= 0) p.layers.splice(i + 1, 0, layer)
        else if (layer.type === 'background') p.layers.unshift(layer)
        else if (layer.type === 'filter') p.layers.splice(aboveBackground(p.layers), 0, layer)
        else p.layers.push(layer)
      }
    })
    get().setSelection(
      pasted.map((x) => x.layer.id),
      tracks.map((t) => t.id)
    )
    return pasted.length + tracks.length
  },

  removeItems(layerIds, trackIds) {
    const { project } = get()
    const dropLayers = new Set(project.layers.filter((l) => layerIds.includes(l.id) && !l.locked).map((l) => l.id))
    const dropTracks = new Set(project.tracks.filter((t) => trackIds.includes(t.id)).map((t) => t.id))
    if (dropLayers.size + dropTracks.size === 0) return 0
    get().update((p) => {
      p.layers = p.layers.filter((l) => !dropLayers.has(l.id))
      p.tracks = p.tracks.filter((t) => !dropTracks.has(t.id))
    })
    const st = get()
    const restLayers = st.selectedLayerIds.filter((x) => !dropLayers.has(x))
    set({
      selectedLayerIds: restLayers,
      selectedLayerId: st.selectedLayerId && dropLayers.has(st.selectedLayerId) ? (restLayers[restLayers.length - 1] ?? null) : st.selectedLayerId,
      selectedTrackIds: st.selectedTrackIds.filter((x) => !dropTracks.has(x)),
      selectedTrackId: st.selectedTrackId && dropTracks.has(st.selectedTrackId) ? null : st.selectedTrackId,
      selectedCta: null
    })
    return dropLayers.size + dropTracks.size
  },

  addDroppedBackgrounds(files, at) {
    if (files.length === 0) return []
    const { project } = get()
    const tl = buildTimeline(project.tracks, project.settings)
    const timings = dropSegments(tl.entries, tl.total, at, files.length)
    // Giữ cách hiển thị của nền đang có (làm tối, đập theo bass…) cho đồng bộ
    const base = [...project.layers].reverse().find((l) => l.type === 'background')?.props as BackgroundProps | undefined
    const row = files.length > 1 ? newId('row') : undefined
    const layers = files.map((f, i) => {
      const l = createLayer('background', { ...(base ? structuredClone(base) : {}), mode: f.kind, src: f.path }, fileLabel(f.path)) as Layer
      return { ...l, timing: timings[i], row } as Layer
    })
    get().update((p) => {
      // Ngay trên các lớp nền đang có (dưới bộ lọc, cột sóng, chữ…); đoạn sau nằm trên đoạn trước
      p.layers.splice(aboveBackground(p.layers), 0, ...layers)
      addToLibrary(p, files.map((f) => f.path))
    })
    get().selectLayers(layers.map((l) => l.id))
    return layers.map((l) => l.id)
  },

  setBackgroundSource(layerId, file) {
    get().update((p) => {
      const l = p.layers.find((x) => x.id === layerId)
      if (l?.type === 'background') Object.assign(l.props, { mode: file.kind, src: file.path })
      addToLibrary(p, [file.path])
    })
    get().selectLayer(layerId)
  },

  addPresetLayer(preset, at) {
    const { project } = get()
    const props = structuredClone(preset.props) as Record<string, unknown>
    // Chữ viết sẵn trong mẫu ("Tiếp theo: {next}"…) theo ngôn ngữ giao diện
    if (preset.type === 'text' && typeof props.template === 'string') props.template = tr(props.template)
    if (preset.type === 'timer' && typeof props.label === 'string' && props.label) props.label = tr(props.label)
    let timing: LayerTiming = { ...FULL_TIMING }
    if (at !== undefined && preset.type === 'cta') Object.assign(props, { schedule: 'times', times: formatTimePrecise(Math.max(0, at), at >= 3600) })
    else if (at !== undefined) timing = dropTiming(project, at)
    const layer = { ...createLayer(preset.type, props, preset.type === 'text' ? preset.name : undefined), timing } as Layer
    get().update((p) => {
      if (layer.type === 'background') p.layers.unshift(layer)
      else if (layer.type === 'filter') p.layers.splice(aboveBackground(p.layers), 0, layer)
      else p.layers.push(layer)
    })
    get().selectLayer(layer.id)
    return layer.id
  },

  addFilterLayer(presetId, at) {
    const preset = presetById(presetId)
    if (!preset) return null
    const layer = createLayer('filter', { ...preset.values, preset: preset.id, intensity: 1 })
    layer.timing = at === undefined ? { ...FULL_TIMING } : dropTiming(get().project, at)
    get().update((p) => {
      p.layers.splice(aboveBackground(p.layers), 0, layer)
    })
    get().selectLayer(layer.id)
    return layer.id
  },

  setMainBackground(file) {
    const { project } = get()
    // Lớp nền phủ cả video nằm dưới cùng (các đoạn nền theo bài giữ nguyên)
    const main = project.layers.find((l) => l.type === 'background' && l.timing.start <= 0 && l.timing.end === null)
    if (main) {
      get().setBackgroundSource(main.id, file)
      return main.id
    }
    const base = project.layers.find((l) => l.type === 'background')?.props as BackgroundProps | undefined
    const layer = createLayer('background', { ...(base ? structuredClone(base) : {}), mode: file.kind, src: file.path })
    get().update((p) => {
      p.layers.unshift(layer)
      addToLibrary(p, [file.path])
    })
    get().selectLayer(layer.id)
    return layer.id
  },

  addLibraryMedia(paths) {
    const have = new Set(get().project.library ?? [])
    const fresh = [...new Set(paths)].filter((x) => !have.has(x) && (mediaKind(x) === 'image' || mediaKind(x) === 'video'))
    if (fresh.length === 0) return 0
    get().update((p) => {
      addToLibrary(p, fresh)
    })
    return fresh.length
  },

  removeLibraryMedia(path) {
    get().update((p) => {
      p.library = (p.library ?? []).filter((x) => x !== path)
    })
  },

  applyStyle(template, keepBackground) {
    const next = applyTemplate(get().project, template, { keepBackground })
    get().update((p) => {
      p.layers = next.layers
    })
    const sel = defaultSelection(next)
    get().setSelection(sel ? [sel] : [], [])
  },

  setLayersLocked(ids, locked) {
    get().update((p) => {
      for (const l of p.layers) if (ids.includes(l.id)) l.locked = locked || undefined
    })
  },

  setLayersColor(ids, color) {
    get().update((p) => {
      for (const l of p.layers) if (ids.includes(l.id)) l.color = color
    })
  },

  setLayersEnabled(ids, enabled) {
    get().update((p) => {
      for (const l of p.layers) if (ids.includes(l.id)) l.enabled = enabled
    })
  },

  setLanguage(lang) {
    setLang(lang)
    set({ lang })
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      // bỏ qua
    }
  },

  setPreviewQuality(q) {
    set({ previewQuality: q })
    try {
      localStorage.setItem(PREVIEW_QUALITY_KEY, q)
    } catch {
      // bỏ qua
    }
  },

  bumpFeatures() {
    set((s) => ({ featuresVersion: s.featuresVersion + 1 }))
  },

  setTime(t) {
    set({ currentTime: t })
  },

  setPlaying(p) {
    set({ playing: p })
  },

  openDialog(d) {
    set({ dialog: d })
  },

  toast(kind, text) {
    const id = ++toastId
    // Chỉ giữ 3 thông báo mới nhất: thao tác liên tiếp không phủ kín khung preview
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }].slice(-3) }))
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 8000 : 3000)
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  }
}))

/** Có gì đã chép (Ctrl+C) để dán không */
export function hasClipboard(): boolean {
  return clipboard.layers.length + clipboard.tracks.length > 0
}

/** Sau hoàn tác / làm lại: bỏ khỏi vùng chọn các lớp, bài không còn trong project */
function prunedSelection(st: State, p: Project): Partial<State> {
  const layers = new Set(p.layers.map((l) => l.id))
  const tracks = new Set(p.tracks.map((t) => t.id))
  return {
    selectedLayerIds: st.selectedLayerIds.filter((id) => layers.has(id)),
    selectedLayerId: st.selectedLayerId && layers.has(st.selectedLayerId) ? st.selectedLayerId : null,
    selectedTrackIds: st.selectedTrackIds.filter((id) => tracks.has(id)),
    selectedTrackId: st.selectedTrackId && tracks.has(st.selectedTrackId) ? st.selectedTrackId : null
  }
}

/** Ghi file vào thư viện ảnh / video của project (bỏ qua file đã có) */
function addToLibrary(p: Project, paths: string[]): void {
  const lib = p.library ?? (p.library = [])
  for (const x of paths) if (!lib.includes(x)) lib.push(x)
}

/** Kéo mục thư viện vào timeline tại `at`: từ chỗ thả đến hết bài đó (chưa có nhạc: cả video) */
function dropTiming(p: Project, at: number): LayerTiming {
  const tl = buildTimeline(p.tracks, p.settings)
  if (tl.entries.length === 0) return { ...FULL_TIMING }
  return dropSegments(tl.entries, tl.total, at, 1)[0]
}

/** Tên file (không đuôi) làm tên lớp nền thả vào timeline */
function fileLabel(path: string): string {
  return (path.split(/[\\/]/).pop() ?? path).replace(/\.[^.]+$/, '')
}

/** Độ dài video hiện tại (0 khi chưa có bài) — để tách / dán đúng giới hạn */
function timelineTotal(p: Project): number {
  return buildTimeline(p.tracks, p.settings).total
}

/** Vị trí ngay trên lớp nền cuối cùng (bộ lọc đặt ở đây chỉ tác động lên ảnh nền) */
export function aboveBackground(layers: Layer[]): number {
  let last = -1
  layers.forEach((l, i) => {
    if (l.type === 'background') last = i
  })
  return last + 1
}

/** Khi undo/redo vẫn giữ dữ liệu phân tích (analysisKey, thời lượng) mới nhất của từng bài */
function keepDerived(target: Project, current: Project): Project {
  const byPath = new Map(current.tracks.map((t) => [t.path, t]))
  let changed = false
  const tracks = target.tracks.map((t) => {
    const cur = byPath.get(t.path)
    if (!cur?.analysisKey || (cur.analysisKey === t.analysisKey && cur.duration === t.duration)) return t
    changed = true
    return { ...t, analysisKey: cur.analysisKey, duration: cur.duration }
  })
  return changed ? { ...target, tracks } : target
}
