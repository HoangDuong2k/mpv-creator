import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'
import { parseFile, TimestampFormat, type ILyricsTag } from 'music-metadata'
import { parseLyricsText } from '../shared/lyrics'
import { newId } from '../shared/defaults'
import type { Track, TrackLyrics } from '../shared/types'
import { probeDuration, runFfmpeg } from './ffmpeg'

import { AUDIO_EXTENSIONS } from '../shared/files'
export { AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from '../shared/files'

export function isAudioFile(path: string): boolean {
  return AUDIO_EXTENSIONS.includes(extname(path).slice(1).toLowerCase())
}

export async function fileFingerprint(path: string): Promise<string> {
  const st = await stat(path)
  return createHash('sha1').update(`${path}|${st.size}|${Math.floor(st.mtimeMs)}`).digest('hex').slice(0, 20)
}

/** "Ca sĩ - Tên bài.mp3" → { artist, title } khi file không có tag */
function guessFromFilename(path: string): { title: string; artist: string } {
  const name = basename(path, extname(path)).replace(/_/g, ' ').trim()
  const m = /^(.+?)\s+[-–]\s+(.+)$/.exec(name)
  if (m) return { artist: m[1].trim(), title: m[2].trim() }
  return { title: name, artist: '' }
}

/** Đọc tên bài, ca sĩ, thời lượng và tách ảnh bìa (nếu có) vào thư mục cache. */
export async function readTrackInfo(path: string, coverDir: string): Promise<Track> {
  const guess = guessFromFilename(path)
  const track: Track = {
    id: newId('track'),
    path,
    title: guess.title,
    artist: guess.artist,
    album: '',
    duration: 0,
    trimStart: 0,
    trimEnd: 0
  }
  try {
    const meta = await parseFile(path, { duration: false, skipCovers: false })
    const c = meta.common
    if (c.title?.trim()) track.title = c.title.trim()
    if (c.artist?.trim()) track.artist = c.artist.trim()
    else if (c.artists?.length) track.artist = c.artists.join(', ')
    track.album = c.album?.trim() ?? ''
    track.duration = meta.format.duration ?? 0
    track.lyrics = lyricsFromTags(c.lyrics) ?? undefined
    const pic = c.picture?.[0]
    if (pic?.data?.length) {
      const ext = pic.format.includes('png') ? 'png' : 'jpg'
      const file = join(coverDir, `${await fileFingerprint(path)}.${ext}`)
      if (!existsSync(file)) {
        await mkdir(coverDir, { recursive: true })
        await writeFile(file, pic.data)
      }
      track.coverPath = file
    }
  } catch {
    // File không đọc được tag: giữ thông tin đoán từ tên file; thời lượng sẽ có sau khi phân tích
  }
  // File .lrc cùng tên đặt cạnh file nhạc (người dùng tự chuẩn bị) ưu tiên hơn lời nhúng trong tag
  const side = await sidecarLyrics(path)
  if (side) track.lyrics = side
  if (!track.lyrics) delete track.lyrics
  return track
}

/**
 * Lời bài hát nhúng trong tag: ưu tiên lời đã đồng bộ (ID3 SYLT, thời gian tính bằng ms), không có thì lời thường
 * (USLT, LYRICS của FLAC / OGG; có khi là cả nội dung LRC).
 */
export function lyricsFromTags(tags: ILyricsTag[] | undefined): TrackLyrics | null {
  if (!tags?.length) return null
  const synced = tags.find((t) => t.syncText?.length && t.timeStampFormat === TimestampFormat.milliseconds)
  if (synced) {
    const lines = synced.syncText
      .filter((l) => typeof l.timestamp === 'number' && l.text.trim())
      .map((l) => ({ t: (l.timestamp as number) / 1000, text: l.text.replace(/\s+/g, ' ').trim() }))
    if (lines.length) return { lines, offset: 0, source: 'embedded' }
  }
  const text = tags.find((t) => t.text?.trim())?.text
  if (!text) return null
  const parsed = parseLyricsText(text, 'embedded')
  return parsed.lines.length ? parsed : null
}

/** File .lrc cạnh file nhạc: "Bài hát.mp3" → "Bài hát.lrc" (hoặc .LRC) */
export async function sidecarLyrics(audioPath: string): Promise<TrackLyrics | null> {
  const base = audioPath.replace(/\.[^./\\]+$/, '')
  for (const ext of ['.lrc', '.LRC', '.Lrc']) {
    const file = base + ext
    if (!existsSync(file)) continue
    try {
      const parsed = parseLyricsText(await readFile(file, 'utf8'), 'lrc-file')
      if (parsed.lines.length) return parsed
    } catch {
      // không đọc được: bỏ qua
    }
  }
  return null
}

/** Lời của file nhạc (cho bài đã có trong project): file .lrc cạnh file nhạc, không có thì lời nhúng trong tag */
export async function readLyricsFor(audioPath: string): Promise<TrackLyrics | null> {
  const side = await sidecarLyrics(audioPath)
  if (side) return side
  try {
    const meta = await parseFile(audioPath, { duration: false, skipCovers: true })
    return lyricsFromTags(meta.common.lyrics)
  } catch {
    return null
  }
}

const stripJobs = new Map<string, Promise<string | null>>()

/**
 * Dải `frames` khung hình (cao 54px, ghép ngang) lấy đều trong video — hiện trên thanh nền ở timeline.
 * Lưu trong cache theo dấu vân tay file (đổi file → làm lại); null nếu không đọc được video.
 */
export function videoThumbStrip(path: string, dir: string, frames = 8): Promise<string | null> {
  const job = stripJobs.get(path) ?? makeStrip(path, dir, frames).finally(() => stripJobs.delete(path))
  stripJobs.set(path, job)
  return job
}

async function makeStrip(path: string, dir: string, frames: number): Promise<string | null> {
  if (!existsSync(path)) return null
  const out = join(dir, `${await fileFingerprint(path)}.jpg`)
  if (existsSync(out)) return out
  const dur = await probeDuration(path)
  if (!(dur > 0)) return null
  await mkdir(dir, { recursive: true })
  const tmp = `${out}.tmp.jpg`
  try {
    await runFfmpeg(['-v', 'error', '-y', '-i', path, '-vf', `fps=${frames}/${dur.toFixed(3)},scale=-2:54,tile=${frames}x1`, '-frames:v', '1', '-q:v', '5', tmp]).done
    await rename(tmp, out)
    return out
  } catch {
    await rm(tmp, { force: true }).catch(() => undefined)
    return null
  }
}
