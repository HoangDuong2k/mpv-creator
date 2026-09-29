// Ảnh thu nhỏ trên thanh timeline: ảnh nền / logo dùng thẳng file ảnh, video nền dùng dải khung hình
// do main process trích bằng FFmpeg (lưu cache).
import { useEffect, useState } from 'react'
import type { Layer } from '../../shared/types'

const strips = new Map<string, Promise<string | null>>()

/** File ảnh / video hiện được trên thanh của lớp này (null: lớp không có ảnh) */
export function thumbSource(layer: Layer): { path: string; video: boolean } | null {
  const p = layer.props as unknown as Record<string, unknown>
  const src = typeof p.src === 'string' ? p.src : ''
  if (!src) return null
  if (layer.type === 'background' && (p.mode === 'image' || p.mode === 'video')) return { path: src, video: p.mode === 'video' }
  if (layer.type === 'image' && p.source === 'file') return { path: src, video: false }
  return null
}

/** URL ảnh thu nhỏ (pvm://…) cho thanh của lớp; video thì có sau khi trích xong dải khung hình */
export function useThumbUrl(layer: Layer): string | null {
  const source = thumbSource(layer)
  const key = source ? `${source.video ? 'v' : 'i'}|${source.path}` : ''
  const [strip, setStrip] = useState<{ key: string; url: string | null } | null>(null)
  useEffect(() => {
    if (!source?.video) return
    let alive = true
    const job = strips.get(source.path) ?? window.api.thumbStrip(source.path).catch(() => null)
    strips.set(source.path, job)
    void job.then((file) => alive && setStrip({ key, url: file ? window.api.fileUrl(file) : null }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (!source) return null
  if (!source.video) return window.api.fileUrl(source.path)
  return strip?.key === key ? strip.url : null
}
