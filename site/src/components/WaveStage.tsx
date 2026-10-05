/**
 * Dải sóng dưới đầu trang (island): đường sóng âm (kiểu "wave" của lớp cột sóng) vẽ bằng chính engine hiệu ứng của
 * app, theo dữ liệu nhạc mẫu có nhịp 118 BPM của engine, kèm hai đường dư ảnh mờ dần chạy trễ phía sau.
 * Nét đường cần sắc nên vẽ đủ độ nét màn hình (tối đa 2×); đường rẻ hơn nhiều so với cột nên vẫn nhẹ: 30 khung
 * hình/giây, chỉ chạy khi đang thấy trên màn hình (dừng khi cuộn đi hoặc đổi tab); máy vẽ chậm (trung bình quá
 * 10 ms một khung hình) tự hạ còn 15 khung hình/giây, bỏ quầng sáng; người bật "giảm chuyển động" chỉ thấy một
 * khung hình đứng yên.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { drawVisualizer } from '../../../src/engine/layers/visualizer'
import type { VisualizerProps } from '../../../src/shared/types'
import { createEngineEnv, seekEnv } from './engineEnv'

/** Khung toạ độ như video 1080p: cột sóng có đúng tỉ lệ, độ dày, độ phát sáng như trong video */
const W = 1920
const H = 1080
/** Độ dài đoạn nhạc mẫu (giây), chạy lặp */
const LOOP = 24
const FPS = 30

/**
 * Đường dư ảnh phía sau đường chính: trễ `lag` giây (sóng mẫu trôi ngang theo thời gian nên các đường so le nhau),
 * mờ và mảnh hơn. Đường chính vẽ sau cùng.
 */
const TRAILS = [
  { lag: 0.26, alpha: 0.2, width: 0.6 },
  { lag: 0.13, alpha: 0.42, width: 0.8 },
  { lag: 0, alpha: 1, width: 1 }
]

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
    sensitivity: 1.15,
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

export function WaveStage(): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const lite = window.matchMedia('(max-width: 640px)').matches
    const props = waveProps(lite)
    const env = createEngineEnv(ctx, W, H, FPS, LOOP)
    let scale = 1
    // Đường sóng vẽ lên canvas phụ, rồi chép ra hai lần: một lần làm mờ (quầng sáng), một lần sắc nét
    const lines = document.createElement('canvas')
    const linesCtx = lines.getContext('2d')!
    env.ctx = linesCtx
    let blur = 10
    /** Máy vẽ chậm (không có GPU, máy yếu): 15 khung hình/giây, bỏ quầng sáng */
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
      linesCtx.setTransform(1, 0, 0, 1, 0, 0)
      linesCtx.clearRect(0, 0, lines.width, lines.height)
      // Chỉ hiện dải giữa khung 1080p (chỗ đường sóng) ở giữa canvas
      linesCtx.setTransform(scale, 0, 0, scale, 0, lines.height / 2 - props.y * H * scale)
      env.px = scale
      for (const trail of TRAILS) {
        seekEnv(env, (t - trail.lag + LOOP) % LOOP)
        linesCtx.save()
        linesCtx.globalAlpha = trail.alpha
        drawVisualizer(env, { ...props, lineWidth: props.lineWidth * trail.width })
        linesCtx.restore()
      }
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

    let raf = 0
    let last = 0
    let running = false
    let frames = 0
    /** Thời gian vẽ trung bình một khung hình (ms) */
    let cost = 0
    const start = performance.now()
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop)
      if (now - last < 1000 / (slow ? 15 : FPS) - 2) return
      last = now
      const t0 = performance.now()
      draw(((now - start) / 1000) % LOOP)
      cost = cost * 0.9 + (performance.now() - t0) * 0.1
      if (!slow && ++frames > 30 && cost > 10) slow = true
    }
    const run = (on: boolean): void => {
      if (on === running) return
      running = on
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
