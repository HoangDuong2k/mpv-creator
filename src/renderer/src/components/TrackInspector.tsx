import type { ReactNode } from 'react'
import { formatTime, formatTimePrecise } from '../../../shared/time'
import type { Track } from '../../../shared/types'
import { player } from '../engineHost'
import { useTimeline } from '../hooks'
import { useStore } from '../store'
import { MIN_TRACK } from '../timelineModel'
import { Row, TimeInput } from './ui'

const api = window.api

/** Thuộc tính của clip nhạc đang chọn trên timeline */
export function TrackInspector({ track }: { track: Track }): ReactNode {
  const tl = useTimeline()
  const updateTrack = useStore((s) => s.updateTrack)
  const removeTrack = useStore((s) => s.removeTrack)
  const entry = tl.entries.find((e) => e.track.id === track.id)
  const withHours = tl.total >= 3600
  const maxTrim = (other: number): number => Math.max(0, track.duration - other - MIN_TRACK)
  const seek = (t: number): void => {
    player.seek(t)
    useStore.getState().setTime(t)
  }
  return (
    <div className="inspector">
      <div className="inspector-head">
        <span className="layer-name static">Bài hát {entry ? entry.index + 1 : ''}</span>
        <span className="badge t-audio-badge">Clip nhạc</span>
      </div>
      {track.coverPath && <img className="track-cover-lg" src={api.fileUrl(track.coverPath)} alt="" />}
      <Row label="Tên bài">
        <input value={track.title} onChange={(e) => updateTrack(track.id, { title: e.target.value }, { coalesce: `title-${track.id}` })} />
      </Row>
      <Row label="Ca sĩ">
        <input value={track.artist} onChange={(e) => updateTrack(track.id, { artist: e.target.value }, { coalesce: `artist-${track.id}` })} />
      </Row>
      <div className="section-title">Cắt bài</div>
      <div className="two">
        <Row label="Cắt đầu">
          <TimeInput value={track.trimStart} onChange={(v) => updateTrack(track.id, { trimStart: Math.min(Math.max(0, v), maxTrim(track.trimEnd)) })} />
        </Row>
        <Row label="Cắt cuối">
          <TimeInput value={track.trimEnd} onChange={(v) => updateTrack(track.id, { trimEnd: Math.min(Math.max(0, v), maxTrim(track.trimStart)) })} />
        </Row>
      </div>
      {entry && (
        <p className="muted small">
          Gốc {formatTime(track.duration)} · phát {formatTime(entry.length)} · trong video từ {formatTimePrecise(entry.start, withHours)} đến{' '}
          {formatTimePrecise(entry.end, withHours)}
        </p>
      )}
      <div className="row-actions">
        {entry && (
          <button type="button" className="btn small" onClick={() => seek(entry.index === 0 ? 0 : entry.displayStart)}>
            Tới đầu bài
          </button>
        )}
        {(track.trimStart > 0 || track.trimEnd > 0) && (
          <button type="button" className="btn small" onClick={() => updateTrack(track.id, { trimStart: 0, trimEnd: 0 })}>
            Bỏ cắt
          </button>
        )}
        <button type="button" className="btn small danger" onClick={() => removeTrack(track.id)}>
          Xoá khỏi playlist
        </button>
      </div>
      <p className="muted small">Trên timeline: kéo clip để đổi thứ tự, kéo mép clip để cắt đầu/cuối, chọn clip rồi bấm Delete để xoá.</p>
    </div>
  )
}
