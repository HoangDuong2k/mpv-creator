// Xuất thật (render + mã hoá + ghép tiếng) một video nhỏ: bị ngắt giữa chừng rồi xuất tiếp.
import { execFileSync, spawnSync } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { exportVideo, isCompleteMp4, type ExportOptions, type ExportProgress } from '../src/main/export/exporter'
import { ffmpegPath } from '../src/main/ffmpeg'
import { Workspace } from '../src/main/workspace'
import { createDefaultProject } from '../src/shared/defaults'
import type { Project } from '../src/shared/types'
import { track } from './helpers'

const ROOT = resolve(__dirname, '..')
const dir = mkdtempSync(join(tmpdir(), 'pvm-export-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const FPS = 30
const SECONDS = 8

/** Số frame của luồng hình (đếm thật bằng FFmpeg) */
function videoFrames(file: string): number {
  // Giải mã hẳn (chép luồng thì FFmpeg 7 không in số frame)
  const r = spawnSync(ffmpegPath(), ['-hide_banner', '-i', file, '-map', '0:v:0', '-f', 'null', '-'], { encoding: 'utf8' })
  const all = [...(r.stderr ?? '').matchAll(/frame=\s*(\d+)/g)]
  return all.length ? Number(all[all.length - 1][1]) : -1
}

describe('xuất video theo đoạn, xuất tiếp khi bị ngắt', () => {
  const ws = new Workspace(join(dir, 'cache'))
  const outDir = join(dir, 'out')
  const output = join(outDir, 'video.mp4')
  let project: Project

  beforeAll(async () => {
    const mp3 = join(dir, 'tone.mp3')
    execFileSync(ffmpegPath(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=330:sample_rate=44100:duration=${SECONDS}`, '-c:a', 'libmp3lame', mp3])
    const a = await ws.ensureAnalysis({ path: mp3, duration: SECONDS })
    project = createDefaultProject()
    project.tracks = [track('a', a.duration, { path: mp3, analysisKey: a.analysisKey })]
    project.settings = { ...project.settings, width: 320, height: 180, fps: FPS }
    project.export = { ...project.export, encoder: 'libx264', quality: 'fast', audioBitrate: 128, outputPath: output }
    mkdirSync(outDir, { recursive: true })
  }, 60000)

  const options = (extra: Partial<ExportOptions> = {}): ExportOptions => ({
    project,
    workspace: ws,
    settings: project.export,
    fontsDir: join(ROOT, 'resources', 'fonts'),
    workerPath: join(ROOT, 'scripts', 'worker-dev.cjs'),
    workers: 1,
    chunkFrames: 2 * FPS,
    ...extra
  })
  const partsDirs = (): string[] => readdirSync(outDir).filter((n) => n.startsWith('.video.parts-'))

  it('bị huỷ sau đoạn đầu: giữ đoạn đã xong, xoá phần dở dang', async () => {
    const ctrl = new AbortController()
    await expect(
      exportVideo(
        options({
          signal: ctrl.signal,
          onProgress: (p) => {
            if (p.chunksDone >= 1) ctrl.abort()
          }
        })
      )
    ).rejects.toThrow('Đã huỷ')
    const dirs = partsDirs()
    expect(dirs).toHaveLength(1)
    const files = readdirSync(join(outDir, dirs[0]))
    expect(files).toEqual(['part00000.mp4'])
    expect(await isCompleteMp4(join(outDir, dirs[0], 'part00000.mp4'))).toBe(true)
    expect(existsSync(output)).toBe(false)
  }, 120000)

  it('xuất lại: chỉ render phần còn thiếu, video đủ frame, dọn thư mục tạm', async () => {
    // Thư mục tạm của một lần xuất cũ (project khác) ra cùng file → bị dọn
    const stale = join(outDir, '.video.parts-0000deadbeef')
    mkdirSync(stale)
    writeFileSync(join(stale, 'part00000.mp4'), 'cũ')
    const events: ExportProgress[] = []
    const r = await exportVideo(options({ onProgress: (p) => events.push(p) }))
    expect(r.resumedFrames).toBe(2 * FPS)
    expect(r.totalFrames).toBe(SECONDS * FPS)
    expect(events[0].resumedFrames).toBe(2 * FPS)
    expect(events[0].chunksDone).toBe(1)
    expect(events[0].chunksTotal).toBe(4)
    expect(events.at(-1)?.stage).toBe('done')
    expect(videoFrames(output)).toBe(SECONDS * FPS)
    expect(partsDirs()).toEqual([])
  }, 120000)

  it('xuất thử một đoạn: không giữ lại gì', async () => {
    const test = join(outDir, 'video (xem thử).mp4')
    const r = await exportVideo(options({ settings: { ...project.export, outputPath: test }, range: { start: 1, duration: 2 } }))
    expect(r.resumedFrames).toBe(0)
    expect(videoFrames(test)).toBe(2 * FPS)
    expect(readdirSync(outDir).filter((n) => n.includes('.parts-'))).toEqual([])
  }, 120000)

  it('file MP4 bị cắt ngang không được coi là đoạn đã xong', async () => {
    const whole = join(outDir, 'video.mp4')
    const buf = readFileSync(whole)
    const cut = join(dir, 'cut.mp4')
    writeFileSync(cut, buf.subarray(0, Math.floor(buf.length / 2)))
    expect(await isCompleteMp4(whole)).toBe(true)
    expect(await isCompleteMp4(cut)).toBe(false)
  })
})
