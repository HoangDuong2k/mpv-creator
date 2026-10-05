import { useEffect, useState, type ReactNode } from 'react'
import { Button, Checkbox, NativeSelect } from 'momi-ui'
import { create } from 'zustand'
import type { EncoderOption, ExportProgressEvent, ExportResultInfo } from '../../../shared/api'
import { resolutionName } from '../../../shared/defaults'
import { safeFileName, shortPath } from '../../../shared/files'
import { formatTime } from '../../../shared/time'
import type { ExportSettings } from '../../../shared/types'
import { assets, player } from '../engineHost'
import { errorText, useTimeline } from '../hooks'
import { useStore } from '../store'
import { FpsSelect, ResolutionSelect } from './SettingsDialog'
import { Icon, Modal, Row, fileName } from './ui'
import { getLang, tr, trKey } from '../../../shared/i18n'

const api = window.api

interface ExportState {
  running: boolean
  progress: ExportProgressEvent | null
  result: ExportResultInfo | null
  error: string | null
  /** Lần xuất gần nhất là cả video (không phải xuất thử) */
  full: boolean
  /**
   * Tắt máy khi xuất xong. Chỉ có hiệu lực trong lần mở app này (không lưu lại) — tránh hôm sau
   * xuất video khác thì máy tự tắt ngoài ý muốn.
   */
  shutdownAfter: boolean
  /** Số giây còn lại trước khi tắt máy; 0 = đang tắt; null = không đếm ngược */
  shutdownLeft: number | null
}

/** Trạng thái xuất video giữ ngoài dialog để đóng/mở lại vẫn thấy tiến độ */
export const useExportStore = create<ExportState>(() => ({
  running: false,
  progress: null,
  result: null,
  error: null,
  full: false,
  shutdownAfter: false,
  shutdownLeft: null
}))

api.on('export:progress', (p) => useExportStore.setState({ progress: p }))

