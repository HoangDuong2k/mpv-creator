import { spawn } from 'child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { escapeConcatPath, ensureWritable, friendlyFfmpegError } from '../src/main/export/exporter'
import { filePathFromUrl, fileUrl } from '../src/main/fileUrl'
import { asarUnpacked, defaultCacheDir } from '../src/main/paths'
import { removeLegacyCache } from '../src/main/workspace'
import { safeFileName, shortPath, withExtension } from '../src/shared/files'

describe('đường dẫn Windows qua pvm://', () => {
  const paths = [
    'C:\\Users\\Nguyễn Văn A\\Music\\bài hát #1 (live) 100%.mp3',
    '\\\\nas\\share\\nhạc\\a.mp3',
    'D:\\a b\\c.png',
    '/home/user/Nhạc/bài 1.mp3'
  ]

  it('mã hoá rồi giải mã ra đúng đường dẫn ban đầu', () => {
    for (const p of paths) expect(filePathFromUrl(fileUrl(p))).toBe(p)
  })

  it('giải mã đúng dạng URL mà Chromium chuẩn hoá (lấy từ app thật)', () => {
    expect(filePathFromUrl('pvm://file/C%3A%5CUsers%5CNguy%E1%BB%85n%20V%C4%83n%20A%5CMusic%5Cb%C3%A0i%20h%C3%A1t%20%231%20(live)%20100%25.mp3')).toBe(paths[0])
    expect(filePathFromUrl('pvm://file/%5C%5Cnas%5Cshare%5Cnh%E1%BA%A1c%5Ca.mp3')).toBe(paths[1])
  })

  it('từ chối URL không hợp lệ', () => {
    expect(filePathFromUrl('pvm://other/abc')).toBeNull()
    expect(filePathFromUrl('không phải url')).toBeNull()
    expect(filePathFromUrl('pvm://file/%E0%A4%A')).toBeNull()
  })
})

describe('bản đóng gói trên Windows', () => {
  it('ffmpeg.exe và worker lấy từ app.asar.unpacked', () => {
    const inAsar = 'C:\\Users\\A\\AppData\\Local\\Programs\\playlist-video-maker\\resources\\app.asar\\node_modules\\ffmpeg-static\\ffmpeg.exe'
    expect(asarUnpacked(inAsar)).toBe('C:\\Users\\A\\AppData\\Local\\Programs\\playlist-video-maker\\resources\\app.asar.unpacked\\node_modules\\ffmpeg-static\\ffmpeg.exe')
    expect(asarUnpacked('/opt/app/resources/app.asar/out/main/exportWorker.js')).toBe('/opt/app/resources/app.asar.unpacked/out/main/exportWorker.js')
    // Không đổi lần hai, không đụng đường dẫn khi chạy dev
    expect(asarUnpacked(asarUnpacked(inAsar))).toBe(asarUnpacked(inAsar))
    expect(asarUnpacked('D:\\code\\app\\out\\main\\exportWorker.js')).toBe('D:\\code\\app\\out\\main\\exportWorker.js')
  })

  it('cache nằm trong %LOCALAPPDATA% (không phải Roaming)', () => {
    expect(defaultCacheDir('win32', { LOCALAPPDATA: 'C:\\Users\\A\\AppData\\Local' }, 'C:\\Users\\A')).toBe('C:\\Users\\A\\AppData\\Local\\PlaylistVideoMaker\\Cache')
    expect(defaultCacheDir('win32', {}, 'C:\\Users\\A')).toBe('C:\\Users\\A\\AppData\\Local\\PlaylistVideoMaker\\Cache')
    expect(defaultCacheDir('darwin', {}, '/Users/a')).toBe('/Users/a/Library/Caches/PlaylistVideoMaker')
    expect(defaultCacheDir('linux', { XDG_CACHE_HOME: '/x' }, '/home/a')).toBe('/x/playlist-video-maker')
    expect(defaultCacheDir('linux', {}, '/home/a')).toBe('/home/a/.cache/playlist-video-maker')
  })

  it('danh sách nối video dùng "/" và thoát dấu nháy', () => {
    expect(escapeConcatPath("C:\\Users\\O'Brien\\.video.parts-1\\part000.mp4")).toBe("C:/Users/O'\\''Brien/.video.parts-1/part000.mp4")
  })

  it('dọn cache kiểu cũ (userData/cache) không xoá bộ nhớ đệm HTTP "Cache" của Chromium', async () => {
    // Windows không phân biệt hoa/thường: "cache" của bản cũ và "Cache" của Chromium là cùng một thư mục
    const userData = mkdtempSync(join(tmpdir(), 'pvm-ud-'))
    const chromium = join(userData, 'Cache', 'Cache_Data', 'index')
    mkdirSync(dirname(chromium), { recursive: true })
    writeFileSync(chromium, 'x')
    const legacy = ['pcm', 'analysis', 'covers'].map((sub) => join(userData, 'cache', sub, 'a.bin'))
    for (const f of legacy) {
      mkdirSync(dirname(f), { recursive: true })
      writeFileSync(f, 'x')
    }
    await removeLegacyCache(userData)
    expect(existsSync(chromium)).toBe(true)
    for (const f of legacy) expect(existsSync(dirname(f))).toBe(false)
    rmSync(userData, { recursive: true, force: true })
  })
})

