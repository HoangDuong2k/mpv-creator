import { BAND_COUNT, WAVE_POINTS, freqToBandPos } from '../../shared/featureFormat'
import type { VisualizerProps } from '../../shared/types'
import { cached, recordBounds, type RenderEnv } from '../env'
import { clamp, lerp, mixColor, sourceSize } from '../util'
import { bassPulse } from './background'

/** smoothing 0..1 → tốc độ rơi của cột (1/giây) */
export function falloffFromSmoothing(smoothing: number): number {
  return lerp(30, 2.5, clamp(smoothing))
}

/**
 * Giá trị 0..1 cho từng cột, lấy từ phổ 64 dải theo thang tần số log.
 * symmetric: tần số thấp ở giữa, toả đều ra hai bên.
 */
function barValues(env: RenderEnv, p: VisualizerProps, count: number, falloff = falloffFromSmoothing(p.smoothing), buffer = 'viz-spectrum'): Float32Array {
  const spectrum = env.audio.bands(env.t, cached(env, buffer, () => new Float32Array(BAND_COUNT)), falloff)
  const out = new Float32Array(count)
  const half = p.symmetric ? Math.ceil(count / 2) : count
  const lo = Math.max(1, Math.min(p.minFreq, p.maxFreq - 1))
  const hi = Math.max(lo + 1, p.maxFreq)
  for (let j = 0; j < half; j++) {
    const f = lo * Math.pow(hi / lo, half === 1 ? 0 : j / (half - 1))
    const pos = clamp(freqToBandPos(f), 0, BAND_COUNT - 1)
    const i0 = Math.floor(pos)
    const i1 = Math.min(BAND_COUNT - 1, i0 + 1)
    const v = lerp(spectrum[i0], spectrum[i1], pos - i0)
    // Đường cong nhẹ để cột nhỏ không "chết", cột lớn không kịch trần liên tục
    const shaped = clamp(Math.pow(clamp(v * p.sensitivity), 1.35))
    if (p.symmetric) {
      out[half - 1 - j] = shaped
      out[count - half + j] = shaped
    } else out[j] = shaped
  }
  return out
}

function barColor(p: VisualizerProps, i: number, n: number, t: number): string {
  if (p.colorMode === 'rainbow') return `hsl(${Math.round((i / n) * 300 + t * 25) % 360}, 90%, 60%)`
  if (p.colorMode === 'gradient') return mixColor(p.color, p.color2, n <= 1 ? 0 : i / (n - 1))
  return p.color
}

function setGlow(env: RenderEnv, p: VisualizerProps): void {
  if (p.glow > 0) {
    env.ctx.shadowBlur = p.glow * env.S * env.px
    env.ctx.shadowColor = p.color
  }
}

function drawBars(env: RenderEnv, p: VisualizerProps, mirror: boolean): void {
  const { ctx, W, H, S } = env
  const n = Math.max(2, Math.round(p.barCount))
  const values = barValues(env, p, n)
  const bw = p.width * W
  const bh = p.height * H
  const left = p.x * W - bw / 2
  const step = bw / n
  const barW = Math.max(1, step * (1 - clamp(p.barGap, 0, 0.95)))
  const minH = Math.max(2 * S, barW * (p.rounded ? 1 : 0.3))
  // flip: cột mọc từ mép trên xuống dưới
  const down = !mirror && p.flip
  const baseY = mirror ? p.y * H : down ? p.y * H - bh / 2 : p.y * H + bh / 2
  const radius = p.rounded ? barW / 2 : 0
  recordBounds(env, left, p.y * H - bh / 2, bw, bh)

  if (p.colorMode === 'gradient') {
    const g = mirror
      ? ctx.createLinearGradient(0, baseY - bh / 2, 0, baseY + bh / 2)
      : ctx.createLinearGradient(0, baseY, 0, down ? baseY + bh : baseY - bh)
    if (mirror) {
      g.addColorStop(0, p.color2)
      g.addColorStop(0.5, p.color)
      g.addColorStop(1, p.color2)
    } else {
      g.addColorStop(0, p.color)
      g.addColorStop(1, p.color2)
    }
    ctx.fillStyle = g
  } else ctx.fillStyle = p.color
  setGlow(env, p)

  const perBarColor = p.colorMode === 'rainbow'
  if (!perBarColor) ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const h = Math.max(minH, values[i] * bh)
    const x = left + i * step + (step - barW) / 2
    const y = mirror ? baseY - h / 2 : down ? baseY : baseY - h
    if (perBarColor) {
      ctx.fillStyle = barColor(p, i, n, env.t)
      ctx.beginPath()
    }
    if (radius > 0) ctx.roundRect(x, y, barW, h, Math.min(radius, h / 2))
    else ctx.rect(x, y, barW, h)
    if (perBarColor) ctx.fill()
  }
  if (!perBarColor) ctx.fill()
}

