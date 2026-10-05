import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AudioSampler, Renderer } from '../../../engine'
import { entryAt, type TimelineEntry } from '../../../shared/timeline'
import { formatTime } from '../../../shared/time'
import { assets, features, player } from '../engineHost'
import { useTimeline } from '../hooks'
import { PREVIEW_QUALITY_SCALE, useStore, type PreviewQuality } from '../store'
import { Stage } from './Stage'
import { Icon, IconButton, rangeFill } from './ui'
import { tr, trKey } from '../../../shared/i18n'
import { useLayout } from '../layout'
import { addLibraryItem, itemName } from '../libraryActions'
import { clearLibraryPreview, layersWithPreview, useLibPreview } from '../libraryPreview'

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
  // Đang xem thử một mục thư viện: vẽ project kèm mục đó (project chưa đổi)
  const libPreview = useLibPreview((s) => s.preview)
  const shown = useMemo(() => {
    if (!libPreview) return { project, pin: null as string | null }
    const r = layersWithPreview(project.layers, libPreview, selectedLayerId)
    return { project: { ...project, layers: r.layers }, pin: r.editLayerId }
  }, [project, libPreview, selectedLayerId])
  const live = useRef({ project: shown.project, pin: shown.pin, timeline, sampler, scale, dirty: true, lastT: -1, lastPlaying: false })
  const renderer = useMemo(() => new Renderer(assets), [])
  // Kiểm thử tự động đọc lỗi vẽ của từng lớp trên preview
  useEffect(() => {
    ;(window as unknown as { __pvm: Record<string, unknown> }).__pvm.preview = renderer
  }, [renderer])

  useEffect(() => {
    live.current = { ...live.current, project: shown.project, pin: shown.pin, timeline, sampler, scale, dirty: true }
    player.total = timeline.total
  }, [shown, timeline, sampler, scale])

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
        // Khi dừng: layer đang chọn (hoặc mục đang xem thử) được "ghim" hiện để canh chỉnh; khi phát: xem đúng như video thật
        const editLayerId = player.playing ? null : (s.pin ?? useStore.getState().selectedLayerId)
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
      {libPreview && (
        <div className="lib-preview-bar" role="status">
          <Icon name="eye" size={15} />
          <span className="lib-preview-name">{tr('Đang xem thử "{name}"', { name: itemName(libPreview.item) })}</span>
          <button type="button" className="btn small primary" onClick={() => addLibraryItem(libPreview.item)}>
            <Icon name="add" size={15} /> {libPreview.item.kind === 'media' ? tr('Đặt làm nền') : tr('Thêm vào video')}
          </button>
          <button type="button" className="icon-btn" onClick={clearLibraryPreview} title={tr('Thôi xem thử (Esc)')} aria-label={tr('Thôi xem thử (Esc)')}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {/* Toàn màn hình không còn timeline: thanh tua ngay trên các nút điều khiển */}
      {maximized && <SeekBar total={timeline.total} entries={timeline.entries} withHours={withHours} onSeek={seek} />}
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
          <span className="now-playing" title={`${cur.track.title}${cur.track.artist ? ` - ${cur.track.artist}` : ''}`}>
            ♪ {cur.track.title}
            {cur.track.artist ? ` - ${cur.track.artist}` : ''}
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

/**
 * Thanh tua (khi xem toàn màn hình): bấm hoặc kéo để tua, rê chuột để xem thời điểm và tên bài, vạch mờ là chỗ đổi bài.
 * (Phím ← → tua 5 giây như mọi lúc.) Vị trí cập nhật 60 lần / giây bằng style trực tiếp (không render lại React).
 */
function SeekBar({ total, entries, withHours, onSeek }: { total: number; entries: TimelineEntry[]; withHours: boolean; onSeek: (t: number) => void }): ReactNode {
  const barRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null)
  const dragging = useRef(false)

  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      raf = requestAnimationFrame(tick)
      const k = total > 0 ? Math.min(1, Math.max(0, player.time() / total)) : 0
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${k})`
      if (knobRef.current) knobRef.current.style.left = `${k * 100}%`
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [total])

  /** Thời điểm dưới con trỏ; `x`: chỗ đặt ô thời gian (trong thanh tua, không tràn ra mép) */
  const timeAt = (clientX: number): { x: number; t: number } => {
    const r = trackRef.current!.getBoundingClientRect()
    const bar = barRef.current!.getBoundingClientRect()
    const k = r.width > 0 ? Math.min(1, Math.max(0, (clientX - r.left) / r.width)) : 0
    return { x: Math.min(bar.width - 80, Math.max(80, r.left - bar.left + k * r.width)), t: k * total }
  }
  const hoverEntry = hover ? entries.find((e) => hover.t >= e.displayStart && hover.t < e.displayEnd) : undefined
  return (
    <div
      className={`seekbar${total > 0 ? '' : ' disabled'}`}
      ref={barRef}
      role="slider"
      aria-label={tr('Tua video')}
      aria-valuemin={0}
      aria-valuemax={Math.round(total)}
      aria-valuenow={Math.round(player.time())}
      aria-valuetext={formatTime(player.time(), withHours)}
      onPointerDown={(e) => {
        if (total <= 0 || e.button !== 0) return
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        onSeek(timeAt(e.clientX).t)
      }}
      onPointerMove={(e) => {
        if (total <= 0) return
        const h = timeAt(e.clientX)
        setHover(h)
        if (dragging.current) onSeek(h.t)
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onPointerLeave={() => !dragging.current && setHover(null)}
    >
      <div className="seek-track" ref={trackRef}>
        <div className="seek-fill" ref={fillRef} />
        {total > 0 &&
          entries.slice(1).map((e) => <span key={e.track.id + e.index} className="seek-mark" style={{ left: `${(e.displayStart / total) * 100}%` }} />)}
        <div className="seek-knob" ref={knobRef} />
      </div>
      {hover && (
        <span className="seek-tip" style={{ left: hover.x }}>
          <b>{formatTime(hover.t, withHours)}</b>
          {hoverEntry && <span>{hoverEntry.track.title}</span>}
        </span>
      )}
    </div>
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
        style={rangeFill(muted ? 0 : volume, 0, 1)}
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
  ['medium', trKey('Vừa (½), mượt hơn')],
  ['low', trKey('Nhẹ (¼), cho máy yếu')]
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
            title={tr('Những chỗ giao diện YouTube thường che mất. Tránh đặt chữ, nút Đăng ký ở đó; vùng này không có trong video xuất ra.')}
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
            {tr('Khung hình {info}. Đổi trong Cài đặt…', { info })}
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
