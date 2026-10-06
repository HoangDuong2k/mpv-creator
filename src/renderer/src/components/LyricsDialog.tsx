import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Badge, Button, Checkbox, Textarea } from 'momi-ui'
import { safeFileName } from '../../../shared/files'
import { FEATURE_RATE, OFF_BEAT, STRIDE } from '../../../shared/featureFormat'
import { tr } from '../../../shared/i18n'
import {
  hasSyncedLyrics,
  lineAt,
  looksLikeLrc,
  nudgeLine,
  parseLyricsText,
  remapLyrics,
  setLineTime,
  snapToBeat,
  timedLines,
  toLrc,
  toPlainText,
  wordTimings
} from '../../../shared/lyrics'
import type { TrackLyrics } from '../../../shared/types'
import { features, player } from '../engineHost'
import { useTimeline } from '../hooks'
import { useStore } from '../store'
import { Icon, Modal, NumberInput } from './ui'
import { LyricsAiBar } from './LyricsAiBar'
import { LOW_CONFIDENCE } from '../../../shared/lyricsAlign'

const api = window.api

const EMPTY: TrackLyrics = { lines: [], offset: 0, source: 'manual' }

/** "1:02.35" (luôn đủ 2 số lẻ, cột thẳng hàng); chưa đồng bộ: "–:––.––" */
function stampText(t: number | null): string {
  if (t === null) return '–:––.––'
  const v = Math.max(0, Math.round(t * 100) / 100)
  const m = Math.floor(v / 60)
  return `${m}:${(v - m * 60).toFixed(2).padStart(5, '0')}`
}

/**
 * Soạn và đồng bộ lời của một bài: dán lời (hoặc LRC), rồi phát nhạc và nhấn Space đúng lúc mỗi câu bắt đầu
 * (gõ nhịp). Mốc thời gian tính theo file nhạc gốc; chỉnh lại bằng mũi tên, bắt dính beat, lệch cả bài.
 */
