import { spawn, type ChildProcess, type SpawnOptions } from 'child_process'
import { existsSync } from 'fs'
import { asarUnpacked } from './paths'
import { tr } from '../shared/i18n'

let resolved: string | null = null

/**
 * Đường dẫn FFmpeg: biến môi trường PVM_FFMPEG → bản đóng gói (ffmpeg-static,
 * tự đổi sang app.asar.unpacked khi đã đóng gói) → ffmpeg trong PATH.
 */
export function ffmpegPath(): string {
  if (resolved) return resolved
  const fromEnv = process.env.PVM_FFMPEG
  if (fromEnv && existsSync(fromEnv)) return (resolved = fromEnv)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    let p = require('ffmpeg-static') as string | null
    if (p) {
      p = asarUnpacked(p)
      if (existsSync(p)) return (resolved = p)
    }
  } catch {
    // không có bản đóng gói → dùng PATH
  }
  return (resolved = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
}

export interface FfmpegRun {
  proc: ChildProcess
  done: Promise<void>
  kill: () => void
}

/** Chạy FFmpeg; done reject kèm đoạn cuối stderr nếu lỗi. */
export function runFfmpeg(args: string[], opts: { onStderr?: (line: string) => void; stdio?: SpawnOptions['stdio'] } = {}): FfmpegRun {
  const proc = spawn(ffmpegPath(), ['-hide_banner', '-nostdin', ...args], {
    windowsHide: true,
    stdio: opts.stdio ?? ['ignore', 'pipe', 'pipe']
  })
  let tail = ''
  let killed = false
  proc.stderr?.setEncoding('utf8')
  proc.stderr?.on('data', (chunk: string) => {
    tail = (tail + chunk).slice(-4000)
    if (opts.onStderr) for (const line of chunk.split(/[\r\n]+/)) if (line) opts.onStderr(line)
  })
  const done = new Promise<void>((resolve, reject) => {
    proc.on('error', (err) => reject(new Error(tr('Không chạy được FFmpeg ({path}): {err}', { path: ffmpegPath(), err: err.message }))))
    proc.on('close', (code) => {
      if (killed) reject(new CancelledError())
      else if (code === 0) resolve()
      else reject(new Error(tr('FFmpeg lỗi (mã {code}): {detail}', { code: String(code), detail: tail.trim().split('\n').slice(-6).join('\n') })))
    })
  })
  return {
    proc,
    done,
    kill: () => {
      killed = true
      proc.kill('SIGKILL')
    }
  }
}

export class CancelledError extends Error {
  constructor() {
    super(tr('Đã huỷ'))
    this.name = 'CancelledError'
  }
}

/** Đọc "time=00:01:02.34" trong log FFmpeg → giây */
export function parseFfmpegTime(line: string): number | null {
  const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line)
  if (!m) return null
  return +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])
}
