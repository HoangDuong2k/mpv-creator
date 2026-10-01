import type { BackgroundProps } from '../../shared/types'
import { cached, type OffscreenSurface, type RenderEnv } from '../env'
import { clamp, drawCover, noise1, parseHex } from '../util'
import { bakeFilterInto, bakeSignature } from './filter'

/** Xung "đập" theo nhạc 0..1: kết hợp beat và mức bass */
export function bassPulse(env: RenderEnv): number {
  const beat = env.audio.beat(env.t, 6)
  const bass = env.audio.bass(env.t, 10)
  return clamp(0.7 * beat + 0.5 * bass * bass)
}

/** Ảnh đã phủ kín khung (và làm mờ nếu cần), vẽ sẵn một lần rồi dùng lại mỗi frame. */
function prerendered(env: RenderEnv, path: string, blur: number): CanvasImageSource | null {
  const key = `bg|${path}|${blur}|${env.W}x${env.H}`
  const lru = cached(env, 'bg-lru', () => new Map<string, OffscreenSurface>())
  const hit = lru.get(key)
  if (hit) {
    lru.delete(key)
    lru.set(key, hit)
    return hit.canvas
  }
  const img = env.assets.image(path)
  if (!img) return null
  const surf = env.assets.createSurface(env.W, env.H)
  const pad = blur > 0 ? blur * env.S * 2 : 0
  if (blur > 0) surf.ctx.filter = `blur(${blur * env.S}px)`
  drawCover(surf.ctx, img, -pad, -pad, env.W + pad * 2, env.H + pad * 2)
  surf.ctx.filter = 'none'
  lru.set(key, surf)
  while (lru.size > 4) lru.delete(lru.keys().next().value as string)
  return surf.canvas
}

/** Gradient theo góc, phủ kín khung W × H */
function linearGradient(ctx: CanvasRenderingContext2D, W: number, H: number, angle: number, c0: string, c1: string): CanvasGradient {
  const a = (angle * Math.PI) / 180
  const r = (Math.abs(W * Math.cos(a)) + Math.abs(H * Math.sin(a))) / 2
  const g = ctx.createLinearGradient(W / 2 - Math.cos(a) * r, H / 2 - Math.sin(a) * r, W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r)
  g.addColorStop(0, c0)
  g.addColorStop(1, c1)
  return g
}

/**
 * Gradient vẽ sẵn một lần (dùng khi nướng bộ lọc màu vào nền).
 * Chỉ giữ vài gradient gần nhất — kéo bảng chọn màu không làm bộ nhớ phình ra.
 */
function gradientSurface(env: RenderEnv, p: BackgroundProps): OffscreenSurface {
  const { W, H } = env
  const key = `${p.color}|${p.color2}|${p.angle}|${W}x${H}`
  const lru = cached(env, 'bg-gradient-lru', () => new Map<string, OffscreenSurface>())
  const hit = lru.get(key)
  if (hit) {
    lru.delete(key)
    lru.set(key, hit)
    return hit
  }
  const s = env.assets.createSurface(W, H)
  s.ctx.fillStyle = linearGradient(s.ctx, W, H, p.angle, p.color, p.color2)
  s.ctx.fillRect(0, 0, W, H)
  lru.set(key, s)
  while (lru.size > 4) lru.delete(lru.keys().next().value as string)
  return s
}

/** Khung màu đơn W × H (chỉ cần khi nướng bộ lọc) — một canvas dùng lại, tô lại khi đổi màu */
function colorSurface(env: RenderEnv, color: string): CanvasImageSource {
  const { W, H } = env
  const slot = cached(env, `bg-color|${W}x${H}`, () => ({ color: '', surf: env.assets.createSurface(W, H) }))
  if (slot.color !== color) {
    slot.surf.ctx.fillStyle = color
    slot.surf.ctx.fillRect(0, 0, W, H)
    slot.color = color
  }
  return slot.surf.canvas
}

/** Số ảnh nền đã nướng bộ lọc giữ lại (ảnh bìa lúc chuyển bài cần 2) */
const BAKE_MAX = 6

/**
 * Ảnh nền đã nướng bộ lọc (env.bake). Mỗi (lớp bộ lọc, nguồn ảnh) có đúng một canvas: đổi thông số
 * bộ lọc (kéo thanh trượt…) thì nướng lại vào chính canvas đó, không sinh thêm.
 */
