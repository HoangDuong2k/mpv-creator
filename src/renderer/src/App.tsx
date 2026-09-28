import { useEffect, useState, type ReactNode } from 'react'
import { ChaptersDialog } from './components/ChaptersDialog'
import { ExportDialog, useExportStore } from './components/ExportDialog'
import { LayersPanel } from './components/LayersPanel'
import { PlaylistPanel, importPaths } from './components/PlaylistPanel'
import { PreviewPanel } from './components/PreviewPanel'
import { SettingsDialog } from './components/SettingsDialog'
import { Timeline } from './components/Timeline'
import { Icon, IconButton, fileName } from './components/ui'
import { assets, loadFonts, player } from './engineHost'
import { safeFileName } from '../../shared/files'
import { errorText, useAnalysis, useAudioSpec, useAutosave } from './hooks'
import { useStore } from './store'
import { copySelection, pasteAtPlayhead, splitAtPlayhead } from './timelineActions'

const api = window.api
let booted = false
const IMAGE_RE = /\.(png|jpe?g|webp|bmp|gif)$/i
const VIDEO_RE = /\.(mp4|mov|webm|mkv|m4v|avi)$/i

async function saveProject(saveAs = false): Promise<void> {
  const { project, filePath, markSaved, toast } = useStore.getState()
  let path = saveAs ? null : filePath
  if (!path) path = await api.saveFile('project', `${safeFileName(project.name)}.pvm.json`)
  if (!path) return
  try {
    await api.writeProject(path, project)
    markSaved(path)
    toast('success', `Đã lưu ${fileName(path)}`)
  } catch (err) {
    toast('error', `Không lưu được: ${errorText(err)}`)
  }
}

function confirmDiscard(): boolean {
  const { dirty, project } = useStore.getState()
  return !dirty || project.tracks.length === 0 || window.confirm('Project hiện tại chưa lưu. Bỏ các thay đổi?')
}

async function openProject(path?: string): Promise<void> {
  if (!confirmDiscard()) return
  const p = path ?? (await api.openFiles('project', false))[0]
  if (!p) return
  try {
    player.pause()
    useStore.getState().loadProject(await api.readProject(p), p)
  } catch (err) {
    useStore.getState().toast('error', `Không mở được project: ${errorText(err)}`)
  }
}

function setBackgroundFile(path: string, mode: 'image' | 'video'): void {
  const { project, setLayerProps, addLayer, toast } = useStore.getState()
  let bg = project.layers.find((l) => l.type === 'background')
  if (!bg) {
    addLayer('background')
    bg = useStore.getState().project.layers.find((l) => l.type === 'background')!
  }
  setLayerProps(bg.id, { mode, src: path })
  useStore.getState().selectLayer(bg.id)
  toast('info', `Đã đặt ${mode === 'image' ? 'ảnh' : 'video'} nền: ${fileName(path)}`)
}

async function handleDroppedPaths(paths: string[]): Promise<void> {
  if (paths.length === 1 && /\.json$/i.test(paths[0])) return openProject(paths[0])
  if (paths.length === 1 && IMAGE_RE.test(paths[0])) return setBackgroundFile(paths[0], 'image')
  if (paths.length === 1 && VIDEO_RE.test(paths[0])) return setBackgroundFile(paths[0], 'video')
  await importPaths(paths)
}

function TopBar(): ReactNode {
  const name = useStore((s) => s.project.name)
  const dirty = useStore((s) => s.dirty)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const exporting = useExportStore((s) => s.running)
  const exportPct = useExportStore((s) => Math.round((s.progress?.progress ?? 0) * 100))
  const { undo, redo, openDialog, newProject } = useStore.getState()

  return (
    <header className="topbar">
      <div className="brand">
        <Icon name="music" size={20} />
        <span>Playlist Video Maker</span>
      </div>
      <div className="toolbar">
        <IconButton
          icon="newFile"
          title="Project mới"
          onClick={() => {
            if (!confirmDiscard()) return
            player.pause()
            newProject()
          }}
        />
        <IconButton icon="folder" title="Mở project (Ctrl+O)" onClick={() => openProject()} />
        <IconButton icon="save" title="Lưu project (Ctrl+S)" onClick={() => saveProject()} />
        <span className="sep" />
        <IconButton icon="undo" title="Hoàn tác (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
        <IconButton icon="redo" title="Làm lại (Ctrl+Y)" onClick={redo} disabled={!canRedo} />
        <span className="sep" />
        <IconButton icon="tune" title="Cài đặt project" onClick={() => openDialog('settings')} />
      </div>
      <div className="project-name" title="Nhấn để đổi tên" onClick={() => openDialog('settings')}>
        {name}
        {dirty && <span className="dirty">●</span>}
      </div>
      <button type="button" className="btn primary" onClick={() => openDialog('export')}>
        <Icon name="movie" size={18} /> {exporting ? `Đang xuất ${exportPct}%` : 'Xuất video'}
      </button>
    </header>
  )
}

