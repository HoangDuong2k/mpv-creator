import { useEffect, useState, type ReactNode } from 'react'
import { tr } from '../../../shared/i18n'
import { builtinTemplates, hasMediaBackground, projectFromTemplate, type StyleTemplate } from '../../../shared/templates'
import { player } from '../engineHost'
import { errorText } from '../hooks'
import { forgetPreviews, type PreviewScene } from '../previewRender'
import { useStore } from '../store'
import { PreviewThumb } from './PreviewThumb'
import { SaveTemplateForm, transitionText } from './SaveTemplate'
import { TemplateStart } from './TemplateStart'
import { Icon, Modal } from './ui'

const api = window.api
const WELCOME_KEY = 'pvm.welcome'

/** Có hiện màn hình chào khi mở app không (mặc định có) */
export function welcomeEnabled(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) !== 'off'
  } catch {
    return true
  }
}

function setWelcomeEnabled(on: boolean): void {
  try {
    localStorage.setItem(WELCOME_KEY, on ? 'on' : 'off')
  } catch {
    // bỏ qua
  }
}

export type TemplatesMode = 'welcome' | 'new-project' | 'styles'

/** Ảnh xem trước của mẫu: dựng lại toàn bộ các lớp của mẫu trên hai bài nhạc giả lập */
function templateScene(t: StyleTemplate): () => PreviewScene {
  return () => ({ layers: t.layers.map((l, i) => ({ ...l, id: `pv-${t.id}-${i}` })) })
}

const previewId = (t: StyleTemplate): string => `tpl:${t.id}:${t.createdAt ?? 0}`

/** Dòng mô tả của mẫu tự tạo: khung hình, fps, cách chuyển bài */
function customMeta(t: StyleTemplate): string {
  const s = t.settings
  return s ? `${s.width}×${s.height}, ${s.fps} fps, ${transitionText(s.transition)}` : ''
}

/**
 * Chọn mẫu phong cách:
 * - welcome / new-project: bắt đầu project mới theo mẫu (cùng khung hình, chuyển bài nếu là mẫu tạo từ video),
 *   rồi sang bước đổi nền và thêm nhạc;
 * - styles: áp mẫu cho project đang làm (giữ nguyên nhạc, hoàn tác được) và tạo mẫu từ video đang làm.
 */
