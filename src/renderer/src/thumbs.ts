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
  return useMediaThumbUrl(thumbSource(layer))
}

/**
 * URL ảnh thu nhỏ của một file ảnh / video (thư viện, thanh timeline). Video: dải 8 khung hình liền nhau,
 * khung đầu nằm ở mép trái.
 */
export function useMediaThumbUrl(source: { path: string; video: boolean } | null): string | null {
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

/** Các file ảnh / video mà lớp đang dùng (để liệt kê trong thư viện) */
export function layerMediaPaths(layer: Layer): string[] {
  const p = layer.props as unknown as Record<string, unknown>
  const out: string[] = []
  const add = (v: unknown): void => {
    if (typeof v === 'string' && v) out.push(v)
  }
  if (layer.type === 'background' && (p.mode === 'image' || p.mode === 'video')) add(p.src)
  if (layer.type === 'image' && p.source === 'file') add(p.src)
  if (layer.type === 'visualizer' && p.centerImage === 'custom') add(p.centerSrc)
  if (layer.type === 'cta' && p.preset === 'image') add(p.src)
  return out
}
