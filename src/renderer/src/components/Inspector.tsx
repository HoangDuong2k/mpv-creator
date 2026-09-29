import type { ReactNode } from 'react'
import { FULL_TIMING, LAYER_DEFAULTS, LAYER_LABELS } from '../../../shared/defaults'
import { isFullLength } from '../../../shared/timing'
import type { Layer } from '../../../shared/types'
import { FILTER_KEYS } from '../../../shared/filterPresets'
import { FIELDS, type Field } from '../fields'
import { FilterPanel } from './FilterPanel'
import { useTimeline } from '../hooks'
import { useStore } from '../store'
import { dragRange, layerRange } from '../timelineModel'
import { ColorInput, Icon, NumberInput, RangeInput, Row, TimeInput, fileName } from './ui'
import { useLayout } from '../layout'
import { tr } from '../../../shared/i18n'

const api = window.api

export function Inspector({ layer }: { layer: Layer }): ReactNode {
  const setLayerProps = useStore((s) => s.setLayerProps)
  const renameLayer = useStore((s) => s.renameLayer)
  const props = layer.props as unknown as Record<string, unknown>
  const set = (key: string, value: unknown, coalesce = false): void => {
    const patch: Record<string, unknown> = { [key]: value }
    // Tinh chỉnh tay một bộ lọc → không còn đúng mẫu nữa
    if (layer.type === 'filter' && (FILTER_KEYS as string[]).includes(key)) patch.preset = 'custom'
    setLayerProps(layer.id, patch, coalesce ? `${layer.id}.${key}` : undefined)
  }

  return (
    <div className="inspector">
      <div className="inspector-head">
        <input className="layer-name" value={tr(layer.name)} onChange={(e) => renameLayer(layer.id, e.target.value)} aria-label={tr('Tên lớp')} />
        <span className="badge">{tr(LAYER_LABELS[layer.type])}</span>
      </div>
      {layer.type === 'cta' ? (
        <p className="muted small">
          {tr('Trên timeline: kéo các ô đỏ để dời thời điểm hiện, kéo mép phải để đổi thời lượng, nhấp đúp vào hàng để thêm lần hiện, chọn ô rồi bấm Delete để xoá.')}
        </p>
      ) : (
        <TimingSection layer={layer} />
      )}
      {layer.type === 'filter' && <FilterPanel layer={layer} />}
      <FieldList layer={layer} props={props} set={set} />
    </div>
  )
}

/** Tiêu đề nhóm thuộc tính: bấm để đóng / mở (nhớ cho lần sau) */
function SectionTitle({ id, label }: { id: string; label: string }): ReactNode {
  const closed = useLayout((s) => s.closed.includes(id))
  return (
    <button type="button" className={`section-title collapsible${closed ? ' closed' : ''}`} onClick={() => useLayout.getState().toggleSection(id)} aria-expanded={!closed}>
      <Icon name="expand" size={16} />
      {label}
    </button>
  )
}

/** Các thuộc tính của lớp, chia theo nhóm; nhóm đang đóng thì ẩn các ô bên trong */
function FieldList({ layer, props, set }: { layer: Layer; props: Record<string, unknown>; set: (k: string, v: unknown, coalesce?: boolean) => void }): ReactNode {
  const closed = useLayout((s) => s.closed)
  const fields = FIELDS[layer.type]
  const defaults = LAYER_DEFAULTS[layer.type] as unknown as Record<string, unknown>
  let group = `${layer.type}:props`
  const out: ReactNode[] = []
  if (fields[0]?.kind !== 'section') out.push(<SectionTitle key="props" id={group} label={tr('Thuộc tính')} />)
  fields.forEach((f, i) => {
    if (f.show && !f.show(props)) return
    if (f.kind === 'section') {
      group = `${layer.type}:${f.label}`
      out.push(<SectionTitle key={`s-${f.label}-${i}`} id={group} label={tr(f.label)} />)
      return
    }
    if (closed.includes(group)) return
    out.push(<FieldView key={`${f.kind}-${f.key}-${i}`} field={f} props={props} set={set} def={defaults[f.key]} />)
  })
  return <>{out}</>
}

/** Thông số tỉ lệ (0…1): hiện theo %; hệ số (cỡ, độ nhạy, tốc độ…): hiện "×" */
const TIMES_KEYS = ['scale', 'sensitivity', 'speed', 'beatReact']

