/**
 * Dải cột sóng dưới đầu trang (island): vẽ bằng chính engine hiệu ứng của app (lớp cột sóng kiểu "mirror" như mẫu
 * EDM), theo dữ liệu nhạc mẫu có nhịp 118 BPM của engine, nên trông giống hệt cột sóng trong video app xuất ra.
 * Nhẹ: 24 khung hình/giây, chỉ chạy khi đang thấy trên màn hình (dừng khi cuộn đi hoặc đổi tab), canvas vẽ ở
 * 0,75× (điện thoại tối đa 1,25× và ít cột hơn); máy vẽ chậm (trung bình quá 10 ms một khung hình) tự hạ còn 15 khung hình/giây,
 * bỏ quầng sáng; người bật "giảm chuyển động" chỉ thấy một khung hình đứng yên.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { AudioSampler } from '../../../src/engine/audio'
import { createDemoFeatures, DEMO_KEY } from '../../../src/engine/demoAudio'
import type { EngineAssets, RenderEnv } from '../../../src/engine/env'
import { drawVisualizer } from '../../../src/engine/layers/visualizer'
import { buildTimeline, entryAt } from '../../../src/shared/timeline'
import type { Project, Track, VisualizerProps } from '../../../src/shared/types'

/** Khung toạ độ như video 1080p: cột sóng có đúng tỉ lệ, độ dày, độ phát sáng như trong video */
const W = 1920
const H = 1080
/** Độ dài đoạn nhạc mẫu (giây), chạy lặp */
const LOOP = 24
/** Đủ mượt cho cột sóng; quầng sáng (shadowBlur) là phần tốn nhất nên giữ số khung hình vừa phải */
const FPS = 24

/** Cột sóng đối xứng như mẫu EDM, màu theo dải màu nhấn của trang (xanh → tím) */
function waveProps(lite: boolean): VisualizerProps {
  return {
    style: 'mirror',
    x: 0.5,
    y: 0.5,
    width: 1,
    // Điện thoại: khung 1920 thu nhỏ nhiều nên cột cao hơn để vẫn rõ
    height: lite ? 0.55 : 0.24,
    radius: 0.16,
    barCount: lite ? 48 : 96,
    barGap: 0.45,
    rounded: true,
    colorMode: 'gradient',
    color: '#62d0ff',
    color2: '#b48cff',
    // Quầng sáng không vẽ riêng từng cột (shadowBlur, tốn) mà làm mờ cả dải một lần, xem draw()
    glow: 0,
    lineWidth: 4,
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

/** Môi trường vẽ tối thiểu cho một lớp của engine (không có nền, không có ảnh / video) */
function createEnv(ctx: CanvasRenderingContext2D): RenderEnv {
  const track: Track = { id: 'site', path: 'site', title: '', artist: '', album: '', duration: LOOP, analysisKey: DEMO_KEY, trimStart: 0, trimEnd: 0 }
  const settings = { width: W, height: H, fps: FPS, transition: { type: 'gap', duration: 0 }, fadeIn: 0, fadeOut: 0 } as Project['settings']
  const timeline = buildTimeline([track], settings)
  const features = createDemoFeatures(LOOP)
  const assets: EngineAssets = {
    image: () => null,
    video: () => null,
    createSurface: (w, h) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      return { canvas, ctx: canvas.getContext('2d')! }
    },
    path2d: (d) => new Path2D(d)
  }
  return {
    ctx,
    project: { tracks: [track], layers: [], settings } as unknown as Project,
    timeline,
    audio: new AudioSampler(timeline, (k) => (k === DEMO_KEY ? features : undefined)),
    assets,
    cache: new Map(),
    t: 0,
    W,
    H,
    S: 1,
    px: 1,
    entry: entryAt(timeline, 0),
    layerId: 'site-wave',
    timing: { start: 0, end: null, fadeIn: 0, fadeOut: 0 },
    fade: 1,
    editLayerId: null,
    bounds: new Map(),
    bake: null,
    fastBackground: true
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
    const env = createEnv(ctx)
    let scale = 1
    // Cột sóng vẽ lên canvas phụ, rồi chép ra hai lần: một lần làm mờ (quầng sáng), một lần sắc nét
    const bars = document.createElement('canvas')
    const barsCtx = bars.getContext('2d')!
    env.ctx = barsCtx
    let blur = 10
    /** Máy vẽ chậm (không có GPU, máy yếu): 15 khung hình/giây, bỏ quầng sáng */
    let slow = false

    const resize = (): void => {
      // Quầng sáng mềm nên không cần độ nét cao: máy tính vẽ ở 0,75× rồi phóng lên (nhìn gần như không khác,
      // nhẹ hơn gần một nửa), điện thoại (canvas nhỏ) tối đa 1,25×
      const dpr = lite ? Math.min(window.devicePixelRatio || 1, 1.25) : 0.75
      canvas.width = bars.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = bars.height = Math.round(canvas.clientHeight * dpr)
      scale = canvas.width / W
      blur = Math.max(4, Math.round((lite ? 6 : 10) * dpr))
    }
    const draw = (t: number): void => {
      barsCtx.setTransform(1, 0, 0, 1, 0, 0)
      barsCtx.clearRect(0, 0, bars.width, bars.height)
      // Chỉ hiện dải giữa khung 1080p (chỗ cột sóng) ở giữa canvas
      barsCtx.setTransform(scale, 0, 0, scale, 0, bars.height / 2 - props.y * H * scale)
      env.t = t
      env.px = scale
      env.entry = entryAt(env.timeline, t)
      barsCtx.save()
      drawVisualizer(env, props)
      barsCtx.restore()
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (!slow) {
        ctx.filter = `blur(${blur}px)`
        ctx.globalAlpha = 0.85
        ctx.drawImage(bars, 0, 0)
        ctx.filter = 'none'
        ctx.globalAlpha = 1
      }
      ctx.drawImage(bars, 0, 0)
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
