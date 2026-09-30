// Thông tin bài trên video: thẻ "Đang phát" (ảnh bìa, tên bài, ca sĩ, tiến trình) và danh sách
// bài (bài đang phát nổi bật, tự cuộn mượt khi đổi bài). Cả hai có nền kính mờ tuỳ chọn.
import { BAND_COUNT } from '../../shared/featureFormat'
import { cssFont } from '../../shared/fonts'
import { tr } from '../../shared/i18n'
import { formatTime } from '../../shared/time'
import type { NowPlayingProps, TracklistProps } from '../../shared/types'
import { cached, recordBounds, type OffscreenSurface, type RenderEnv } from '../env'
import { clamp, easeInOutCubic, easeOutCubic, sourceSize, withAlpha } from '../util'

/**
 * Nền kính mờ: làm mờ phần hình đã vẽ phía sau hình chữ nhật bo góc (x, y, w, h) rồi đặt lại
 * đúng chỗ. Làm trên điểm ảnh thật của canvas nên đúng cả khi preview thu nhỏ.
 */
export function frostedBackdrop(env: RenderEnv, x: number, y: number, w: number, h: number, r: number, blurPx: number): void {
  const { ctx } = env
  const blur = blurPx * env.S * env.px
  if (blur < 0.5) return
  const canvas = ctx.canvas as unknown as CanvasImageSource & { width: number; height: number }
  const pad = Math.ceil(blur * 2)
  const sx = Math.max(0, Math.floor(x * env.px) - pad)
  const sy = Math.max(0, Math.floor(y * env.px) - pad)
  const ex = Math.min(canvas.width, Math.ceil((x + w) * env.px) + pad)
  const ey = Math.min(canvas.height, Math.ceil((y + h) * env.px) + pad)
  const sw = ex - sx
  const sh = ey - sy
  if (sw <= 0 || sh <= 0) return
  // Canvas tạm theo bậc 64 px để không sinh quá nhiều canvas khi kéo đổi cỡ
  const bw = Math.ceil(sw / 64) * 64
  const bh = Math.ceil(sh / 64) * 64
  const s: OffscreenSurface = cached(env, `frost|${bw}x${bh}`, () => env.assets.createSurface(bw, bh))
  const c = s.ctx
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.globalAlpha = 1
  c.globalCompositeOperation = 'copy'
  c.filter = `blur(${Math.round(blur * 10) / 10}px)`
  c.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh)
  c.filter = 'none'
  c.globalCompositeOperation = 'source-over'
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.clip()
  ctx.globalAlpha = 1
  ctx.drawImage(s.canvas, 0, 0, sw, sh, sx / env.px, sy / env.px, sw / env.px, sh / env.px)
  ctx.restore()
}

/** Cắt chữ vừa bề ngang, thêm "…" */
export function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (maxW <= 0) return ''
  if (ctx.measureText(text).width <= maxW) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxW) lo = mid
    else hi = mid - 1
  }
  return text.slice(0, lo).trimEnd() + '…'
}

