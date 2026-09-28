import { useEffect, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import type { EncoderOption, ExportProgressEvent, ExportResultInfo } from '../../../shared/api'
import { safeFileName } from '../../../shared/files'
import { formatTime } from '../../../shared/time'
import type { ExportSettings } from '../../../shared/types'
import { player } from '../engineHost'
import { errorText, useTimeline } from '../hooks'
import { useStore } from '../store'
import { Icon, Modal, Row, fileName, shortPath } from './ui'
import { getLang, tr, trKey } from '../../../shared/i18n'

const api = window.api

interface ExportState {
  running: boolean
  progress: ExportProgressEvent | null
  result: ExportResultInfo | null
  error: string | null
  /** Lần xuất gần nhất là cả video (không phải xuất thử) */
  full: boolean
  /** Tắt máy khi xuất xong (nhớ giữa các lần mở app) */
  shutdownAfter: boolean
  /** Số giây còn lại trước khi tắt máy; 0 = đang tắt; null = không đếm ngược */
  shutdownLeft: number | null
}

const SHUTDOWN_KEY = 'pvm.shutdownAfterExport'

function loadShutdownAfter(): boolean {
  try {
    return localStorage.getItem(SHUTDOWN_KEY) === '1'
  } catch {
    return false
  }
}

/** Trạng thái xuất video giữ ngoài dialog để đóng/mở lại vẫn thấy tiến độ */
export const useExportStore = create<ExportState>(() => ({
  running: false,
  progress: null,
  result: null,
  error: null,
  full: false,
  shutdownAfter: loadShutdownAfter(),
  shutdownLeft: null
}))

api.on('export:progress', (p) => useExportStore.setState({ progress: p }))

function setShutdownAfter(on: boolean): void {
  useExportStore.setState({ shutdownAfter: on })
  try {
    localStorage.setItem(SHUTDOWN_KEY, on ? '1' : '0')
  } catch {
    // không lưu được (chế độ riêng tư…) — vẫn dùng được cho lần này
  }
}

const SHUTDOWN_SECONDS = 60
let shutdownTimer: ReturnType<typeof setInterval> | null = null

/** Đếm ngược rồi tắt máy. Tính theo đồng hồ thật: cửa sổ bị thu nhỏ (hẹn giờ chạy thưa) vẫn tắt đúng lúc. */
export function startShutdownCountdown(seconds = SHUTDOWN_SECONDS): void {
  cancelShutdownCountdown()
  const deadline = Date.now() + seconds * 1000
  useExportStore.setState({ shutdownLeft: seconds })
  shutdownTimer = setInterval(() => {
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
    useExportStore.setState({ shutdownLeft: left })
    if (left > 0) return
    if (shutdownTimer) clearInterval(shutdownTimer)
    shutdownTimer = null
    void shutdownNow()
  }, 250)
}

export function cancelShutdownCountdown(): void {
  if (shutdownTimer) clearInterval(shutdownTimer)
  shutdownTimer = null
  useExportStore.setState({ shutdownLeft: null })
}

async function shutdownNow(): Promise<void> {
  const st = useStore.getState()
  try {
    // Lưu phiên làm việc để mở app lần sau vẫn còn nguyên project
    if (st.project.tracks.length) await api.autosave(st.project)
    await api.shutdown()
  } catch (err) {
    useExportStore.setState({ shutdownLeft: null })
    st.toast('error', errorText(err))
  }
}

/** Hộp đếm ngược trước khi tắt máy — luôn gắn trong App để vẫn hiện khi hộp thoại xuất đã đóng */
export function ShutdownCountdown(): ReactNode {
  const left = useExportStore((s) => s.shutdownLeft)
  if (left === null) return null
  return (
    <Modal
      title={tr('Tắt máy')}
      onClose={cancelShutdownCountdown}
      footer={
        <button type="button" className="btn primary" onClick={cancelShutdownCountdown} disabled={left <= 0}>
          {tr('Huỷ tắt máy')}
        </button>
      }
    >
      <p className="shutdown-count">{left > 0 ? tr('Máy sẽ tắt sau {n} giây', { n: left }) : tr('Đang tắt máy…')}</p>
      <p className="muted">{tr('Video đã xuất xong. Phiên làm việc được tự lưu, mở app lần sau vẫn còn nguyên project.')}</p>
    </Modal>
  )
}

const STAGES: Record<ExportProgressEvent['stage'], string> = {
  audio: trKey('Đang ghép âm thanh'),
  render: trKey('Đang render hình'),
  mux: trKey('Đang ghép tiếng vào video'),
  done: trKey('Hoàn tất')
}

function withSuffix(path: string, suffix: string): string {
  return path.replace(/(\.mp4)?$/i, `${suffix}.mp4`)
}

function percentOf(part: number, total: number): number {
  return Math.floor((100 * part) / Math.max(1, total))
}

/** Số frame nằm trong các đoạn đã xong (được giữ lại khi bị ngắt) — ước theo số đoạn */
function keptFrames(p: ExportProgressEvent): number {
  return Math.min(p.framesTotal, Math.round((p.framesTotal * p.chunksDone) / Math.max(1, p.chunksTotal)))
}

export function ExportDialog(): ReactNode {
  const project = useStore((s) => s.project)
  const trackStatus = useStore((s) => s.trackStatus)
  const update = useStore((s) => s.update)
  const openDialog = useStore((s) => s.openDialog)
  const timeline = useTimeline()
  const { running, progress, result, error, full, shutdownAfter } = useExportStore()
  const [encoders, setEncoders] = useState<EncoderOption[] | null>(null)
  const ex = project.export

  useEffect(() => {
    api.listEncoders().then(setEncoders).catch(() => setEncoders([]))
  }, [])

  const setExport = (patch: Partial<ExportSettings>): void =>
    update((p) => {
      p.export = { ...p.export, ...patch }
    })

  const pending = project.tracks.filter((t) => trackStatus[t.path]?.state !== 'ready').length
  const canStart = project.tracks.length > 0 && pending === 0 && !running

  const chooseOutput = async (): Promise<string | null> => {
    const p = await api.saveFile('video', ex.outputPath || `${safeFileName(project.name)}.mp4`)
    if (p) setExport({ outputPath: p })
    return p
  }

  const start = async (range?: { start: number; duration: number }): Promise<void> => {
    let out = ex.outputPath || (await chooseOutput())
    if (!out) return
    if (range) out = withSuffix(out, tr(' (xem thử)'))
    useExportStore.setState({ running: true, result: null, error: null, progress: null, full: !range })
    try {
      const r = await api.startExport({ ...useStore.getState().project, export: { ...ex, outputPath: out } }, range)
      useExportStore.setState({ result: r })
      useStore.getState().toast('success', tr('Đã xuất xong: {file}', { file: fileName(r.outputPath) }))
      // Đọc lựa chọn lúc xuất xong: người dùng có thể tích "Tắt máy" khi video đang xuất
      if (!range && useExportStore.getState().shutdownAfter) startShutdownCountdown()
    } catch (err) {
      useExportStore.setState({ error: errorText(err) })
    } finally {
      useExportStore.setState({ running: false })
    }
  }

  const pct = Math.round((progress?.progress ?? 0) * 100)
  const locale = getLang() === 'en' ? 'en-US' : 'vi-VN'
  const withHours = timeline.total >= 3600

  return (
    <Modal
      title={tr('Xuất video')}
      onClose={() => openDialog(null)}
      footer={
        running ? (
          <button type="button" className="btn danger" onClick={() => api.cancelExport()}>
            {tr('Huỷ xuất')}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn"
              disabled={!canStart}
              title={tr('Render 15 giây từ vị trí đang xem để kiểm tra nhanh')}
              onClick={() => start({ start: Math.max(0, Math.min(player.time(), timeline.total - 15)), duration: 15 })}
            >
              {tr('Xuất thử 15 giây')}
            </button>
            <button type="button" className="btn primary" disabled={!canStart} onClick={() => start()}>
              <Icon name="movie" size={16} /> {tr('Xuất video ({time})', { time: formatTime(timeline.total, withHours) })}
            </button>
          </>
        )
      }
    >
      <Row label={tr('Lưu vào')}>
        <div className="file-pick">
          <button type="button" className="btn small" onClick={chooseOutput} disabled={running}>
            {tr('Chọn…')}
          </button>
          <span className="file-name" title={ex.outputPath}>
            {ex.outputPath ? shortPath(ex.outputPath) : tr('Chưa chọn nơi lưu')}
          </span>
        </div>
      </Row>
      <div className="two">
        <Row label={tr('Bộ mã hoá')}>
          <select value={ex.encoder} onChange={(e) => setExport({ encoder: e.target.value as ExportSettings['encoder'] })} disabled={running}>
            {(encoders ?? []).map((e) => (
              <option key={e.id} value={e.id} disabled={!e.available}>
                {tr(e.label)}
                {e.available ? '' : tr(' — không có trên máy này')}
              </option>
            ))}
            {!encoders && <option value={ex.encoder}>{tr('Đang kiểm tra bộ mã hoá…')}</option>}
          </select>
        </Row>
        <Row label={tr('Chất lượng')}>
          <select value={ex.quality} onChange={(e) => setExport({ quality: e.target.value as ExportSettings['quality'] })} disabled={running}>
            <option value="fast">{tr('Nhanh (file lớn hơn)')}</option>
            <option value="balanced">{tr('Cân bằng (khuyên dùng)')}</option>
            <option value="high">{tr('Chất lượng cao (chậm)')}</option>
          </select>
        </Row>
      </div>
      <div className="two">
        <Row label={tr('Âm thanh AAC')}>
          <select value={ex.audioBitrate} onChange={(e) => setExport({ audioBitrate: Number(e.target.value) })} disabled={running}>
            <option value={192}>192 kbps</option>
            <option value={256}>256 kbps</option>
            <option value={320}>320 kbps</option>
          </select>
        </Row>
        <Row label={tr('Khung hình')}>
          <div className="static-value">
            {project.settings.width}×{project.settings.height} · {project.settings.fps} fps{' '}
            <button type="button" className="link" onClick={() => openDialog('settings')} disabled={running}>
              {tr('đổi')}
            </button>
          </div>
        </Row>
      </div>
      <label className="toggle" title={tr('Hợp khi để máy xuất video dài qua đêm. Trước khi tắt có 60 giây để huỷ.')}>
        <input type="checkbox" checked={shutdownAfter} onChange={(e) => setShutdownAfter(e.target.checked)} />
        <span>{tr('Tắt máy khi xuất xong (không áp dụng cho xuất thử)')}</span>
      </label>
      {encoders && ex.encoder !== 'libx264' && !encoders.find((e) => e.id === ex.encoder)?.available && (
        <p className="warn">{tr('Bộ mã hoá đã chọn không dùng được trên máy này, hãy chọn “CPU – x264”.')}</p>
      )}
      {pending > 0 && <p className="warn">{tr('Còn {n} bài đang phân tích âm thanh, vui lòng chờ…', { n: pending })}</p>}

      {(running || progress) && !result && !error && (
        <div className="export-progress">
          <div className="progress-head">
            <strong>{progress ? tr(STAGES[progress.stage]) : tr('Đang chuẩn bị…')}</strong>
            <span>{pct}%</span>
          </div>
          <div className="progress-bar">
            <div style={{ width: `${pct}%` }} />
          </div>
          {progress?.stage === 'render' && (
            <div className="progress-stats">
              <span>
                {tr('{done} / {total} khung hình', { done: progress.framesDone.toLocaleString(locale), total: progress.framesTotal.toLocaleString(locale) })}
              </span>
              {progress.chunksTotal > 1 && (
                <span>
                  {tr('Đoạn {a}/{b}', { a: progress.chunksDone, b: progress.chunksTotal })}
                </span>
              )}
              <span>{tr('{n} khung/giây', { n: progress.fps.toFixed(0) })}</span>
              <span>{tr('Còn khoảng {time}', { time: formatTime(progress.eta, progress.eta >= 3600) })}</span>
            </div>
          )}
          {progress && progress.resumedFrames > 0 && (
            <p className="resume-note">{tr('Tiếp tục bản xuất dở: đã có {p}%, chỉ render phần còn lại.', { p: percentOf(progress.resumedFrames, progress.framesTotal) })}</p>
          )}
        </div>
      )}
      {error && <p className="error-box">{error}</p>}
      {error && full && (progress?.chunksDone ?? 0) > 0 && (
        <p className="resume-note">
          {tr('Các đoạn đã render ({p}%) được giữ lại. Nếu không sửa project và vẫn lưu vào file này, lần xuất sau sẽ tiếp tục từ chỗ đã dừng.', {
            p: percentOf(keptFrames(progress!), progress!.framesTotal)
          })}
        </p>
      )}
      {result && (
        <div className="success-box">
          <p>
            {tr('✓ Đã xuất')} <strong>{fileName(result.outputPath)}</strong> {tr('({dur} video) trong {time} —', { dur: formatTime(result.duration), time: formatTime(result.seconds) })}
            {result.resumedFrames > 0
              ? tr(' tiếp tục từ bản xuất dở (đã có {p}%).', { p: percentOf(result.resumedFrames, result.totalFrames) })
              : tr(' nhanh {x}× thời gian thực.', { x: (result.duration / Math.max(0.1, result.seconds)).toFixed(1) })}
          </p>
          <div className="row-actions">
            <button type="button" className="btn small" onClick={() => api.showItem(result.outputPath)}>
              <Icon name="folder" size={16} /> {tr('Mở thư mục')}
            </button>
            <button type="button" className="btn small" onClick={() => openDialog('chapters')}>
              <Icon name="list" size={16} /> {tr('Lấy timestamp cho mô tả')}
            </button>
          </div>
          {result.warnings.length > 0 && <p className="warn">{tr('Cảnh báo: {list}', { list: result.warnings.join('; ') })}</p>}
        </div>
      )}
    </Modal>
  )
}
