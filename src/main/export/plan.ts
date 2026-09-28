// Kế hoạch một lần xuất: chia video thành các đoạn nhỏ và đặt khoá cho bản xuất,
// để lần xuất bị ngắt (huỷ, lỗi, mất điện) có thể tiếp tục từ chỗ dừng.
import { createHash } from 'crypto'
import type { ExportSettings, Project } from '../../shared/types'

/** Tăng khi cách vẽ / mã hoá thay đổi khiến các đoạn đã render trước đó không còn dùng lại được */
export const RENDER_VERSION = 1

export interface Chunk {
  index: number
  /** Frame đầu (tính cả) */
  start: number
  /** Frame cuối (không tính) */
  end: number
}

/** Số frame mỗi đoạn: khoảng 30 giây, ít nhất 3 giây; video ngắn thì chia đều cho các luồng */
export function chunkFramesFor(totalFrames: number, fps: number, workers: number): number {
  return Math.max(Math.round(fps * 3), Math.min(Math.round(fps * 30), Math.ceil(totalFrames / Math.max(1, workers))))
}

/** Chia [firstFrame, firstFrame + totalFrames) thành các đoạn liền nhau, đoạn cuối có thể ngắn hơn */
export function planChunks(firstFrame: number, totalFrames: number, chunkFrames: number): Chunk[] {
  const size = Math.max(1, Math.round(chunkFrames))
  const out: Chunk[] = []
  for (let i = 0, s = 0; s < totalFrames; i++, s += size) {
    out.push({ index: i, start: firstFrame + s, end: firstFrame + Math.min(totalFrames, s + size) })
  }
  return out
}

/** JSON có thứ tự khoá cố định: cùng dữ liệu luôn ra cùng một chuỗi */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonicalJson(x))).join(',')}]`
  const o = v as Record<string, unknown>
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`
}

export interface RenderKeyInput {
  project: Project
  settings: Pick<ExportSettings, 'encoder' | 'quality'>
  firstFrame: number
  totalFrames: number
  chunkFrames: number
  appVersion?: string
  /** Kích thước + thời điểm sửa của các file ảnh/video dùng trong project (đổi file → khoá đổi) */
  media?: Record<string, string>
}

/**
 * Thuộc tính chỉ dùng cho giao diện (không đổi hình của video): đổi chúng không làm mất bản xuất dở.
 * id được tạo ngẫu nhiên mỗi lần thêm lớp / nhập bài, engine không dùng khi vẽ.
 * Thuộc tính lạ (thêm sau này) mặc định được tính vào khoá — thà render lại còn hơn ghép nhầm hình cũ.
 */
export const UI_ONLY_LAYER_FIELDS = ['id', 'name']
export const UI_ONLY_TRACK_FIELDS = ['id']

function omit(o: object, keys: string[]): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...o }
  for (const k of keys) delete copy[k]
  return copy
}

/**
 * Khoá của một bản xuất: gồm mọi thứ quyết định hình của video (lớp, bài hát, cài đặt khung hình,
 * bộ mã hoá, chất lượng, đoạn cần xuất, cách chia đoạn). Tên project, nơi lưu và bitrate âm thanh
 * không ảnh hưởng hình nên không nằm trong khoá.
 */
export function renderKey(i: RenderKeyInput): string {
  const data = {
    v: RENDER_VERSION,
    app: i.appVersion ?? '',
    settings: i.project.settings,
    tracks: i.project.tracks.map((t) => omit(t, UI_ONLY_TRACK_FIELDS)),
    layers: i.project.layers.map((l) => omit(l, UI_ONLY_LAYER_FIELDS)),
    encoder: i.settings.encoder,
    quality: i.settings.quality,
    frames: [i.firstFrame, i.totalFrames, i.chunkFrames],
    media: i.media ?? {}
  }
  return createHash('sha1').update(canonicalJson(data)).digest('hex').slice(0, 12)
}

/** Thư mục tạm chứa các đoạn, nằm cạnh file video (ẩn): ".<tên>.parts-<khoá>" */
export function partsDirName(base: string, key: string): string {
  return `.${base}.parts-${key}`
}

/** Thư mục tạm của một lần xuất ra cùng tên file (kể cả kiểu tên cũ ".<tên>.parts-<thời điểm>") */
export function isPartsDirOf(name: string, base: string): boolean {
  const prefix = `.${base}.parts-`
  return name.startsWith(prefix) && /^[0-9a-z]+$/.test(name.slice(prefix.length))
}

const pad = (i: number): string => String(i).padStart(5, '0')

/** Đoạn đã render xong */
export function partName(index: number): string {
  return `part${pad(index)}.mp4`
}

/** Đoạn đang render (chỉ đổi sang tên chính thức khi đã mã hoá xong) */
export function partialName(index: number): string {
  return `part${pad(index)}.partial.mp4`
}

/** Số thứ tự đoạn nếu là file đoạn đã xong, ngược lại null */
export function completedPartIndex(fileName: string): number | null {
  const m = /^part(\d{5})\.mp4$/.exec(fileName)
  return m ? Number(m[1]) : null
}
