import { useEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from 'react'
import type { Rect, Renderer } from '../../../engine'
import { LAYER_LABELS } from '../../../shared/defaults'
import { HANDLE_CURSOR, applyDrag, handlePoint, handlesFor, hitTest, isMovable, type DragSession, type Handle } from '../editing'
import { formatTimePrecise } from '../../../shared/time'
import { layerFade } from '../../../shared/timing'
import { useTimeline } from '../hooks'
import { useStore } from '../store'
import { layerRange } from '../timelineModel'
import { tr } from '../../../shared/i18n'
import { useLayout } from '../layout'
import { youtubeSafeZones } from '../safeArea'

const HANDLE_HIT = 8 // px màn hình
const SNAP = 8 // px màn hình

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return a === b
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5
}

function inside(p: { x: number; y: number }, b: Rect): boolean {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h
}

/**
 * Khung preview: canvas + lớp phủ để chọn layer, kéo di chuyển,
 * kéo ô vuông để đổi kích thước, tự bắt dính vào giữa khung hình.
 */
export function Stage({
  canvasRef,
  renderer,
  W,
  H,
  onTogglePlay
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>
  renderer: Renderer
  W: number
  H: number
  onTogglePlay: () => void
}): ReactNode {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ w: 0, h: 0 })
  const [box, setBox] = useState<Rect | null>(null)
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({})
  const [cursor, setCursor] = useState('default')
  const drag = useRef<DragSession | null>(null)
  const layers = useStore((s) => s.project.layers)
  const selectedId = useStore((s) => s.selectedLayerId)
  const selected = layers.find((l) => l.id === selectedId) ?? null
  const currentTime = useStore((s) => s.currentTime)
  const timeline = useTimeline()
  const safeArea = useLayout((st) => st.safeArea)

  // Canvas luôn vừa khung, giữ đúng tỉ lệ khung hình của project
  useEffect(() => {
    const el = wrapRef.current!
    const fit = (): void => {
      const k = Math.max(0.01, Math.min((el.clientWidth - 32) / W, (el.clientHeight - 32) / H))
      setView({ w: Math.floor(W * k), h: Math.floor(H * k) })
    }
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    fit()
    return () => ro.disconnect()
  }, [W, H])

  // Theo dõi khung bao của layer đang chọn (engine cập nhật mỗi frame)
  useEffect(() => {
    let raf = 0
    let last: Rect | null = null
    const tick = (): void => {
      raf = requestAnimationFrame(tick)
      const id = useStore.getState().selectedLayerId
      const b = (id && renderer.bounds.get(id)) || null
      if (!sameRect(b, last)) {
        last = b ? { ...b } : null
        setBox(last)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [renderer])

  const d = view.w > 0 ? view.w / W : 1
  const toProject = (e: PointerEvent<HTMLDivElement>): { x: number; y: number } => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: (e.clientX - r.left) / d, y: (e.clientY - r.top) / d }
  }
  // Lớp đang khoá: vẫn chọn được (từ danh sách / timeline) nhưng không kéo, không đổi kích thước
  const movableSelected = selected && isMovable(selected) && !selected.locked ? selected : null
  const handleAt = (p: { x: number; y: number }): Handle | null => {
    if (!movableSelected || !box) return null
    for (const h of handlesFor(movableSelected)) {
      const hp = handlePoint(box, h)
      if (Math.abs(hp.x - p.x) * d <= HANDLE_HIT && Math.abs(hp.y - p.y) * d <= HANDLE_HIT) return h
    }
    return null
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    const p = toProject(e)
    const st = useStore.getState()
    let layer = movableSelected
    let mode: DragSession['mode'] = 'move'
    const handle = handleAt(p)
    if (handle) mode = 'resize'
    else if (!(layer && box && inside(p, box))) {
      layer = hitTest(st.project.layers, renderer.bounds, p.x, p.y, W, H)
      if (!layer) return
      st.selectLayer(layer.id)
    }
    if (!layer) return
    const b = renderer.bounds.get(layer.id)
    if (!b) return
    drag.current = {
      layerId: layer.id,
      mode,
      handle: handle ?? undefined,
      start: p,
      box: { ...b },
      props: { ...(layer.props as unknown as Record<string, unknown>) },
      undoKey: `drag-${layer.id}-${Date.now()}`
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    setCursor(handle ? HANDLE_CURSOR[handle] : 'move')
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const p = toProject(e)
    const s = drag.current
    if (!s) {
      const h = handleAt(p)
      if (h) setCursor(HANDLE_CURSOR[h])
      else if (movableSelected && box && inside(p, box)) setCursor('move')
      else setCursor(hitTest(useStore.getState().project.layers, renderer.bounds, p.x, p.y, W, H) ? 'pointer' : 'default')
      return
    }
    const st = useStore.getState()
    const layer = st.project.layers.find((l) => l.id === s.layerId)
    if (!layer) return
    const { patch, guides: g } = applyDrag(layer, s, p.x, p.y, W, H, e.shiftKey ? 0 : SNAP / d)
    st.setLayerProps(layer.id, patch, s.undoKey)
    setGuides(g)
  }

  const endDrag = (): void => {
    drag.current = null
    setGuides({})
  }

  const visibleNow = !selected || selected.type === 'cta' || layerFade(selected.timing, currentTime, timeline.total) > 0
  let hint: string
  if (!selected) hint = tr('Nhấp vào chữ, cột sóng, nút Đăng ký… để chọn và kéo')
  else if (!visibleNow) {
    const r = layerRange(selected.timing, timeline.total)
    const wh = timeline.total >= 3600
    hint = tr('“{name}” chỉ hiện từ {from} đến {to}', {
      name: tr(selected.name),
      from: formatTimePrecise(r.start, wh),
      to: selected.timing.end === null ? tr('hết video') : formatTimePrecise(r.end, wh)
    })
  } else if (!isMovable(selected)) hint = tr('“{name}” phủ cả khung hình, chỉnh ở bảng bên phải', { name: tr(LAYER_LABELS[selected.type]) })
  else if (selected.locked) hint = tr('“{name}” đang khoá, mở khoá để kéo', { name: tr(selected.name) })
  else hint = tr('Kéo để di chuyển, kéo ô vuông để đổi cỡ. Bấm ? để xem phím tắt')

  return (
    <div className="stage" ref={wrapRef}>
      <div className="stage-inner" style={{ width: view.w, height: view.h }}>
        <canvas ref={canvasRef} className="stage-canvas" />
        {safeArea && <SafeZones W={W} H={H} />}
        <div
          className="stage-overlay"
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={onTogglePlay}
          data-testid="stage-overlay"
        >
          {selected?.locked && isMovable(selected) && box && <div className="sel-box locked" style={{ left: box.x * d, top: box.y * d, width: box.w * d, height: box.h * d }} />}
          {movableSelected && box && (
            <div className="sel-box" style={{ left: box.x * d, top: box.y * d, width: box.w * d, height: box.h * d }}>
              {handlesFor(movableSelected).map((h) => {
                const hp = handlePoint(box, h)
                return <span key={h} className="handle" data-handle={h} style={{ left: (hp.x - box.x) * d, top: (hp.y - box.y) * d }} />
              })}
            </div>
          )}
          {guides.x !== undefined && <div className="guide v" style={{ left: guides.x * d }} />}
          {guides.y !== undefined && <div className="guide h" style={{ top: guides.y * d }} />}
        </div>
      </div>
      <div className="stage-hint">{hint}</div>
    </div>
  )
}

/** Vùng an toàn YouTube vẽ đè lên preview (chỉ để canh, không có trong video xuất ra) */
function SafeZones({ W, H }: { W: number; H: number }): ReactNode {
  return (
    <div className="safe-zones" aria-hidden="true">
      {youtubeSafeZones(W, H).map((z) => (
        <div key={z.label} className="safe-zone" style={{ left: `${z.x * 100}%`, top: `${z.y * 100}%`, width: `${z.w * 100}%`, height: `${z.h * 100}%` }}>
          <span>{tr(z.label)}</span>
        </div>
      ))}
    </div>
  )
}
