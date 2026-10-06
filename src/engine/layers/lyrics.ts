import { cssFont } from '../../shared/fonts'
import { tr, trKey } from '../../shared/i18n'
import { lineAt, timedLines, wordTimings, type ActiveLine } from '../../shared/lyrics'
import type { LyricsProps, TrackLyrics } from '../../shared/types'
import { recordBounds, type RenderEnv } from '../env'
import { clamp, easeOutCubic } from '../util'
import { bassPulse } from './background'

/** Thời gian hiện dần dòng mới / mờ dần dòng cũ (giây) */
const FADE_IN = 0.25
const FADE_OUT = 0.3

/** Mốc từng dòng tính sẵn theo lời của từng bài (lời đổi → đối tượng mới, tự tính lại) */
const linesCache = new WeakMap<TrackLyrics, Map<number, ActiveLine[]>>()
function linesOf(lyrics: TrackLyrics, hold: number): ActiveLine[] {
  let byHold = linesCache.get(lyrics)
  if (!byHold) linesCache.set(lyrics, (byHold = new Map()))
  let lines = byHold.get(hold)
  if (!lines) byHold.set(hold, (lines = timedLines(lyrics, hold)))
  return lines
}

/** Chữ mẫu khi lớp đang được chọn mà bài chưa có lời (để canh vị trí, cỡ chữ) */
const SAMPLE = trKey('Lời bài hát hiện ở đây, một dòng nhỏ')

/**
 * Lời bài hát, kiểu một dòng: dòng đang hát hiện ở vị trí (x, y), dòng mới hiện dần trong lúc dòng cũ mờ đi
 * (hoặc trượt lên), chữ đổi màu theo lời hát (lướt mượt hoặc nhảy theo từ). Thời gian theo file nhạc của bài
 * đang phát, nên cắt đầu bài hay đổi thứ tự bài thì lời vẫn khớp.
 */
export function drawLyrics(env: RenderEnv, p: LyricsProps): void {
  const entry = env.entry
  const lyrics = entry?.track.lyrics
  const fileT = entry ? env.t - entry.start + (entry.track.trimStart || 0) : 0
  const lines = lyrics ? linesOf(lyrics, p.hold) : []

  if (lines.length === 0 || !lyrics) {
    // Chưa có lời: chỉ hiện chữ mẫu cho lớp đang chỉnh
    if (env.editLayerId === env.layerId) drawLine(env, p, { text: tr(SAMPLE), alpha: 1, offsetY: 0, progress: null })
    return
  }

  const cur = lineAt(lines, fileT, p.lead)
  // Dòng mới đang hiện thì dòng ngay trước nó mờ dần trong FADE_OUT giây (dù đã hết giờ của nó)
  const curIdx = cur ? lines.indexOf(cur) : -1
  if (!cur) {
    // Không có dòng đang hát: dòng vừa hết vẫn mờ dần nốt
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].end <= fileT) {
        if (fileT - lines[i].end < FADE_OUT) drawActive(env, p, lyrics, lines[i], fileT, 1 - (fileT - lines[i].end) / FADE_OUT, 'out')
        break
      }
    }
    return
  }
  const appear = cur.start - p.lead
  const sinceAppear = fileT - appear
  const prev = lines[curIdx - 1]
  if (prev && sinceAppear < FADE_OUT && prev.end >= appear - 0.05) drawActive(env, p, lyrics, prev, fileT, 1 - sinceAppear / FADE_OUT, 'out')
  const inK = p.transition === 'none' ? 1 : clamp(sinceAppear / FADE_IN)
  const outK = p.transition === 'none' ? 1 : clamp((cur.end - fileT) / FADE_OUT)
  drawActive(env, p, lyrics, cur, fileT, Math.min(inK, outK), inK < 1 ? 'in' : outK < 1 ? 'out' : 'in')
}

function drawActive(env: RenderEnv, p: LyricsProps, lyrics: TrackLyrics, active: ActiveLine, fileT: number, k: number, dir: 'in' | 'out'): void {
  if (k <= 0.001) return
  const S = env.S
  const eased = p.transition === 'none' ? 1 : easeOutCubic(k)
  // Trượt: dòng mới đi lên vào chỗ, dòng cũ đi tiếp lên rồi biến mất
  const offsetY = p.transition === 'slide' ? (dir === 'in' ? 1 : -1) * (1 - eased) * 22 * S : 0
  let progress: { words: string[]; starts: number[]; end: number } | null = null
  if (p.highlight !== 'none') progress = wordTimings(active, lyrics.offset)
  const text = progress ? progress.words.join(' ') : active.line.text
  drawLine(env, p, { text, alpha: p.transition === 'none' ? 1 : eased, offsetY, progress: progress ? { ...progress, t: fileT } : null })
}