function bakedSurface(env: RenderEnv, srcKey: string, src: CanvasImageSource, dim: number): CanvasImageSource {
  const bake = env.bake!
  const { W, H } = env
  const lru = cached(env, 'filter-bake', () => new Map<string, { sig: string; surf: OffscreenSurface }>())
  const key = `${bake.filterId}|${srcKey}|${W}x${H}`
  const sig = bakeSignature(bake.props, dim)
  let entry = lru.get(key)
  if (entry) lru.delete(key)
  else {
    let surf: OffscreenSurface | undefined
    if (lru.size >= BAKE_MAX) {
      const oldest = lru.keys().next().value as string
      const old = lru.get(oldest)!.surf
      lru.delete(oldest)
      const c = old.canvas as unknown as { width: number; height: number }
      if (c.width === W && c.height === H) surf = old
    }
    entry = { sig: '', surf: surf ?? env.assets.createSurface(W, H) }
  }
  if (entry.sig !== sig) {
    bakeFilterInto(env, entry.surf, src, bake.props, dim)
    entry.sig = sig
  }
  lru.set(key, entry)
  return entry.surf.canvas
}

/** Màu hex đục tối đi như khi phủ đen với độ tối `dim`; null nếu không phải màu hex (có thể có độ trong) */
function dimmedHex(color: string, dim: number): string | null {
  const rgb = parseHex(color)
  if (!rgb) return null
  const k = 1 - clamp(dim)
  return `rgb(${Math.round(rgb[0] * k)},${Math.round(rgb[1] * k)},${Math.round(rgb[2] * k)})`
}

/**
 * Nền gradient / màu đơn bằng màu hex (đục) đang hiện đủ: phủ kín khung (phóng ≥ 1), nên lớp dưới cùng là nền
 * này thì không cần tô đen khung trước.
 */
export function coversFrame(env: RenderEnv, p: BackgroundProps): boolean {
  if (!env.fastBackground || env.fade < 0.999) return false
  if (p.mode === 'color') return parseHex(p.color) !== null
  return p.mode === 'gradient' && parseHex(p.color) !== null && parseHex(p.color2) !== null
}

/**
 * Nền phủ kín khung, không nướng bộ lọc: tô thẳng một lần bằng màu đã tối sẵn, thay cho vẽ gradient phóng to
 * rồi phủ đen cả khung. Hình như nhau — phủ đen lên một lớp đục chỉ là nhân màu với (1 − độ tối) — nhưng xuất
 * video nhanh hơn nhiều vì Skia vẽ bằng CPU. Trả về màu đầu–cuối đã tối, null nếu không dùng được cách này.
 */
function solidColors(env: RenderEnv, p: BackgroundProps): [string, string] | null {
  if (env.bake || !coversFrame(env, p)) return null
  const c0 = dimmedHex(p.color, p.dim)!
  return [c0, p.mode === 'gradient' ? dimmedHex(p.color2, p.dim)! : c0]
}

const COVER_FADE = 1.2

/**
 * Nền vẽ ra đúng một ảnh tĩnh (W × H) ở frame này nên nướng sẵn bộ lọc màu được: ảnh, màu, gradient,
 * ảnh bìa (trừ lúc đang chuyển ảnh bìa giữa hai bài — khi đó lọc từng frame cho đúng màu lúc đan nhau).
 */
export function isStaticBackground(env: RenderEnv, p: BackgroundProps): boolean {
  if (p.mode === 'video') return false
  if (p.mode !== 'cover') return true
  const e = env.entry
  if (!e || e.index === 0) return true
  const prev = env.timeline.entries[e.index - 1]
  return (env.t - e.displayStart) / COVER_FADE >= 1 || prev.track.coverPath === e.track.coverPath
}