export function TemplatesDialog({ mode, onOpenProject }: { mode: TemplatesMode; onOpenProject?: () => void }): ReactNode {
  const [builtins] = useState(builtinTemplates)
  const [custom, setCustom] = useState<StyleTemplate[] | null>(null)
  const project = useStore((s) => s.project)
  const mediaBg = hasMediaBackground(project)
  const [keepBg, setKeepBg] = useState(true)
  const [creating, setCreating] = useState(false)
  /** Mẫu vừa chọn cho video mới: đang ở bước đổi nền, thêm nhạc */
  const [started, setStarted] = useState<StyleTemplate | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [showOnStart, setShowOnStart] = useState(welcomeEnabled)
  const close = (): void => useStore.getState().openDialog(null)

  const reload = (): void => {
    api.listTemplates().then(setCustom, () => setCustom([]))
  }
  useEffect(reload, [])

  const pick = (t: StyleTemplate): void => {
    const st = useStore.getState()
    if (mode === 'styles') {
      st.applyStyle(t, keepBg && mediaBg)
      st.toast('success', tr('Đã áp phong cách "{name}". Bấm Ctrl+Z để hoàn tác.', { name: tr(t.name) }))
      close()
    } else {
      player.pause()
      st.setPlaying(false)
      st.loadProject(projectFromTemplate(t), null)
      setStarted(t)
    }
  }

  const remove = async (t: StyleTemplate): Promise<void> => {
    if (confirmDelete !== t.id) {
      setConfirmDelete(t.id)
      return
    }
    setConfirmDelete(null)
    try {
      await api.deleteTemplate(t.id)
      forgetPreviews(previewId(t))
      reload()
    } catch (err) {
      useStore.getState().toast('error', errorText(err))
    }
  }

  const card = (t: StyleTemplate): ReactNode => (
    <div key={t.id} className="tpl-card" data-template={t.id} onPointerEnter={() => setHover(t.id)} onPointerLeave={() => setHover(null)}>
      <button type="button" className="tpl-pick" onClick={() => pick(t)} title={mode === 'styles' ? tr('Áp phong cách này (giữ nguyên nhạc)') : tr('Bắt đầu với mẫu này')}>
        <PreviewThumb id={previewId(t)} build={templateScene(t)} size="large" hover={hover === t.id} />
        <span className="tpl-name">{tr(t.name)}</span>
        {(t.description || t.custom) && <span className="tpl-desc">{t.description ? tr(t.description) : customMeta(t)}</span>}
      </button>
      {t.custom && (
        <button
          type="button"
          className={`tpl-delete${confirmDelete === t.id ? ' confirm' : ''}`}
          title={tr('Xoá mẫu')}
          aria-label={tr('Xoá mẫu')}
          onClick={() => void remove(t)}
          onPointerLeave={() => confirmDelete === t.id && setConfirmDelete(null)}
        >
          {confirmDelete === t.id ? tr('Xoá?') : <Icon name="delete" size={14} />}
        </button>
      )}
    </div>
  )

  const title = mode === 'welcome' ? tr('Chào mừng đến với Playlist Video Maker') : mode === 'new-project' ? tr('Project mới') : tr('Mẫu phong cách')
  const lead =
    mode === 'styles'
      ? tr('Áp phong cách cho project đang làm: giữ nguyên nhạc, thay nền, cột sóng, chữ và hiệu ứng. Hoàn tác được bằng Ctrl+Z.')
      : tr('Chọn một phong cách để bắt đầu. Đổi lại lúc nào cũng được bằng nút Mẫu phong cách trên thanh công cụ; rê chuột lên mẫu để xem chuyển động.')

  const footer =
    mode === 'welcome' ? (
      <>
        <label className="toggle tpl-start">
          <input
            type="checkbox"
            checked={showOnStart}
            onChange={(e) => {
              setShowOnStart(e.target.checked)
              setWelcomeEnabled(e.target.checked)
            }}
          />
          <span>{tr('Hiện màn hình này khi mở ứng dụng')}</span>
        </label>
        {onOpenProject && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              close()
              onOpenProject()
            }}
          >
            <Icon name="folder" size={16} /> {tr('Mở project…')}
          </button>
        )}
        <button type="button" className="btn primary" onClick={close}>
          {tr('Bắt đầu với mẫu mặc định')}
        </button>
      </>
    ) : (
      <button type="button" className="btn" onClick={close}>
        {tr('Đóng')}
      </button>
    )

  if (started)
    return (
      <Modal
        title={tr('Video mới theo mẫu "{name}"', { name: tr(started.name) })}
        onClose={close}
        footer={
          <button type="button" className="btn primary" onClick={close}>
            {tr('Xong')}
          </button>
        }
        wide
      >
        <TemplateStart />
      </Modal>
    )

  const hasCustom = !!custom && custom.length > 0
  return (
    <Modal title={title} onClose={close} footer={footer} wide>
      <div className="tpl-dialog" data-mode={mode}>
        <p className="muted">{lead}</p>
        {mode === 'styles' && mediaBg && (
          <label className="toggle">
            <input type="checkbox" checked={keepBg} onChange={(e) => setKeepBg(e.target.checked)} />
            <span>{tr('Giữ ảnh / video nền đang dùng (chỉ thay cột sóng, chữ, hiệu ứng)')}</span>
          </label>
        )}
        {(mode === 'styles' || hasCustom) && (
          <section className="tpl-custom">
            <div className="tpl-custom-head">
              <h4>{tr('Mẫu của bạn')}</h4>
              {mode === 'styles' && !creating && (
                <button type="button" className="btn small" onClick={() => setCreating(true)}>
                  <Icon name="save" size={15} /> {tr('Tạo mẫu từ video này')}
                </button>
              )}
            </div>
            {creating && (
              <SaveTemplateForm
                onDone={() => {
                  setCreating(false)
                  reload()
                }}
                onCancel={() => setCreating(false)}
              />
            )}
            {hasCustom ? (
              <div className="tpl-grid">{custom.map(card)}</div>
            ) : (
              !creating && <p className="muted small">{tr('Chưa có mẫu nào. Làm xong một video, bấm "Tạo mẫu từ video này" để lần sau chỉ cần đổi nền và thêm nhạc.')}</p>
            )}
          </section>
        )}
        <section className="tpl-builtin">
          {(mode === 'styles' || hasCustom) && <h4>{tr('Mẫu có sẵn')}</h4>}
          <div className="tpl-grid">{builtins.map(card)}</div>
        </section>
      </div>
    </Modal>
  )
}