interface LineDraw {
  text: string
  alpha: number
  offsetY: number
  /** Thời điểm từng từ để tô màu theo lời hát (null = không tô) */
  progress: { words: string[]; starts: number[]; end: number; t: number } | null
}

function drawLine(env: RenderEnv, p: LyricsProps, d: LineDraw): void {
  const { ctx, W, H, S } = env
  const text = p.uppercase ? d.text.toLocaleUpperCase('vi') : d.text
  if (!text.trim()) return
  let size = p.size * S
  ctx.font = cssFont(p.font, size, p.bold)
  const maxW = p.maxWidth * W
  let width = ctx.measureText(text).width
  if (maxW > 0 && width > maxW) {
    size = (size * maxW) / width
    ctx.font = cssFont(p.font, size, p.bold)
    width = ctx.measureText(text).width
  }
  const x = p.x * W
  const y = p.y * H + d.offsetY
  const left = p.align === 'left' ? x : p.align === 'right' ? x - width : x - width / 2
  recordBounds(env, left, p.y * H - size * 0.7, width, size * 1.4)

  const alpha = clamp(p.opacity) * env.fade * d.alpha
  if (alpha <= 0.001) return
  ctx.save()
  if (p.beatScale > 0) {
    const s = 1 + p.beatScale * bassPulse(env)
    ctx.translate(x, y)
    ctx.scale(s, s)
    ctx.translate(-x, -y)
  }
  // Nền mờ bo góc sau chữ
  if (p.box > 0.001) {
    const padX = size * 0.55
    const padY = size * 0.32
    ctx.globalAlpha = alpha * clamp(p.box)
    ctx.fillStyle = p.boxColor
    ctx.beginPath()
    ctx.roundRect(left - padX, y - size * 0.5 - padY, width + padX * 2, size + padY * 2, (size + padY * 2) / 2)
    ctx.fill()
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const paint = (color: string, glow: boolean): void => {
    ctx.globalAlpha = alpha
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    if (p.strokeWidth > 0) {
      ctx.lineJoin = 'round'
      ctx.lineWidth = p.strokeWidth * S * 2
      ctx.strokeStyle = p.strokeColor
      ctx.strokeText(text, left, y)
    }
    if (glow && p.shadowBlur > 0) {
      ctx.shadowColor = p.shadowColor
      ctx.shadowBlur = p.shadowBlur * S * env.px
      ctx.shadowOffsetY = 2 * S * env.px
    }
    ctx.fillStyle = color
    ctx.fillText(text, left, y)
  }
  paint(p.color, true)
  // Phần đã hát: vẽ lại bằng màu "đang hát", cắt tới vị trí đang hát
  const sungX = d.progress ? sungWidth(ctx, text, d.progress, p) : 0
  if (sungX > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(left - size, y - size * 1.2, sungX + size, size * 2.4)
    ctx.clip()
    paint(p.activeColor, false)
    ctx.restore()
  }
  ctx.restore()
}

/** Bề ngang phần đã hát của dòng (theo font đang đặt trên ctx) */
function sungWidth(ctx: CanvasRenderingContext2D, text: string, pr: NonNullable<LineDraw['progress']>, p: LyricsProps): number {
  const { starts, end, t } = pr
  if (t < starts[0]) return 0
  // Chữ đã viết hoa / thường theo cài đặt: đo theo đúng chuỗi đang vẽ
  const words = text.split(' ')
  if (t >= end) return ctx.measureText(text).width
  let k = 0
  while (k + 1 < starts.length && starts[k + 1] <= t) k++
  const before = words.slice(0, k).join(' ')
  const beforeW = k > 0 ? ctx.measureText(before + ' ').width : 0
  const wordW = ctx.measureText(words[k] ?? '').width
  if (p.highlight === 'word') return beforeW + wordW
  const wordEnd = k + 1 < starts.length ? starts[k + 1] : end
  const frac = clamp((t - starts[k]) / Math.max(0.05, wordEnd - starts[k]))
  return beforeW + wordW * frac
}
