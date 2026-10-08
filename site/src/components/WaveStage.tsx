/**
 * Dải sóng dưới đầu trang (island): đường sóng âm (kiểu "wave" của lớp cột sóng) vẽ bằng chính engine hiệu ứng của
 * app, kèm hai đường dư ảnh mờ dần chạy trễ phía sau.
 *
 * Dạng sóng tính liên tục theo thời gian (ba sóng sin trôi chậm ngược chiều nhau, biên độ "thở" theo một nhịp chậm),
 * không lấy từ dữ liệu nhạc mẫu theo từng bước 1/60 giây, nên chuyển động mượt ở mọi tốc độ khung hình.
 *
 * Như một dây đàn: rê chuột chạm (hoặc lướt qua) đường sóng thì dây dính theo con trỏ; kéo quá xa hay rời khỏi dải
 * thì dây bật ra, rung rồi lan sóng sang hai bên (mô phỏng dây rung, bước 1/240 giây). Đường dư ảnh lặp lại cú rung
 * trễ hơn một nhịp.
 *
 * Nhẹ: tối đa 60 khung hình/giây, chỉ chạy khi đang thấy trên màn hình (dừng khi cuộn đi hoặc đổi tab); máy vẽ chậm
 * (trung bình quá 10 ms một khung hình) tự hạ còn 30 khung hình/giây, bỏ quầng sáng; người bật "giảm chuyển động"
 * chỉ thấy một khung hình đứng yên, không tương tác.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import type { AudioSampler } from '../../../src/engine/audio'
import { drawVisualizer } from '../../../src/engine/layers/visualizer'
import { WAVE_POINTS } from '../../../src/shared/featureFormat'
import type { VisualizerProps } from '../../../src/shared/types'
import { createEngineEnv, seekEnv } from './engineEnv'
import { pointer, trackPointer } from './pointer'

/** Khung toạ độ như video 1080p: đường sóng có đúng tỉ lệ, độ dày như trong video */
const W = 1920
const H = 1080
const N = WAVE_POINTS
const FPS = 60
const TAU = Math.PI * 2

/**
 * Đường dư ảnh phía sau đường chính: trễ `lag` giây (sóng trôi ngang theo thời gian nên các đường so le nhau),
 * mờ và mảnh hơn. Đường chính vẽ sau cùng.
 */
const TRAILS = [
  { lag: 0.8, alpha: 0.2, width: 0.6 },
  { lag: 0.4, alpha: 0.42, width: 0.8 },
  { lag: 0, alpha: 1, width: 1 }
]

/** Dây rung (đơn vị: một nút = một điểm của đường sóng): tốc độ lan sóng, lực kéo về, độ tắt dần */
const WAVE_SPEED = 140
const REST = 30
const DAMPING = 2.4
/** Lực dính của con trỏ và độ rộng chỗ bị kéo (số nút) */
const GRIP = 2500
const GRIP_WIDTH = 2.2
const STEP = 1 / 240
/** Số khung hình nhớ lại để vẽ dư ảnh (đủ ~1 giây ở 60 khung hình/giây) */
const HISTORY = 72

/** Đường sóng âm, màu theo dải màu nhấn của trang (xanh → tím → xanh) */
function waveProps(lite: boolean): VisualizerProps {
  return {
    style: 'wave',
    x: 0.5,
    y: 0.5,
    width: 1,
    // Điện thoại: khung 1920 thu nhỏ nhiều nên sóng cao hơn, nét dày hơn để vẫn rõ
    height: lite ? 0.55 : 0.26,
    radius: 0.16,
    barCount: 96,
    barGap: 0.45,
    rounded: true,
    colorMode: 'gradient',
    color: '#62d0ff',
    color2: '#b48cff',
    // Quầng sáng không dùng shadowBlur mà làm mờ cả dải một lần, xem draw()
    glow: 0,
    lineWidth: lite ? 9 : 4,
    sensitivity: 1,
    smoothing: 0.55,
    minFreq: 40,
    maxFreq: 12000,
    opacity: 1,
    symmetric: true,
    flip: false,
    centerImage: 'none',
    centerSrc: '',
    centerBeat: 0,
    rotateSpeed: 0,
    ledSegments: 18,
    ledPalette: 'theme',
    peakHold: false
  }
}

/** Engine nhân giá trị sóng với hệ số này (sensitivity × 1,2) rồi cắt trong ±1 biên độ */
const GAIN = 1.2

/**
 * Sóng nền tại thời điểm t (giây): ba sóng sin trôi chậm (chừng 0,1–0,2 bề ngang mỗi giây), biên độ thở theo chu kỳ
 * 7 giây và phồng nhẹ theo nhịp 1,25 giây (48 nhịp/phút) với dạng xung tròn trịa, không giật.
 */
