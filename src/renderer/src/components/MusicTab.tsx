import { useState, type MouseEvent, type ReactNode } from 'react'
import { Button, Input, SortableList } from 'momi-ui'
import { formatTime } from '../../../shared/time'
import type { Track } from '../../../shared/types'
import { player } from '../engineHost'
import { errorText, useTimeline } from '../hooks'
import { useStore } from '../store'
import { Icon, IconButton, NumberInput } from './ui'
import { tr } from '../../../shared/i18n'

const api = window.api

export async function importPaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const { addTracks, toast } = useStore.getState()
  try {
    const tracks = await api.importMedia(paths)
    if (tracks.length === 0) toast('error', tr('Không tìm thấy file nhạc hợp lệ (mp3, wav, flac, m4a, ogg…)'))
    else addTracks(tracks)
  } catch (err) {
    toast('error', tr('Không thêm được nhạc: {err}', { err: errorText(err) }))
  }
}

/** Hàng bài là khung trơn: nền, viền, chữ do `.track` bên trong vẽ (lớp `current`, `selected` theo từng bài) */
const ROW_RESET = 'block p-0 rounded-[var(--r-sm)] text-[length:inherit] hover:bg-transparent'

/**
 * Bấm chuột vào hàng bài không đưa focus vào hàng (focus về trang như trước): Space vẫn phát / dừng.
 * Hàng chỉ nhận focus qua Tab, khi đó Space nhấc bài lên, mũi tên dời chỗ, Space thả.
 */
function keepFocusOff(e: MouseEvent): void {
  if ((e.target as Element).closest('button, input, textarea, select, a, label')) return
  e.preventDefault()
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
}

/** Thẻ Nhạc của cột Thư viện: danh sách bài (kéo chuột hoặc bàn phím để đổi thứ tự), thêm nhạc, timestamp YouTube */
export function MusicTab(): ReactNode {
  const tracks = useStore((s) => s.project.tracks)
  const status = useStore((s) => s.trackStatus)
  const currentTime = useStore((s) => s.currentTime)
  const selectedTrackId = useStore((s) => s.selectedTrackId)
  const timeline = useTimeline()
  const [expanded, setExpanded] = useState<string | null>(null)
  const { moveTrack, removeTrack, openDialog } = useStore.getState()
  const withHours = timeline.total >= 3600

  const current = timeline.entries.find((e) => currentTime >= e.displayStart && currentTime < e.displayEnd)

  return (
    <>
      <div className="lib-bar">
        <span className="lib-bar-title">Playlist</span>
        <Button variant="solid" tone="primary" size="xs" onClick={async () => importPaths(await api.openFiles('audio', true))}>
          <Icon name="add" size={16} /> {tr('Thêm nhạc')}
        </Button>
      </div>
      {tracks.length === 0 ? (
        <div className="empty-drop">
          <Icon name="music" size={40} />
          <p>{tr('Kéo thả file nhạc hoặc thư mục vào đây')}</p>
          <p className="muted">MP3, WAV, FLAC, M4A, OGG…</p>
        </div>
      ) : (
        <SortableList
          className="track-list momi-scrollbar [--sortable-gap:1px]"
          itemClassName={ROW_RESET}
          variant="plain"
          value={timeline.entries}
          getItemId={(e) => e.track.id}
          getItemLabel={(e) => e.track.title || tr('Không tên')}
          onReorder={({ from, to }) => moveTrack(from, to)}
          renderItem={(e, { index: i, overlay }) => {
            const t = e.track
            const st = status[t.path]
            return (
              <div className={`track${current?.track.id === t.id && !overlay ? ' current' : ''}${selectedTrackId === t.id ? ' selected' : ''}`}>
                <div
                  className="track-main"
                  onMouseDown={keepFocusOff}
                  onClick={() => useStore.getState().selectTrack(t.id)}
                  onDoubleClick={() => player.seek(e.start + 0.01)}
                >
                  <span className="track-no">{i + 1}</span>
                  {t.coverPath ? <img className="cover" src={api.fileUrl(t.coverPath)} alt="" /> : <span className="cover placeholder"><Icon name="music" size={18} /></span>}
                  <div className="track-info">
                    <div className="track-title" title={t.path}>
                      {t.title || tr('Không tên')}
                    </div>
                    <div className="track-sub">
                      {t.artist && <span>{t.artist} · </span>}
                      <span title={tr('Bắt đầu trong video')}>{formatTime(i === 0 ? 0 : e.displayStart, withHours)}</span>
                      <span className="muted"> · {formatTime(e.length)}</span>
                    </div>
                    {!overlay && <TrackStatusBar st={st} />}
                  </div>
                  {!overlay && (
                    <div className="track-actions">
                      <IconButton btnSize="xs" icon="tune" title={tr('Chỉnh sửa')} onClick={() => setExpanded(expanded === t.id ? null : t.id)} active={expanded === t.id} size={15} />
                      <IconButton btnSize="xs" icon="delete" title={tr('Xoá khỏi playlist')} onClick={() => removeTrack(t.id)} size={15} />
                    </div>
                  )}
                </div>
                {expanded === t.id && !overlay && <TrackEditor track={t} />}
              </div>
            )
          }}
        />
      )}
      <div className="panel-foot">
        <span>
          {tr('{n} bài', { n: tracks.length })} · {formatTime(timeline.total, withHours)}
        </span>
        <Button variant="outline" tone="neutral" size="xs" onClick={() => openDialog('chapters')} disabled={tracks.length === 0}>
          <Icon name="list" size={16} /> {tr('Timestamp YouTube')}
        </Button>
      </div>
    </>
  )
}

function TrackStatusBar({ st }: { st?: { state: string; progress: number; error?: string } }): ReactNode {
  if (!st || st.state === 'ready') return null
  if (st.state === 'error')
    return (
      <div className="track-error" title={st.error}>
        <Icon name="error" size={14} /> {tr('Lỗi đọc file')}
      </div>
    )
  return (
    <div className="mini-progress" title={tr('Đang phân tích âm thanh')}>
      <div style={{ width: `${Math.round(st.progress * 100)}%` }} />
    </div>
  )
}

function TrackEditor({ track }: { track: Track }): ReactNode {
  const updateTrack = useStore((s) => s.updateTrack)
  return (
    <div className="track-editor">
      <label>
        {tr('Tên bài')}
        <Input value={track.title} onChange={(e) => updateTrack(track.id, { title: e.target.value }, { coalesce: `title-${track.id}` })} />
      </label>
      <label>
        {tr('Ca sĩ')}
        <Input value={track.artist} onChange={(e) => updateTrack(track.id, { artist: e.target.value }, { coalesce: `artist-${track.id}` })} />
      </label>
      <div className="two">
        <label>
          {tr('Cắt đầu (giây)')}
          <NumberInput value={track.trimStart} min={0} max={Math.max(0, track.duration - track.trimEnd - 1)} onChange={(v) => updateTrack(track.id, { trimStart: v })} />
        </label>
        <label>
          {tr('Cắt cuối (giây)')}
          <NumberInput value={track.trimEnd} min={0} max={Math.max(0, track.duration - track.trimStart - 1)} onChange={(v) => updateTrack(track.id, { trimEnd: v })} />
        </label>
      </div>
      <p className="muted small">{tr('Thời lượng gốc: {time}', { time: formatTime(track.duration) })}</p>
    </div>
  )
}
