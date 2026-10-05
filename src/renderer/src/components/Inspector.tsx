import type { ReactNode } from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge, Button, Input, NativeSelect, Switch, Textarea } from 'momi-ui'
import { FULL_TIMING, LAYER_DEFAULTS, LAYER_LABELS } from '../../../shared/defaults'
import { isFullLength } from '../../../shared/timing'
import type { Layer } from '../../../shared/types'
import { FILTER_KEYS } from '../../../shared/filterPresets'
import { FIELDS, type Field } from '../fields'
import { FilterPanel } from './FilterPanel'
import { useTimeline } from '../hooks'
import { useStore } from '../store'
import { dragRange, layerRange } from '../timelineModel'
import { ColorInput, ControlSize, NumberInput, RangeInput, Row, TimeInput, fileName, useControlSize, useToggleSize } from './ui'
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
    <ControlSize size="sm">
      <div className="inspector">
        <div className="inspector-head">
          <Input size="sm" className="layer-name" value={tr(layer.name)} onChange={(e) => renameLayer(layer.id, e.target.value)} aria-label={tr('Tên lớp')} />
          <Badge size="sm" shape="rounded">
            {tr(LAYER_LABELS[layer.type])}
          </Badge>
        </div>
        {layer.type === 'cta' && (
          <p className="muted small">
            {tr('Trên timeline: kéo các ô đỏ để dời thời điểm hiện, kéo mép phải để đổi thời lượng, nhấp đúp vào hàng để thêm lần hiện, chọn ô rồi bấm Delete để xoá.')}
          </p>
        )}
        <Sections layer={layer} props={props} set={set} />
      </div>
    </ControlSize>
  )
}

interface FieldSection {
  id: string
  label: string
  fields: Array<Exclude<Field, { kind: 'section' }>>
}

/** Chia thuộc tính theo nhóm; nhóm ẩn (theo `show`) bỏ luôn các ô của nó, nhóm không còn ô nào thì không hiện */
function fieldSections(layer: Layer, props: Record<string, unknown>): FieldSection[] {
  const fields = FIELDS[layer.type]
  const out: FieldSection[] = []
  let cur: FieldSection | null = null
  if (fields[0]?.kind !== 'section') out.push((cur = { id: `${layer.type}:props`, label: tr('Thuộc tính'), fields: [] }))
  for (const f of fields) {
    const shown = !f.show || f.show(props)
    if (f.kind === 'section') {
      cur = shown ? { id: `${layer.type}:${f.label}`, label: tr(f.label), fields: [] } : null
      if (cur) out.push(cur)
    } else if (shown && cur) cur.fields.push(f)
  }
  return out.filter((sec) => sec.fields.length > 0)
}

