import { useState, type ReactNode } from 'react'
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

/** Thẻ Nhạc của cột Thư viện: danh sách bài (kéo để đổi thứ tự), thêm nhạc, timestamp YouTube */
export function MusicTab(): ReactNode {
  const tracks = useStore((s) => s.project.tracks)
  const status = useStore((s) => s.trackStatus)
  const currentTime = useStore((s) => s.currentTime)
  const selectedTrackId = useStore((s) => s.selectedTrackId)
  const timeline = useTimeline()
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const { moveTrack, removeTrack, openDialog } = useStore.getState()
  const withHours = timeline.total >= 3600

  const current = timeline.entries.find((e) => currentTime >= e.displayStart && currentTime < e.displayEnd)

  return (
    <>
      <div className="lib-bar">
        <span className="lib-bar-title">Playlist</span>
        <button type="button" className="btn small primary" onClick={async () => importPaths(await api.openFiles('audio', true))}>
          <Icon name="add" size={16} /> {tr('Thêm nhạc')}
        </button>
      </div>
      {tracks.length === 0 ? (
        <div className="empty-drop">
          <Icon name="music" size={40} />
          <p>{tr('Kéo thả file nhạc hoặc thư mục vào đây')}</p>
          <p className="muted">MP3, WAV, FLAC, M4A, OGG…</p>
        </div>
      ) : (
        <ol className="track-list">
          {timeline.entries.map((e, i) => {
            const t = e.track
            const st = status[t.path]
            return (
              <li
                key={t.id}
                className={`track${current?.track.id === t.id ? ' current' : ''}${selectedTrackId === t.id ? ' selected' : ''}${overIndex === i && dragIndex !== null && dragIndex !== i ? ' drop-target' : ''}`}
                draggable
                onDragStart={(ev) => {
                  setDragIndex(i)
                  ev.dataTransfer.effectAllowed = 'move'
                  ev.dataTransfer.setData('text/x-track', String(i))
                }}
                onDragOver={(ev) => {
                  if (dragIndex === null) return
                  ev.preventDefault()
                  setOverIndex(i)
                }}
                onDrop={(ev) => {
                  if (dragIndex === null) return
                  ev.preventDefault()
                  ev.stopPropagation()
                  moveTrack(dragIndex, i)
                  setDragIndex(null)
                  setOverIndex(null)
                }}
                onDragEnd={() => {
                  setDragIndex(null)
                  setOverIndex(null)
                }}
              >
                <div className="track-main" onClick={() => useStore.getState().selectTrack(t.id)} onDoubleClick={() => player.seek(e.start + 0.01)}>
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
                    <TrackStatusBar st={st} />
                  </div>
                  <div className="track-actions">
                    <IconButton icon="tune" title={tr('Chỉnh sửa')} onClick={() => setExpanded(expanded === t.id ? null : t.id)} active={expanded === t.id} size={15} />
                    <IconButton icon="delete" title={tr('Xoá khỏi playlist')} onClick={() => removeTrack(t.id)} size={15} />
                  </div>
                </div>
                {expanded === t.id && <TrackEditor track={t} />}
              </li>
            )
          })}
        </ol>
      )}
      <div className="panel-foot">
        <span>
          {tr('{n} bài', { n: tracks.length })} · {formatTime(timeline.total, withHours)}
        </span>
        <button type="button" className="btn small" onClick={() => openDialog('chapters')} disabled={tracks.length === 0}>
          <Icon name="list" size={16} /> {tr('Timestamp YouTube')}
        </button>
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
        <input value={track.title} onChange={(e) => updateTrack(track.id, { title: e.target.value }, { coalesce: `title-${track.id}` })} />
      </label>
      <label>
        {tr('Ca sĩ')}
        <input value={track.artist} onChange={(e) => updateTrack(track.id, { artist: e.target.value }, { coalesce: `artist-${track.id}` })} />
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
