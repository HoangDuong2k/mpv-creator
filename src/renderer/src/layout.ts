// Bố cục giao diện (độ rộng cột, cột thu gọn, nhóm thuộc tính đóng/mở…) — lưu lại cho lần mở app sau.
import { create } from 'zustand'

const KEY = 'pvm.layout'

export const LEFT_W = { min: 220, max: 480, def: 300 }
export const RIGHT_W = { min: 280, max: 560, def: 340 }
/** Bề ngang cột khi thu gọn (dải dọc có nút mở lại) */
export const RAIL_W = 34

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
}

/** Màn hình hẹp (laptop 1366 px trở xuống): hai cột mặc định hẹp hơn để preview đủ lớn */
function defaults(): Saved {
  const narrow = typeof window !== 'undefined' && window.innerWidth < 1400
  return { leftW: narrow ? 240 : LEFT_W.def, rightW: narrow ? 300 : RIGHT_W.def, leftOpen: true, rightOpen: true, listH: null, closed: [], safeArea: false }
}

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null
    if (v && typeof v === 'object') return { ...defaults(), ...v, closed: Array.isArray(v.closed) ? v.closed : [] }
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
    const saved: Saved = { leftW: s.leftW, rightW: s.rightW, leftOpen: s.leftOpen, rightOpen: s.rightOpen, listH: s.listH, closed: s.closed, safeArea: s.safeArea }
    localStorage.setItem(KEY, JSON.stringify(saved))
  } catch {
    // bỏ qua
  }
})
