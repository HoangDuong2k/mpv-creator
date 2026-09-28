import type { ReactNode } from 'react'
import { FULL_TIMING, LAYER_LABELS } from '../../../shared/defaults'
import { isFullLength } from '../../../shared/timing'
import type { Layer } from '../../../shared/types'
import { FIELDS, type Field } from '../fields'
import { useTimeline } from '../hooks'
import { useStore } from '../store'
import { dragRange, layerRange } from '../timelineModel'
import { ColorInput, NumberInput, RangeInput, Row, TimeInput, fileName } from './ui'

const api = window.api

export function Inspector({ layer }: { layer: Layer }): ReactNode {
  const setLayerProps = useStore((s) => s.setLayerProps)
  const renameLayer = useStore((s) => s.renameLayer)
  const props = layer.props as unknown as Record<string, unknown>
  const set = (key: string, value: unknown, coalesce = false): void =>
    setLayerProps(layer.id, { [key]: value }, coalesce ? `${layer.id}.${key}` : undefined)

  return (
    <div className="inspector">
      <div className="inspector-head">
        <input className="layer-name" value={layer.name} onChange={(e) => renameLayer(layer.id, e.target.value)} aria-label="Tên lớp" />
        <span className="badge">{LAYER_LABELS[layer.type]}</span>
      </div>
      {layer.type === 'cta' ? (
        <p className="muted small">
          Trên timeline: kéo các ô đỏ để dời thời điểm hiện, kéo mép phải để đổi thời lượng, nhấp đúp vào hàng để thêm lần hiện, chọn ô rồi bấm
          Delete để xoá.
        </p>
      ) : (
        <TimingSection layer={layer} />
      )}
      {FIELDS[layer.type].map((f, i) => (f.show && !f.show(props) ? null : <FieldView key={`${f.kind}-${'key' in f ? f.key : f.label}-${i}`} field={f} props={props} set={set} />))}
    </div>
  )
}

function FieldView({ field: f, props, set }: { field: Field; props: Record<string, unknown>; set: (k: string, v: unknown, coalesce?: boolean) => void }): ReactNode {
  if (f.kind === 'section') return <div className="section-title">{f.label}</div>
  const value = props[f.key]
  switch (f.kind) {
    case 'range':
      return (
        <Row label={f.unit ? `${f.label} (${f.unit})` : f.label}>
          <RangeInput value={Number(value)} min={f.min} max={f.max} step={f.step} onChange={(v) => set(f.key, v, true)} />
        </Row>
      )
    case 'number':
      return (
        <Row label={f.unit ? `${f.label} (${f.unit})` : f.label}>
          <NumberInput value={Number(value)} min={f.min} max={f.max} step={f.step} onChange={(v) => set(f.key, v)} />
        </Row>
      )
    case 'select':
      return (
        <Row label={f.label}>
          <select value={String(value)} onChange={(e) => set(f.key, e.target.value)}>
            {f.options.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </Row>
      )
    case 'color':
      return (
        <Row label={f.label}>
          <ColorInput value={String(value)} onChange={(v) => set(f.key, v, true)} />
        </Row>
      )
    case 'toggle':
      return (
        <label className="toggle">
          <input type="checkbox" checked={!!value} onChange={(e) => set(f.key, e.target.checked)} />
          <span>{f.label}</span>
        </label>
      )
    case 'text':
      return (
        <Row label={f.label}>
          <input type="text" value={String(value)} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value, true)} />
        </Row>
      )
    case 'textarea':
      return (
        <Row label={f.label} hint={f.hint}>
          <textarea rows={2} value={String(value)} onChange={(e) => set(f.key, e.target.value, true)} />
        </Row>
      )
    case 'file':
      return (
        <Row label={f.label}>
          <div className="file-pick">
            <button
              type="button"
              className="btn small"
              onClick={async () => {
                const [p] = await api.openFiles(f.accept, false)
                if (p) set(f.key, p)
              }}
            >
              Chọn…
            </button>
            <span className="file-name" title={String(value)}>
              {value ? fileName(String(value)) : 'Chưa chọn'}
            </span>
          </div>
        </Row>
      )
  }
}

/** Khoảng thời gian layer hiện trong video (đồng bộ với thanh trên timeline) */
function TimingSection({ layer }: { layer: Layer }): ReactNode {
  const total = useTimeline().total
  const setLayerTiming = useStore((s) => s.setLayerTiming)
  const t = layer.timing
  const withHours = total >= 3600
  const range = layerRange(t, total)
  const set = (patch: Partial<Layer['timing']>): void => setLayerTiming(layer.id, patch)
  return (
    <>
      <div className="section-title">Thời gian hiển thị</div>
      <div className="two">
        <Row label="Bắt đầu">
          <TimeInput value={t.start} withHours={withHours} onChange={(v) => set(dragRange('start', t, total, v))} />
        </Row>
        <Row label="Kết thúc">
          {t.end === null ? (
            <div className="static-value">Hết video</div>
          ) : (
            <TimeInput value={t.end} withHours={withHours} onChange={(v) => set(dragRange('end', t, total, v))} />
          )}
        </Row>
      </div>
      <label className="toggle">
        <input
          type="checkbox"
          checked={t.end === null}
          onChange={(e) => set(e.target.checked ? { end: null } : { end: Math.round(range.end * 100) / 100 })}
        />
        <span>Kéo dài đến hết video (tự dài theo khi thêm bài)</span>
      </label>
      <div className="two">
        <Row label="Hiện dần (giây)">
          <NumberInput value={t.fadeIn} min={0} step={0.1} onChange={(v) => set(dragRange('fadeIn', t, total, range.start + v))} />
        </Row>
        <Row label="Ẩn dần (giây)">
          <NumberInput value={t.fadeOut} min={0} step={0.1} onChange={(v) => set(dragRange('fadeOut', t, total, range.end - v))} />
        </Row>
      </div>
      {!isFullLength(t) && (
        <button type="button" className="btn small" onClick={() => set({ ...FULL_TIMING })}>
          Hiện suốt video
        </button>
      )}
      <div className="section-title">Thuộc tính</div>
    </>
  )
}
