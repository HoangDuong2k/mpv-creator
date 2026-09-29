import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cancelPreview, LOOP_LEN, previewImage, renderPreview, type PreviewScene } from '../previewRender'

const SIZES = { small: [256, 144], large: [400, 225] } as const

/**
 * Ảnh xem trước vẽ bằng engine (ảnh tĩnh có cache). Rê chuột lên (hoặc `playing`) thì chạy
 * chuyển động theo nhạc mẫu ngay trong ô.
 */
export function PreviewThumb({ id, build, size = 'small', hover, playing }: { id: string; build: () => PreviewScene; size?: keyof typeof SIZES; hover?: boolean; playing?: boolean }): ReactNode {
  const [w, h] = SIZES[size]
  const [url, setUrl] = useState<string | null>(null)
  const buildRef = useRef(build)
  buildRef.current = build
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animate = !!(hover || playing)

  useEffect(() => {
    let alive = true
    const done = (u: string): void => {
      if (alive) setUrl(u)
    }
    const hit = previewImage(id, () => buildRef.current(), w, h, done)
    setUrl(hit)
    return () => {
      alive = false
      cancelPreview(id, w, h, done)
    }
  }, [id, w, h])

  useEffect(() => {
    const c = canvasRef.current
    if (!animate || !c) return
    const scene = buildRef.current()
    const t0 = performance.now()
    let raf = 0
    const loop = (): void => {
      try {
        renderPreview(c, scene, 0.3 + (((performance.now() - t0) / 1000) % LOOP_LEN))
      } catch {
        return
      }
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [animate, id])

  return (
    <span className="pv-thumb" style={{ aspectRatio: `${w} / ${h}` }}>
      {url ? <img src={url} alt="" draggable={false} /> : <span className="pv-thumb-empty" />}
      {animate && <canvas ref={canvasRef} width={w} height={h} />}
    </span>
  )
}
