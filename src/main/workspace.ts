import { existsSync } from 'fs'
import { open, readdir, rm, stat, utimes } from 'fs/promises'
import { join } from 'path'
import { ANALYSIS_VERSION, type FeatureHeader } from '../shared/featureFormat'
import type { Track } from '../shared/types'
import { analyzeFile } from './audio/analyze'
import { MixSource, type MixSettings, type MixTrack } from './audio/mix'
import { fileFingerprint } from './media'

/** Giới hạn dung lượng cache âm thanh đã giải mã (PCM) — xoá bài lâu không dùng khi vượt */
const CACHE_LIMIT_BYTES = 10 * 1024 ** 3

/** Thư mục con mà các bản cũ tạo trong userData/cache */
const LEGACY_CACHE_SUBDIRS = ['pcm', 'analysis', 'mix', 'covers', 'thumbs']

/**
 * Xoá cache âm thanh ở vị trí cũ (userData/cache). Chỉ xoá các thư mục con của app, không xoá cả thư mục:
 * Windows (và macOS) không phân biệt hoa/thường nên "cache" chính là thư mục "Cache" — bộ nhớ đệm HTTP
 * mà Chromium đang dùng.
 */
export async function removeLegacyCache(userData: string): Promise<void> {
  for (const sub of LEGACY_CACHE_SUBDIRS) {
    await rm(join(userData, 'cache', sub), { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined)
  }
}

/** Quản lý thư mục cache: dữ liệu phân tích, âm thanh đã giải mã, ảnh bìa. */
export class Workspace {
  constructor(readonly cacheDir: string) {}

  get coverDir(): string {
    return join(this.cacheDir, 'covers')
  }

  /** Dải khung hình của video nền (ảnh thu nhỏ trên timeline) */
  get thumbDir(): string {
    return join(this.cacheDir, 'thumbs')
  }

  featuresPath(key: string): string {
    return join(this.cacheDir, 'analysis', `${key}.pvmf`)
  }

  /** Âm thanh đã giải mã của một bài: stereo 16-bit 48kHz, không header */
  pcmPath(key: string): string {
    return join(this.cacheDir, 'pcm', `${key}.s16`)
  }

  async analysisKey(path: string): Promise<string> {
    return `${await fileFingerprint(path)}_v${ANALYSIS_VERSION}`
  }

  async readHeader(key: string): Promise<FeatureHeader | null> {
    const file = this.featuresPath(key)
    if (!existsSync(file)) return null
    const fh = await open(file, 'r')
    try {
      const buf = Buffer.alloc(8192)
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0)
      if (bytesRead < 8 || buf.toString('latin1', 0, 4) !== 'PVMF') return null
      const len = buf.readUInt32LE(4)
      return JSON.parse(buf.toString('utf8', 8, 8 + len)) as FeatureHeader
    } catch {
      return null
    } finally {
      await fh.close()
    }
  }

  /** Phân tích bài (hoặc dùng lại cache). Trả về khoá cache và thời lượng chính xác. */
  async ensureAnalysis(
    track: Pick<Track, 'path' | 'duration'>,
    opts: { onProgress?: (p: number) => void; signal?: AbortSignal } = {}
  ): Promise<{ analysisKey: string; duration: number }> {
    const key = await this.analysisKey(track.path)
    const pcm = this.pcmPath(key)
    let header = existsSync(pcm) ? await this.readHeader(key) : null
    if (header) {
      // Đánh dấu vừa dùng để không bị dọn khi cache đầy
      const now = new Date()
      await utimes(pcm, now, now).catch(() => undefined)
    } else header = await analyzeFile(track.path, this.featuresPath(key), pcm, { expectedDuration: track.duration, ...opts })
    return { analysisKey: key, duration: header.duration }
  }

  /** Bản mix đọc được theo đoạn (preview) hoặc tuần tự (export) */
  mixSource(tracks: MixTrack[], settings: MixSettings): MixSource {
    return new MixSource(tracks, settings, (key) => this.pcmPath(key))
  }

  hasAudio(key: string): boolean {
    return existsSync(this.pcmPath(key)) && existsSync(this.featuresPath(key))
  }

  /** Dung lượng cache âm thanh (PCM + dữ liệu phân tích), byte */
  async audioCacheSize(): Promise<number> {
    let total = 0
    for (const sub of ['pcm', 'analysis']) {
      const dir = join(this.cacheDir, sub)
      try {
        for (const f of await readdir(dir)) total += (await stat(join(dir, f))).size
      } catch {
        // chưa có thư mục
      }
    }
    return total
  }

  /** Xoá cache âm thanh (tạo lại được bằng cách phân tích lại). Ảnh bìa giữ nguyên vì project đang trỏ tới. */
  async clearAudioCache(): Promise<void> {
    for (const sub of ['pcm', 'analysis', 'mix']) {
      // maxRetries: Windows có thể tạm khoá file vừa đóng (antivirus, indexer)
      await rm(join(this.cacheDir, sub), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    }
  }

  /**
   * Dọn cache: xoá dữ liệu của phiên bản cũ và bản mix kiểu cũ,
   * rồi xoá các bài lâu không dùng nhất khi PCM vượt giới hạn dung lượng.
   */
  async pruneCache(limit = CACHE_LIMIT_BYTES): Promise<void> {
    await rm(join(this.cacheDir, 'mix'), { recursive: true, force: true }).catch(() => undefined)
    const analysisDir = join(this.cacheDir, 'analysis')
    const pcmDir = join(this.cacheDir, 'pcm')
    try {
      for (const f of await readdir(analysisDir)) {
        if (!f.endsWith(`_v${ANALYSIS_VERSION}.pvmf`)) await rm(join(analysisDir, f), { force: true })
      }
    } catch {
      // chưa có thư mục
    }
    try {
      const files = await Promise.all(
        (await readdir(pcmDir))
          .filter((f) => f.endsWith('.s16'))
          .map(async (f) => {
            const st = await stat(join(pcmDir, f))
            return { f, size: st.size, t: st.mtimeMs }
          })
      )
      let total = files.reduce((s, x) => s + x.size, 0)
      files.sort((a, b) => a.t - b.t)
      for (const x of files) {
        if (total <= limit) break
        const key = x.f.slice(0, -'.s16'.length)
        await rm(join(pcmDir, x.f), { force: true })
        await rm(this.featuresPath(key), { force: true })
        total -= x.size
      }
    } catch {
      // chưa có thư mục
    }
  }
}