function FieldView({
  field: f,
  props,
  set,
  def
}: {
  field: Exclude<Field, { kind: 'section' }>
  props: Record<string, unknown>
  set: (k: string, v: unknown, coalesce?: boolean) => void
  def: unknown
}): ReactNode {
  const label = tr(f.label)
  const value = props[f.key]
  switch (f.kind) {
    case 'range': {
      const percent = !f.unit && f.min >= -1 && f.max <= 1
      return (
        <Row label={f.unit ? `${label} (${tr(f.unit)})` : label}>
          <RangeInput
            value={Number(value)}
            min={f.min}
            max={f.max}
            step={f.step}
            onChange={(v) => set(f.key, v, true)}
            percent={percent}
            suffix={!percent && TIMES_KEYS.includes(f.key) ? '×' : undefined}
            resetTo={typeof def === 'number' ? def : undefined}
          />
        </Row>
      )
    }
    case 'number':
      return (
        <Row label={f.unit ? `${label} (${tr(f.unit)})` : label}>
          <NumberInput value={Number(value)} min={f.min} max={f.max} step={f.step} onChange={(v) => set(f.key, v)} />
        </Row>
      )
    case 'select':
      return (
        <Row label={label}>
          <select value={String(value)} onChange={(e) => set(f.key, e.target.value)}>
            {f.options.map(([v, text]) => (
              <option key={v} value={v}>
                {tr(text)}
              </option>
            ))}
          </select>
        </Row>
      )
    case 'color':
      return (
        <Row label={label}>
          <ColorInput value={String(value)} onChange={(v) => set(f.key, v, true)} />
        </Row>
      )
    case 'toggle':
      return (
        <label className="toggle">
          <input type="checkbox" checked={!!value} onChange={(e) => set(f.key, e.target.checked)} />
          <span>{label}</span>
        </label>
      )
    case 'text':
      return (
        <Row label={label}>
          <input type="text" value={String(value)} placeholder={f.placeholder ? tr(f.placeholder) : undefined} onChange={(e) => set(f.key, e.target.value, true)} />
        </Row>
      )
    case 'textarea':
      return (
        <Row label={label} hint={f.hint ? tr(f.hint) : undefined}>
          <textarea rows={2} value={String(value)} onChange={(e) => set(f.key, e.target.value, true)} />
        </Row>
      )
    case 'file':
      return (
        <Row label={label}>
          <div className="file-pick">
            <button
              type="button"
              className="btn small"
              onClick={async () => {
                const [p] = await api.openFiles(f.accept, false)
                if (p) set(f.key, p)
              }}
            >
              {tr('Chọn…')}
            </button>
            <span className="file-name" title={String(value)}>
              {value ? fileName(String(value)) : tr('Chưa chọn')}
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
  const withHours = total >= 3600
  const set = (patch: Partial<Layer['timing']>): void => setLayerTiming(layer.id, patch)
  const closed = useLayout((s) => s.closed.includes('timing'))
  return (
    <>
      <SectionTitle id="timing" label={tr('Thời gian hiển thị')} />
      {!closed && <TimingFields layer={layer} set={set} total={total} withHours={withHours} />}
    </>
  )
}

function TimingFields({ layer, set, total, withHours }: { layer: Layer; set: (patch: Partial<Layer['timing']>) => void; total: number; withHours: boolean }): ReactNode {
  const t = layer.timing
  const range = layerRange(t, total)
  return (
    <>
      <div className="two">
        <Row label={tr('Bắt đầu')}>
          <TimeInput value={t.start} withHours={withHours} onChange={(v) => set(dragRange('start', t, total, v))} />
        </Row>
        <Row label={tr('Kết thúc')}>
          {t.end === null ? (
            <div className="static-value">{tr('Hết video')}</div>
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
        <span>{tr('Kéo dài đến hết video (tự dài theo khi thêm bài)')}</span>
      </label>
      <div className="two">
        <Row label={tr('Hiện dần (giây)')}>
          <NumberInput value={t.fadeIn} min={0} step={0.1} onChange={(v) => set(dragRange('fadeIn', t, total, range.start + v))} />
        </Row>
        <Row label={tr('Ẩn dần (giây)')}>
          <NumberInput value={t.fadeOut} min={0} step={0.1} onChange={(v) => set(dragRange('fadeOut', t, total, range.end - v))} />
        </Row>
      </div>
      {!isFullLength(t) && (
        <button type="button" className="btn small" onClick={() => set({ ...FULL_TIMING })}>
          {tr('Hiện suốt video')}
        </button>
      )}
    </>
  )
}
