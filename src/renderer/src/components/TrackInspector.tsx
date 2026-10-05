import type { ReactNode } from 'react'
import { Badge, Button, Input } from 'momi-ui'
import { formatTime, formatTimePrecise } from '../../../shared/time'
import type { Track } from '../../../shared/types'
import { player } from '../engineHost'
import { useTimeline } from '../hooks'
import { useStore } from '../store'
import { MIN_TRACK } from '../timelineModel'
import { Row, TimeInput } from './ui'
import { tr } from '../../../shared/i18n'

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
        <span className="layer-name static">{tr('Bài hát {n}', { n: entry ? entry.index + 1 : '' })}</span>
        <Badge size="sm" shape="rounded">
          {tr('Clip nhạc')}
        </Badge>
      </div>
      {track.coverPath && <img className="track-cover-lg" src={api.fileUrl(track.coverPath)} alt="" />}
      <Row label={tr('Tên bài')}>
        <Input value={track.title} onChange={(e) => updateTrack(track.id, { title: e.target.value }, { coalesce: `title-${track.id}` })} />
      </Row>
      <Row label={tr('Ca sĩ')}>
        <Input value={track.artist} onChange={(e) => updateTrack(track.id, { artist: e.target.value }, { coalesce: `artist-${track.id}` })} />
      </Row>
      <div className="section-title">{tr('Cắt bài')}</div>
      <div className="two">
        <Row label={tr('Cắt đầu')}>
          <TimeInput value={track.trimStart} onChange={(v) => updateTrack(track.id, { trimStart: Math.min(Math.max(0, v), maxTrim(track.trimEnd)) })} />
        </Row>
        <Row label={tr('Cắt cuối')}>
          <TimeInput value={track.trimEnd} onChange={(v) => updateTrack(track.id, { trimEnd: Math.min(Math.max(0, v), maxTrim(track.trimStart)) })} />
        </Row>
      </div>
      {entry && (
        <p className="muted small">
          {tr('Gốc {orig}, phát {len}, trong video từ {from} đến {to}', {
            orig: formatTime(track.duration),
            len: formatTime(entry.length),
            from: formatTimePrecise(entry.start, withHours),
            to: formatTimePrecise(entry.end, withHours)
          })}
        </p>
      )}
      <div className="row-actions">
        {entry && (
          <Button variant="outline" tone="neutral" size="xs" onClick={() => seek(entry.index === 0 ? 0 : entry.displayStart)}>
            {tr('Tới đầu bài')}
          </Button>
        )}
        {(track.trimStart > 0 || track.trimEnd > 0) && (
          <Button variant="outline" tone="neutral" size="xs" onClick={() => updateTrack(track.id, { trimStart: 0, trimEnd: 0 })}>
            {tr('Bỏ cắt')}
          </Button>
        )}
        <Button variant="soft" tone="danger" size="xs" onClick={() => removeTrack(track.id)}>
          {tr('Xoá khỏi playlist')}
        </Button>
      </div>
      <p className="muted small">{tr('Trên timeline: kéo clip để đổi thứ tự, kéo mép clip để cắt đầu/cuối, chọn clip rồi bấm Delete để xoá.')}</p>
    </div>
  )
}
