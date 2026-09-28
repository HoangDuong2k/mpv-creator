import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AudioSampler, Renderer } from '../../../engine'
import { FULL_TIMING } from '../../../shared/defaults'
import { FILTER_PRESETS } from '../../../shared/filterPresets'
import type { Layer } from '../../../shared/types'
import { assets, features, player } from '../engineHost'
import { useTimeline } from '../hooks'
import { aboveBackground, useStore } from '../store'

/** Engine riêng để vẽ ảnh xem trước các mẫu lọc (không đụng cache của preview chính) */
const thumbRenderer = new Renderer(assets)
const THUMB_W = 150

/**
 * Chọn mẫu lọc bằng lưới ảnh xem trước (vẽ từ chính khung hình đang xem, qua đúng engine
 * dùng khi xuất video) + chọn phạm vi tác động (chỉ ảnh nền / cả khung hình).
 */
export function FilterPanel({ layer }: { layer: Layer }): ReactNode {
  const project = useStore((s) => s.project)
  const featuresVersion = useStore((s) => s.featuresVersion)
  const currentTime = useStore((s) => s.currentTime)
  const playing = useStore((s) => s.playing)
  const { setLayerProps, moveLayerTo } = useStore.getState()
  const timeline = useTimeline()
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const props = layer.props as unknown as Record<string, unknown>

  const index = project.layers.findIndex((l) => l.id === layer.id)
  const below = useMemo(() => project.layers.slice(0, Math.max(0, index)).filter((l) => l.enabled), [project.layers, index])
  const belowKey = useMemo(() => JSON.stringify(below), [below])
  const bgIndex = aboveBackground(project.layers)
  // Nằm trên cùng → lọc cả khung hình; nằm ngay trên lớp nền → chỉ lọc ảnh nền
  const scope = index === project.layers.length - 1 ? 'all' : index === bgIndex ? 'background' : 'below'

  // Vẽ lại ảnh mẫu khi các lớp bên dưới đổi hoặc tua sang chỗ khác (chỉ khi đang dừng)
  useEffect(() => {
    if (playing) return
    const id = window.setTimeout(() => {
      const { width: W, height: H } = project.settings
      const w = THUMB_W
      const h = Math.max(1, Math.round((w * H) / W))
      const audio = new AudioSampler(timeline, (k) => features.get(k))
      const out: Record<string, string> = {}
      for (const preset of FILTER_PRESETS) {
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const ctx = c.getContext('2d')
        if (!ctx) continue
        const sample = { ...layer, enabled: true, timing: { ...FULL_TIMING }, props: { ...layer.props, ...preset.values, preset: preset.id, intensity: 1 } } as Layer
        try {
          thumbRenderer.render({ ctx, project: { ...project, layers: [...below, sample] }, timeline, audio, t: player.time(), scale: w / W })
          out[preset.id] = c.toDataURL('image/jpeg', 0.85)
        } catch (err) {
          console.warn('Không vẽ được ảnh mẫu bộ lọc', preset.id, err)
        }
      }
      setThumbs(out)
    }, 200)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [belowKey, timeline, featuresVersion, playing, Math.round(currentTime * 2), project.settings.width, project.settings.height])

  return (
    <>
      <div className="filter-grid" role="listbox" aria-label="Mẫu bộ lọc">
        {FILTER_PRESETS.map((p) => (
          <button
            type="button"
            key={p.id}
            role="option"
            aria-selected={props.preset === p.id}
            className={`filter-thumb${props.preset === p.id ? ' selected' : ''}`}
            onClick={() => setLayerProps(layer.id, { ...p.values, preset: p.id })}
            title={`Áp dụng mẫu "${p.name}"`}
          >
            {thumbs[p.id] ? <img src={thumbs[p.id]} alt="" /> : <span className="filter-thumb-empty" />}
            <span>{p.name}</span>
          </button>
        ))}
      </div>
      {props.preset === 'custom' && <p className="muted small">Đang dùng bộ lọc tự chỉnh.</p>}
      <div className="section-title">Phạm vi tác động</div>
      <p className="muted small">Bộ lọc áp dụng cho các lớp nằm dưới nó trong danh sách lớp.</p>
      <div className="row-actions">
        <button
          type="button"
          className={`btn small${scope === 'background' ? ' primary' : ''}`}
          onClick={() => moveLayerTo(layer.id, bgIndex > index ? bgIndex - 1 : bgIndex)}
        >
          Chỉ lọc ảnh nền
        </button>
        <button type="button" className={`btn small${scope === 'all' ? ' primary' : ''}`} onClick={() => moveLayerTo(layer.id, project.layers.length - 1)}>
          Lọc cả khung hình
        </button>
      </div>
    </>
  )
}
