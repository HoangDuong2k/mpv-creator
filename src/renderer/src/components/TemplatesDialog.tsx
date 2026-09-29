import { useEffect, useState, type ReactNode } from 'react'
import { tr } from '../../../shared/i18n'
import { builtinTemplates, hasMediaBackground, projectFromTemplate, templateFromProject, type StyleTemplate } from '../../../shared/templates'
import { player } from '../engineHost'
import { errorText } from '../hooks'
import { forgetPreviews, type PreviewScene } from '../previewRender'
import { useStore } from '../store'
import { PreviewThumb } from './PreviewThumb'
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

/**
 * Chọn mẫu phong cách:
 * - welcome / new-project: bắt đầu project mới theo mẫu;
 * - styles: áp mẫu cho project đang làm (giữ nguyên nhạc, hoàn tác được) và lưu phong cách hiện tại làm mẫu riêng.
 */
export function TemplatesDialog({ mode, onOpenProject }: { mode: TemplatesMode; onOpenProject?: () => void }): ReactNode {
  const [builtins] = useState(builtinTemplates)
  const [custom, setCustom] = useState<StyleTemplate[] | null>(null)
  const project = useStore((s) => s.project)
  const mediaBg = hasMediaBackground(project)
  const [keepBg, setKeepBg] = useState(true)
  const [saveName, setSaveName] = useState<string | null>(null)
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
    } else {
      player.pause()
      st.setPlaying(false)
      st.loadProject(projectFromTemplate(t), null)
    }
    close()
  }

  const save = async (): Promise<void> => {
    const name = (saveName ?? '').trim()
    if (!name) return
    try {
      await api.saveTemplate(templateFromProject(useStore.getState().project, name))
      useStore.getState().toast('success', tr('Đã lưu mẫu "{name}"', { name }))
      setSaveName(null)
      reload()
    } catch (err) {
      useStore.getState().toast('error', tr('Không lưu được mẫu: {err}', { err: errorText(err) }))
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
        {t.description && <span className="tpl-desc">{tr(t.description)}</span>}
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
        <div className="tpl-grid">{builtins.map(card)}</div>
        {(mode === 'styles' || (custom && custom.length > 0)) && (
          <section className="tpl-custom">
            <div className="tpl-custom-head">
              <h4>{tr('Mẫu của bạn')}</h4>
              {mode === 'styles' && saveName === null && (
                <button type="button" className="btn small" onClick={() => setSaveName('')}>
                  <Icon name="save" size={15} /> {tr('Lưu phong cách hiện tại làm mẫu')}
                </button>
              )}
            </div>
            {saveName !== null && (
              <form
                className="tpl-save"
                onSubmit={(e) => {
                  e.preventDefault()
                  void save()
                }}
              >
                <input autoFocus value={saveName} maxLength={80} placeholder={tr('Tên mẫu, vd. Kênh lofi của tôi')} onChange={(e) => setSaveName(e.target.value)} />
                <button type="submit" className="btn small primary" disabled={!saveName.trim()}>
                  {tr('Lưu')}
                </button>
                <button type="button" className="btn small" onClick={() => setSaveName(null)}>
                  {tr('Huỷ')}
                </button>
              </form>
            )}
            {custom && custom.length > 0 ? (
              <div className="tpl-grid">{custom.map(card)}</div>
            ) : (
              <p className="muted small">{tr('Chưa có mẫu nào. Chỉnh project theo ý rồi bấm "Lưu phong cách hiện tại làm mẫu" để dùng lại cho video sau.')}</p>
            )}
          </section>
        )}
      </div>
    </Modal>
  )
}
