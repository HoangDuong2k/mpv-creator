// Địa chỉ pvm://file/… cho file cục bộ (tách riêng khỏi electron để kiểm thử được).

export const SCHEME = 'pvm'

export function fileUrl(path: string): string {
  return `${SCHEME}://file/${encodeURIComponent(path)}`
}

/**
 * pvm://file/<đường dẫn đã mã hoá> → đường dẫn file. Chromium giữ nguyên %3A và %5C nên đường dẫn
 * Windows (C:\…, \\server\share\…, có dấu tiếng Việt, #, %) được giải mã ra đúng như ban đầu.
 */
export function filePathFromUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.host !== 'file') return null
  try {
    // Chỉ bỏ đúng một dấu "/" đầu (phần phân cách sau host)
    const p = decodeURIComponent(url.pathname.replace(/^\//, ''))
    return p || null
  } catch {
    return null
  }
}
