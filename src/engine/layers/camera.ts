// Hiệu ứng khung hình tác động lên mọi lớp nằm dưới (như nhóm Cơ bản / Ống kính của CapCut): phóng to, rung,
// phóng mờ, lệch màu ống kính, khối điểm ảnh theo beat / bass; soi gương, kính vạn hoa, viền điện ảnh.
// Làm việc trên điểm ảnh thật của canvas (như VHS, glitch) và chỉ phụ thuộc thời điểm t.
import type { CameraProps } from '../../shared/types'
import type { RenderEnv } from '../env'
import { clamp, easeOutCubic, noise1 } from '../util'
import { channel, snapshot, surface, type Snap } from './screenfx'

/** Xung beat nhỏ hơn mức này coi như đã tắt: giữa hai beat khung hình đứng yên hẳn (không rung rinh liên tục) */
const BEAT_FLOOR = 0.1

/** Độ mạnh lúc t (0..1): theo beat, theo bass, hoặc luôn bật */
export function cameraStrength(p: CameraProps, env: Pick<RenderEnv, 't' | 'audio' | 'fade'>): number {
  const v = p.trigger === 'always' ? 1 : p.trigger === 'bass' ? env.audio.bass(env.t, 10) : (env.audio.beat(env.t, 7) - BEAT_FLOOR) / (1 - BEAT_FLOOR)
  return clamp(v) * clamp(p.amount) * env.fade
}

/** Vẽ ảnh chụp trở lại, biến đổi quanh tâm khung hình (phóng `scale`, dời `dx, dy`, xoay `rot`) */
function putTransformed(env: RenderEnv, snap: Snap, scale: number, dx = 0, dy = 0, rot = 0, alpha = 1): void {
  const { ctx } = env
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.filter = 'none'
  ctx.globalAlpha = alpha
  ctx.globalCompositeOperation = alpha >= 1 ? 'copy' : 'source-over'
  ctx.translate(snap.dw / 2 + dx, snap.dh / 2 + dy)
  if (rot) ctx.rotate(rot)
  ctx.scale(scale, scale)
  ctx.drawImage(snap.s.canvas, 0, 0, snap.w, snap.h, -snap.dw / 2, -snap.dh / 2, snap.dw, snap.dh)
  ctx.restore()
}

export function drawCamera(env: RenderEnv, p: CameraProps): void {
  switch (p.style) {
    case 'mirror':
      return drawMirror(env, p)
    case 'kaleido':
      return drawKaleido(env, p)
    case 'bars':
      return drawBars(env, p)
  }
  const k = cameraStrength(p, env)
  if (k < 0.004) return
  switch (p.style) {
    case 'shake': {
      // Rung 24 lần / giây: dời + xoay nhẹ, phóng vừa đủ để không lộ mép
      const unit = env.S * env.px
      const A = 34 * unit * k
      const f = Math.floor(env.t * 24) * 0.37
      const dx = (noise1(f, 71) * 2 - 1) * A
      const dy = (noise1(f, 72) * 2 - 1) * A
      const rot = (noise1(f, 73) * 2 - 1) * 0.02 * k
      const snap = snapshot(env, 'cam-snap')
      const cover = 1 + (2 * A) / Math.min(snap.dw, snap.dh) + Math.abs(rot) * 1.2
      putTransformed(env, snap, cover, dx, dy, rot)
      return
    }
    case 'zoomblur':
      return drawZoomBlur(env, k)
    case 'chromatic': {
      // Kênh đỏ phóng to hơn một chút: mép khung hình có viền màu, giữa khung vẫn nét
      const snap = snapshot(env, 'cam-snap')
      const red = channel(env, 'cam-r', snap, '#ff0000')
      const cyan = channel(env, 'cam-gb', snap, '#00ffff')
      const s = 1 + 0.024 * k
      const { ctx } = env
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.filter = 'none'
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'copy'
      ctx.drawImage(cyan.canvas, 0, 0)
      ctx.globalCompositeOperation = 'lighter'
      ctx.translate(snap.dw / 2, snap.dh / 2)
      ctx.scale(s, s)
      ctx.drawImage(red.canvas, -snap.dw / 2, -snap.dh / 2)
      ctx.restore()
      return
    }
    case 'pixelate': {
      const block = Math.round(p.pixel * env.S * env.px * k)
      if (block < 2) return
      const snapCanvas = env.ctx.canvas as unknown as CanvasImageSource & { width: number; height: number }
      const dw = snapCanvas.width
      const dh = snapCanvas.height
      const tiny = surface(env, 'cam-pix', Math.max(1, Math.ceil(dw / block)), Math.max(1, Math.ceil(dh / block)))
      const tw = Math.ceil(dw / block)
      const th = Math.ceil(dh / block)
      tiny.ctx.setTransform(1, 0, 0, 1, 0, 0)
      tiny.ctx.globalCompositeOperation = 'copy'
      tiny.ctx.drawImage(snapCanvas, 0, 0, dw, dh, 0, 0, tw, th)
      const { ctx } = env
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.filter = 'none'
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'copy'
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(tiny.canvas, 0, 0, tw, th, 0, 0, tw * block, th * block)
      ctx.restore()
      return
    }
    default: {
      // Phóng to theo nhịp
      const snap = snapshot(env, 'cam-snap')
      putTransformed(env, snap, 1 + 0.14 * k)
    }
  }
}

