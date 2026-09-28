// Kéo thả trên preview: đổi thao tác chuột thành thay đổi thuộc tính của layer.
import type { Rect } from '../../engine'
import type { Layer, LayerType } from '../../shared/types'
import { FIELDS } from './fields'

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface DragSession {
  layerId: string
  mode: 'move' | 'resize'
  handle?: Handle
  /** Điểm bắt đầu kéo (px của project) */
  start: { x: number; y: number }
  box: Rect
  props: Record<string, unknown>
  /** Khoá gộp undo: cả lần kéo là một bước hoàn tác */
  undoKey: string
}

export interface DragResult {
  patch: Record<string, unknown>
  /** Đường gióng khi bắt dính vào giữa khung hình */
  guides: { x?: number; y?: number }
}

const MOVABLE: LayerType[] = ['visualizer', 'text', 'image', 'progress', 'cta', 'particles']

export function isMovable(layer: Layer): boolean {
  return MOVABLE.includes(layer.type)
}

const CORNERS: Handle[] = ['nw', 'ne', 'sw', 'se']
const ALL: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export function handlesFor(layer: Layer): Handle[] {
  switch (layer.type) {
    case 'visualizer':
      return layer.props.style === 'circle' ? CORNERS : ALL
    case 'particles':
      return ALL
    case 'progress':
      return ['e', 'w']
    case 'text':
    case 'image':
    case 'cta':
      return CORNERS
    default:
      return []
  }
}

export function handlePoint(box: Rect, h: Handle): { x: number; y: number } {
  const x = h.includes('w') ? box.x : h.includes('e') ? box.x + box.w : box.x + box.w / 2
  const y = h.startsWith('n') ? box.y : h.startsWith('s') ? box.y + box.h : box.y + box.h / 2
  return { x, y }
}

export const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize'
}

/** Giới hạn giá trị theo min/max khai báo trong bảng thuộc tính */
function clampProp(type: LayerType, key: string, v: number): number {
  const f = FIELDS[type].find((x) => (x.kind === 'range' || x.kind === 'number') && x.key === key) as { min?: number; max?: number } | undefined
  let out = v
  if (f?.min !== undefined) out = Math.max(f.min, out)
  if (f?.max !== undefined) out = Math.min(f.max, out)
  return Math.round(out * 1000) / 1000
}

export function applyDrag(layer: Layer, s: DragSession, px: number, py: number, W: number, H: number, snapPx: number): DragResult {
  const guides: DragResult['guides'] = {}
  const cx0 = s.box.x + s.box.w / 2
  const cy0 = s.box.y + s.box.h / 2
  const num = (k: string): number => Number(s.props[k])
  const set = (patch: Record<string, unknown>, k: string, v: number): void => {
    patch[k] = clampProp(layer.type, k, v)
  }

  if (s.mode === 'move') {
    let ncx = cx0 + px - s.start.x
    let ncy = cy0 + py - s.start.y
    if (snapPx > 0) {
      if (Math.abs(ncx - W / 2) < snapPx) {
        ncx = W / 2
        guides.x = W / 2
      }
      if (Math.abs(ncy - H / 2) < snapPx) {
        ncy = H / 2
        guides.y = H / 2
      }
    }
    const patch: Record<string, unknown> = {}
    if (layer.type === 'cta') {
      // Chuyển sang đặt tự do, tâm khối nút theo chuột
      patch.anchor = 'free'
      set(patch, 'x', ncx / W)
      set(patch, 'y', ncy / H)
    } else {
      set(patch, 'x', num('x') + (ncx - cx0) / W)
      set(patch, 'y', num('y') + (ncy - cy0) / H)
    }
    return { patch, guides }
  }

  // Đổi kích thước quanh tâm khung
  const h = s.handle ?? 'se'
  const sdx = Math.max(1, Math.abs(s.start.x - cx0))
  const sdy = Math.max(1, Math.abs(s.start.y - cy0))
  const kx = Math.max(0.02, Math.abs(px - cx0) / sdx)
  const ky = Math.max(0.02, Math.abs(py - cy0) / sdy)
  const k = Math.max(0.02, Math.hypot(px - cx0, py - cy0) / Math.max(1, Math.hypot(s.start.x - cx0, s.start.y - cy0)))
  const horiz = h.includes('e') || h.includes('w')
  const vert = h.startsWith('n') || h.startsWith('s')
  const patch: Record<string, unknown> = {}
  switch (layer.type) {
    case 'visualizer':
      if (layer.props.style === 'circle') {
        set(patch, 'radius', num('radius') * k)
        set(patch, 'height', num('height') * k)
      } else {
        if (horiz) set(patch, 'width', num('width') * kx)
        if (vert) set(patch, 'height', num('height') * ky)
      }
      break
    case 'particles':
      if (horiz) set(patch, 'width', num('width') * kx)
      if (vert) set(patch, 'height', num('height') * ky)
      break
    case 'progress':
      set(patch, 'width', num('width') * kx)
      break
    case 'text':
      set(patch, 'size', num('size') * k)
      break
    case 'image':
      set(patch, 'width', num('width') * k)
      break
    case 'cta':
      set(patch, 'scale', num('scale') * k)
      break
  }
  return { patch, guides }
}

/** Layer trên cùng chứa điểm (x, y). Layer phủ gần kín khung chỉ chọn được khi không còn layer nào khác. */
export function hitTest(layers: Layer[], bounds: Map<string, Rect>, x: number, y: number, W: number, H: number): Layer | null {
  let fallback: Layer | null = null
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]
    if (!l.enabled || !isMovable(l)) continue
    const b = bounds.get(l.id)
    if (!b || x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) continue
    if (b.w * b.h > W * H * 0.9) fallback ??= l
    else return l
  }
  return fallback
}
