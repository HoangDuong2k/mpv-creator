import { useEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { LAYER_LABELS } from '../../../shared/defaults'
import { formatTime } from '../../../shared/time'
import type { LayerType } from '../../../shared/types'
import { useTimeline } from '../hooks'
import { useStore } from '../store'
import { layerRange } from '../timelineModel'
import { Inspector } from './Inspector'
import { TrackInspector } from './TrackInspector'
import { Icon, IconButton } from './ui'
import { tr } from '../../../shared/i18n'
import { useLayout } from '../layout'
import { CollapseButton, ColumnResizer } from './PanelFrame'

const ADDABLE: LayerType[] = ['visualizer', 'text', 'image', 'cta', 'filter', 'particles', 'flicker', 'vignette', 'progress', 'background']

export function LayersPanel(): ReactNode {
  const layers = useStore((s) => s.project.layers)
  const selectedId = useStore((s) => s.selectedLayerId)
  const selectedIds = useStore((s) => s.selectedLayerIds)
  const selectedTrack = useStore((s) => (s.selectedTrackId ? s.project.tracks.find((t) => t.id === s.selectedTrackId) : undefined))
  const { selectLayer, toggleLayerSelection, toggleLayer, moveLayer, removeLayer, duplicateLayer, addLayer, setLayersLocked } = useStore.getState()
  const tl = useTimeline()
  const [menu, setMenu] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listH = useLayout((s) => s.listH)
  // Đổi mục đang chọn → cuộn bảng thuộc tính về đầu
  useEffect(() => {
    if (wrapRef.current) wrapRef.current.scrollTop = 0
  }, [selectedId, selectedTrack?.id])
  const selected = layers.find((l) => l.id === selectedId)
  // Hiển thị lớp trên cùng ở đầu danh sách (giống Photoshop)
  const ordered = [...layers].reverse()
  const withHours = tl.total >= 3600

  return (
    <aside className="panel right">
      <ColumnResizer side="right" />
      <div className="panel-head">
        <h3>{tr('Lớp hiệu ứng')}</h3>
        <span className="panel-head-tools">
        <div className="add-menu">
          <button type="button" className="btn small primary" onClick={() => setMenu(!menu)}>
            <Icon name="add" size={16} /> {tr('Thêm lớp')}
          </button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)}>
              {ADDABLE.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => {
                    addLayer(t)
                    setMenu(false)
                  }}
                >
                  {tr(LAYER_LABELS[t])}
                </button>
              ))}
            </div>
          )}
        </div>
        <CollapseButton side="right" />
        </span>
      </div>
      <ul className="layer-list" ref={listRef} style={listH ? { height: listH, maxHeight: 'none' } : undefined}>
        {ordered.map((l, i) => {
          // Các đoạn sau khi tách thanh: ghi kèm khoảng thời gian để phân biệt
          const r = l.row ? layerRange(l.timing, tl.total) : null
          return (
            <li
              key={l.id}
              className={`layer${selectedIds.includes(l.id) ? ' selected' : ''}${l.enabled ? '' : ' disabled'}`}
              onClick={(e) => (e.ctrlKey || e.metaKey || e.shiftKey ? toggleLayerSelection(l.id) : selectLayer(l.id))}
            >
              <IconButton icon={l.enabled ? 'eye' : 'eyeOff'} title={l.enabled ? tr('Ẩn lớp') : tr('Hiện lớp')} onClick={() => toggleLayer(l.id)} size={16} />
              <span className="layer-title">
                {tr(l.name)}
                {l.name !== LAYER_LABELS[l.type] && <small>{tr(LAYER_LABELS[l.type])}</small>}
              </span>
              {r && (
                <span className="layer-range" title={tr('Khoảng thời gian của đoạn này')}>
                  {formatTime(r.start, withHours)}–{l.timing.end === null ? tr('hết') : formatTime(r.end, withHours)}
                </span>
              )}
              <span className="layer-actions" onClick={(e) => e.stopPropagation()}>
                <IconButton
                  icon={l.locked ? 'lock' : 'lockOpen'}
                  title={l.locked ? tr('Đang khoá — bấm để mở khoá') : tr('Khoá lớp (không kéo, tách, xoá nhầm)')}
                  onClick={() => setLayersLocked([l.id], !l.locked)}
                  active={!!l.locked}
                  size={15}
                />
                <IconButton icon="up" title={tr('Đưa lên trên')} onClick={() => moveLayer(l.id, 1)} disabled={i === 0} size={15} />
                <IconButton icon="down" title={tr('Đưa xuống dưới')} onClick={() => moveLayer(l.id, -1)} disabled={i === ordered.length - 1} size={15} />
                <IconButton icon="duplicate" title={tr('Nhân bản')} onClick={() => duplicateLayer(l.id)} size={15} />
                <IconButton icon="delete" title={l.locked ? tr('Lớp đang khoá — mở khoá để xoá') : tr('Xoá lớp')} onClick={() => removeLayer(l.id)} disabled={!!l.locked} size={15} />
              </span>
            </li>
          )
        })}
      </ul>
      <SplitResizer listRef={listRef} />
      <div className="inspector-wrap" ref={wrapRef}>{selectedTrack ? <TrackInspector track={selectedTrack} /> : selected ? <Inspector layer={selected} /> : <p className="muted pad">{tr('Chọn một lớp ở danh sách trên, hoặc nhấp thẳng vào nó trên khung hình để chỉnh vị trí, kích thước, màu sắc.')}</p>}</div>
    </aside>
  )
}

/** Vạch kéo chia chỗ giữa danh sách lớp và bảng thuộc tính; nhấp đúp để về mặc định */
function SplitResizer({ listRef }: { listRef: RefObject<HTMLUListElement | null> }): ReactNode {
  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    const list = listRef.current
    if (e.button !== 0 || !list) return
    e.preventDefault()
    const el = e.currentTarget
    const y0 = e.clientY
    const h0 = list.getBoundingClientRect().height
    const panelH = list.parentElement?.getBoundingClientRect().height ?? 600
    el.setPointerCapture(e.pointerId)
    el.classList.add('active')
    const move = (ev: globalThis.PointerEvent): void => useLayout.getState().setListH(Math.min(panelH - 180, Math.max(64, h0 + ev.clientY - y0)))
    const up = (): void => {
      el.classList.remove('active')
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
  return (
    <div
      className="split-resize"
      onPointerDown={onPointerDown}
      onDoubleClick={() => useLayout.getState().setListH(null)}
      title={tr('Kéo để chia chỗ cho danh sách lớp và bảng thuộc tính · nhấp đúp để về mặc định')}
      role="separator"
      aria-orientation="horizontal"
    />
  )
}