/** Phóng mờ: cộng dồn nhiều bản phóng to dần (ở nửa độ phân giải cho nhanh), phủ lên theo độ mạnh */
function drawZoomBlur(env: RenderEnv, k: number): void {
  if (k < 0.02) return
  const snap = snapshot(env, 'cam-zb-src', 0.5)
  const acc = surface(env, 'cam-zb', snap.w, snap.h)
  const c = acc.ctx
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.globalAlpha = 1
  c.globalCompositeOperation = 'copy'
  c.drawImage(snap.s.canvas, 0, 0)
  c.globalCompositeOperation = 'source-over'
  for (let i = 1; i <= 5; i++) {
    const s = 1 + 0.035 * i * k
    c.globalAlpha = 1 / (i + 1)
    c.setTransform(s, 0, 0, s, (snap.w * (1 - s)) / 2, (snap.h * (1 - s)) / 2)
    c.drawImage(snap.s.canvas, 0, 0)
  }
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.globalAlpha = 1
  const { ctx } = env
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.filter = 'none'
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = clamp(k * 1.6)
  ctx.drawImage(acc.canvas, 0, 0, snap.w, snap.h, 0, 0, snap.dw, snap.dh)
  ctx.restore()
}

/** Soi gương: giữ một nửa khung hình, nửa kia là ảnh phản chiếu */
function drawMirror(env: RenderEnv, p: CameraProps): void {
  if (env.fade < 0.004) return
  const snap = snapshot(env, 'cam-snap')
  const { dw, dh } = snap
  const { ctx } = env
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.filter = 'none'
  ctx.globalAlpha = env.fade
  ctx.globalCompositeOperation = 'source-over'
  const hw = Math.ceil(dw / 2)
  const hh = Math.ceil(dh / 2)
  switch (p.mirror) {
    case 'right':
      // Nửa phải lật sang trái
      ctx.translate(dw, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(snap.s.canvas, dw - hw, 0, hw, dh, dw - hw, 0, hw, dh)
      break
    case 'top':
      ctx.translate(0, dh)
      ctx.scale(1, -1)
      ctx.drawImage(snap.s.canvas, 0, 0, dw, hh, 0, 0, dw, hh)
      break
    case 'bottom':
      ctx.translate(0, dh)
      ctx.scale(1, -1)
      ctx.drawImage(snap.s.canvas, 0, dh - hh, dw, hh, 0, dh - hh, dw, hh)
      break
    default:
      // Nửa trái lật sang phải
      ctx.translate(dw, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(snap.s.canvas, 0, 0, hw, dh, 0, 0, hw, dh)
  }
  ctx.restore()
}

/**
 * Kính vạn hoa: các cánh hình quạt quanh tâm, cánh liền kề lật đối xứng; hình bên trong xoay chậm. Hình được
 * phóng to quanh tâm để xoay thế nào cũng phủ kín cánh (không hở góc).
 */
function drawKaleido(env: RenderEnv, p: CameraProps): void {
  if (env.fade < 0.004) return
  const snap = snapshot(env, 'cam-snap')
  const { dw, dh } = snap
  const n = Math.max(4, Math.min(16, Math.round(p.segments / 2) * 2))
  const half = Math.PI / n
  const R = Math.hypot(dw, dh)
  const spin = (p.spin / 60) * Math.PI * 2 * env.t
  const zoom = R / Math.min(dw, dh)
  const { ctx } = env
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.filter = 'none'
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = env.fade
  for (let i = 0; i < n; i++) {
    ctx.save()
    ctx.translate(dw / 2, dh / 2)
    ctx.rotate(i * 2 * half)
    if (i % 2) ctx.scale(1, -1)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    // Phủ chồng một chút để không hở đường nối giữa các cánh
    ctx.arc(0, 0, R, -half - 0.004, half + 0.004)
    ctx.closePath()
    ctx.clip()
    ctx.rotate(spin)
    ctx.scale(zoom, zoom)
    ctx.drawImage(snap.s.canvas, -dw / 2, -dh / 2)
    ctx.restore()
  }
  ctx.restore()
}

/** Viền điện ảnh: dải đen trên / dưới (hoặc hai bên) cho phần giữa đúng tỉ lệ `ratio`, trượt vào / ra */
function drawBars(env: RenderEnv, p: CameraProps): void {
  const { ctx, W, H, t, timing } = env
  let k = 1
  if (p.slideIn > 0) {
    k = easeOutCubic((t - timing.start) / p.slideIn)
    if (timing.end !== null) k = Math.min(k, easeOutCubic((timing.end - t) / p.slideIn))
  }
  if (k <= 0) return
  const ratio = Math.max(0.3, p.ratio)
  ctx.globalAlpha = env.fade
  ctx.fillStyle = p.barColor
  if (W / H < ratio) {
    const bar = ((H - W / ratio) / 2) * k
    ctx.fillRect(0, 0, W, bar)
    ctx.fillRect(0, H - bar, W, bar)
  } else {
    const bar = ((W - H * ratio) / 2) * k
    ctx.fillRect(0, 0, bar, H)
    ctx.fillRect(W - bar, 0, bar, H)
  }
}