function setShutdownAfter(on: boolean): void {
  useExportStore.setState({ shutdownAfter: on })
  if (!on) return
  // macOS hỏi quyền tắt máy ngay lúc tích (người dùng còn ở máy), không đợi tới lúc xuất xong
  void api.prepareShutdown().then((ok) => {
    if (ok) return
    useExportStore.setState({ shutdownAfter: false })
    useStore.getState().toast('error', tr('macOS chưa cho phép tắt máy. Vào Cài đặt hệ thống → Quyền riêng tư & Bảo mật → Tự động hoá, bật System Events cho Playlist Video Maker.'))
  })
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
        <Button variant="solid" tone="primary" size="sm" onClick={cancelShutdownCountdown} disabled={left <= 0}>
          {tr('Huỷ tắt máy')}
        </Button>
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
    // Mở hộp xuất video thì dừng phát preview: không phát tiếng khi đang chọn cài đặt, nhường CPU cho việc xuất
    if (player.playing) {
      player.pause()
      assets.pauseVideos()
      useStore.getState().setPlaying(false)
    }
    api
      .listEncoders()
      .then((list) => {
        setEncoders(list)
        // Project làm trên máy khác (vd. NVENC trên Windows) mở trên máy này (Mac): về CPU (x264)
        if (list.length && !list.some((e) => e.id === useStore.getState().project.export.encoder)) setExport({ encoder: 'libx264' })
      })
      .catch(() => setEncoders([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Card đồ hoạ mã hoá nhanh hơn CPU (x264) và để CPU rảnh cho việc vẽ hình
  const hardware = encoders?.find((e) => e.hardware && e.available)

  return (
    <Modal
      title={tr('Xuất video')}
      onClose={() => openDialog(null)}
      footer={
        running ? (
          <Button variant="soft" tone="danger" size="sm" onClick={() => api.cancelExport()}>
            {tr('Huỷ xuất')}
          </Button>
        ) : (
          <>
            <Button
              variant="outline" tone="neutral" size="sm"
              disabled={!canStart}
              title={tr('Render 15 giây từ vị trí đang xem để kiểm tra nhanh')}
              onClick={() => start({ start: Math.max(0, Math.min(player.time(), timeline.total - 15)), duration: 15 })}
            >
              {tr('Xuất thử 15 giây')}
            </Button>
            <Button variant="solid" tone="primary" size="sm" data-action="export-start" disabled={!canStart} onClick={() => start()}>
              <Icon name="movie" size={16} />{' '}
              {tr('Xuất video {res} ({time})', { res: resolutionName(project.settings.width, project.settings.height), time: formatTime(timeline.total, withHours) })}
            </Button>
          </>
        )
      }
    >
      <Row label={tr('Lưu vào')}>
        <div className="file-pick">
          <Button variant="outline" tone="neutral" size="xs" onClick={chooseOutput} disabled={running}>
            {tr('Chọn…')}
          </Button>
          <span className="file-name" title={ex.outputPath}>
            {ex.outputPath ? shortPath(ex.outputPath) : tr('Chưa chọn nơi lưu')}
          </span>
        </div>
      </Row>
      <div className="two">
        <Row label={tr('Độ phân giải')}>
          <ResolutionSelect disabled={running} />
        </Row>
        <Row label={tr('Số khung hình / giây')}>
          <FpsSelect disabled={running} />
        </Row>
      </div>
      <div className="two">
        <Row label={tr('Bộ mã hoá')}>
          <NativeSelect size="sm" value={ex.encoder} onChange={(e) => setExport({ encoder: e.target.value as ExportSettings['encoder'] })} disabled={running}>
            {(encoders ?? []).map((e) => (
              <option key={e.id} value={e.id} disabled={!e.available}>
                {tr(e.label)}
                {e.available ? '' : tr(' (không có trên máy này)')}
              </option>
            ))}
            {!encoders && <option value={ex.encoder}>{tr('Đang kiểm tra bộ mã hoá…')}</option>}
          </NativeSelect>
        </Row>
        <Row label={tr('Chất lượng nén')}>
          <NativeSelect size="sm" value={ex.quality} onChange={(e) => setExport({ quality: e.target.value as ExportSettings['quality'] })} disabled={running}>
            <option value="fast">{tr('Nhanh (file lớn hơn)')}</option>
            <option value="balanced">{tr('Cân bằng (khuyên dùng)')}</option>
            <option value="high">{tr('Chất lượng cao (chậm)')}</option>
          </NativeSelect>
        </Row>
      </div>
      {hardware && ex.encoder === 'libx264' && !running && (
        <p className="muted small encoder-tip">
          {tr('Máy này có {name}: xuất nhanh hơn và CPU đỡ tải.', { name: tr(hardware.label) })}{' '}
          <button type="button" className="link" onClick={() => setExport({ encoder: hardware.id })}>
            {tr('Dùng bộ mã hoá này')}
          </button>
        </p>
      )}
      <div className="two">
        <Row label={tr('Âm thanh AAC')}>
          <NativeSelect size="sm" value={ex.audioBitrate} onChange={(e) => setExport({ audioBitrate: Number(e.target.value) })} disabled={running}>
            <option value={192}>192 kbps</option>
            <option value={256}>256 kbps</option>
            <option value={320}>320 kbps</option>
          </NativeSelect>
        </Row>
      </div>
      <Checkbox
        size="sm"
        wrapperClassName="toggle-row"
        checked={shutdownAfter}
        onCheckedChange={(on) => setShutdownAfter(on === true)}
        label={tr('Tắt máy khi xuất xong (không áp dụng cho xuất thử)')}
        description={tr('Hợp khi để máy xuất video dài qua đêm. Trước khi tắt có 60 giây để huỷ.')}
      />
      {encoders && ex.encoder !== 'libx264' && !encoders.find((e) => e.id === ex.encoder)?.available && (
        <p className="warn">{tr('Bộ mã hoá đã chọn không dùng được trên máy này, hãy chọn “CPU (x264)”.')}</p>
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
            {tr('✓ Đã xuất')} <strong>{fileName(result.outputPath)}</strong> {tr('({dur} video) trong {time},', { dur: formatTime(result.duration), time: formatTime(result.seconds) })}
            {result.resumedFrames > 0
              ? tr(' tiếp tục từ bản xuất dở (đã có {p}%).', { p: percentOf(result.resumedFrames, result.totalFrames) })
              : tr(' nhanh {x}× thời gian thực.', { x: (result.duration / Math.max(0.1, result.seconds)).toFixed(1) })}
          </p>
          <div className="row-actions">
            <Button variant="outline" tone="neutral" size="xs" onClick={() => api.showItem(result.outputPath)}>
              <Icon name="folder" size={16} /> {tr('Mở thư mục')}
            </Button>
            <Button variant="outline" tone="neutral" size="xs" onClick={() => openDialog('chapters')}>
              <Icon name="list" size={16} /> {tr('Lấy timestamp cho mô tả')}
            </Button>
            <Button
              variant="outline" tone="neutral" size="xs"
              onClick={() => openDialog('save-template')}
              title={tr('Lần sau làm video cùng phong cách: chỉ cần đổi nền và thêm nhạc')}
            >
              <Icon name="palette" size={16} /> {tr('Tạo mẫu từ video này')}
            </Button>
          </div>
          {result.warnings.length > 0 && <p className="warn">{tr('Cảnh báo: {list}', { list: result.warnings.join('; ') })}</p>}
        </div>
      )}
    </Modal>
  )
}
