// Tên file an toàn trên mọi hệ điều hành (Windows khắt khe nhất).

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** Bỏ ký tự Windows không cho phép (\ / : * ? " < > | và ký tự điều khiển), dấu chấm/khoảng trắng cuối, tên dành riêng (CON, NUL…) */
export function safeFileName(name: string, fallback = 'playlist'): string {
  let s = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  if (s.length > 120) s = s.slice(0, 120).trim()
  if (!s) s = fallback
  if (RESERVED.test(s)) s = `${s}_`
  return s
}

/** Đảm bảo file có đúng đuôi mong muốn: "video.final" → "video.final.mp4" */
export function withExtension(path: string, ext: string): string {
  const want = ext.startsWith('.') ? ext : `.${ext}`
  return path.toLowerCase().endsWith(want.toLowerCase()) ? path : `${path}${want}`
}
