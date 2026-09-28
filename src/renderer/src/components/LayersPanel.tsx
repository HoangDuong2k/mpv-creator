import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LAYER_LABELS } from '../../../shared/defaults'
import type { LayerType } from '../../../shared/types'
import { useStore } from '../store'
import { Inspector } from './Inspector'
import { TrackInspector } from './TrackInspector'
import { Icon, IconButton } from './ui'

const ADDABLE: LayerType[] = ['visualizer', 'text', 'image', 'cta', 'filter', 'particles', 'flicker', 'vignette', 'progress', 'background']

export function LayersPanel(): ReactNode {
  const layers = useStore((s) => s.project.layers)
  const selectedId = useStore((s) => s.selectedLayerId)
  const selectedTrack = useStore((s) => (s.selectedTrackId ? s.project.tracks.find((t) => t.id === s.selectedTrackId) : undefined))
  const { selectLayer, toggleLayer, moveLayer, removeLayer, duplicateLayer, addLayer } = useStore.getState()
  const [menu, setMenu] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  // Đổi mục đang chọn → cuộn bảng thuộc tính về đầu
  useEffect(() => {
    if (wrapRef.current) wrapRef.current.scrollTop = 0
  }, [selectedId, selectedTrack?.id])
  const selected = layers.find((l) => l.id === selectedId)
  // Hiển thị lớp trên cùng ở đầu danh sách (giống Photoshop)
  const ordered = [...layers].reverse()

  return (
    <aside className="panel right">
      <div className="panel-head">
        <h3>Lớp hiệu ứng</h3>
        <div className="add-menu">
          <button type="button" className="btn small primary" onClick={() => setMenu(!menu)}>
            <Icon name="add" size={16} /> Thêm lớp
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
                  {LAYER_LABELS[t]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <ul className="layer-list">
        {ordered.map((l, i) => (
          <li key={l.id} className={`layer${l.id === selectedId ? ' selected' : ''}${l.enabled ? '' : ' disabled'}`} onClick={() => selectLayer(l.id)}>
            <IconButton icon={l.enabled ? 'eye' : 'eyeOff'} title={l.enabled ? 'Ẩn lớp' : 'Hiện lớp'} onClick={() => toggleLayer(l.id)} size={16} />
            <span className="layer-title">
              {l.name}
              {l.name !== LAYER_LABELS[l.type] && <small>{LAYER_LABELS[l.type]}</small>}
            </span>
            <span className="layer-actions" onClick={(e) => e.stopPropagation()}>
              <IconButton icon="up" title="Đưa lên trên" onClick={() => moveLayer(l.id, 1)} disabled={i === 0} size={15} />
              <IconButton icon="down" title="Đưa xuống dưới" onClick={() => moveLayer(l.id, -1)} disabled={i === ordered.length - 1} size={15} />
              <IconButton icon="duplicate" title="Nhân bản" onClick={() => duplicateLayer(l.id)} size={15} />
              <IconButton icon="delete" title="Xoá lớp" onClick={() => removeLayer(l.id)} size={15} />
            </span>
          </li>
        ))}
      </ul>
      <div className="inspector-wrap" ref={wrapRef}>{selectedTrack ? <TrackInspector track={selectedTrack} /> : selected ? <Inspector layer={selected} /> : <p className="muted pad">Chọn một lớp ở danh sách trên, hoặc nhấp thẳng vào nó trên khung hình để chỉnh vị trí, kích thước, màu sắc.</p>}</div>
    </aside>
  )
}
