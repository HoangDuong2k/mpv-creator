import { afterEach, describe, expect, it } from 'vitest'
import { encoderArgs, encodersFor } from '../src/main/export/encoders'
import { defaultCacheDir } from '../src/main/paths'
import { shutdownCommand, shutdownPermissionCommand } from '../src/main/shutdown'
import { keyLabel, setLang, setMacKeys, tr } from '../src/shared/i18n'

describe('macOS', () => {
  afterEach(() => {
    setMacKeys(false)
    setLang('vi')
  })

  it('bộ mã hoá: Mac có VideoToolbox, không có NVENC / Quick Sync / AMF / VAAPI', () => {
    const ids = (p: NodeJS.Platform): string[] => encodersFor(p).map((e) => e.id)
    expect(ids('darwin')).toEqual(['libx264', 'h264_videotoolbox'])
    expect(ids('win32')).toEqual(['libx264', 'h264_nvenc', 'h264_qsv', 'h264_amf'])
    expect(ids('linux')).toEqual(['libx264', 'h264_nvenc', 'h264_qsv', 'h264_vaapi'])
  })

  it('VideoToolbox: bitrate theo độ phân giải, số khung hình / giây và chất lượng', () => {
    const rate = (q: 'fast' | 'balanced' | 'high', fps: number, pixels: number): number => {
      const post = encoderArgs('h264_videotoolbox', q, fps, pixels).post
      expect(post).toContain('h264_videotoolbox')
      return Number(post[post.indexOf('-b:v') + 1])
    }
    const hd = rate('balanced', 30, 1920 * 1080)
    expect(hd).toBeGreaterThan(10e6)
    expect(hd).toBeLessThan(14e6)
    expect(rate('fast', 30, 1920 * 1080)).toBeLessThan(hd)
    expect(rate('high', 30, 1920 * 1080)).toBeGreaterThan(hd)
    expect(rate('balanced', 60, 1920 * 1080)).toBeCloseTo(hd * 2, -3)
    // 4K60 chất lượng cao: có trần
    expect(rate('high', 60, 3840 * 2160)).toBe(90e6)
  })

  it('phím tắt hiện kiểu Mac: ⌘ thay Ctrl, ⇧⌘Z để làm lại, ⌃⌘F để xem toàn màn hình', () => {
    expect(keyLabel('Ctrl+S')).toBe('Ctrl+S')
    setMacKeys(true)
    expect(keyLabel('Ctrl+S · Ctrl+Shift+S')).toBe('⌘S · ⇧⌘S')
    expect(keyLabel('Ctrl+Z · Ctrl+Y')).toBe('⌘Z · ⇧⌘Z')
    expect(keyLabel('F11 · Esc')).toBe('⌃⌘F · Esc')
    expect(keyLabel('Ctrl + lăn chuột')).toBe('⌘ + lăn chuột')
    expect(tr('Tách thanh đang chọn tại đầu phát (Ctrl+B)')).toBe('Tách thanh đang chọn tại đầu phát (⌘B)')
    setLang('en')
    expect(tr('Tách thanh đang chọn tại đầu phát (Ctrl+B)')).toBe('Split the selected bars at the playhead (⌘B)')
    // Câu không có phím tắt giữ nguyên
    expect(tr('Xuất video')).toBe('Export video')
  })

  it('tắt máy: Mac xin quyền System Events trước; Windows / Linux không cần', () => {
    expect(shutdownCommand('darwin')).toEqual({ cmd: 'osascript', args: ['-e', 'tell app "System Events" to shut down'] })
    expect(shutdownPermissionCommand('darwin')?.args.join(' ')).toContain('System Events')
    expect(shutdownPermissionCommand('win32')).toBeNull()
    expect(shutdownPermissionCommand('linux')).toBeNull()
  })

  it('bộ nhớ đệm âm thanh nằm trong ~/Library/Caches', () => {
    expect(defaultCacheDir('darwin', {}, '/Users/an')).toBe('/Users/an/Library/Caches/PlaylistVideoMaker')
  })
})
