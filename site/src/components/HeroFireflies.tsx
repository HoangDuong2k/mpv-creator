/**
 * Đốm sáng lơ lửng sau phần đầu trang (island): lớp hạt kiểu "đom đóm" của engine app, hai màu theo dải màu nhấn
 * (xanh, tím), bay lượn chậm, lúc sáng lúc mờ, mờ dần về phía dưới. Nhẹ: 30 khung hình/giây, ít hạt, chỉ chạy khi
 * đang thấy trên màn hình; máy vẽ chậm tự hạ còn 15 khung hình/giây; người bật "giảm chuyển động" thấy đứng yên.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { drawParticles } from '../../../src/engine/layers/effects'
import type { ParticlesProps } from '../../../src/shared/types'
import { createEngineEnv, seekEnv } from './engineEnv'

const FPS = 30

function fireflies(color: string, count: number, seed: number): ParticlesProps {
  return {
    style: 'fireflies',
    // Vùng nhỏ hơn khung một chút: hạt mờ dần ở mép thay vì biến mất đột ngột
    x: 0.5,
    y: 0.5,
    width: 0.98,
    height: 0.96,
    count,
    size: 2.2,
    speed: 0.5,
    color,
    opacity: 0.7,
    beatReact: 0,
    seed,
    multicolor: false
  }
}

export function HeroFireflies(): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const lite = window.matchMedia('(max-width: 640px)').matches
    const n = lite ? 8 : 16
    const layers = [fireflies('#62d0ff', n, 11), fireflies('#b48cff', n, 23)]
    // Toạ độ engine = px CSS của canvas (hạt có cỡ như nhau trên mọi màn hình)
    const env = createEngineEnv(ctx, 1, 1, FPS, 60)
    let dpr = 1
    /** Máy vẽ chậm: 15 khung hình/giây */
    let slow = false

    const resize = (): void => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = Math.round(canvas.clientHeight * dpr)
      env.W = canvas.clientWidth
      env.H = canvas.clientHeight
    }
    const draw = (t: number): void => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seekEnv(env, t)
      for (const p of layers) {
        ctx.save()
        drawParticles(env, p)
        ctx.restore()
      }
    }

    resize()
    if (reduce) {
      draw(4)
      const sizedStill = new ResizeObserver(() => {
        resize()
        draw(4)
      })
      sizedStill.observe(canvas)
      return () => sizedStill.disconnect()
    }

    let raf = 0
    let last = 0
    let running = false
    let frames = 0
    let cost = 0
    const start = performance.now()
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop)
      if (now - last < 1000 / (slow ? 15 : FPS) - 2) return
      last = now
      const t0 = performance.now()
      draw((now - start) / 1000)
      cost = cost * 0.9 + (performance.now() - t0) * 0.1
      if (!slow && ++frames > 30 && cost > 8) slow = true
    }
    const run = (on: boolean): void => {
      if (on === running) return
      running = on
      if (on) raf = requestAnimationFrame(loop)
      else cancelAnimationFrame(raf)
    }
    const observer = new IntersectionObserver(([e]) => run(e.isIntersecting))
    observer.observe(canvas)
    const sized = new ResizeObserver(() => resize())
    sized.observe(canvas)
    return () => {
      run(false)
      observer.disconnect()
      sized.disconnect()
    }
  }, [])

  return <canvas ref={ref} className="hero-fireflies pointer-events-none absolute inset-x-0 top-0 -z-10 block h-[620px] w-full sm:h-[760px]" aria-hidden />
}
