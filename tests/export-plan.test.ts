import { describe, expect, it } from 'vitest'
import { canonicalJson, chunkFramesFor, completedPartIndex, isPartsDirOf, partialName, partName, partsDirName, planChunks, renderKey, type RenderKeyInput } from '../src/main/export/plan'
import { shutdownCommand } from '../src/main/shutdown'
import { createDefaultProject } from '../src/shared/defaults'
import { track } from './helpers'

describe('chia đoạn khi xuất', () => {
  it('video dài: mỗi đoạn 30 giây', () => {
    expect(chunkFramesFor(3600 * 30, 30, 8)).toBe(900)
    expect(chunkFramesFor(3600 * 60, 60, 8)).toBe(1800)
  })

  it('video ngắn: chia đều cho các luồng nhưng không dưới 3 giây', () => {
    expect(chunkFramesFor(15 * 30, 30, 5)).toBe(90)
    expect(chunkFramesFor(10 * 30, 30, 1)).toBe(300)
    expect(chunkFramesFor(100 * 30, 30, 8)).toBe(375)
  })

  it('các đoạn liền nhau, phủ kín, đoạn cuối ngắn hơn', () => {
    const chunks = planChunks(120, 1000, 300)
    expect(chunks.map((c) => [c.index, c.start, c.end])).toEqual([
      [0, 120, 420],
      [1, 420, 720],
      [2, 720, 1020],
      [3, 1020, 1120]
    ])
    for (let i = 1; i < chunks.length; i++) expect(chunks[i].start).toBe(chunks[i - 1].end)
    expect(planChunks(0, 5, 300)).toEqual([{ index: 0, start: 0, end: 5 }])
  })

  it('tên file đoạn và thư mục tạm', () => {
    expect(partName(7)).toBe('part00007.mp4')
    expect(partialName(7)).toBe('part00007.partial.mp4')
    expect(completedPartIndex('part00007.mp4')).toBe(7)
    expect(completedPartIndex('part00007.partial.mp4')).toBeNull()
    expect(completedPartIndex('list.txt')).toBeNull()
    expect(partsDirName('Playlist (1)', 'abc123')).toBe('.Playlist (1).parts-abc123')
    expect(isPartsDirOf('.Playlist (1).parts-0123456789ab', 'Playlist (1)')).toBe(true)
    expect(isPartsDirOf('.Playlist (1).parts-lx3k9a2b', 'Playlist (1)')).toBe(true) // kiểu tên cũ
    expect(isPartsDirOf('.Playlist (1) 2.parts-0123456789ab', 'Playlist (1)')).toBe(false)
    expect(isPartsDirOf('.Playlist (1).parts-', 'Playlist (1)')).toBe(false)
    expect(isPartsDirOf('.Playlist (1).parts-../x', 'Playlist (1)')).toBe(false)
  })
})

describe('khoá của bản xuất dở', () => {
  // Tạo một lần rồi sao chép: mỗi lần tạo project mới, id các lớp lại khác
  const sample = createDefaultProject()
  sample.tracks = [track('a', 60), track('b', 45)]
  const base = (): RenderKeyInput => ({
    project: structuredClone(sample),
    settings: { encoder: 'libx264', quality: 'balanced' },
    firstFrame: 0,
    totalFrames: 3150,
    chunkFrames: 900,
    appVersion: '0.1.0'
  })

  it('cùng dữ liệu → cùng khoá, không phụ thuộc thứ tự thuộc tính', () => {
    const a = base()
    const b = structuredClone(a)
    b.project.settings = Object.fromEntries(Object.entries(b.project.settings).reverse()) as typeof b.project.settings
    expect(renderKey(a)).toBe(renderKey(b))
    expect(renderKey(a)).toMatch(/^[0-9a-f]{12}$/)
    expect(canonicalJson({ b: 1, a: [1, { d: 2, c: undefined }] })).toBe('{"a":[1,{"d":2}],"b":1}')
  })

  it('đổi thứ làm thay đổi hình → khoá đổi', () => {
    const k = renderKey(base())
    const changed = (f: (i: RenderKeyInput) => void): string => {
      const i = base()
      f(i)
      return renderKey(i)
    }
    expect(changed((i) => (i.project.layers[1].props = { ...i.project.layers[1].props, x: 0.123 }))).not.toBe(k)
    expect(changed((i) => (i.project.layers[1].enabled = !i.project.layers[1].enabled))).not.toBe(k)
    expect(changed((i) => (i.project.layers[1].timing = { ...i.project.layers[1].timing, start: 3 }))).not.toBe(k)
    expect(changed((i) => (i.project.tracks[0].title = 'Tên khác'))).not.toBe(k)
    expect(changed((i) => (i.project.tracks[1].trimEnd = 2))).not.toBe(k)
    expect(changed((i) => (i.project.settings = { ...i.project.settings, width: 1280, height: 720 }))).not.toBe(k)
    expect(changed((i) => (i.settings = { encoder: 'h264_nvenc', quality: 'balanced' }))).not.toBe(k)
    expect(changed((i) => (i.settings = { encoder: 'libx264', quality: 'high' }))).not.toBe(k)
    expect(changed((i) => (i.chunkFrames = 450))).not.toBe(k)
    expect(changed((i) => (i.appVersion = '0.2.0'))).not.toBe(k)
    expect(changed((i) => (i.media = { '/anh/nen.jpg': '123:456' }))).not.toBe(k)
  })

  it('đổi thứ không ảnh hưởng hình → giữ khoá (vẫn xuất tiếp được)', () => {
    const k = renderKey(base())
    const same = (f: (i: RenderKeyInput) => void): string => {
      const i = base()
      f(i)
      return renderKey(i)
    }
    expect(same((i) => (i.project.name = 'Tên project mới'))).toBe(k)
    expect(same((i) => (i.project.export = { ...i.project.export, outputPath: '/khac/video.mp4', audioBitrate: 320 }))).toBe(k)
    expect(same((i) => (i.project.layers[2].name = 'Cột sóng của tôi'))).toBe(k)
    // id sinh ngẫu nhiên mỗi lần thêm lớp / nhập lại bài — không ảnh hưởng hình
    expect(same((i) => (i.project.layers[2].id = 'id-khac'))).toBe(k)
    expect(same((i) => (i.project.tracks[0].id = 'id-khac'))).toBe(k)
    // Khoá lớp, màu hàng, nhóm hàng trên timeline chỉ là giao diện
    expect(same((i) => Object.assign(i.project.layers[2], { locked: true, color: '#81c784', row: 'r1' }))).toBe(k)
  })
})

describe('lệnh tắt máy', () => {
  it('theo hệ điều hành, Windows không ép đóng chương trình khác (/f)', () => {
    expect(shutdownCommand('win32')).toEqual({ cmd: 'shutdown', args: ['/s', '/t', '0'] })
    expect(shutdownCommand('win32').args).not.toContain('/f')
    expect(shutdownCommand('linux')).toEqual({ cmd: 'systemctl', args: ['poweroff'] })
    expect(shutdownCommand('darwin').cmd).toBe('osascript')
  })
})