describe('tên file hợp lệ trên Windows', () => {
  it('bỏ ký tự cấm, dấu chấm cuối, tên dành riêng', () => {
    expect(safeFileName('Nhạc: "Top 10" hay nhất?')).toBe('Nhạc Top 10 hay nhất')
    expect(safeFileName('a/b\\c|d*e<f>')).toBe('a b c d e f')
    expect(safeFileName('video. . ')).toBe('video')
    expect(safeFileName('CON')).toBe('CON_')
    expect(safeFileName('   ')).toBe('playlist')
    expect(safeFileName('x'.repeat(300)).length).toBe(120)
  })

  it('luôn đúng đuôi file', () => {
    expect(withExtension('C:\\v\\video.final', 'mp4')).toBe('C:\\v\\video.final.mp4')
    expect(withExtension('C:\\v\\VIDEO.MP4', 'mp4')).toBe('C:\\v\\VIDEO.MP4')
    expect(withExtension('/a/p.pvm.json', 'json')).toBe('/a/p.pvm.json')
  })

  it('đường dẫn rút gọn giữ dấu phân cách của hệ điều hành', () => {
    expect(shortPath('C:\\Users\\Nguyễn Văn A\\Videos\\Playlist nhạc\\bản cuối cùng.mp4', 40)).toBe('…\\Playlist nhạc\\bản cuối cùng.mp4')
    expect(shortPath('/home/a/Videos/Playlist nhạc/bản cuối cùng.mp4', 40)).toBe('…/Playlist nhạc/bản cuối cùng.mp4')
    expect(shortPath('C:\\v\\a.mp4')).toBe('C:\\v\\a.mp4')
  })
})

describe('báo lỗi khi không ghi được video', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pvm-w-'))
  afterAll(() => {
    chmodSync(dir, 0o755)
    rmSync(dir, { recursive: true, force: true })
  })

  it('ghi được: không để lại file rỗng', async () => {
    const p = join(dir, 'sub', 'ok.mp4')
    await ensureWritable(p)
    expect(() => writeFileSync(p + '.probe', 'x')).not.toThrow()
  })

  it('thư mục không cho ghi → thông báo tiếng Việt dễ hiểu', async () => {
    if (process.platform === 'win32' || process.getuid?.() === 0) return
    const ro = join(dir, 'ro')
    await ensureWritable(join(ro, 'x.mp4'))
    chmodSync(ro, 0o555)
    await expect(ensureWritable(join(ro, 'y.mp4'))).rejects.toThrow(/Không ghi được/)
    chmodSync(ro, 0o755)
  })

  it('Windows: file video đang mở ở trình xem video (bị khoá) → báo ngay trước khi render', async () => {
    if (process.platform !== 'win32') return
    const p = join(dir, 'đang mở.mp4')
    writeFileSync(p, Buffer.alloc(2000, 1))
    // Giữ file như trình xem video: cho đọc chung nhưng không cho ghi
    const ps = spawn(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', `$f = [IO.File]::Open('${p.replace(/'/g, "''")}', 'Open', 'Read', 'Read'); 'LOCKED'; Start-Sleep 30; $f.Close()`],
      { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }
    )
    const exited = new Promise((r) => ps.once('exit', r))
    try {
      await new Promise<void>((resolve, reject) => {
        ps.stdout.once('data', () => resolve())
        ps.once('error', reject)
        ps.once('exit', () => reject(new Error('PowerShell dừng trước khi khoá được file')))
      })
      await expect(ensureWritable(p)).rejects.toThrow(/đang được mở ở chương trình khác/)
    } finally {
      ps.kill()
      await exited
    }
    // Đóng file ở chương trình kia → ghi được bình thường
    await expect(ensureWritable(p)).resolves.toBeUndefined()
  }, 30000)

  it('đổi lỗi FFmpeg sang tiếng Việt', () => {
    expect(friendlyFfmpegError('out.mp4: Permission denied', 'C:\\v\\out.mp4')).toMatch(/đang được mở ở chương trình khác/)
    expect(friendlyFfmpegError('No space left on device', 'x')).toMatch(/Ổ đĩa đã đầy/)
    expect(friendlyFfmpegError('lỗi khác', 'x')).toBe('lỗi khác')
  })
})
