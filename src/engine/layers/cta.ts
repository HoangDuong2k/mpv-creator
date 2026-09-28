import { cssFont } from '../../shared/fonts'
import { parseTimeList } from '../../shared/time'
import type { CtaProps } from '../../shared/types'
import type { Timeline } from '../../shared/timeline'
import { cached, recordBounds, type RenderEnv } from '../env'
import { anchorPosition, clamp, easeInOutCubic, easeOutBack, easeOutCubic, sourceSize, span, withAlpha } from '../util'

// Biểu tượng Material Icons (Apache License 2.0), khung 24×24
const ICON_THUMB =
  'M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z'
const ICON_BELL =
  'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z'
const CURSOR = 'M0 0 L0 23 L6 17.5 L10.2 26.5 L13.8 25 L9.6 16.2 L17 16.2 Z'

const LABELS = {
  vi: { sub: 'ĐĂNG KÝ', subbed: 'ĐÃ ĐĂNG KÝ' },
  en: { sub: 'SUBSCRIBE', subbed: 'SUBSCRIBED' }
}

/** Các thời điểm bắt đầu hiện CTA trên toàn bộ timeline */
export function ctaStartTimes(p: CtaProps, tl: Timeline): number[] {
  const total = tl.total
  const out: number[] = []
  if (p.schedule === 'interval') {
    const every = Math.max(0.1, p.every) * 60
    for (let s = Math.max(0, p.firstAt); s < total && out.length < 10000; s += every) out.push(s)
  } else if (p.schedule === 'trackStart') {
    for (const e of tl.entries) {
      const s = e.displayStart + Math.max(0, p.offset)
      if (s < e.displayEnd) out.push(s)
    }
  } else {
    for (const s of parseTimeList(p.times)) if (s < total) out.push(s)
  }
  return out
}

/** Thời gian cục bộ của lần hiện CTA đang diễn ra, hoặc -1 nếu không hiện */
export function ctaLocalTime(starts: number[], t: number, duration: number): number {
  let lo = 0
  let hi = starts.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (starts[mid] <= t) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  if (found < 0) return -1
  const u = t - starts[found]
  return u < duration ? u : -1
}

type ButtonKind = 'sub' | 'like' | 'bell'

interface ButtonBox {
  kind: ButtonKind
  x: number
  w: number
}

const BTN_H = 76
const GAP = 14

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

export function drawCta(env: RenderEnv, p: CtaProps): void {
  const starts = cached(env, `cta-starts|${p.schedule}|${p.firstAt}|${p.every}|${p.offset}|${p.times}|${env.timeline.total}|${env.timeline.entries.length}`, () =>
    ctaStartTimes(p, env.timeline)
  )
  const D = Math.max(1.5, p.duration)
  let u = ctaLocalTime(starts, env.t, D)
  // Đang chỉnh layer này trên preview: luôn hiện (khi nút đã bật lên đủ) để canh vị trí
  if (u < 0 && env.editLayerId === env.layerId) u = 0.7
  if (u < 0) return
  if (p.preset === 'image') drawImageCta(env, p, u, D)
  else drawButtons(env, p, u, D)
}

/** Góc trên-trái của khối CTA kích thước (w, h): neo theo góc/cạnh hoặc đặt tự do theo tâm (x, y) */
function placeBox(env: RenderEnv, p: CtaProps, w: number, h: number): { x: number; y: number } {
  if (p.anchor === 'free') return { x: p.x * env.W - w / 2, y: p.y * env.H - h / 2 }
  return anchorPosition(p.anchor, w, h, env.W, env.H, p.margin * env.S)
}

function drawImageCta(env: RenderEnv, p: CtaProps, u: number, D: number): void {
  const img = p.src ? env.assets.image(p.src) : null
  const { ctx, S } = env
  if (!img) {
    // Chưa chọn ảnh: khung giữ chỗ khi đang chỉnh
    if (env.editLayerId !== env.layerId) return
    const side = 180 * S * p.scale
    const pos = placeBox(env, p, side, side)
    recordBounds(env, pos.x, pos.y, side, side)
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = 2 * S
    ctx.setLineDash([8 * S, 6 * S])
    ctx.strokeRect(pos.x, pos.y, side, side)
    ctx.setLineDash([])
    return
  }
  const { width: iw, height: ih } = sourceSize(img)
  if (!iw || !ih) return
  const k = S * p.scale
  const h = 180 * k
  const w = (h * iw) / ih
  const pos = placeBox(env, p, w, h)
  recordBounds(env, pos.x, pos.y, w, h)
  const appear = easeOutBack(span(u, 0, 0.5))
  const vanish = 1 - easeOutCubic(span(u, D - 0.5, D))
  const bob = Math.sin(u * 3) * 4 * k
  ctx.globalAlpha = clamp(span(u, 0, 0.25)) * vanish * env.fade
  ctx.translate(pos.x + w / 2, pos.y + h / 2 + bob)
  const s = Math.max(0.01, appear * (0.9 + 0.1 * vanish))
  ctx.scale(s, s)
  ctx.drawImage(img, -w / 2, -h / 2, w, h)
}

