import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { analyzeFile } from '../src/main/audio/analyze'
import { MixSource, placeTracks, streamMix, toS16 } from '../src/main/audio/mix'
import { ffmpegPath } from '../src/main/ffmpeg'
import { createDefaultProject } from '../src/shared/defaults'
import { SAMPLE_RATE } from '../src/shared/featureFormat'
import { buildTimeline } from '../src/shared/timeline'
import type { Track } from '../src/shared/types'
import { track } from './helpers'

const dir = mkdtempSync(join(tmpdir(), 'pvm-test-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const pcmPath = (key: string): string => join(dir, `${key}.s16`)

function tone(name: string, freq: number, seconds: number): string {
  const out = join(dir, name)
  execFileSync(ffmpegPath(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=${freq}:sample_rate=44100:duration=${seconds}`, '-c:a', 'libmp3lame', out])
  return out
}

function rms(buf: Float32Array, fromFrame: number, frames: number): number {
  let s = 0
  for (let i = fromFrame * 2; i < (fromFrame + frames) * 2; i++) s += buf[i] * buf[i]
  return Math.sqrt(s / (frames * 2))
}

describe('ghép âm thanh', () => {
  const settings = { ...createDefaultProject().settings, transition: { type: 'crossfade' as const, duration: 2 }, fadeIn: 1, fadeOut: 1 }
  let tracks: Track[] = []

  beforeAll(async () => {
    for (const [id, freq, secs] of [
      ['a', 220, 6],
      ['b', 660, 5]
    ] as const) {
      const file = tone(`${id}.mp3`, freq, secs)
      const h = await analyzeFile(file, join(dir, `${id}.pvmf`), pcmPath(id))
      tracks.push(track(id, h.duration, { path: file, analysisKey: id }))
    }
    tracks = [...tracks]
  }, 60000)

  it('phân tích ghi kèm PCM stereo đúng số mẫu', () => {
    const frames = statSync(pcmPath('a')).size / 4
    expect(Math.abs(frames - tracks[0].duration * SAMPLE_RATE)).toBeLessThan(2)
  })

  it('placeTracks khớp với buildTimeline (theo mẫu)', () => {
    const t3 = [track('a', 10), track('b', 7.5, { trimStart: 1 }), track('c', 3)]
    const { placements, total } = placeTracks(t3, settings)
    const tl = buildTimeline(t3, settings)
    placements.forEach((p, i) => expect(p.start).toBe(Math.round(tl.entries[i].start * SAMPLE_RATE)))
    expect(placements[1].trim).toBe(SAMPLE_RATE)
    expect(total).toBe(Math.round(tl.total * SAMPLE_RATE))
  })

  it('đọc theo từng đoạn lẻ (preview) giống hệt đọc một lần (export)', async () => {
    const mix = new MixSource(tracks, settings, pcmPath)
    const whole = await mix.read(0, mix.total)
    const pieces: Float32Array[] = []
    for (let pos = 0; pos < mix.total; pos += 7919) pieces.push(await mix.read(pos, Math.min(7919, mix.total - pos)))
    const joined = new Float32Array(whole.length)
    let o = 0
    for (const p of pieces) {
      joined.set(p, o)
      o += p.length
    }
    expect(Buffer.from(joined.buffer).equals(Buffer.from(whole.buffer))).toBe(true)
    await mix.close()
  })

  it('crossfade, fade đầu/cuối và phần ngoài video', async () => {
    const mix = new MixSource(tracks, settings, pcmPath)
    const buf = await mix.read(0, mix.total)
    const sr = SAMPLE_RATE
    expect(mix.total).toBe(Math.round(buildTimeline(tracks, settings).total * sr))
    expect(rms(buf, 0, 480)).toBeLessThan(0.01) // 10ms đầu: đang fade in
    expect(rms(buf, 2 * sr, sr)).toBeGreaterThan(0.05) // giữa bài 1
    expect(rms(buf, mix.total - 480, 480)).toBeLessThan(0.01) // 10ms cuối: đã fade out
    // Giữa đoạn crossfade (giây 4–6) vẫn có tiếng, không bị hụt
    expect(rms(buf, Math.round(4.9 * sr), sr / 5)).toBeGreaterThan(0.05)
    const after = await mix.read(mix.total + 100, 1000)
    expect(after.every((v) => v === 0)).toBe(true)
    await mix.close()
  })

  it('streamMix đẩy đủ số mẫu dạng 16-bit', async () => {
    const mix = new MixSource(tracks, settings, pcmPath)
    let bytes = 0
    await streamMix(mix, SAMPLE_RATE, SAMPLE_RATE * 3, async (pcm) => {
      bytes += pcm.length
    })
    expect(bytes).toBe(SAMPLE_RATE * 3 * 4)
    expect(toS16(new Float32Array([2, -2, 0.5])).readInt16LE(0)).toBe(32767)
    await mix.close()
  })
})