function baseWave(out: Float32Array, t: number): void {
  const beat = Math.pow(0.5 + 0.5 * Math.cos((TAU * t) / 1.25), 4)
  const breathe = 0.62 + 0.14 * Math.sin((TAU * t) / 7.3) + 0.12 * beat
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1)
    const shape = 0.5 * Math.sin(TAU * (2.2 * x - 0.45 * t)) + 0.3 * Math.sin(TAU * (4.6 * x + 0.6 * t) + 1.1) + 0.2 * Math.sin(TAU * (8.3 * x - 0.9 * t) + 2.4)
    const spread = 0.78 + 0.22 * Math.sin(TAU * (1.1 * x + 0.07 * t))
    out[i] = 0.56 * breathe * spread * shape
  }
}

/** Hình làm mỏng hai đầu đường sóng của engine (đường "khép" lại ở hai mép) */
const edgeAt = (i: number): number => Math.sin((Math.PI * i) / (N - 1))

export function WaveStage(): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const lite = window.matchMedia('(max-width: 640px)').matches
    const props = waveProps(lite)
    const env = createEngineEnv(ctx, W, H, FPS, 24)

    // ---- Dây rung: độ lệch d và vận tốc v của từng nút, cộng lên sóng nền
    const d = new Float32Array(N)
    const v = new Float32Array(N)
    const base = new Float32Array(N)
    const hold = { on: false, node: 0, y: 0, lastSide: 0 }
    // Lịch sử độ lệch (vòng tròn) để đường dư ảnh rung trễ theo
    const hist = Array.from({ length: HISTORY }, () => new Float32Array(N))
    const histT = new Float64Array(HISTORY).fill(-Infinity)
    let head = -1
    const remember = (t: number): void => {
      head = (head + 1) % HISTORY
      hist[head].set(d)
      histT[head] = t
    }
    /** Độ lệch của dây lúc `t` (nội suy giữa hai khung hình đã nhớ); trước lúc nhớ được thì coi như dây đứng yên */
    const sampleAt = (t: number, out: Float32Array): void => {
      let newer = -1
      for (let k = 0; k < HISTORY; k++) {
        const j = (head - k + HISTORY) % HISTORY
        if (histT[j] === -Infinity) break
        if (histT[j] <= t) {
          if (newer < 0) return void out.set(hist[j])
          const f = (t - histT[j]) / Math.max(1e-6, histT[newer] - histT[j])
          for (let i = 0; i < N; i++) out[i] = hist[j][i] + (hist[newer][i] - hist[j][i]) * f
          return
        }
        newer = j
      }
      out.fill(0)
    }

    // Engine vẽ đường sóng từ env.audio.wave(t): thay bằng sóng nền + độ lệch của dây (cùng thời điểm, kể cả dư ảnh)
    const sample = new Float32Array(N)
    const shaped = new Float32Array(N)
    let now = 0
    env.audio = {
      wave(t: number): Float32Array {
        baseWave(shaped, t)
        if (t >= now - 1e-6) sample.set(d)
        else sampleAt(t, sample)
        for (let i = 0; i < N; i++) shaped[i] += sample[i]
        return shaped
      }
    } as unknown as AudioSampler

    /** Bám con trỏ: chạm hoặc lướt qua đường sóng thì giữ dây; kéo quá biên độ hay rời dải thì thả cho dây bật */
    const follow = (): void => {
      if (!pointer.active) {
        hold.on = false
        hold.lastSide = 0
        return
      }
      const rect = canvas.getBoundingClientRect()
      const ampCss = ((props.height * H) / 2) * (rect.width / W)
      const px = (pointer.x - rect.left) / rect.width
      const ny = (pointer.y - (rect.top + rect.height / 2)) / ampCss
      const inside = px > 0.03 && px < 0.97 && Math.abs(ny) < 1.25
      if (!inside) {
        hold.on = false
        hold.lastSide = 0
        return
      }
      const node = px * (N - 1)
      const i = Math.round(node)
      const lineY = Math.max(-1, Math.min(1, (base[i] + d[i]) * GAIN)) * edgeAt(i)
      const side = Math.sign(ny - lineY)
      if (!hold.on && (Math.abs(ny - lineY) < 0.22 || (hold.lastSide !== 0 && side !== hold.lastSide))) hold.on = true
      hold.lastSide = side
      if (hold.on && Math.abs(ny) > 0.95) {
        // Kéo quá xa: dây tuột khỏi tay, bật lại
        hold.on = false
        hold.lastSide = 0
      }
      hold.node = node
      hold.y = ny
    }

    /** Một bước mô phỏng dây rung (Euler bán ẩn); hai đầu dây cố định */
    const C2 = WAVE_SPEED * WAVE_SPEED
    const physics = (dt: number): void => {
      for (let i = 1; i < N - 1; i++) {
        let a = C2 * (d[i - 1] + d[i + 1] - 2 * d[i]) - REST * d[i] - DAMPING * v[i]
        if (hold.on) {
          const k = (i - hold.node) / GRIP_WIDTH
          if (k > -4 && k < 4) {
            const target = hold.y / (GAIN * Math.max(0.25, edgeAt(i))) - base[i]
            a += GRIP * Math.exp(-0.5 * k * k) * (target - d[i])
          }
        }
        v[i] += a * dt
      }
      for (let i = 1; i < N - 1; i++) d[i] = Math.max(-1.4, Math.min(1.4, d[i] + v[i] * dt))
    }

    let scale = 1
    // Đường sóng vẽ lên canvas phụ, rồi chép ra hai lần: một lần làm mờ (quầng sáng), một lần sắc nét
    const lines = document.createElement('canvas')
    const linesCtx = lines.getContext('2d')!
    env.ctx = linesCtx
    let blur = 10
    /** Máy vẽ chậm (không có GPU, máy yếu): 30 khung hình/giây, bỏ quầng sáng */
    let slow = false

    const resize = (): void => {
      // Đường mảnh phải vẽ đủ độ nét màn hình, phóng canvas nhỏ lên là nét bị nhoè, răng cưa
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = lines.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = lines.height = Math.round(canvas.clientHeight * dpr)
      scale = canvas.width / W
      blur = Math.max(4, Math.round((lite ? 5 : 8) * dpr))
    }
    const draw = (t: number): void => {
      now = t
      baseWave(base, t)
      linesCtx.setTransform(1, 0, 0, 1, 0, 0)
      linesCtx.clearRect(0, 0, lines.width, lines.height)
      // Chỉ hiện dải giữa khung 1080p (chỗ đường sóng) ở giữa canvas
      linesCtx.setTransform(scale, 0, 0, scale, 0, lines.height / 2 - props.y * H * scale)
      env.px = scale
      for (const trail of TRAILS) {
        seekEnv(env, t - trail.lag)
        // Engine tự đặt globalAlpha = opacity × fade: độ mờ của dư ảnh phải đi qua fade
        env.fade = trail.alpha
        linesCtx.save()
        drawVisualizer(env, { ...props, lineWidth: props.lineWidth * trail.width })
        linesCtx.restore()
      }
      env.fade = 1
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (!slow) {
        ctx.filter = `blur(${blur}px)`
        ctx.globalAlpha = 0.9
        ctx.drawImage(lines, 0, 0)
        ctx.filter = 'none'
        ctx.globalAlpha = 1
      }
      ctx.drawImage(lines, 0, 0)
    }

    resize()
    if (reduce) {
      // Giảm chuyển động: một khung hình đứng yên, vẽ lại khi đổi cỡ (đổi cỡ canvas xoá hình đã vẽ)
      draw(6.3)
      const sizedStill = new ResizeObserver(() => {
        resize()
        draw(6.3)
      })
      sizedStill.observe(canvas)
      return () => sizedStill.disconnect()
    }

    trackPointer()
    let raf = 0
    let last = 0
    let running = false
    let frames = 0
    /** Thời gian vẽ trung bình một khung hình (ms) */
    let cost = 0
    /** Đồng hồ của hiệu ứng (giây): chỉ chạy khi đang vẽ, dừng lúc cuộn đi */
    let clock = 0
    let carry = 0
    const loop = (ts: number): void => {
      raf = requestAnimationFrame(loop)
      if (last && ts - last < 1000 / (slow ? 30 : FPS) - 2) return
      // Lâu không vẽ (vừa quay lại tab): không bù cả quãng, tránh dây "nhảy cóc"
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : 1 / FPS
      last = ts
      const t0 = performance.now()
      follow()
      carry += dt
      while (carry >= STEP) {
        physics(STEP)
        carry -= STEP
      }
      clock += dt
      remember(clock)
      draw(clock)
      cost = cost * 0.9 + (performance.now() - t0) * 0.1
      if (!slow && ++frames > 30 && cost > 10) slow = true
    }
    const run = (on: boolean): void => {
      if (on === running) return
      running = on
      last = 0
      if (on) raf = requestAnimationFrame(loop)
      else cancelAnimationFrame(raf)
    }
    const observer = new IntersectionObserver(([e]) => run(e.isIntersecting), { rootMargin: '100px' })
    observer.observe(canvas)
    const sized = new ResizeObserver(() => resize())
    sized.observe(canvas)
    return () => {
      run(false)
      observer.disconnect()
      sized.disconnect()
    }
  }, [])

  return <canvas ref={ref} className="wave-stage block h-36 w-full sm:h-56" aria-hidden />
}
