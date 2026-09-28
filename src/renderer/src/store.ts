import { produce } from 'immer'
import { create } from 'zustand'
import { createDefaultProject, createLayer, normalizeProject } from '../../shared/defaults'
import type { Layer, LayerPropsMap, LayerTiming, LayerType, Project, ProjectSettings, Track } from '../../shared/types'

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
  selectedLayerId: string | null
  /** Clip nhạc đang chọn trên timeline */
  selectedTrackId: string | null
  selectedCta: CtaSelection | null
  trackStatus: Record<string, TrackStatus>
  featuresVersion: number
  currentTime: number
  playing: boolean
  dialog: DialogName
  toasts: Toast[]

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
  selectLayer(id: string | null): void
  selectTrack(id: string | null): void
  selectCta(sel: CtaSelection | null): void

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
  selectedTrackId: null,
  selectedCta: null,
  trackStatus: {},
  featuresVersion: 0,
  currentTime: 0,
  playing: false,
  dialog: null,
  toasts: [],

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
    set({
      project: p,
      filePath,
      dirty,
      past: [],
      future: [],
      lastCoalesce: null,
      selectedLayerId: defaultSelection(p),
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
    set({ selectedLayerId: layer.id })
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
    if (get().selectedLayerId === id) set({ selectedLayerId: null, selectedCta: null })
  },

  duplicateLayer(id) {
    const src = get().project.layers.find((l) => l.id === id)
    if (!src) return
    const copy = { ...structuredClone(src), id: createLayer(src.type).id, name: `${src.name} (bản sao)` } as Layer
    get().update((p) => {
      const i = p.layers.findIndex((l) => l.id === id)
      p.layers.splice(i + 1, 0, copy)
    })
    set({ selectedLayerId: copy.id })
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

  selectLayer(id) {
    set({ selectedLayerId: id, selectedTrackId: null, selectedCta: null })
  },

  selectTrack(id) {
    set({ selectedTrackId: id, selectedLayerId: id ? null : get().selectedLayerId, selectedCta: null })
  },

  selectCta(sel) {
    set({ selectedCta: sel, selectedLayerId: sel ? sel.layerId : get().selectedLayerId, selectedTrackId: null })
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
