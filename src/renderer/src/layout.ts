// Bố cục giao diện (độ rộng cột, cột thu gọn, nhóm thuộc tính đóng/mở…) — lưu lại cho lần mở app sau.
import { create } from 'zustand'

const KEY = 'pvm.layout'

export const LEFT_W = { min: 220, max: 480, def: 300 }
export const RIGHT_W = { min: 280, max: 560, def: 340 }
/** Bề ngang cột khi thu gọn (dải dọc có nút mở lại) */
export const RAIL_W = 34

/** Màu nhấn của giao diện (Cài đặt → Màu giao diện); CSS ở index.css theo html[data-accent] */
export type Accent = 'lavender' | 'orchid' | 'aqua'
export const ACCENTS: Accent[] = ['lavender', 'orchid', 'aqua']

/** Các thẻ của cột Thư viện (bên trái) */
export type LibraryTab = 'music' | 'media' | 'effects' | 'filters' | 'text'
const LIB_TABS: LibraryTab[] = ['music', 'media', 'effects', 'filters', 'text']

interface Saved {
  leftW: number
  rightW: number
  leftOpen: boolean
  rightOpen: boolean
  /** Chiều cao danh sách lớp ở cột phải (px); null = tự động */
  listH: number | null
  /** Các nhóm thuộc tính đang đóng ("visualizer:Màu sắc", "timing"…) */
  closed: string[]
  /** Hiện vùng an toàn YouTube trên preview */
  safeArea: boolean
  /** Thẻ đang mở của cột Thư viện */
  libTab: LibraryTab
  accent: Accent
}

interface LayoutState extends Saved {
  /** Trước khi bật "Tập trung preview": để tắt thì mở lại đúng như cũ */
  beforeFocus: { leftOpen: boolean; rightOpen: boolean } | null
  setWidth(side: 'left' | 'right', w: number): void
  setOpen(side: 'left' | 'right', open: boolean): void
  toggleFocus(): void
  setListH(h: number | null): void
  toggleSection(key: string): void
  /** Preview phủ kín cửa sổ (và toàn màn hình nếu được) */
  previewMax: boolean
  setPreviewMax(on: boolean): void
  toggleSafeArea(): void
  setLibTab(tab: LibraryTab): void
  setAccent(accent: Accent): void
}

/** Màn hình hẹp (laptop 1366 px trở xuống): hai cột mặc định hẹp hơn để preview đủ lớn */
function defaults(): Saved {
  const narrow = typeof window !== 'undefined' && window.innerWidth < 1400
  return { leftW: narrow ? 240 : LEFT_W.def, rightW: narrow ? 300 : RIGHT_W.def, leftOpen: true, rightOpen: true, listH: null, closed: [], safeArea: false, libTab: 'music', accent: 'lavender' }
}

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null
    if (v && typeof v === 'object')
      return {
        ...defaults(),
        ...v,
        closed: Array.isArray(v.closed) ? v.closed : [],
        libTab: LIB_TABS.includes(v.libTab as LibraryTab) ? (v.libTab as LibraryTab) : 'music',
        accent: ACCENTS.includes(v.accent as Accent) ? (v.accent as Accent) : 'lavender'
      }
  } catch {
    // bộ nhớ trình duyệt không dùng được
  }
  return defaults()
}

const clamp = (v: number, r: { min: number; max: number }): number => Math.round(Math.min(r.max, Math.max(r.min, v)))

export const useLayout = create<LayoutState>((set, get) => ({
  ...load(),
  beforeFocus: null,
  previewMax: false,
  setPreviewMax(on) {
    set({ previewMax: on })
  },
  toggleSafeArea() {
    set({ safeArea: !get().safeArea })
  },
  setAccent(accent) {
    set({ accent })
  },
  setLibTab(tab) {
    set({ libTab: tab, ...(get().leftOpen ? {} : { leftOpen: true, beforeFocus: null }) })
  },
  setWidth(side, w) {
    set(side === 'left' ? { leftW: clamp(w, LEFT_W) } : { rightW: clamp(w, RIGHT_W) })
  },
  setOpen(side, open) {
    set({ ...(side === 'left' ? { leftOpen: open } : { rightOpen: open }), beforeFocus: null })
  },
  toggleFocus() {
    const { leftOpen, rightOpen, beforeFocus } = get()
    if (leftOpen || rightOpen) set({ leftOpen: false, rightOpen: false, beforeFocus: { leftOpen, rightOpen } })
    else set({ ...(beforeFocus ?? { leftOpen: true, rightOpen: true }), beforeFocus: null })
  },
  setListH(h) {
    set({ listH: h === null ? null : Math.round(h) })
  },
  toggleSection(key) {
    const { closed } = get()
    set({ closed: closed.includes(key) ? closed.filter((k) => k !== key) : [...closed, key] })
  }
}))

// Lưu mỗi khi đổi (bỏ trạng thái tạm thời)
useLayout.subscribe((s) => {
  try {
    const saved: Saved = { leftW: s.leftW, rightW: s.rightW, leftOpen: s.leftOpen, rightOpen: s.rightOpen, listH: s.listH, closed: s.closed, safeArea: s.safeArea, libTab: s.libTab, accent: s.accent }
    localStorage.setItem(KEY, JSON.stringify(saved))
  } catch {
    // bỏ qua
  }
})

/** Màu nhấn lên thẻ <html> (CSS chọn theo data-accent): đặt ngay khi nạp, đổi theo Cài đặt */
function applyAccent(accent: Accent): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.accent = accent
}
applyAccent(useLayout.getState().accent)
useLayout.subscribe((s, prev) => {
  if (s.accent !== prev.accent) applyAccent(s.accent)
})