export function LyricsDialog(): ReactNode {
  const trackId = useStore((s) => s.lyricsTrackId)
  const track = useStore((s) => s.project.tracks.find((t) => t.id === s.lyricsTrackId))
  const currentTime = useStore((s) => s.currentTime)
  const playing = useStore((s) => s.playing)
  const timeline = useTimeline()
  const entry = timeline.entries.find((e) => e.track.id === trackId)
  const { openDialog, updateTrack, toast } = useStore.getState()
  const lyrics = track?.lyrics ?? EMPTY
  const [text, setText] = useState(() => toPlainText(lyrics))
  const [selected, setSelected] = useState(0)
  const [tapping, setTapping] = useState(false)
  const [snap, setSnap] = useState(true)
  const listRef = useRef<HTMLOListElement>(null)

  // Lời đổi từ nơi khác (nhập file, hoàn tác…): cập nhật ô soạn nếu khác nội dung đang có
  const plain = toPlainText(lyrics)
  useEffect(() => {
    setText((cur) => (remapLyrics(lyrics, cur).lines.map((l) => l.text).join('\n') === plain ? cur : plain))
  }, [plain, lyrics])

  /** Mốc beat của bài (giây theo file nhạc) để bắt dính khi gõ nhịp */
  const beats = useMemo(() => {
    const f = track?.analysisKey ? features.get(track.analysisKey) : undefined
    if (!f) return []
    const out: number[] = []
    for (let i = 0; i < f.frames; i++) if (f.data[i * STRIDE + OFF_BEAT] > 0) out.push(i / FEATURE_RATE)
    return out
  }, [track?.analysisKey])

  const timed = useMemo(() => timedLines(lyrics), [lyrics])
  /** Thời điểm đang phát, tính theo file nhạc của bài này */
  const fileT = entry && track ? currentTime - entry.start + (track.trimStart || 0) : 0
  const inTrack = !!entry && currentTime >= entry.start - 0.05 && currentTime <= entry.end + 0.05
  const active = inTrack ? lineAt(timed, fileT, 0) : null

  // Danh sách tự cuộn tới dòng đang chọn
  useEffect(() => {
    listRef.current?.querySelector(`[data-row="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (!track || !entry) return null

  const save = (next: TrackLyrics, coalesce?: string): void => updateTrack(track.id, { lyrics: next.lines.length ? next : undefined }, coalesce ? { coalesce } : undefined)
  const lineCount = lyrics.lines.length
  const synced = lyrics.lines.filter((l) => l.t !== null).length

  /** Thời điểm trên timeline của mốc `t` trong file nhạc (phần đã cắt đầu thì về đầu bài) */
  const toTimeline = (t: number): number => Math.max(entry.start, entry.start + t - (track.trimStart || 0))
  const playFrom = (t: number): void => {
    player.seek(Math.max(0, toTimeline(t)))
    useStore.getState().setTime(player.time())
    if (!player.playing) player.play()
    useStore.getState().setPlaying(true)
  }
  const togglePlay = (): void => {
    if (player.playing) {
      player.pause()
      useStore.getState().setPlaying(false)
    } else {
      // Đang ở ngoài bài này: phát từ đầu bài
      if (!inTrack) player.seek(entry.start)
      player.play()
      useStore.getState().setPlaying(true)
    }
  }
  /** Gõ nhịp: chốt dòng đang chọn tại thời điểm đang phát rồi sang dòng sau */
  const stamp = (): void => {
    if (!inTrack || selected >= lineCount) return
    const t = snap ? snapToBeat(fileT, beats) : fileT
    save(setLineTime(lyrics, selected, t - lyrics.offset), `lyrics-tap-${track.id}`)
    setSelected(Math.min(lineCount - 1, selected + 1))
  }
  const startTapping = (): void => {
    const first = lyrics.lines.findIndex((l) => l.t === null)
    const row = first < 0 ? 0 : first
    setSelected(row)
    setTapping(true)
    // Phát từ 3 giây trước dòng cần gõ (dòng trước đã có mốc), không thì từ đầu bài
    const prev = lyrics.lines.slice(0, row).reverse().find((l) => l.t !== null)
    playFrom(prev?.t != null ? Math.max(0, prev.t + lyrics.offset - 3) : track.trimStart || 0)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return
    const step = e.shiftKey ? 0.5 : 0.05
    if (e.key === ' ') {
      if (tapping && playing) stamp()
      else togglePlay()
    } else if (e.key === 'ArrowDown') setSelected((i) => Math.min(lineCount - 1, i + 1))
    else if (e.key === 'ArrowUp') setSelected((i) => Math.max(0, i - 1))
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') save(nudgeLine(lyrics, selected, e.key === 'ArrowLeft' ? -step : step), `lyrics-nudge-${track.id}`)
    else if (e.key === 'Backspace' || e.key === 'Delete') {
      // Gõ nhịp: bỏ mốc vừa gõ (dòng trước) và quay lại dòng đó
      const row = tapping && selected > 0 && lyrics.lines[selected].t === null ? selected - 1 : selected
      save(setLineTime(lyrics, row, null))
      setSelected(row)
    } else if (e.key === 'Enter') {
      const t = lyrics.lines[selected]?.t
      playFrom(t != null ? Math.max(0, t + lyrics.offset - 1) : track.trimStart || 0)
    } else return
    e.preventDefault()
    e.stopPropagation()
  }

  const importFile = async (): Promise<void> => {
    const [path] = await api.openFiles('lyrics', false)
    if (!path) return
    const parsed = parseLyricsText(await api.readText(path), 'lrc-file')
    if (!parsed.lines.length) return toast('error', tr('File không có lời bài hát'))
    save(parsed)
    toast('success', hasSyncedLyrics(parsed) ? tr('Đã nhập {n} dòng lời đã đồng bộ', { n: parsed.lines.length }) : tr('Đã nhập {n} dòng lời, giờ gõ nhịp để đồng bộ', { n: parsed.lines.length }))
  }
  const fromAudio = async (): Promise<void> => {
    const found = await api.lyricsFor(track.path)
    if (!found) return toast('info', tr('File nhạc không có lời nhúng sẵn, cũng không có file .lrc cùng tên đặt cạnh'))
    save(found)
    toast('success', tr('Đã lấy {n} dòng lời từ file nhạc', { n: found.lines.length }))
  }
  const exportLrc = async (): Promise<void> => {
    const p = await api.saveFile('lyrics', `${safeFileName(track.title || 'lyrics')}.lrc`)
    if (!p) return
    await api.writeText(p, toLrc(lyrics, { title: track.title, artist: track.artist }))
    toast('success', tr('Đã lưu file lời .lrc'))
  }

  // Xem trước: dòng đang hát, phần đã hát sáng lên như trên video
  const preview = active ? wordTimings(active, lyrics.offset) : null

  return (
    <Modal
      title={tr('Lời bài hát · {title}', { title: track.title || tr('Không tên') })}
      onClose={() => openDialog(null)}
      wide
      onEscapeKeyDown={(e) => {
        if (!tapping) return
        e.preventDefault()
        setTapping(false)
      }}
      footer={
        <>
          <span className="lyrics-foot-hint muted small">{tr('Lời gắn với bài này; thêm lớp "Lời bài hát" (thư viện → Chữ) để hiện lên video.')}</span>
          <Button variant="solid" tone="primary" size="sm" onClick={() => openDialog(null)}>
            {tr('Xong')}
          </Button>
        </>
      }
    >
      <div className="lyrics-dialog" onKeyDown={onKeyDown}>
        <section className="lyrics-compose">
          <div className="lyrics-tools">
            <Button variant="outline" tone="neutral" size="sm" onClick={() => void importFile()}>
              {tr('Nhập file (.lrc, .txt)')}
            </Button>
            <Button variant="outline" tone="neutral" size="sm" onClick={() => void fromAudio()}>
              {tr('Lấy từ file nhạc')}
            </Button>
          </div>
          <Textarea
            className="lyrics-text min-h-[44vh] max-h-[44vh] resize-none"
            value={text}
            spellCheck={false}
            placeholder={`${tr('Dán lời bài hát vào đây, mỗi câu một dòng.')}\n${tr('Dán nội dung .lrc thì giữ luôn thời gian.')}`}
            onChange={(e) => {
              setText(e.target.value)
              save(remapLyrics(lyrics, e.target.value), `lyrics-text-${track.id}`)
            }}
            onPaste={(e) => {
              // Dán cả LRC (có mốc thời gian) vào ô trống: giữ luôn mốc thời gian
              const pasted = e.clipboardData.getData('text')
              if (!looksLikeLrc(pasted) || (text.trim() && e.currentTarget.selectionEnd - e.currentTarget.selectionStart < text.length)) return
              e.preventDefault()
              const parsed = parseLyricsText(pasted, 'manual')
              save(parsed)
              setText(toPlainText(parsed))
            }}
          />
          <div className="lyrics-tools">
            <Button variant="outline" tone="neutral" size="sm" disabled={!synced} onClick={() => void exportLrc()}>
              {tr('Lưu file .lrc')}
            </Button>
            <Button variant="soft" tone="danger" size="sm" disabled={!lineCount} onClick={() => save(EMPTY)}>
              {tr('Xoá lời')}
            </Button>
          </div>
        </section>

        <section className="lyrics-sync">
          <LyricsAiBar trackId={track.id} lines={lyrics.lines.map((l) => l.text)} />
          <div className="lyrics-tools">
            <Button variant="outline" tone="neutral" size="sm" onClick={togglePlay} aria-label={playing ? tr('Tạm dừng') : tr('Phát')}>
              <Icon name={playing ? 'pause' : 'play'} size={14} /> {playing ? tr('Tạm dừng') : tr('Phát')}
            </Button>
            <Button
              variant={tapping ? 'solid' : 'outline'}
              tone={tapping ? 'primary' : 'neutral'}
              size="sm"
              data-action="lyrics-tap"
              disabled={!lineCount}
              onClick={() => (tapping ? setTapping(false) : startTapping())}
            >
              {tapping ? tr('Đang gõ nhịp (Esc để dừng)') : tr('Gõ nhịp')}
            </Button>
            <Checkbox size="sm" checked={snap} onCheckedChange={(v) => setSnap(v === true)} label={tr('Bắt dính beat')} />
            <span className="lyrics-offset">
              {tr('Lệch cả bài')}
              <NumberInput value={lyrics.offset} step={0.05} min={-30} max={30} unit="s" onChange={(v) => save({ ...lyrics, offset: Math.round(v * 100) / 100 }, `lyrics-offset-${track.id}`)} />
            </span>
          </div>
          <p className="muted small lyrics-help">
            {tapping
              ? tr('Nhấn Space đúng lúc mỗi câu bắt đầu. Backspace: bỏ mốc vừa gõ. ← →: nhích mốc ±0,05 giây (Shift: ±0,5).')
              : tr('Bấm "Gõ nhịp" rồi nhấn Space đúng lúc mỗi câu bắt đầu. ↑ ↓ chọn dòng, ← → nhích mốc, Enter nghe từ dòng đang chọn.')}
          </p>
          <ol className="lyrics-lines momi-scrollbar" ref={listRef} tabIndex={0} aria-label={tr('Các dòng lời')}>
            {lyrics.lines.length === 0 && <li className="lyrics-empty muted">{tr('Chưa có lời. Dán lời vào ô bên trái, nhập file .lrc, hoặc lấy từ file nhạc.')}</li>}
            {lyrics.lines.map((l, i) => (
              <li
                key={i}
                data-row={i}
                className={`lyrics-line${i === selected ? ' selected' : ''}${active?.index === i ? ' current' : ''}${l.t === null ? ' unsynced' : ''}${l.conf !== undefined && l.conf < LOW_CONFIDENCE ? ' doubt' : ''}`}
                title={l.conf !== undefined && l.conf < LOW_CONFIDENCE ? tr('AI chưa chắc dòng này: nghe lại (Enter) rồi chỉnh mốc nếu lệch') : undefined}
                onClick={() => setSelected(i)}
                onDoubleClick={() => playFrom(l.t != null ? Math.max(0, l.t + lyrics.offset - 1) : track.trimStart || 0)}
              >
                <span className="lyrics-stamp">{stampText(l.t === null ? null : l.t + lyrics.offset)}</span>
                <span className="lyrics-line-text">{l.text}</span>
              </li>
            ))}
          </ol>
          <div className="lyrics-status">
            <Badge size="sm" shape="rounded" tone={synced === lineCount && lineCount > 0 ? 'success' : 'neutral'}>
              {tr('Đã đồng bộ {n}/{total} dòng', { n: synced, total: lineCount })}
            </Badge>
            <span className="lyrics-preview" aria-live="polite">
              {preview
                ? preview.words.map((w, i) => (
                    <span key={i} className={preview.starts[i] <= fileT ? 'sung' : undefined}>
                      {w}{' '}
                    </span>
                  ))
                : inTrack
                  ? '♪'
                  : tr('Bấm Phát để nghe bài này')}
            </span>
          </div>
        </section>
      </div>
    </Modal>
  )
}
