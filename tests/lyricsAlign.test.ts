import { describe, expect, it } from 'vitest'
import { AI_LINE_HOLD, applyAlignment } from '../src/shared/lyrics'
import { LOW_CONFIDENCE, alignLyrics, filterHallucinations, lyricsLanguage, type AsrWord } from '../src/shared/lyricsAlign'
import type { TrackLyrics } from '../src/shared/types'

/** Từ nghe được giả lập: mỗi từ 0,4 giây, các câu bắt đầu ở `starts` */
function sung(lines: string[], starts: number[]): AsrWord[] {
  return lines.flatMap((line, i) => line.split(' ').map((text, k) => ({ text, start: starts[i] + k * 0.4, end: starts[i] + k * 0.4 + 0.35 })))
}

describe('AI căn lời: khớp lời với từ nghe được', () => {
  it('đặt mốc từng dòng, từng từ (sớm hơn 0,2 giây so với mốc nhận dạng) và tin cậy cao khi nghe đúng lời', () => {
    const lyrics = ['Nắng ấm xa dần rồi', 'Nắng ấm xa dần bỏ rơi để lại những giấc mơ', 'Giữ lại đi']
    const res = alignLyrics(lyrics, sung(lyrics, [12, 16, 24]))
    expect(res.map((l) => l.start)).toEqual([11.8, 15.8, 23.8])
    expect(res[0].words.map((w) => w.start)).toEqual([11.8, 12.2, 12.6, 13, 13.4])
    expect(res.every((l) => l.confidence > 0.9 && !l.estimated)).toBe(true)
  })

  it('nghe sai vài chữ (sai dấu, đọc gần giống) vẫn khớp đúng chỗ', () => {
    const lyrics = ['Giờ em đã xa rồi', 'Trời mưa rơi trên phố']
    // Whisper nghe "Dờ em đả xa rồi", "Chời mưa dơi trên phố"
    const heard = sung(['Dờ em đả xa rồi', 'Chời mưa dơi trên phố'], [5, 9])
    const res = alignLyrics(lyrics, heard)
    expect(res.map((l) => l.start)).toEqual([4.8, 8.8])
    expect(res.every((l) => l.confidence >= LOW_CONFIDENCE)).toBe(true)
  })

  it('dòng chú thích [Chorus] bị bỏ qua; dòng không hát thì độ tin cậy thấp, các dòng khác không bị lệch', () => {
    const lyrics = ['[Chorus]', 'Hold me close tonight', 'This line is never sung at all', 'Never let me go']
    const res = alignLyrics(lyrics, sung(['Hold me close tonight', 'Never let me go'], [30, 40]))
    expect(res.map((l) => l.index)).toEqual([1, 2, 3])
    expect(res[0].start).toBeCloseTo(29.8)
    expect(res[2].start).toBeCloseTo(39.8)
    expect(res[1].estimated).toBe(true)
    expect(res[1].confidence).toBeLessThanOrEqual(0.2)
    expect(res[1].start).toBeGreaterThan(res[0].start)
    expect(res[1].start).toBeLessThan(res[2].start)
  })

  it('ghép / tách từ: "heartbeat" ↔ "heart beat"', () => {
    const res = alignLyrics(['Feel my heart beat'], [
      { text: 'Feel', start: 1, end: 1.3 },
      { text: 'my', start: 1.4, end: 1.6 },
      { text: 'heartbeat', start: 1.7, end: 2.5 }
    ])
    expect(res[0].words.map((w) => w.kind)).toEqual(['match', 'match', 'match', 'match'])
    expect(res[0].words[3].start).toBeGreaterThan(res[0].words[2].start)
  })

  it('bỏ câu Whisper hay bịa ở đoạn nhạc không lời và chuỗi từ dồn cục khi giải mã lặp vòng', () => {
    const words: AsrWord[] = [
      { text: 'Hãy', start: 0.5, end: 0.7 },
      { text: 'subscribe', start: 0.8, end: 1.2 },
      { text: 'cho', start: 1.3, end: 1.4 },
      { text: 'kênh', start: 1.5, end: 1.8 },
      ...['la', 'la', 'la', 'la'].map((text, i) => ({ text, start: 10 + i * 0.02, end: 10 + i * 0.02 + 0.01 })),
      { text: 'Hello', start: 20, end: 20.4 }
    ]
    expect(filterHallucinations(words).map((w) => w.text)).toEqual(['Hello'])
  })

  it('nhận ngôn ngữ của lời để báo cho Whisper', () => {
    expect(lyricsLanguage(['Nắng ấm xa dần'])).toBe('vi')
    expect(lyricsLanguage(['Hold me close tonight'])).toBe('en')
    expect(lyricsLanguage(['夜に駆ける'])).toBeNull()
    expect(lyricsLanguage([''])).toBeNull()
  })
})

describe('Áp kết quả AI vào lời bài hát', () => {
  it('mốc dòng, mốc từng chữ (dấu câu đứng riêng lấy mốc chữ trước), hết dòng, độ tin cậy; trừ lệch cả bài', () => {
    const lyrics: TrackLyrics = {
      lines: [
        { t: null, text: '[Verse 1]' },
        { t: 3, text: 'Hold me — close', end: 9, words: [{ t: 3, text: 'old' }] },
        { t: null, text: 'Never let go' }
      ],
      offset: 0.5,
      source: 'manual'
    }
    const aligned = alignLyrics(
      lyrics.lines.map((l) => l.text),
      sung(['Hold me close', 'Never let go'], [10, 14])
    )
    const next = applyAlignment(lyrics, aligned)
    expect(next.source).toBe('ai')
    expect(next.offset).toBe(0.5)
    expect(next.lines[0]).toEqual({ t: null, text: '[Verse 1]' })
    const [, a, b] = next.lines
    expect(a.t).toBeCloseTo(9.8 - 0.5)
    expect(a.words?.map((w) => w.text)).toEqual(['Hold', 'me', '—', 'close'])
    // "—" lấy mốc của "me"
    expect(a.words?.[2].t).toBe(a.words?.[1].t)
    expect(a.end).toBeCloseTo(aligned[0].end + AI_LINE_HOLD - 0.5)
    expect(a.conf).toBe(aligned[0].confidence)
    expect(b.t).toBeCloseTo(13.8 - 0.5)
  })
})
