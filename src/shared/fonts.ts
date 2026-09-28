// Font đóng gói kèm app (resources/fonts, giấy phép SIL OFL), đều hỗ trợ tiếng Việt.
// Dùng chung một danh sách để preview (FontFace) và export (Skia) vẽ giống nhau.

export interface FontFile {
  family: string
  file: string
  weight: 400 | 700 | 800
}

export const FONT_FILES: FontFile[] = [
  { family: 'Be Vietnam Pro', file: 'BeVietnamPro-Regular.ttf', weight: 400 },
  { family: 'Be Vietnam Pro', file: 'BeVietnamPro-Bold.ttf', weight: 700 },
  { family: 'Be Vietnam Pro', file: 'BeVietnamPro-ExtraBold.ttf', weight: 800 },
  { family: 'Oswald', file: 'Oswald-Variable.ttf', weight: 400 },
  { family: 'Playfair Display', file: 'PlayfairDisplay-Variable.ttf', weight: 400 },
  { family: 'Dancing Script', file: 'DancingScript-Variable.ttf', weight: 400 },
  { family: 'Pacifico', file: 'Pacifico-Regular.ttf', weight: 400 },
  { family: 'Lobster', file: 'Lobster-Regular.ttf', weight: 400 },
  { family: 'Bungee', file: 'Bungee-Regular.ttf', weight: 400 }
]

export const FONT_FAMILIES = Array.from(new Set(FONT_FILES.map((f) => f.family)))

export const DEFAULT_FONT = 'Be Vietnam Pro'

/** Chuỗi CSS font. Chỉ dùng weight 700 cho font có file bold thật, tránh chữ đậm giả khác nhau giữa preview và export. */
export function cssFont(family: string, sizePx: number, bold: boolean): string {
  const hasBold = FONT_FILES.some((f) => f.family === family && f.weight === 700)
  const weight = bold && hasBold ? 700 : 400
  return `${weight} ${Math.max(1, Math.round(sizePx * 100) / 100)}px "${family}", "${DEFAULT_FONT}", sans-serif`
}