function strokeStyleFor(env: RenderEnv, p: VisualizerProps, x0: number, x1: number): string | CanvasGradient {
  if (p.colorMode === 'solid') return p.color
  const g = env.ctx.createLinearGradient(x0, 0, x1, 0)
  if (p.colorMode === 'gradient') {
    g.addColorStop(0, p.color)
    g.addColorStop(0.5, p.color2)
    g.addColorStop(1, p.color)
  } else {
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${Math.round(i * 60 + env.t * 25) % 360}, 90%, 60%)`)
  }
  return g
}

function drawWave(env: RenderEnv, p: VisualizerProps): void {
  const { ctx, W, H, S } = env
  const wave = env.audio.wave(env.t)
  const bw = p.width * W
  const amp = (p.height * H) / 2
  const left = p.x * W - bw / 2
  const cy = p.y * H
  const gain = p.sensitivity * 1.2 * (p.flip ? -1 : 1)
  recordBounds(env, left, cy - amp, bw, amp * 2)
  ctx.lineWidth = Math.max(1, p.lineWidth * S)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = strokeStyleFor(env, p, left, left + bw)
  setGlow(env, p)
  ctx.beginPath()
  for (let i = 0; i < WAVE_POINTS; i++) {
    // Làm mỏng hai đầu để đường sóng "khép" lại đẹp hơn
    const edge = Math.sin((Math.PI * i) / (WAVE_POINTS - 1))
    const x = left + (bw * i) / (WAVE_POINTS - 1)
    const y = cy + clamp(wave[i] * gain, -1, 1) * amp * edge
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

function drawArea(env: RenderEnv, p: VisualizerProps): void {
  const { ctx, W, H } = env
  const n = Math.max(8, Math.round(p.barCount))
  const values = barValues(env, p, n)
  const bw = p.width * W
  const half = (p.height * H) / 2
  const left = p.x * W - bw / 2
  const cy = p.y * H
  recordBounds(env, left, cy - half, bw, half * 2)
  const pts: Array<[number, number]> = []
  for (let i = 0; i < n; i++) {
    const edge = Math.pow(Math.sin((Math.PI * (i + 0.5)) / n), 0.5)
    pts.push([left + (bw * (i + 0.5)) / n, values[i] * half * edge])
  }
  const trace = (sign: number): void => {
    ctx.lineTo(pts[0][0], cy + sign * pts[0][1])
    for (let i = 0; i < n - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2
      const my = cy + (sign * (pts[i][1] + pts[i + 1][1])) / 2
      ctx.quadraticCurveTo(pts[i][0], cy + sign * pts[i][1], mx, my)
    }
    ctx.lineTo(pts[n - 1][0], cy + sign * pts[n - 1][1])
  }
  ctx.beginPath()
  ctx.moveTo(left, cy)
  trace(-1)
  ctx.lineTo(left + bw, cy)
  // Nửa dưới: đi ngược lại
  for (let i = n - 1; i > 0; i--) {
    const mx = (pts[i][0] + pts[i - 1][0]) / 2
    const my = cy + (pts[i][1] + pts[i - 1][1]) / 2
    ctx.quadraticCurveTo(pts[i][0], cy + pts[i][1], mx, my)
  }
  ctx.lineTo(pts[0][0], cy + pts[0][1])
  ctx.closePath()
  ctx.fillStyle = strokeStyleFor(env, p, left, left + bw)
  setGlow(env, p)
  ctx.fill()
}

function drawCircle(env: RenderEnv, p: VisualizerProps): void {
  const { ctx, W, H, S, t } = env
  const M = Math.min(W, H)
  const cx = p.x * W
  const cy = p.y * H
  const pulse = p.centerBeat > 0 ? bassPulse(env) : 0
  const R = p.radius * M * (1 + p.centerBeat * pulse)
  const maxLen = p.height * M * 0.6
  const n = Math.max(8, Math.round(p.barCount))
  const values = barValues(env, { ...p, symmetric: true }, n)
  const outer = p.radius * M + 6 * S + maxLen
  recordBounds(env, cx - outer, cy - outer, outer * 2, outer * 2)
  // flip: tần số thấp ở phía trên vòng tròn thay vì phía dưới
  const spin = ((p.rotateSpeed * t) / 180) * Math.PI
  const rot = spin - Math.PI / 2 + (p.flip ? Math.PI : 0)
  const barW = Math.max(1.5 * S, ((2 * Math.PI * R) / n) * (1 - clamp(p.barGap, 0, 0.95)))

  // Ảnh ở tâm
  const imgPath = p.centerImage === 'cover' ? env.entry?.track.coverPath : p.centerImage === 'custom' ? p.centerSrc : undefined
  const img = imgPath ? env.assets.image(imgPath) : null
  if (p.centerImage !== 'none') {
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R * 0.92, 0, Math.PI * 2)
    ctx.closePath()
    if (img) {
      ctx.clip()
      const { width: iw, height: ih } = sourceSize(img)
      const s = (R * 1.84) / Math.min(iw, ih)
      ctx.translate(cx, cy)
      ctx.rotate(spin)
      ctx.drawImage(img, (-iw * s) / 2, (-ih * s) / 2, iw * s, ih * s)
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.fill()
    }
    ctx.restore()
  }

  setGlow(env, p)
  ctx.lineCap = p.rounded ? 'round' : 'butt'
  ctx.lineWidth = barW
  const inner = R + 6 * S
  const perBar = p.colorMode !== 'solid'
  if (!perBar) {
    ctx.strokeStyle = p.color
    ctx.beginPath()
  }
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2
    const len = Math.max(2 * S, values[i] * maxLen)
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    if (perBar) {
      // Màu đổi dần quanh vòng tròn và khép kín (đầu = cuối)
      const k = 1 - Math.abs((i / n) * 2 - 1)
      ctx.strokeStyle = p.colorMode === 'rainbow' ? barColor(p, i, n, t) : mixColor(p.color, p.color2, k)
      ctx.beginPath()
    }
    ctx.moveTo(cx + cos * inner, cy + sin * inner)
    ctx.lineTo(cx + cos * (inner + len), cy + sin * (inner + len))
    if (perBar) ctx.stroke()
  }
  if (!perBar) ctx.stroke()

  // Viền tròn quanh ảnh
  ctx.shadowBlur = 0
  ctx.lineWidth = Math.max(1, 3 * S)
  ctx.strokeStyle = p.color
  ctx.beginPath()
  ctx.arc(cx, cy, R * 0.92 + ctx.lineWidth / 2, 0, Math.PI * 2)
  ctx.stroke()
}

/** Màu của ô LED thứ `seg` (từ dưới lên) ở cột `i` */
function ledColor(p: VisualizerProps, seg: number, segs: number, i: number, n: number, t: number): string {
  const f = segs <= 1 ? 0 : seg / (segs - 1)
  if (p.ledPalette === 'hifi') return f < 0.62 ? '#3ddc84' : f < 0.86 ? '#ffd23f' : '#ff453a'
  if (p.colorMode === 'rainbow') return barColor(p, i, n, t)
  if (p.colorMode === 'gradient') return mixColor(p.color, p.color2, f)
  return p.color
}

/**
 * Equalizer LED: mỗi cột ghép từ các ô sáng như dàn hi-fi, ô chưa sáng vẫn hiện mờ;
 * giữ đỉnh: một ô sáng ở mức cao nhất vừa đạt rồi rơi chậm.
 */
function drawLed(env: RenderEnv, p: VisualizerProps): void {
  const { ctx, W, H, t } = env
  const n = Math.max(2, Math.round(p.barCount))
  const values = barValues(env, p, n)
  const peaks = p.peakHold ? barValues(env, p, n, 1.4, 'viz-spectrum-peak') : null
  const segs = Math.max(4, Math.min(48, Math.round(p.ledSegments)))
  const bw = p.width * W
  const bh = p.height * H
  const left = p.x * W - bw / 2
  const step = bw / n
  const colW = Math.max(1, step * (1 - clamp(p.barGap, 0, 0.9)))
  const segH = bh / segs
  const blockH = Math.max(1, segH * 0.72)
  const top = p.y * H - bh / 2
  recordBounds(env, left, top, bw, bh)
  const base = ctx.globalAlpha
  // Gom các ô cùng màu, cùng trạng thái vào một lần tô
  const groups = new Map<string, Array<[number, number]>>()
  for (let i = 0; i < n; i++) {
    const lit = Math.round(values[i] * segs)
    const peak = peaks ? Math.min(segs - 1, Math.floor(peaks[i] * segs)) : -1
    const x = left + i * step + (step - colW) / 2
    for (let sgi = 0; sgi < segs; sgi++) {
      const on = sgi < lit || sgi === peak
      const y = p.flip ? top + sgi * segH + (segH - blockH) / 2 : top + bh - (sgi + 1) * segH + (segH - blockH) / 2
      const key = `${on ? 1 : 0}|${ledColor(p, sgi, segs, i, n, t)}`
      let list = groups.get(key)
      if (!list) groups.set(key, (list = []))
      list.push([x, y])
    }
  }
  const r = Math.min(colW, blockH) * 0.18
  for (const [key, cells] of groups) {
    const on = key.startsWith('1')
    ctx.fillStyle = key.slice(2)
    ctx.globalAlpha = base * (on ? 1 : 0.1)
    if (on) setGlow(env, { ...p, color: key.slice(2) })
    else ctx.shadowBlur = 0
    ctx.beginPath()
    for (const [x, y] of cells) ctx.roundRect(x, y, colW, blockH, r)
    ctx.fill()
  }
  ctx.shadowBlur = 0
  ctx.globalAlpha = base
}

export function drawVisualizer(env: RenderEnv, p: VisualizerProps): void {
  env.ctx.globalAlpha = clamp(p.opacity) * env.fade
  switch (p.style) {
    case 'bars':
      drawBars(env, p, false)
      break
    case 'mirror':
      drawBars(env, p, true)
      break
    case 'wave':
      drawWave(env, p)
      break
    case 'area':
      drawArea(env, p)
      break
    case 'circle':
      drawCircle(env, p)
      break
    case 'led':
      drawLed(env, p)
      break
  }
}
