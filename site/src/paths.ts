/** Đường dẫn trong trang, có tiền tố base của GitHub Pages ("/mpv-creator") */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}