function Toasts(): ReactNode {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

export function App(): ReactNode {
  const dialog = useStore((s) => s.dialog)
  const name = useStore((s) => s.project.name)
  const dirty = useStore((s) => s.dirty)
  const [dragging, setDragging] = useState(false)
  useAnalysis()
  useAudioSpec()
  useAutosave()

  useEffect(() => {
    document.title = `${dirty ? '● ' : ''}${name} — Playlist Video Maker`
  }, [name, dirty])

  useEffect(() => api.on('app:open-files', (files) => void importPaths(files)), [])

  // Khởi động (một lần): nạp font, mở file truyền qua dòng lệnh hoặc khôi phục phiên trước
  useEffect(() => {
    if (booted) return
    booted = true
    void (async () => {
      const info = await api.info()
      await loadFonts(info.fontsDir)
      assets.onChange()
      useStore.getState().bumpFeatures()
      const files = await api.initialFiles()
      if (files.length) await importPaths(files)
      else {
        const saved = await api.loadAutosave()
        if (saved && saved.tracks.length > 0) {
          useStore.getState().loadProject(saved, null, true)
          useStore.getState().toast('info', 'Đã khôi phục phiên làm việc trước')
        }
      }
    })()
  }, [])

  // Phím tắt
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && !(target as HTMLInputElement).type?.match(/range|checkbox|color/)
      const mod = e.ctrlKey || e.metaKey
      const st = useStore.getState()
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveProject(e.shiftKey)
      } else if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        void openProject()
      } else if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        st.openDialog('export')
      } else if (typing) {
        return
      } else if (mod && e.key.toLowerCase() === 'b' && !st.dialog) {
        e.preventDefault()
        splitAtPlayhead()
      } else if (mod && e.key.toLowerCase() === 'c' && !st.dialog && !window.getSelection()?.toString()) {
        e.preventDefault()
        copySelection()
      } else if (mod && e.key.toLowerCase() === 'v' && !st.dialog) {
        e.preventDefault()
        pasteAtPlayhead()
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        st.redo()
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        st.undo()
      } else if (e.key === ' ' && !st.dialog) {
        e.preventDefault()
        if (player.playing) {
          player.pause()
          assets.pauseVideos()
        } else player.play()
        st.setPlaying(player.playing)
      } else if ((e.key === 'Home' || e.key === 'End') && !st.dialog) {
        e.preventDefault()
        player.seek(e.key === 'Home' ? 0 : player.total)
        st.setTime(player.time())
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !st.dialog) {
        e.preventDefault()
        const t = player.time() + (e.key === 'ArrowLeft' ? -5 : 5) * (e.shiftKey ? 6 : 1)
        player.seek(Math.max(0, t))
        st.setTime(player.time())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      className="app"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        setDragging(false)
        const paths = Array.from(e.dataTransfer.files)
          .map((f) => api.pathForFile(f))
          .filter(Boolean)
        void handleDroppedPaths(paths)
      }}
    >
      <TopBar />
      <main className="workspace">
        <PlaylistPanel />
        <PreviewPanel />
        <LayersPanel />
      </main>
      <Timeline />
      {dialog === 'export' && <ExportDialog />}
      {dialog === 'settings' && <SettingsDialog />}
      {dialog === 'chapters' && <ChaptersDialog />}
      {dragging && (
        <div className="drop-overlay">
          <div>
            <Icon name="music" size={48} />
            <p>Thả nhạc / thư mục để thêm vào playlist</p>
            <p className="muted">Thả 1 ảnh hoặc video để đặt làm nền · thả file .json để mở project</p>
          </div>
        </div>
      )}
      <Toasts />
    </div>
  )
}