function drawButtons(env: RenderEnv, p: CtaProps, u: number, D: number): void {
  const { ctx, S } = env
  const lang = LABELS[p.lang] ?? LABELS.vi
  const labels = { sub: p.labelSub.trim() || lang.sub, subbed: p.labelDone.trim() || lang.subbed }
  const kinds: ButtonKind[] = p.preset === 'combo' ? ['sub', 'like', 'bell'] : p.preset === 'subscribe' ? ['sub'] : p.preset === 'like' ? ['like'] : ['bell']

  ctx.font = cssFont('Be Vietnam Pro', 30, true)
  const subW = Math.max(ctx.measureText(labels.sub).width, ctx.measureText(labels.subbed).width + 40) + 76
  const boxes: ButtonBox[] = []
  let x = 0
  for (const kind of kinds) {
    const w = kind === 'sub' ? subW : kind === 'like' ? 104 : BTN_H
    boxes.push({ kind, x, w })
    x += w + GAP
  }
  const rowW = x - GAP
  const k = S * p.scale
  const pos = placeBox(env, p, rowW * k, BTN_H * k)
  recordBounds(env, pos.x, pos.y, rowW * k, BTN_H * k)

  // Nén hoạt cảnh nếu thời lượng hiển thị ngắn
  const actionsEnd = 0.7 + kinds.length * 0.9 + 0.8
  const tk = Math.min(1, (D - 0.6) / actionsEnd)
  const ua = u / tk
  const clickAt = (i: number): number => 1.35 + i * 0.9
  // Hiện dần / ẩn dần của layer gộp vào hệ số biến mất
  const vanish = (1 - easeOutCubic(span(u, D - 0.5, D))) * env.fade

  ctx.translate(pos.x, pos.y)
  ctx.scale(k, k)
  ctx.globalAlpha = vanish

  boxes.forEach((b, i) => {
    const appear = easeOutBack(span(u, i * 0.08, i * 0.08 + 0.45))
    if (appear <= 0) return
    const active = ua >= clickAt(i) + 0.1
    const press = ua >= clickAt(i) && ua < clickAt(i) + 0.15 ? 0.93 : 1
    const pop = active ? 1 + 0.18 * Math.sin(Math.PI * clamp((ua - clickAt(i) - 0.1) / 0.35)) : 1
    const s = appear * press * (b.kind === 'sub' ? 1 : pop) * (0.92 + 0.08 * vanish)
    ctx.save()
    ctx.globalAlpha = vanish * clamp(span(u, i * 0.08, i * 0.08 + 0.2))
    ctx.translate(b.x + b.w / 2, BTN_H / 2)
    ctx.scale(s, s)
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = 18 * k * env.px
    ctx.shadowOffsetY = 4 * k * env.px
    if (b.kind === 'sub') drawSubscribe(ctx, b.w, active, p.accent, p.textColor, active ? labels.subbed : labels.sub)
    else if (b.kind === 'like') drawIconButton(ctx, env, b.w, ICON_THUMB, p.buttonColor, active ? p.activeColor : p.iconColor, 0)
    else {
      const since = ua - clickAt(i) - 0.1
      const wiggle = active ? 0.45 * Math.sin(since * Math.PI * 2 * 5) * Math.exp(-since * 3.2) : 0
      drawIconButton(ctx, env, b.w, ICON_BELL, p.buttonColor, active ? '#ffd54a' : p.iconColor, wiggle)
      if (active && since < 1) drawRings(ctx, since)
    }
    ctx.restore()
    // Gợn sóng khi click
    const rip = ua - clickAt(i)
    if (rip >= 0 && rip < 0.45) {
      ctx.save()
      ctx.globalAlpha = vanish * 0.5 * (1 - rip / 0.45)
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(b.x + b.w / 2, BTN_H / 2, 12 + (rip / 0.45) * 70, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  })

  drawCursor(ctx, env, boxes, ua, clickAt, rowW, vanish, k * env.px)
}

function drawSubscribe(ctx: CanvasRenderingContext2D, w: number, active: boolean, accent: string, textColor: string, label: string): void {
  roundRectPath(ctx, -w / 2, -BTN_H / 2, w, BTN_H, BTN_H / 2)
  ctx.fillStyle = active ? '#3b3b3b' : accent
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  ctx.font = cssFont('Be Vietnam Pro', 30, true)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = active ? '#d9d9d9' : textColor
  if (active) {
    const tw = ctx.measureText(label).width
    ctx.fillText(label, 16, 2)
    // Dấu tích
    ctx.strokeStyle = '#d9d9d9'
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const cx = 16 - tw / 2 - 26
    ctx.beginPath()
    ctx.moveTo(cx - 10, 1)
    ctx.lineTo(cx - 3, 8)
    ctx.lineTo(cx + 11, -8)
    ctx.stroke()
  } else ctx.fillText(label, 0, 2)
}

function drawIconButton(ctx: CanvasRenderingContext2D, env: RenderEnv, w: number, icon: string, bg: string, color: string, rotate: number): void {
  roundRectPath(ctx, -w / 2, -BTN_H / 2, w, BTN_H, BTN_H / 2)
  ctx.fillStyle = withAlpha(bg, 0.92)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  const path = cached(env, `path|${icon}`, () => env.assets.path2d(icon))
  ctx.save()
  ctx.translate(0, -4)
  ctx.rotate(rotate)
  ctx.translate(0, 4)
  const size = 40
  ctx.scale(size / 24, size / 24)
  ctx.translate(-12, -12)
  ctx.fillStyle = color
  ctx.fill(path)
  ctx.restore()
}

function drawRings(ctx: CanvasRenderingContext2D, since: number): void {
  ctx.strokeStyle = '#ffd54a'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.globalAlpha *= 1 - clamp(since)
  const r = 30 + since * 14
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(0, -2, r, side < 0 ? Math.PI * 1.1 : -Math.PI * 0.35, side < 0 ? Math.PI * 1.35 : -Math.PI * 0.1)
    ctx.stroke()
  }
}

function drawCursor(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  boxes: ButtonBox[],
  ua: number,
  clickAt: (i: number) => number,
  rowW: number,
  vanish: number,
  shadowScale: number
): void {
  // Các điểm dừng: ngoài khung → từng nút → rời đi
  const target = (i: number): [number, number] => [boxes[i].x + boxes[i].w * (boxes[i].kind === 'sub' ? 0.62 : 0.55), BTN_H * 0.62]
  const start: [number, number] = [rowW + 140, BTN_H + 170]
  const lastClick = clickAt(boxes.length - 1)
  let pos: [number, number]
  if (ua < clickAt(0) - 0.65) pos = start
  else {
    pos = start
    for (let i = 0; i < boxes.length; i++) {
      const from = i === 0 ? start : target(i - 1)
      const to = target(i)
      const m = easeInOutCubic(span(ua, clickAt(i) - 0.65, clickAt(i) - 0.05))
      if (ua >= clickAt(i) - 0.65) pos = [from[0] + (to[0] - from[0]) * m, from[1] + (to[1] - from[1]) * m]
    }
    const leave = easeInOutCubic(span(ua, lastClick + 0.4, lastClick + 0.9))
    const last = target(boxes.length - 1)
    if (leave > 0) pos = [last[0] + (start[0] - last[0]) * leave, last[1] + (start[1] - last[1]) * leave]
  }
  const appear = clamp(span(ua, clickAt(0) - 0.9, clickAt(0) - 0.6))
  const gone = 1 - span(ua, lastClick + 0.6, lastClick + 0.9)
  const alpha = appear * gone * vanish
  if (alpha <= 0.01) return
  let press = 1
  for (let i = 0; i < boxes.length; i++) if (ua >= clickAt(i) && ua < clickAt(i) + 0.15) press = 0.85
  const path = cached(env, 'path|cursor', () => env.assets.path2d(CURSOR))
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(pos[0], pos[1])
  ctx.scale(2.2 * press, 2.2 * press)
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 6 * shadowScale
  ctx.fillStyle = '#ffffff'
  ctx.fill(path)
  ctx.shadowBlur = 0
  ctx.lineWidth = 1.3
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#111111'
  ctx.stroke(path)
  ctx.restore()
}
