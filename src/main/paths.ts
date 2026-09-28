import { homedir } from 'os'
import { posix, win32 } from 'path'

/**
 * Thư mục cache mặc định theo quy ước từng hệ điều hành (cache có thể lớn vài GB):
 * - Windows: %LOCALAPPDATA%\PlaylistVideoMaker\Cache (không nằm trong Roaming để không bị đồng bộ theo tài khoản)
 * - macOS:   ~/Library/Caches/PlaylistVideoMaker
 * - Linux:   $XDG_CACHE_HOME/playlist-video-maker (mặc định ~/.cache/…)
 */
export function defaultCacheDir(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  if (platform === 'win32') return win32.join(env.LOCALAPPDATA || win32.join(home, 'AppData', 'Local'), 'PlaylistVideoMaker', 'Cache')
  if (platform === 'darwin') return posix.join(home, 'Library', 'Caches', 'PlaylistVideoMaker')
  return posix.join(env.XDG_CACHE_HOME || posix.join(home, '.cache'), 'playlist-video-maker')
}

/** Đường dẫn trong app.asar → bản giải nén (file chạy / worker không nạp được từ trong asar) */
export function asarUnpacked(p: string): string {
  return p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
}
