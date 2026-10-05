import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button, Input } from 'momi-ui'
import { createDefaultProject, LAYER_LABELS } from '../../../shared/defaults'
import { tr } from '../../../shared/i18n'
import { planTemplate, templateFromProject, type StyleTemplate } from '../../../shared/templates'
import type { Layer, ProjectSettings } from '../../../shared/types'
import { errorText } from '../hooks'
import { useStore } from '../store'
import { PreviewThumb } from './PreviewThumb'
import { Icon, Modal } from './ui'

const api = window.api

/** Mã ngắn của nội dung mẫu: ảnh xem trước vẽ lại khi các lớp giữ lại thay đổi */
function hashOf(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = (h * 33) ^ text.charCodeAt(i)
  return (h >>> 0).toString(36)
}

/** Cách chuyển giữa các bài, viết thành chữ */
export function transitionText(t: ProjectSettings['transition']): string {
  if (t.type === 'crossfade') return tr('crossfade {d} giây', { d: t.duration })
  if (t.type === 'gap') return tr('khoảng lặng {d} giây', { d: t.duration })
  return tr('nối liền các bài')
}

function LayerLine({ layer, note }: { layer: Layer; note?: string }): ReactNode {
  const typeLabel = LAYER_LABELS[layer.type]
  return (
    <li className={`tpl-layer t-${layer.type}`}>
      <span className="tl-dot" />
      <span className="tpl-layer-name">{tr(layer.name)}</span>
      {layer.name !== typeLabel && <span className="tpl-layer-type">{tr(typeLabel)}</span>}
      {note && <span className="tpl-layer-note">{note}</span>}
    </li>
  )
}

/**
 * Tạo mẫu từ video đang làm: chỉ giữ những gì dùng suốt video (nền, cột sóng, chữ tên bài, hiệu ứng…),
 * kèm khung hình và kiểu chuyển bài. Lần sau làm video mới từ mẫu chỉ cần đổi nền và thêm nhạc.
 */
export function SaveTemplateForm({ onDone, onCancel }: { onDone: (saved: StyleTemplate) => void; onCancel: () => void }): ReactNode {
  const project = useStore((s) => s.project)
  const plan = useMemo(() => planTemplate(project), [project])
  const [name, setName] = useState(() => (project.name === createDefaultProject().name ? '' : tr(project.name)))
  const [existing, setExisting] = useState<StyleTemplate[]>([])
  const [busy, setBusy] = useState(false)
  const [hover, setHover] = useState(false)
  useEffect(() => {
    api.listTemplates().then(setExisting, () => setExisting([]))
  }, [])

  const trimmed = name.trim()
  const same = existing.find((t) => t.name.trim().toLocaleLowerCase('vi') === trimmed.toLocaleLowerCase('vi'))
  const previewKey = useMemo(() => hashOf(JSON.stringify(plan.layers.map((l) => [l.type, l.props, l.enabled]))), [plan])
  const s = project.settings

  const save = async (): Promise<void> => {
    if (!trimmed || busy) return
    setBusy(true)
    try {
      const t = templateFromProject(project, trimmed, { id: same?.id })
      await api.saveTemplate(t)
      useStore.getState().toast('success', tr('Đã lưu mẫu "{name}". Lần sau bấm Project mới rồi chọn mẫu này.', { name: trimmed }))
      onDone(t)
    } catch (err) {
      useStore.getState().toast('error', tr('Không lưu được mẫu: {err}', { err: errorText(err) }))
      setBusy(false)
    }
  }

  return (
    <form
      className="tpl-save-form"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="tpl-save-preview" onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
        <PreviewThumb
          id={`save:${previewKey}`}
          build={() => ({ layers: plan.layers.map((l, i) => ({ ...l, id: `pv-save-${previewKey}-${i}` })) })}
          size="large"
          hover={hover}
        />
        <p className="muted small">{tr('Lần sau bấm Project mới, chọn mẫu này, rồi chỉ cần đổi ảnh / video nền và thêm nhạc.')}</p>
      </div>
      <div className="tpl-save-body">
        <label className="field">
          <span className="field-label">{tr('Tên mẫu')}</span>
          <Input size="sm" autoFocus value={name} maxLength={80} placeholder={tr('Tên mẫu, vd. Kênh lofi của tôi')} onChange={(e) => setName(e.target.value)} />
          {same && <span className="field-hint">{tr('Đã có mẫu tên này. Lưu sẽ thay mẫu cũ bằng phong cách của video này.')}</span>}
        </label>
        <section>
          <h4 className="tpl-save-title">{tr('Giữ lại {n} lớp dùng suốt video', { n: plan.layers.length })}</h4>
          <ul className="tpl-layers">
            {[...plan.layers].reverse().map((l, i) => (
              <LayerLine key={i} layer={l} note={plan.backgroundFromSegment && l.type === 'background' ? tr('kiểu nền của đoạn đầu') : undefined} />
            ))}
          </ul>
        </section>
        {plan.skipped.length > 0 && (
          <section>
            <h4 className="tpl-save-title">{tr('Bỏ qua {n} lớp', { n: plan.skipped.length })}</h4>
            <ul className="tpl-layers skipped">
              {[...plan.skipped].reverse().map(({ layer, reason }) => (
                <LayerLine key={layer.id} layer={layer} note={reason === 'hidden' ? tr('đang ẩn') : tr('chỉ hiện một đoạn')} />
              ))}
            </ul>
          </section>
        )}
        <p className="muted small">
          {tr('Lưu kèm khung hình {w}×{h}, {fps} fps, {transition} và chất lượng xuất.', { w: s.width, h: s.height, fps: s.fps, transition: transitionText(s.transition) })}
        </p>
        <div className="tpl-save-actions">
          <Button variant="outline" tone="neutral" size="sm" onClick={onCancel}>
            {tr('Huỷ')}
          </Button>
          <Button type="submit" variant="solid" tone="primary" size="sm" disabled={!trimmed || busy}>
            <Icon name="save" size={16} /> {same ? tr('Lưu đè mẫu') : tr('Lưu mẫu')}
          </Button>
        </div>
      </div>
    </form>
  )
}

/** Hộp thoại riêng (mở từ hộp thoại xuất video khi vừa xuất xong) */
export function SaveTemplateDialog(): ReactNode {
  const close = (): void => useStore.getState().openDialog(null)
  return (
    <Modal title={tr('Tạo mẫu từ video này')} onClose={close} wide>
      <SaveTemplateForm onDone={close} onCancel={close} />
    </Modal>
  )
}
