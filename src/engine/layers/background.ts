import type { BackgroundProps } from '../../shared/types'
import { cached, type OffscreenSurface, type RenderEnv } from '../env'
import { clamp, drawCover, noise1 } from '../util'

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

const COVER_FADE = 1.2

function drawContent(env: RenderEnv, p: BackgroundProps): void {
  const { ctx, W, H } = env
  const fallback = (): void => {
    ctx.fillStyle = p.color
    ctx.fillRect(0, 0, W, H)
  }
  switch (p.mode) {
    case 'color':
      fallback()
      return
    case 'gradient': {
      // Vẽ sẵn một lần: drawImage rẻ hơn tô gradient toàn khung mỗi frame
      const surf = cached(env, `bg-gradient|${p.color}|${p.color2}|${p.angle}|${W}x${H}`, () => {
        const s = env.assets.createSurface(W, H)
        const a = (p.angle * Math.PI) / 180
        const r = (Math.abs(W * Math.cos(a)) + Math.abs(H * Math.sin(a))) / 2
        const g = s.ctx.createLinearGradient(W / 2 - Math.cos(a) * r, H / 2 - Math.sin(a) * r, W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r)
        g.addColorStop(0, p.color)
        g.addColorStop(1, p.color2)
        s.ctx.fillStyle = g
        s.ctx.fillRect(0, 0, W, H)
        return s
      })
      ctx.drawImage(surf.canvas, 0, 0)
      return
    }
    case 'image': {
      const img = p.src ? prerendered(env, p.src, p.blur) : null
      if (img) ctx.drawImage(img, 0, 0)
      else fallback()
      return
    }
    case 'video': {
      const frame = p.src ? env.assets.video(p.src, env.t) : null
      if (frame) drawCover(ctx, frame, 0, 0, W, H)
      else fallback()
      return
    }
    case 'cover': {
      const e = env.entry
      const cur = e?.track.coverPath ? prerendered(env, e.track.coverPath, p.blur) : null
      if (cur) ctx.drawImage(cur, 0, 0)
      else fallback()
      if (e && e.index > 0) {
        const k = (env.t - e.displayStart) / COVER_FADE
        const prev = env.timeline.entries[e.index - 1]
        if (k < 1 && prev.track.coverPath !== e.track.coverPath) {
          const old = prev.track.coverPath ? prerendered(env, prev.track.coverPath, p.blur) : null
          ctx.globalAlpha = (1 - clamp(k)) * env.fade
          if (old) ctx.drawImage(old, 0, 0)
          else {
            ctx.fillStyle = p.color
            ctx.fillRect(0, 0, W, H)
          }
          ctx.globalAlpha = env.fade
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
  // Phóng to thêm một chút để khi rung/pan không lộ viền
  const zoom = 1 + kb + p.beatZoom * pulse + (shakeAmp * 2.2) / Math.min(W, H)
  const panRoom = ((zoom - 1) * W) / 2
  const panX = kb > 0 ? Math.sin((2 * Math.PI * t) / 53) * panRoom * 0.6 : 0
  const panY = kb > 0 ? Math.cos((2 * Math.PI * t) / 61) * panRoom * 0.3 : 0
  const frame = Math.floor(t * 30)
  const dx = shakeAmp * beat * (noise1(frame * 0.9, 11) * 2 - 1)
  const dy = shakeAmp * beat * (noise1(frame * 0.9, 23) * 2 - 1)

  ctx.save()
  ctx.translate(W / 2 + panX + dx, H / 2 + panY + dy)
  ctx.scale(zoom, zoom)
  ctx.translate(-W / 2, -H / 2)
  drawContent(env, p)
  ctx.restore()

  if (p.dim > 0) {
    ctx.fillStyle = `rgba(0,0,0,${clamp(p.dim)})`
    ctx.fillRect(0, 0, W, H)
  }
}
