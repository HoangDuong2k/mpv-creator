import { open, type FileHandle } from 'fs/promises'
import { SAMPLE_RATE } from '../../shared/featureFormat'
import { buildTimeline, type TimedTrack } from '../../shared/timeline'
import type { ProjectSettings } from '../../shared/types'

const CH = 2
/** PCM trong cache: stereo, 16-bit, 48kHz */
const BYTES_PER_FRAME = CH * 2
const MAX_OPEN_FILES = 16

export interface MixTrack extends TimedTrack {
  analysisKey?: string
}

export type MixSettings = Pick<ProjectSettings, 'transition' | 'fadeIn' | 'fadeOut'>

export interface Placement<T extends TimedTrack = MixTrack> {
  track: T
  /** Vị trí trong bản mix (mẫu, mỗi kênh) */
  start: number
  length: number
  /** Số mẫu cắt ở đầu bài */
  trim: number
  fadeIn: number
  fadeOut: number
}

/** Vị trí từng bài theo mẫu âm thanh, suy ra từ cùng buildTimeline() mà preview/export dùng. */
export function placeTracks<T extends TimedTrack>(tracks: T[], settings: Pick<ProjectSettings, 'transition'>): { placements: Placement<T>[]; total: number } {
  const tl = buildTimeline(tracks, settings)
  const placements = tl.entries.map((e) => ({
    track: e.track,
    start: Math.round(e.start * SAMPLE_RATE),
    length: Math.round(e.length * SAMPLE_RATE),
    trim: Math.round((e.track.trimStart || 0) * SAMPLE_RATE),
    fadeIn: Math.round(e.overlapIn * SAMPLE_RATE),
    fadeOut: Math.round(e.overlapOut * SAMPLE_RATE)
  }))
  const last = placements[placements.length - 1]
  return { placements, total: last ? last.start + last.length : 0 }
}

/** Hệ số âm lượng crossfade kiểu equal-power tại mẫu thứ `local` của bài */
function crossfadeGain(pl: Placement, local: number): number {
  let g = 1
  if (pl.fadeIn > 0 && local < pl.fadeIn) g = Math.sin((Math.PI / 2) * (local / pl.fadeIn))
  const toEnd = pl.length - local
  if (pl.fadeOut > 0 && toEnd < pl.fadeOut) g = Math.min(g, Math.sin((Math.PI / 2) * (toEnd / pl.fadeOut)))
  return g
}

/**
 * Bản mix tổng của playlist, đọc được một đoạn bất kỳ mà không cần ghép cả bài:
 * đọc thẳng PCM đã giải mã sẵn trong cache (lúc phân tích), cộng các bài chồng nhau
 * (crossfade equal-power), fade đầu/cuối video. Preview và export dùng chung hàm này.
 */
export class MixSource {
  readonly total: number
  private readonly placements: Placement[]
  /** Lưu promise để hai lần đọc song song không mở trùng một file */
  private readonly handles = new Map<string, Promise<FileHandle>>()
  private readonly masterFadeIn: number
  private readonly masterFadeOut: number

  constructor(
    tracks: MixTrack[],
    settings: MixSettings,
    private readonly pcmPath: (analysisKey: string) => string
  ) {
    const { placements, total } = placeTracks(tracks, settings)
    this.placements = placements
    this.total = total
    this.masterFadeIn = Math.round(settings.fadeIn * SAMPLE_RATE)
    this.masterFadeOut = Math.round(settings.fadeOut * SAMPLE_RATE)
  }

  private handle(key: string): Promise<FileHandle> {
    const hit = this.handles.get(key)
    if (hit) {
      this.handles.delete(key)
      this.handles.set(key, hit)
      return hit
    }
    const p = open(this.pcmPath(key), 'r')
    p.catch(() => this.handles.delete(key))
    this.handles.set(key, p)
    while (this.handles.size > MAX_OPEN_FILES) {
      const [oldKey, old] = this.handles.entries().next().value as [string, Promise<FileHandle>]
      this.handles.delete(oldKey)
      old.then((h) => h.close()).catch(() => undefined)
    }
    return p
  }

  /** Đọc đoạn [from, from + frames) (đơn vị: mẫu mỗi kênh) — stereo xen kẽ, float −1..1 */
  async read(from: number, frames: number): Promise<Float32Array> {
    const out = new Float32Array(Math.max(0, frames) * CH)
    const end = from + frames
    for (const pl of this.placements) {
      const a = Math.max(from, pl.start)
      const b = Math.min(end, pl.start + pl.length)
      if (a >= b || !pl.track.analysisKey) continue
      const fh = await this.handle(pl.track.analysisKey)
      const n = b - a
      const local = a - pl.start
      const buf = Buffer.alloc(n * BYTES_PER_FRAME)
      const { bytesRead } = await fh.read(buf, 0, buf.length, (pl.trim + local) * BYTES_PER_FRAME)
      // File ngắn hơn dự kiến: phần thiếu là im lặng
      const got = Math.floor(bytesRead / BYTES_PER_FRAME)
      const src = new Int16Array(buf.buffer, buf.byteOffset, got * CH)
      const o = (a - from) * CH
      for (let i = 0; i < got; i++) {
        const g = crossfadeGain(pl, local + i) / 32768
        out[o + i * 2] += src[i * 2] * g
        out[o + i * 2 + 1] += src[i * 2 + 1] * g
      }
    }
    this.applyMasterFade(out, from, frames)
    return out
  }

  private applyMasterFade(out: Float32Array, from: number, frames: number): void {
    const fi = this.masterFadeIn
    const fo = this.masterFadeOut
    const total = this.total
    if (fi > 0 && from < fi) {
      for (let i = 0; i < frames && from + i < fi; i++) {
        const g = Math.max(0, (from + i) / fi)
        out[i * 2] *= g
        out[i * 2 + 1] *= g
      }
    }
    if (fo > 0 && from + frames > total - fo) {
      for (let i = Math.max(0, total - fo - from); i < frames; i++) {
        const g = Math.max(0, (total - (from + i)) / fo)
        out[i * 2] *= g
        out[i * 2 + 1] *= g
      }
    }
  }

  async close(): Promise<void> {
    const all = [...this.handles.values()]
    this.handles.clear()
    await Promise.all(all.map((p) => p.then((h) => h.close()).catch(() => undefined)))
  }
}

/** Float −1..1 → PCM 16-bit (cắt đỉnh nếu vượt ngưỡng) */
export function toS16(f: Float32Array): Buffer {
  const buf = Buffer.alloc(f.length * 2)
  const out = new Int16Array(buf.buffer, buf.byteOffset, f.length)
  for (let i = 0; i < f.length; i++) {
    const v = f[i]
    out[i] = v >= 1 ? 32767 : v <= -1 ? -32768 : Math.round(v * 32767)
  }
  return buf
}

/** Đẩy lần lượt bản mix [from, from + frames) ra `write` theo từng khối 5 giây (có backpressure). */
export async function streamMix(
  source: MixSource,
  from: number,
  frames: number,
  write: (pcm: Buffer) => Promise<void>,
  onProgress?: (p: number) => void
): Promise<void> {
  const block = SAMPLE_RATE * 5
  for (let pos = from; pos < from + frames; pos += block) {
    const n = Math.min(block, from + frames - pos)
    await write(toS16(await source.read(pos, n)))
    onProgress?.((pos + n - from) / frames)
  }
}
