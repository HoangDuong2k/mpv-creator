import { createReadStream, existsSync, statSync } from 'fs'
import { extname } from 'path'
import { Readable } from 'stream'
import { protocol } from 'electron'
import { SCHEME, filePathFromUrl } from './fileUrl'

const MIME: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  ttf: 'font/ttf', otf: 'font/otf'
}

/** Phải gọi trước khi app sẵn sàng */
export function registerSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
  ])
}

/**
 * pvm://file/<đường dẫn đã encodeURIComponent> — phục vụ file media/font cục bộ cho
 * renderer, hỗ trợ HTTP Range để <audio>/<video> tua được.
 */
export function registerFileProtocol(): void {
  protocol.handle(SCHEME, async (request) => {
    const path = filePathFromUrl(request.url)
    const ext = path ? extname(path).slice(1).toLowerCase() : ''
    const mime = MIME[ext]
    if (!path || !mime || !existsSync(path)) return new Response('Not found', { status: 404 })
    const size = statSync(path).size
    const range = request.headers.get('range')
    // CORS: ảnh/video nạp ở chế độ crossOrigin nên canvas không bị "tainted" — đọc lại được điểm ảnh
    // (ảnh xem trước bộ lọc, kiểm thử). Chỉ trang của app dùng được giao thức này: cửa sổ bị chặn
    // điều hướng sang trang khác (will-navigate) và không mở cửa sổ mới.
    const headers: Record<string, string> = {
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    }
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range)
      let start = m?.[1] ? parseInt(m[1], 10) : 0
      let end = m?.[2] ? parseInt(m[2], 10) : size - 1
      if (!m?.[1] && m?.[2]) {
        start = Math.max(0, size - parseInt(m[2], 10))
        end = size - 1
      }
      if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
      end = Math.min(end, size - 1)
      const stream = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream
      return new Response(stream, {
        status: 206,
        headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) }
      })
    }
    const stream = Readable.toWeb(createReadStream(path)) as ReadableStream
    return new Response(stream, { status: 200, headers: { ...headers, 'Content-Length': String(size) } })
  })
}