/** Vẽ nội dung nền (trong hệ toạ độ đã phóng / lia). `baked`: vẽ bản đã nướng bộ lọc. */
function drawContent(env: RenderEnv, p: BackgroundProps, baked: boolean, alpha: number): void {
  const { ctx, W, H } = env
  ctx.globalAlpha = alpha
  // Một nguồn tĩnh W × H — đã lọc sẵn nếu cần
  const put = (key: string, src: CanvasImageSource): void => {
    ctx.drawImage(baked ? bakedSurface(env, key, src, p.dim) : src, 0, 0)
  }
  const fallback = (): void => {
    if (baked) put(`color|${p.color}`, colorSurface(env, p.color))
    else {
      ctx.fillStyle = p.color
      ctx.fillRect(0, 0, W, H)
    }
  }
  switch (p.mode) {
    case 'color':
      fallback()
      return
    case 'gradient':
      put(`gradient|${p.color}|${p.color2}|${p.angle}`, gradientSurface(env, p).canvas)
      return
    case 'image': {
      const img = p.src ? prerendered(env, p.src, p.blur) : null
      if (img) put(`image|${p.src}|${p.blur}`, img)
      else fallback()
      return
    }
    case 'video': {
      // Frame video đổi liên tục: không nướng được (Renderer không chọn cách này cho nền video)
      if (baked && env.bake) env.bake.failed = true
      const frame = p.src ? env.assets.video(p.src, env.t) : null
      if (frame) drawCover(ctx, frame, 0, 0, W, H)
      else {
        ctx.fillStyle = p.color
        ctx.fillRect(0, 0, W, H)
      }
      return
    }
    case 'cover': {
      const e = env.entry
      const cur = e?.track.coverPath ? prerendered(env, e.track.coverPath, p.blur) : null
      if (cur) put(`image|${e!.track.coverPath}|${p.blur}`, cur)
      else fallback()
      if (e && e.index > 0) {
        const k = (env.t - e.displayStart) / COVER_FADE
        const prev = env.timeline.entries[e.index - 1]
        if (k < 1 && prev.track.coverPath !== e.track.coverPath) {
          const old = prev.track.coverPath ? prerendered(env, prev.track.coverPath, p.blur) : null
          ctx.globalAlpha = (1 - clamp(k)) * alpha
          if (old) put(`image|${prev.track.coverPath}|${p.blur}`, old)
          else fallback()
          ctx.globalAlpha = alpha
        }
      }
      return
    }
  }
}

export function drawBackground(env: RenderEnv, p: BackgroundProps): void {
  const { ctx, W, H, S, t } = env
  const pulse = p.beatZoom > 0 ? bassPulse(env) : 0
  const kb = p.kenBurns * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 36))
  const shakeAmp = p.shake * S
  const beat = shakeAmp > 0 ? env.audio.beat(t, 10) : 0
  // Phóng to thêm một chút để khi rung/pan không lộ viền. Lia chỉ dùng phần phóng của Ken Burns / đập theo bass;
  // phần phóng thêm cho rung để riêng (lia hết cỡ đúng lúc rung mạnh vẫn phủ kín khung)
  const panZoom = 1 + kb + p.beatZoom * pulse
  const zoom = panZoom + (shakeAmp * 2.2) / Math.min(W, H)
  const panRoom = ((panZoom - 1) * W) / 2
  const panX = kb > 0 ? Math.sin((2 * Math.PI * t) / 53) * panRoom * 0.6 : 0
  const panY = kb > 0 ? Math.cos((2 * Math.PI * t) / 61) * panRoom * 0.3 : 0
  const frame = Math.floor(t * 30)
  const dx = shakeAmp * beat * (noise1(frame * 0.9, 11) * 2 - 1)
  const dy = shakeAmp * beat * (noise1(frame * 0.9, 23) * 2 - 1)

  const content = (baked: boolean, alpha: number): void => {
    ctx.save()
    ctx.translate(W / 2 + panX + dx, H / 2 + panY + dy)
    ctx.scale(zoom, zoom)
    ctx.translate(-W / 2, -H / 2)
    drawContent(env, p, baked, alpha)
    ctx.restore()
  }
  const dimFill = (): void => {
    if (p.dim > 0) {
      ctx.fillStyle = `rgba(0,0,0,${clamp(p.dim)})`
      ctx.fillRect(0, 0, W, H)
    }
  }

  const bake = env.bake
  if (!bake) {
    const solid = solidColors(env, p)
    if (solid) {
      ctx.globalAlpha = env.fade
      if (p.mode === 'color') {
        ctx.fillStyle = solid[0]
        ctx.fillRect(0, 0, W, H)
        return
      }
      ctx.save()
      ctx.translate(W / 2 + panX + dx, H / 2 + panY + dy)
      ctx.scale(zoom, zoom)
      ctx.translate(-W / 2, -H / 2)
      ctx.fillStyle = linearGradient(ctx, W, H, p.angle, solid[0], solid[1])
      // Tô rộng hơn khung: phóng / lia / rung thế nào cũng phủ kín
      ctx.fillRect(-W, -H, W * 3, H * 3)
      ctx.restore()
      return
    }
    content(false, env.fade)
    dimFill()
    return
  }
  if (bake.fade >= 0.999) {
    // Ảnh đã nướng có sẵn độ tối của nền
    content(true, env.fade)
    if (bake.failed) dimFill()
    return
  }
  // Bộ lọc đang hiện dần / ẩn dần: ảnh gốc, rồi ảnh đã lọc phủ lên theo độ hiện của bộ lọc
  content(false, env.fade)
  dimFill()
  content(true, env.fade * bake.fade)
  ctx.globalAlpha = env.fade
}
