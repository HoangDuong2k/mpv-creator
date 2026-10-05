/**
 * Bản phát hành mới nhất trên GitHub Releases, đọc lúc build trang (CI tự build lại trang mỗi khi phát hành bản mới).
 * Không đọc được (mất mạng, chưa có bản nào) thì nút tải trỏ tới trang Releases.
 */
export const REPO = 'HoangDuong2k/mpv-creator'
export const RELEASES_URL = `https://github.com/${REPO}/releases`

export interface Asset {
  name: string
  url: string
  /** Dung lượng (byte) */
  size: number
}

export interface Release {
  version: string
  /** Ngày phát hành, ISO */
  date: string
  url: string
  notes: string
  assets: Asset[]
}

/** Các file tải theo hệ điều hành (truyền được cho island React: chỉ có dữ liệu thuần) */
export interface Downloads {
  windows: { setup?: Asset; portable?: Asset }
  mac: { arm64?: Asset; x64?: Asset }
  linux: { appimage?: Asset; deb?: Asset }
  /** Trang Releases (dự phòng khi không có file phù hợp) */
  page: string
}

let cached: Promise<Release | null> | undefined

export function latestRelease(): Promise<Release | null> {
  cached ??= (async () => {
    try {
      const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
      // Trên CI có GITHUB_TOKEN: không bị giới hạn 60 lượt / giờ của API không đăng nhập
      if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers })
      if (!res.ok) {
        console.warn(`[release] GitHub trả ${res.status}: dùng link trang Releases`)
        return null
      }
      const d = (await res.json()) as {
        tag_name: string
        published_at: string
        html_url: string
        body?: string
        assets: Array<{ name: string; browser_download_url: string; size: number }>
      }
      return {
        version: d.tag_name,
        date: d.published_at,
        url: d.html_url,
        notes: d.body ?? '',
        assets: d.assets.map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size }))
      }
    } catch (err) {
      console.warn('[release] không đọc được bản phát hành mới nhất:', err)
      return null
    }
  })()
  return cached
}

/** Chọn file cho từng hệ điều hành theo tên (đặt trong electron-builder.yml) */
export function pickDownloads(release: Release | null): Downloads {
  const find = (re: RegExp): Asset | undefined => release?.assets.find((a) => re.test(a.name))
  return {
    windows: { setup: find(/Setup-.*\.exe$/i), portable: find(/Portable-.*\.exe$/i) },
    mac: { arm64: find(/arm64\.dmg$/i), x64: find(/x64\.dmg$/i) },
    linux: { appimage: find(/\.AppImage$/i), deb: find(/\.deb$/i) },
    page: release?.url ?? RELEASES_URL
  }
}

/** "92 MB" */
export function formatSize(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`
}