/** Các nhóm thuộc tính (Accordion của momi-ui): đóng / mở từng nhóm, nhớ cho lần sau (layout.closed) */
function Sections({ layer, props, set }: { layer: Layer; props: Record<string, unknown>; set: (k: string, v: unknown, coalesce?: boolean) => void }): ReactNode {
  const closed = useLayout((s) => s.closed)
  const defaults = LAYER_DEFAULTS[layer.type] as unknown as Record<string, unknown>
  const sections = fieldSections(layer, props)
  const ids = [...(layer.type === 'cta' ? [] : ['timing']), ...sections.map((sec) => sec.id)]
  const open = ids.filter((id) => !closed.includes(id))
  const onValueChange = (next: string[]): void => {
    for (const id of ids) if (open.includes(id) !== next.includes(id)) useLayout.getState().toggleSection(id)
  }
  return (
    <Accordion type="multiple" className="inspector-sections" value={open} onValueChange={onValueChange}>
      {layer.type !== 'cta' && (
        <AccordionItem value="timing">
          <AccordionTrigger className="inspector-section py-3">{tr('Thời gian hiển thị')}</AccordionTrigger>
          <AccordionContent className="inspector-fields grid gap-4 pt-0.5 pb-5 leading-normal text-foreground">
            <TimingFields layer={layer} />
          </AccordionContent>
        </AccordionItem>
      )}
      {layer.type === 'filter' && <FilterPanel layer={layer} />}
      {sections.map((sec) => (
        <AccordionItem key={sec.id} value={sec.id}>
          <AccordionTrigger className="inspector-section py-3">{sec.label}</AccordionTrigger>
          <AccordionContent className="inspector-fields grid gap-4 pt-0.5 pb-5 leading-normal text-foreground">
            {sec.fields.map((f, i) => (
              <FieldView key={`${f.kind}-${f.key}-${i}`} field={f} props={props} set={set} def={defaults[f.key]} />
            ))}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
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
  const size = useControlSize()
  const toggleSize = useToggleSize()
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
            label={label}
          />
        </Row>
      )
    }
    case 'number':
      return (
        <Row label={f.unit ? `${label} (${tr(f.unit)})` : label}>
          <NumberInput
            value={Number(value)}
            min={f.min}
            max={f.max}
            step={f.step}
            onChange={(v) => set(f.key, v, true)}
            resetValue={typeof def === 'number' ? def : undefined}
            label={label}
          />
        </Row>
      )
    case 'select':
      return (
        <Row label={label}>
          <NativeSelect size={size} value={String(value)} onChange={(e) => set(f.key, e.target.value)}>
            {f.options.map(([v, text]) => (
              <option key={v} value={v}>
                {tr(text)}
              </option>
            ))}
          </NativeSelect>
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
        <Switch size={toggleSize} className="toggle" wrapperClassName="toggle-row" label={label} checked={!!value} onCheckedChange={(on) => set(f.key, on)} />
      )
    case 'text':
      return (
        <Row label={label}>
          <Input size={size} type="text" value={String(value)} placeholder={f.placeholder ? tr(f.placeholder) : undefined} onChange={(e) => set(f.key, e.target.value, true)} />
        </Row>
      )
    case 'textarea':
      return (
        <Row label={label} hint={f.hint ? tr(f.hint) : undefined}>
          <Textarea rows={2} autoResize value={String(value)} onChange={(e) => set(f.key, e.target.value, true)} />
        </Row>
      )
    case 'file':
      return (
        <Row label={label}>
          <div className="file-pick">
            <Button
              variant="outline" tone="neutral" size={size}
              onClick={async () => {
                const [p] = await api.openFiles(f.accept, false)
                if (p) set(f.key, p)
              }}
            >
              {tr('Chọn…')}
            </Button>
            <span className="file-name" title={String(value)}>
              {value ? fileName(String(value)) : tr('Chưa chọn')}
            </span>
          </div>
        </Row>
      )
  }
}

/** Khoảng thời gian layer hiện trong video (đồng bộ với thanh trên timeline) */
function TimingFields({ layer }: { layer: Layer }): ReactNode {
  const total = useTimeline().total
  const setLayerTiming = useStore((s) => s.setLayerTiming)
  const withHours = total >= 3600
  const set = (patch: Partial<Layer['timing']>): void => setLayerTiming(layer.id, patch)
  const toggleSize = useToggleSize()
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
      <Switch
        size={toggleSize}
        className="toggle"
        wrapperClassName="toggle-row"
        label={tr('Kéo dài đến hết video (tự dài theo khi thêm bài)')}
        checked={t.end === null}
        onCheckedChange={(on) => set(on ? { end: null } : { end: Math.round(range.end * 100) / 100 })}
      />
      <div className="two">
        <Row label={tr('Hiện dần (giây)')}>
          <NumberInput value={t.fadeIn} min={0} step={0.1} onChange={(v) => set(dragRange('fadeIn', t, total, range.start + v))} />
        </Row>
        <Row label={tr('Ẩn dần (giây)')}>
          <NumberInput value={t.fadeOut} min={0} step={0.1} onChange={(v) => set(dragRange('fadeOut', t, total, range.end - v))} />
        </Row>
      </div>
      {!isFullLength(t) && (
        <Button variant="outline" tone="neutral" size="sm" className="justify-self-start" onClick={() => set({ ...FULL_TIMING })}>
          {tr('Hiện suốt video')}
        </Button>
      )}
    </>
  )
}
