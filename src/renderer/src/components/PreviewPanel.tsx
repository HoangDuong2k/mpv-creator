import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AudioSampler, Renderer } from '../../../engine'
import { entryAt } from '../../../shared/timeline'
import { formatTime } from '../../../shared/time'
import { assets, features, player } from '../engineHost'
import { useTimeline } from '../hooks'
import { PREVIEW_QUALITY_SCALE, useStore, type PreviewQuality } from '../store'
import { Stage } from './Stage'
import { Icon, IconButton } from './ui'
import { tr, trKey } from '../../../shared/i18n'
import { useLayout } from '../layout'

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
  const maximized = useLayout((s) => s.previewMax)
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
    <section className={`preview${maximized ? ' maximized' : ''}`}>
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
        {/* Một dòng điều khiển (tiết kiệm chiều cao cho preview trên màn hình laptop); tua bằng timeline bên dưới */}
        {cur ? (
          <span className="now-playing" title={`${cur.track.title}${cur.track.artist ? ` — ${cur.track.artist}` : ''}`}>
            ♪ {cur.track.title}
            {cur.track.artist ? ` — ${cur.track.artist}` : ''}
          </span>
        ) : (
          <span className="now-playing muted">{tr('Thêm nhạc để bắt đầu')}</span>
        )}
        <span className="status-chips">
          {analyzing > 0 && <span className="chip">{tr('Đang phân tích {n} bài…', { n: analyzing })}</span>}
          {failed > 0 && <span className="chip error">{tr('{n} bài lỗi đọc file', { n: failed })}</span>}
          {audioReady && (
            <span className="chip ok" title={tr('Âm thanh sẵn sàng')}>
              <span className="chip-text">{tr('Âm thanh sẵn sàng')}</span>
            </span>
          )}
          <PreviewMenu info={`${W}×${H} · ${project.settings.fps}fps`} />
        </span>
        <VolumeControl />
        <FocusButton />
        <IconButton
          icon={maximized ? 'minimize' : 'maximize'}
          title={maximized ? tr('Thoát toàn màn hình (Esc)') : tr('Xem toàn màn hình (F11)')}
          onClick={() => togglePreviewMax()}
        />
      </div>
    </section>
  )
}

/** Âm lượng: bấm biểu tượng loa để tắt / mở tiếng; thanh trượt tự ẩn khi khung preview hẹp */
function VolumeControl(): ReactNode {
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const apply = (v: number, m: boolean): void => player.setVolume(m ? 0 : v)
  return (
    <span className="volume">
      <button
        type="button"
        className="icon-btn"
        onClick={() => {
          setMuted(!muted)
          apply(volume, !muted)
        }}
        title={muted ? tr('Bật tiếng') : tr('Tắt tiếng')}
        aria-label={muted ? tr('Bật tiếng') : tr('Tắt tiếng')}
      >
        <Icon name={muted || volume === 0 ? 'volumeOff' : 'volume'} size={16} />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          setVolume(v)
          setMuted(false)
          apply(v, false)
        }}
        aria-label={tr('Âm lượng')}
      />
    </span>
  )
}

/** Tập trung preview: ẩn / hiện hai cột bên (phím F) */
function FocusButton(): ReactNode {
  const focused = useLayout((s) => !s.leftOpen && !s.rightOpen)
  return (
    <IconButton
      icon={focused ? 'focusExit' : 'focus'}
      title={focused ? tr('Hiện lại hai cột bên (F)') : tr('Tập trung preview: ẩn hai cột bên (F)')}
      onClick={() => useLayout.getState().toggleFocus()}
      active={focused}
    />
  )
}

const QUALITY_LABELS: Array<[PreviewQuality, string]> = [
  ['high', trKey('Nét (đầy đủ)')],
  ['medium', trKey('Vừa (½) — mượt hơn')],
  ['low', trKey('Nhẹ (¼) — cho máy yếu')]
]

/** Menu nhỏ: độ nét preview + khung hình của project (thay cho các chip dễ bị tràn) */
function PreviewMenu({ info }: { info: string }): ReactNode {
  const quality = useStore((s) => s.previewQuality)
  const safeArea = useLayout((s) => s.safeArea)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: globalThis.PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <span className="preview-menu-wrap" ref={ref}>
      <button type="button" className="chip chip-btn preview-menu-btn" onClick={() => setOpen(!open)} title={tr('Độ nét preview, khung hình')} aria-expanded={open}>
        <Icon name="tune" size={13} />
        <span className="chip-text">{quality === 'high' ? info : `${info} · ${quality === 'medium' ? '½' : '¼'}`}</span>
        <Icon name="expand" size={14} />
      </button>
      {open && (
        <div className="preview-menu" role="menu">
          <div className="menu-title">{tr('Độ nét preview')}</div>
          {QUALITY_LABELS.map(([q, label]) => (
            <button
              type="button"
              key={q}
              data-q={q}
              className={quality === q ? 'on' : ''}
              role="menuitemradio"
              aria-checked={quality === q}
              onClick={() => {
                useStore.getState().setPreviewQuality(q)
                setOpen(false)
              }}
            >
              {tr(label)}
            </button>
          ))}
          <p className="menu-note">{tr('Chỉ ảnh hưởng khung xem trước, video xuất ra luôn đủ nét.')}</p>
          <button
            type="button"
            className={`check${safeArea ? ' on' : ''}`}
            data-safe
            role="menuitemcheckbox"
            aria-checked={safeArea}
            onClick={() => useLayout.getState().toggleSafeArea()}
            title={tr('Những chỗ giao diện YouTube thường che mất — tránh đặt chữ, nút Đăng ký ở đó. Không có trong video xuất ra.')}
          >
            {safeArea ? '☑' : '☐'} {tr('Hiện vùng an toàn YouTube')}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              useStore.getState().openDialog('settings')
            }}
          >
            {tr('Khung hình {info} — đổi trong Cài đặt…', { info })}
          </button>
        </div>
      )}
    </span>
  )
}

/** Xem preview toàn màn hình: preview phủ kín cửa sổ, và cả màn hình nếu hệ điều hành cho phép */
export function togglePreviewMax(on = !useLayout.getState().previewMax): void {
  useLayout.getState().setPreviewMax(on)
  if (on) void document.documentElement.requestFullscreen?.().catch(() => undefined)
  else if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
}

// Thoát toàn màn hình bằng phím của hệ điều hành (Esc…) → preview trở lại bình thường
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && useLayout.getState().previewMax) useLayout.getState().setPreviewMax(false)
})
