import { produce } from 'immer'
import { create } from 'zustand'
import { createDefaultProject, createLayer, normalizeProject } from '../../shared/defaults'
import { buildTimeline } from '../../shared/timeline'
import type { Layer, LayerPropsMap, LayerTiming, LayerType, Project, ProjectSettings, Track } from '../../shared/types'
import { pasteTimings, splitTiming } from './timelineModel'

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

/** Các lớp đã chép (Ctrl+C) — chỉ trong phiên làm việc */
let clipboard: Layer[] = []

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

export type DialogName = 'export' | 'settings' | 'chapters' | null

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
  /** Clip nhạc đang chọn trên timeline */
  selectedTrackId: string | null
  selectedCta: CtaSelection | null
  trackStatus: Record<string, TrackStatus>
  featuresVersion: number
  currentTime: number
  playing: boolean
  dialog: DialogName
  toasts: Toast[]
  previewQuality: PreviewQuality

  update(fn: (p: Project) => void, opts?: UpdateOptions): void
  undo(): void
  redo(): void
  loadProject(project: Project, filePath: string | null, dirty?: boolean): void
  newProject(): void
  markSaved(filePath: string): void

  addTracks(tracks: Track[]): void
  removeTrack(id: string): void
  moveTrack(from: number, to: number): void
  updateTrack(id: string, patch: Partial<Track>, opts?: UpdateOptions): void
  setTrackStatus(path: string, status: TrackStatus): void
  setSettings(patch: Partial<ProjectSettings>): void

  addLayer(type: LayerType): void
  removeLayer(id: string): void
  duplicateLayer(id: string): void
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
  selectCta(sel: CtaSelection | null): void

  /** Xoá các lớp (bỏ qua lớp đang khoá); trả về số lớp đã xoá */
  removeLayers(ids: string[]): number
  /** Tách các lớp tại thời điểm `t` thành hai đoạn chung hàng; trả về số lớp đã tách */
  splitLayers(ids: string[], t: number): number
  /** Chép các lớp (Ctrl+C); trả về số lớp đã chép */
  copyLayers(ids: string[]): number
  /** Dán các lớp đã chép tại thời điểm `at` (Ctrl+V); trả về số lớp đã dán */
  pasteLayers(at: number): number
  setLayersLocked(ids: string[], locked: boolean): void
  setLayersColor(ids: string[], color: string | undefined): void
  setLayersEnabled(ids: string[], enabled: boolean): void
  setPreviewQuality(q: PreviewQuality): void

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
  selectedCta: null,
  trackStatus: {},
  featuresVersion: 0,
  currentTime: 0,
  playing: false,
  dialog: null,
  toasts: [],
  previewQuality: loadPreviewQuality(),

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
    set({ project: keepDerived(prev, project), past: past.slice(0, -1), future: [project, ...future], dirty: true, lastCoalesce: null })
  },

  redo() {
    const { past, project, future } = get()
    const next = future[0]
    if (!next) return
    set({ project: keepDerived(next, project), past: [...past, project], future: future.slice(1), dirty: true, lastCoalesce: null })
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

  removeTrack(id) {
    get().update((p) => {
      p.tracks = p.tracks.filter((t) => t.id !== id)
    })
    if (get().selectedTrackId === id) set({ selectedTrackId: null })
  },

  moveTrack(from, to) {
    if (from === to) return
    get().update((p) => {
      const [t] = p.tracks.splice(from, 1)
      p.tracks.splice(to, 0, t)
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
    const copy = { ...structuredClone(src), id: createLayer(src.type).id, name: `${src.name} (bản sao)`, row: undefined, locked: undefined } as Layer
    get().update((p) => {
      const i = p.layers.findIndex((l) => l.id === id)
      p.layers.splice(i + 1, 0, copy)
    })
    get().selectLayer(copy.id)
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
    set({ selectedLayerId: id, selectedLayerIds: id ? [id] : [], selectedTrackId: null, selectedCta: null })
  },

  toggleLayerSelection(id) {
    const { selectedLayerIds, selectedLayerId } = get()
    const has = selectedLayerIds.includes(id)
    const ids = has ? selectedLayerIds.filter((x) => x !== id) : [...selectedLayerIds, id]
    // Lớp chính: lớp vừa thêm; bỏ lớp chính thì lấy lớp chọn gần nhất còn lại
    const primary = has ? (selectedLayerId === id ? (ids[ids.length - 1] ?? null) : selectedLayerId) : id
    set({ selectedLayerIds: ids, selectedLayerId: primary, selectedTrackId: null, selectedCta: null })
  },

  selectLayers(ids) {
    set({ selectedLayerIds: ids, selectedLayerId: ids[ids.length - 1] ?? null, selectedTrackId: null, selectedCta: null })
  },

  selectTrack(id) {
    const keep = id ? null : get().selectedLayerId
    set({ selectedTrackId: id, selectedLayerId: keep, selectedLayerIds: keep ? [keep] : [], selectedCta: null })
  },

  selectCta(sel) {
    const keep = sel ? sel.layerId : get().selectedLayerId
    set({ selectedCta: sel, selectedLayerId: keep, selectedLayerIds: keep ? [keep] : [], selectedTrackId: null })
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
    // Giữ thứ tự chồng lớp (dưới → trên)
    clipboard = get()
      .project.layers.filter((l) => ids.includes(l.id))
      .map((l) => structuredClone(l))
    return clipboard.length
  },

  pasteLayers(at) {
    if (clipboard.length === 0) return 0
    const total = timelineTotal(get().project)
    const timings = pasteTimings(
      clipboard.map((l) => l.timing),
      at,
      total
    )
    const pasted = clipboard.map((src, i) => ({
      src: src.id,
      layer: { ...structuredClone(src), id: createLayer(src.type).id, timing: timings[i], row: undefined, locked: undefined } as Layer
    }))
    get().update((p) => {
      for (const { src, layer } of pasted) {
        // Ngay trên lớp gốc nếu còn (giữ phạm vi của bộ lọc…), nếu không thì theo quy tắc thêm lớp
        const i = p.layers.findIndex((l) => l.id === src)
        if (i >= 0) p.layers.splice(i + 1, 0, layer)
        else if (layer.type === 'background') p.layers.unshift(layer)
        else if (layer.type === 'filter') p.layers.splice(aboveBackground(p.layers), 0, layer)
        else p.layers.push(layer)
      }
    })
    get().selectLayers(pasted.map((x) => x.layer.id))
    return pasted.length
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
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }))
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 8000 : 4000)
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  }
}))

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
