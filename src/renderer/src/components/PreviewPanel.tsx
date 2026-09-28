import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { AudioSampler, Renderer } from '../../../engine'
import { entryAt } from '../../../shared/timeline'
import { formatTime } from '../../../shared/time'
import { assets, features, player } from '../engineHost'
import { useTimeline } from '../hooks'
import { PREVIEW_QUALITY_SCALE, useStore, type PreviewQuality } from '../store'
import { Stage } from './Stage'
import { Icon, IconButton } from './ui'
import { tr } from '../../../shared/i18n'

/** Kích thước tối đa của canvas preview (cạnh dài) — dự án 4K được xem trước ở 1080p */
const PREVIEW_MAX = 1920

export function PreviewPanel(): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const project = useStore((s) => s.project)
  const featuresVersion = useStore((s) => s.featuresVersion)
  const playing = useStore((s) => s.playing)
  const currentTime = useStore((s) => s.currentTime)
  const trackStatus = useStore((s) => s.trackStatus)
  const timeline = useTimeline()
  const { width: W, height: H } = project.settings
  const quality = useStore((s) => s.previewQuality)
  // Độ nét preview: máy yếu chọn Vừa / Thấp để phát mượt (video xuất ra luôn đủ nét)
  const scale = Math.min(1, PREVIEW_MAX / Math.max(W, H)) * PREVIEW_QUALITY_SCALE[quality]

  const sampler = useMemo(() => new AudioSampler(timeline, (k) => features.get(k)), [timeline, featuresVersion])
  const selectedLayerId = useStore((s) => s.selectedLayerId)
  const live = useRef({ project, timeline, sampler, scale, dirty: true, lastT: -1, lastPlaying: false })
  const renderer = useMemo(() => new Renderer(assets), [])

  useEffect(() => {
    live.current = { ...live.current, project, timeline, sampler, scale, dirty: true }
    player.total = timeline.total
  }, [project, timeline, sampler, scale])

  // Đổi layer đang chọn: vẽ lại (layer đang chỉnh luôn hiện, vd. nút Đăng ký ngoài lịch)
  useEffect(() => {
    live.current.dirty = true
  }, [selectedLayerId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = Math.round(W * scale)
    canvas.height = Math.round(H * scale)
    live.current.dirty = true
  }, [W, H, scale])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    assets.onChange = () => (live.current.dirty = true)
    player.onEnded = () => useStore.getState().setPlaying(false)
    let raf = 0
    let lastUi = 0
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop)
      const s = live.current
      const t = player.time()
      if (player.playing || s.dirty || t !== s.lastT || s.lastPlaying !== player.playing) {
        assets.playing = player.playing
        // Khi dừng: layer đang chọn được "ghim" hiện để canh chỉnh; khi phát: xem đúng như video thật
        const editLayerId = player.playing ? null : useStore.getState().selectedLayerId
        renderer.render({ ctx, project: s.project, timeline: s.timeline, audio: s.sampler, t, scale: s.scale, editLayerId })
        s.dirty = false
        s.lastT = t
        s.lastPlaying = player.playing
      }
      if (now - lastUi > 100) {
        lastUi = now
        const st = useStore.getState()
        if (Math.abs(st.currentTime - t) > 0.04) st.setTime(t)
        if (st.playing !== player.playing) st.setPlaying(player.playing)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [renderer])

  const togglePlay = (): void => {
    if (player.playing) {
      player.pause()
      assets.pauseVideos()
    } else player.play()
    useStore.getState().setPlaying(player.playing)
  }
  const seek = (t: number): void => {
    player.seek(t)
    useStore.getState().setTime(t)
    live.current.dirty = true
  }
  const cur = entryAt(timeline, currentTime)
  const jump = (dir: 1 | -1): void => {
    if (!cur) return
    const target = dir < 0 && currentTime - cur.displayStart > 2 ? cur : timeline.entries[cur.index + dir]
    if (target) seek(target.index === 0 ? 0 : target.displayStart)
  }
  const withHours = timeline.total >= 3600
  const analyzing = Object.values(trackStatus).filter((s) => s.state === 'analyzing').length
  const failed = project.tracks.filter((t) => trackStatus[t.path]?.state === 'error').length
  const audioReady = project.tracks.length > 0 && project.tracks.every((t) => t.analysisKey && trackStatus[t.path]?.state === 'ready')

  return (
    <section className="preview">
      <Stage canvasRef={canvasRef} renderer={renderer} W={W} H={H} onTogglePlay={togglePlay} />
      <div className="transport">
        <IconButton icon="prev" title={tr('Bài trước')} onClick={() => jump(-1)} disabled={!cur} />
        <button type="button" className="play-btn" onClick={togglePlay} title={playing ? tr('Tạm dừng (Space)') : tr('Phát (Space)')} aria-label={playing ? tr('Tạm dừng') : tr('Phát')}>
          <Icon name={playing ? 'pause' : 'play'} size={22} />
        </button>
        <IconButton icon="next" title={tr('Bài sau')} onClick={() => jump(1)} disabled={!cur || cur.index >= timeline.entries.length - 1} />
        <span className="time">
          {formatTime(currentTime, withHours)} / {formatTime(timeline.total, withHours)}
        </span>
        {/* Tua bằng đầu phát trên timeline bên dưới */}
        <span className="spacer" />
        <span className="volume">
          <Icon name="volume" size={16} />
          <input type="range" min={0} max={1} step={0.01} defaultValue={1} onChange={(e) => player.setVolume(parseFloat(e.target.value))} aria-label={tr('Âm lượng')} />
        </span>
      </div>
      <div className="status-line">
        {cur ? (
          <span className="now-playing">
            ♪ {cur.track.title}
            {cur.track.artist ? ` — ${cur.track.artist}` : ''}
          </span>
        ) : (
          <span className="muted">{tr('Thêm nhạc để bắt đầu')}</span>
        )}
        <span className="status-chips">
          {analyzing > 0 && <span className="chip">{tr('Đang phân tích {n} bài…', { n: analyzing })}</span>}
          {failed > 0 && <span className="chip error">{tr('{n} bài lỗi đọc file', { n: failed })}</span>}
          {audioReady && <span className="chip ok">{tr('Âm thanh sẵn sàng')}</span>}
          <span className="chip">
            {W}×{H} · {project.settings.fps}fps
          </span>
          <select
            className="chip chip-select"
            value={quality}
            onChange={(e) => useStore.getState().setPreviewQuality(e.target.value as PreviewQuality)}
            title={tr('Độ nét preview — giảm để phát mượt trên máy yếu; không ảnh hưởng video xuất ra')}
            aria-label={tr('Độ nét preview')}
          >
            <option value="high">{tr('Preview nét')}</option>
            <option value="medium">Preview ½</option>
            <option value="low">Preview ¼</option>
          </select>
        </span>
      </div>
    </section>
  )
}
