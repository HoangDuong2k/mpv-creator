import type { ReactNode } from 'react'
import { Button } from 'momi-ui'
import { trKey, tr } from '../../../shared/i18n'
import { entryAt } from '../../../shared/timeline'
import type { LyricsSource, Track } from '../../../shared/types'
import { useTimeline } from '../hooks'
import { useStore } from '../store'

const SOURCE: Record<LyricsSource, string> = {
  embedded: trKey('lời nhúng trong file nhạc'),
  'lrc-file': trKey('file .lrc'),
  manual: trKey('tự soạn'),
  ai: trKey('AI căn lời')
}

/** Tình trạng lời của một bài + nút mở hộp thoại Lời bài hát (và thêm lớp lời nếu video chưa có) */
export function LyricsSummary({ track }: { track: Track }): ReactNode {
  const hasLayer = useStore((s) => s.project.layers.some((l) => l.type === 'lyrics'))
  const { openLyrics, addLayer } = useStore.getState()
  const lyrics = track.lyrics
  const total = lyrics?.lines.length ?? 0
  const synced = lyrics?.lines.filter((l) => l.t !== null).length ?? 0
  return (
    <div className="lyrics-summary">
      <p className="muted small" data-lyrics-status>
        {total === 0
          ? tr('Chưa có lời. Dán lời rồi gõ nhịp, hoặc nhập file .lrc.')
          : tr('{n} dòng, đã đồng bộ {k} ({source})', { n: total, k: synced, source: tr(SOURCE[lyrics!.source]) })}
      </p>
      <div className="row-actions">
        <Button variant="outline" tone="neutral" size="xs" data-action="open-lyrics" onClick={() => openLyrics(track.id)}>
          {total === 0 ? tr('Thêm lời') : tr('Soạn / đồng bộ lời')}
        </Button>
        {!hasLayer && total > 0 && (
          <Button variant="soft" tone="primary" size="xs" onClick={() => addLayer('lyrics')}>
            {tr('Hiện lời lên video')}
          </Button>
        )}
      </div>
    </div>
  )
}

/** Bảng thuộc tính của lớp Lời bài hát: lời của bài đang phát (mỗi bài một lời) */
export function LyricsLayerPanel(): ReactNode {
  const timeline = useTimeline()
  const currentTime = useStore((s) => s.currentTime)
  const entry = entryAt(timeline, currentTime)
  const track = useStore((s) => (entry ? s.project.tracks.find((t) => t.id === entry.track.id) : undefined))
  if (!track) return <p className="muted small">{tr('Thêm nhạc để soạn lời cho từng bài.')}</p>
  return (
    <div className="lyrics-layer-panel">
      <p className="small">
        {tr('Bài đang phát:')} <strong>{track.title || tr('Không tên')}</strong>
      </p>
      <LyricsSummary track={track} />
    </div>
  )
}