/** Ảnh bìa bo góc; bài không có ảnh bìa thì vẽ ô màu có hình đĩa nhỏ */
function drawCover(env: RenderEnv, path: string | undefined, x: number, y: number, s: number): void {
  const { ctx } = env
  const img = path ? env.assets.image(path) : null
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, s, s, s * 0.12)
  ctx.clip()
  if (img) {
    const { width: iw, height: ih } = sourceSize(img)
    const k = s / Math.max(1, Math.min(iw, ih))
    ctx.drawImage(img, x + (s - iw * k) / 2, y + (s - ih * k) / 2, iw * k, ih * k)
  } else {
    const g = ctx.createLinearGradient(x, y, x + s, y + s)
    g.addColorStop(0, '#3a3542')
    g.addColorStop(1, '#1d1b22')
    ctx.fillStyle = g
    ctx.fillRect(x, y, s, s)
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    ctx.beginPath()
    ctx.arc(x + s / 2, y + s / 2, s * 0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.beginPath()
    ctx.arc(x + s / 2, y + s / 2, s * 0.06, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** Nền của thẻ / danh sách theo kiểu */
function panel(env: RenderEnv, style: 'glass' | 'solid' | 'minimal' | 'plain', x: number, y: number, w: number, h: number, r: number, color: string, opacity: number, blur: number, A: number): void {
  const { ctx, S } = env
  if (style === 'minimal' || style === 'plain') return
  if (style === 'glass') frostedBackdrop(env, x, y, w, h, r, blur)
  ctx.globalAlpha = A * clamp(style === 'solid' ? Math.max(opacity, 0.6) : opacity)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
  if (style === 'glass') {
    ctx.globalAlpha = A * 0.6
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'
    ctx.lineWidth = Math.max(1, S * 1.2)
    ctx.stroke()
  }
  ctx.globalAlpha = A
}

/** Chữ trần (kiểu tối giản / không nền): bóng mờ để đọc được trên mọi nền */
function textShadow(env: RenderEnv, on: boolean): void {
  const { ctx } = env
  if (on) {
    ctx.shadowColor = 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = 10 * env.S * env.px
    ctx.shadowOffsetY = 2 * env.S * env.px
  } else {
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0
  }
}

export function drawNowPlaying(env: RenderEnv, p: NowPlayingProps): void {
  const { ctx, W, H, S, t } = env
  const s0 = Math.max(16, p.size * S)
  const pad = s0 * 0.16
  const w0 = Math.max(p.width * S, s0 * (p.showCover ? 2.6 : 1.8))
  const h0 = s0 + pad * 2
  const x0 = p.x * W - w0 / 2
  const y0 = p.y * H - h0 / 2
  recordBounds(env, x0, y0, w0, h0)
  const A = clamp(p.opacity) * env.fade
  ctx.globalAlpha = A
  const r = Math.min(p.radius * S, h0 / 2)
  panel(env, p.style, x0, y0, w0, h0, r, p.bgColor, p.bgOpacity, p.blur, A)

  const e = env.entry
  // Đổi bài: nội dung mờ dần ra, bài mới trượt lên và hiện dần
  const inK = !e || e.index === 0 ? 1 : clamp((t - e.displayStart) / 0.45)
  const outK = e ? clamp((e.displayEnd - t) / 0.35) : 1
  const k = Math.min(inK, outK)
  const lift = (1 - easeOutCubic(inK)) * s0 * 0.12
  ctx.globalAlpha = A * easeOutCubic(k)
  const bare = p.style === 'minimal'

  let tx = x0 + pad
  if (p.showCover) {
    drawCover(env, e?.track.coverPath, x0 + pad, y0 + pad + lift, s0)
    tx += s0 + pad * 0.9
  }
  const tw = x0 + w0 - pad - tx
  const title = e?.track.title || (env.editLayerId === env.layerId ? tr('Tên bài hát') : '')
  const artist = e?.track.artist || (env.editLayerId === env.layerId && !e ? tr('Ca sĩ') : '')
  const label = p.label.trim()
  const hasBar = p.showProgress
  // Khối chữ canh giữa theo chiều dọc của ảnh bìa
  const lines: Array<{ h: number; draw: (y: number) => void }> = []
  if (label)
    lines.push({
      h: s0 * 0.2,
      draw: (y) => {
        ctx.font = cssFont(p.font, s0 * 0.13, false)
        ctx.fillStyle = withAlpha(p.textColor, 0.85)
        ctx.fillText(ellipsize(ctx, label, tw), tx, y)
      }
    })
  lines.push({
    h: s0 * 0.3,
    draw: (y) => {
      ctx.font = cssFont(p.font, s0 * 0.22, true)
      ctx.fillStyle = p.titleColor
      ctx.fillText(ellipsize(ctx, title, tw), tx, y)
    }
  })
  if (artist)
    lines.push({
      h: s0 * 0.24,
      draw: (y) => {
        ctx.font = cssFont(p.font, s0 * 0.16, false)
        ctx.fillStyle = p.textColor
        ctx.fillText(ellipsize(ctx, artist, tw), tx, y)
      }
    })
  const barH = hasBar ? s0 * (p.showTime ? 0.34 : 0.18) : 0
  const blockH = lines.reduce((a, l) => a + l.h, 0) + barH
  let y = y0 + pad + Math.max(0, (s0 - blockH) / 2) + lift
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  textShadow(env, bare)
  for (const l of lines) {
    l.draw(y)
    y += l.h
  }
  if (hasBar) {
    const len = e?.length ?? 0
    const pos = e ? clamp(t - e.start, 0, len) : 0
    const th = Math.max(2 * S, s0 * 0.03)
    const by = y + s0 * 0.07
    textShadow(env, false)
    ctx.lineCap = 'round'
    ctx.lineWidth = th
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.beginPath()
    ctx.moveTo(tx, by)
    ctx.lineTo(tx + tw, by)
    ctx.stroke()
    ctx.strokeStyle = p.accent
    ctx.beginPath()
    ctx.moveTo(tx, by)
    ctx.lineTo(tx + Math.max(0.5, tw * (len > 0 ? pos / len : 0)), by)
    ctx.stroke()
    if (p.showTime) {
      textShadow(env, bare)
      ctx.font = cssFont(p.font, s0 * 0.12, false)
      ctx.fillStyle = withAlpha(p.textColor, 0.9)
      const ty = by + th + s0 * 0.05
      ctx.fillText(formatTime(pos), tx, ty)
      ctx.textAlign = 'right'
      ctx.fillText(`-${formatTime(Math.max(0, len - pos))}`, tx + tw, ty)
      ctx.textAlign = 'left'
    }
  }
  textShadow(env, false)
}

/** Biểu tượng "đang phát": ba cột nhảy theo nhạc */
function eqIcon(env: RenderEnv, x: number, cy: number, size: number, color: string): void {
  const { ctx } = env
  const spec = env.audio.bands(env.t, cached(env, 'tracklist-eq', () => new Float32Array(BAND_COUNT)), 14)
  const bw = size * 0.2
  const gap = size * 0.12
  ctx.fillStyle = color
  ;[5, 22, 42].forEach((band, i) => {
    const v = clamp(spec[band] * 1.1)
    const h = size * (0.25 + 0.75 * v * v)
    ctx.beginPath()
    ctx.roundRect(x + i * (bw + gap), cy + size / 2 - h, bw, h, bw / 3)
    ctx.fill()
  })
}

export function drawTracklist(env: RenderEnv, p: TracklistProps): void {
  const { ctx, W, H, S, t } = env
  const fs = Math.max(6, p.fontSize * S)
  const rowH = fs * (p.showArtist ? 2.3 : 1.65)
  const title = p.title.trim()
  const headerH = title ? fs * 2 : 0
  const padX = fs * 0.75
  const padY = fs * 0.55
  const entries = env.timeline.entries
  const n = entries.length
  // Playlist ít bài hơn số dòng: khung co lại vừa đủ số bài
  const visible = Math.max(1, Math.min(n, Math.max(2, Math.min(30, Math.round(p.rows)))))
  const w0 = Math.max(fs * 6, p.width * W)
  const h0 = headerH + visible * rowH + padY * 2
  const X = p.x * W
  const x0 = p.align === 'left' ? X : p.align === 'right' ? X - w0 : X - w0 / 2
  const y0 = p.y * H - h0 / 2
  recordBounds(env, x0, y0, w0, h0)
  const A = clamp(p.opacity) * env.fade
  ctx.globalAlpha = A
  panel(env, p.style, x0, y0, w0, h0, fs * 0.6, p.bgColor, p.bgOpacity, p.blur, A)
  const bare = p.style === 'plain'
  textShadow(env, bare)

  ctx.textBaseline = 'middle'
  if (title) {
    ctx.font = cssFont(p.font, fs * 1.02, true)
    ctx.fillStyle = p.color
    ctx.textAlign = 'left'
    ctx.fillText(ellipsize(ctx, title, w0 - padX * 2), x0 + padX, y0 + padY + headerH * 0.45)
  }

  const top = y0 + padY + headerH
  if (n === 0) {
    if (env.editLayerId === env.layerId) {
      ctx.font = cssFont(p.font, fs * 0.9, false)
      ctx.fillStyle = withAlpha(p.color, 0.6)
      ctx.textAlign = 'left'
      ctx.fillText(tr('Chưa có bài nào'), x0 + padX, top + rowH / 2)
    }
    textShadow(env, false)
    return
  }
  const cur = env.entry?.index ?? 0
  // Cuộn: bài đang phát ở dòng thứ hai; đổi bài thì cuộn mượt trong 0,6 giây
  const firstFor = (i: number): number => clamp(i - 1, 0, Math.max(0, n - visible))
  let first = firstFor(cur)
  if (cur > 0) {
    const k = easeInOutCubic(clamp((t - entries[cur].displayStart) / 0.6))
    first = firstFor(cur - 1) + (firstFor(cur) - firstFor(cur - 1)) * k
  }
  ctx.save()
  ctx.beginPath()
  ctx.rect(x0, top, w0, visible * rowH)
  ctx.clip()
  const numW = p.showNumber ? fs * 1.7 : 0
  const timeW = p.showTime ? fs * (entries[n - 1].displayStart >= 3600 ? 3.9 : 2.9) : 0
  const withHours = env.timeline.total >= 3600
  for (let i = Math.max(0, Math.floor(first)); i < Math.min(n, Math.ceil(first + visible) + 1); i++) {
    const e = entries[i]
    const ry = top + (i - first) * rowH
    const active = i === cur
    const alphaRow = active ? 1 : i < cur && p.dimPlayed ? 0.45 : 0.82
    ctx.globalAlpha = A * alphaRow
    if (active) {
      ctx.globalAlpha = A
      textShadow(env, false)
      ctx.fillStyle = withAlpha(p.activeColor, 0.14)
      ctx.beginPath()
      ctx.roundRect(x0 + padX * 0.4, ry + rowH * 0.06, w0 - padX * 0.8, rowH * 0.88, fs * 0.35)
      ctx.fill()
      ctx.fillStyle = p.activeColor
      ctx.fillRect(x0 + padX * 0.4, ry + rowH * 0.2, Math.max(2, 3 * S), rowH * 0.6)
      textShadow(env, bare)
    }
    const color = active ? p.activeColor : p.color
    let cx = x0 + padX
    if (p.showNumber) {
      if (active) eqIcon(env, cx + fs * 0.1, ry + rowH / 2, fs * 0.8, color)
      else {
        ctx.font = cssFont(p.font, fs * 0.8, false)
        ctx.fillStyle = withAlpha(color, 0.7)
        ctx.textAlign = 'left'
        ctx.fillText(String(i + 1), cx, ry + rowH / 2)
      }
      cx += numW
    }
    const textW = x0 + w0 - padX - timeW - cx - fs * 0.3
    ctx.textAlign = 'left'
    ctx.fillStyle = color
    ctx.font = cssFont(p.font, fs, active)
    const name = e.track.title || tr('Không tên')
    if (p.showArtist && e.track.artist) {
      ctx.fillText(ellipsize(ctx, name, textW), cx, ry + rowH * 0.36)
      ctx.font = cssFont(p.font, fs * 0.74, false)
      ctx.fillStyle = withAlpha(color, 0.7)
      ctx.fillText(ellipsize(ctx, e.track.artist, textW), cx, ry + rowH * 0.7)
    } else ctx.fillText(ellipsize(ctx, name, textW), cx, ry + rowH / 2)
    if (p.showTime) {
      ctx.font = cssFont(p.font, fs * 0.78, false)
      ctx.fillStyle = withAlpha(color, 0.7)
      ctx.textAlign = 'right'
      ctx.fillText(formatTime(i === 0 ? 0 : e.displayStart, withHours), x0 + w0 - padX, ry + rowH / 2)
    }
  }
  ctx.restore()
  textShadow(env, false)
}
