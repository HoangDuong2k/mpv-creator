import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { afterAll, describe, expect, it } from 'vitest'
import { loadImage } from '@napi-rs/canvas'
import { ffmpegPath } from '../src/main/ffmpeg'
import { videoThumbStrip } from '../src/main/media'
import { youtubeSafeZones } from '../src/renderer/src/safeArea'

describe('vùng an toàn YouTube', () => {
  it('khung ngang: vùng tiêu đề ở trên, thanh điều khiển ở dưới', () => {
    const z = youtubeSafeZones(1920, 1080)
    expect(z).toHaveLength(2)
    expect(z[0]).toMatchObject({ y: 0, w: 1 })
    expect(z[1].y + z[1].h).toBeCloseTo(1)
  })

  it('khung dọc (Shorts): thêm cột nút bên phải', () => {
    const z = youtubeSafeZones(1080, 1920)
    expect(z).toHaveLength(3)
    const right = z.find((x) => x.x > 0.5)!
    expect(right.x + right.w).toBeCloseTo(1)
    for (const x of z) {
      expect(x.x).toBeGreaterThanOrEqual(0)
      expect(x.y + x.h).toBeLessThanOrEqual(1 + 1e-9)
    }
  })
})

describe('dải khung hình của video nền (ảnh thu nhỏ trên timeline)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pvm-thumbs-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('trích 8 khung hình ghép ngang, cao 54px; lần sau dùng lại file trong cache', async () => {
    const video = join(dir, 'nen.mp4')
    const r = spawnSync(ffmpegPath(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=3:size=320x180:rate=10', '-pix_fmt', 'yuv420p', video], { windowsHide: true })
    expect(r.status).toBe(0)
    const strip = await videoThumbStrip(video, join(dir, 'thumbs'))
    expect(strip && existsSync(strip)).toBe(true)
    const img = await loadImage(strip!)
    expect(img.height).toBe(54)
    expect(img.width).toBe(96 * 8)
    expect(await videoThumbStrip(video, join(dir, 'thumbs'))).toBe(strip)
  }, 30000)

  it('file không phải video → null', async () => {
    expect(await videoThumbStrip(join(dir, 'khong-co.mp4'), join(dir, 'thumbs'))).toBeNull()
  })
})
