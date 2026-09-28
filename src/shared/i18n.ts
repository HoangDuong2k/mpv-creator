// Đa ngôn ngữ. Câu tiếng Việt viết trong code chính là khoá tra cứu; bản tiếng Anh nằm trong
// i18n-en.ts. Câu chưa có bản dịch thì hiện nguyên tiếng Việt (không bao giờ hiện khoá rỗng).
import { EN } from './i18n-en'

export type Lang = 'vi' | 'en'

export const LANGS: Array<{ id: Lang; label: string; short: string }> = [
  { id: 'vi', label: 'Tiếng Việt', short: 'VI' },
  { id: 'en', label: 'English', short: 'EN' }
]

let current: Lang = 'vi'

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang): void {
  current = lang
}

export function isLang(v: unknown): v is Lang {
  return v === 'vi' || v === 'en'
}

/** Đánh dấu câu nằm trong dữ liệu (bảng hằng…) để dịch lúc hiển thị bằng tr(); trả về nguyên câu */
export function trKey(vi: string): string {
  return vi
}

/**
 * Dịch một câu (viết bằng tiếng Việt) sang ngôn ngữ đang dùng.
 * `{tên}` trong câu được thay bằng `vars.tên` (dùng cho số, tên file…).
 */
export function tr(vi: string, vars?: Record<string, string | number>): string {
  const s = current === 'en' ? (EN[vi] ?? vi) : vi
  return vars ? s.replace(/\{(\w+)\}/g, (m: string, k: string) => (k in vars ? String(vars[k]) : m)) : s
}
