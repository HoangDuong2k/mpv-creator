import type { CSSProperties, ReactNode } from 'react'
import { mediaKind } from '../../../shared/files'
import { tr } from '../../../shared/i18n'
import { formatTime } from '../../../shared/time'
import type { BackgroundProps, Layer } from '../../../shared/types'
import { useTimeline } from '../hooks'
import { useStore } from '../store'
import { useMediaThumbUrl } from '../thumbs'
import { importPaths } from './MusicTab'
import { Icon, fileName } from './ui'

const api = window.api

/** Lớp nền chính: phủ cả video, nằm dưới cùng */
function mainBackground(layers: Layer[]): Layer<'background'> | undefined {
  const bgs = layers.filter((l): l is Layer<'background'> => l.type === 'background')
  return bgs.find((l) => l.timing.start <= 0 && l.timing.end === null) ?? bgs[0]
}

function swatchOf(p: BackgroundProps): CSSProperties {
  if (p.mode === 'gradient') return { background: `linear-gradient(${p.angle}deg, ${p.color}, ${p.color2})` }
  return { background: p.color }
}

/**
 * Bước tiếp theo sau khi chọn mẫu cho video mới: đổi ảnh / video nền và thêm nhạc
 * (kéo thả file vào cửa sổ cũng được). Cột sóng, chữ, hiệu ứng đã có sẵn từ mẫu.
 */
export function TemplateStart(): ReactNode {
  const layers = useStore((s) => s.project.layers)
  const tracks = useStore((s) => s.project.tracks)
  const tl = useTimeline()
  const bg = mainBackground(layers)
  const p = bg?.props
  const media = p && (p.mode === 'image' || p.mode === 'video') && p.src ? { path: p.src, video: p.mode === 'video' } : null
  const thumb = useMediaThumbUrl(media)

  const chooseBackground = async (): Promise<void> => {
    const [path] = await api.openFiles('media', false)
    if (!path) return
    const kind = mediaKind(path)
    if (kind !== 'image' && kind !== 'video') {
      useStore.getState().toast('error', tr('Không có ảnh / video mới (jpg, png, webp, mp4, mov, webm…)'))
      return
    }
    useStore.getState().setMainBackground({ path, kind })
  }

  const bgText = !p
    ? tr('Chưa có nền')
    : media
      ? fileName(media.path)
      : p.mode === 'cover'
        ? tr('Ảnh bìa bài hát (tự đổi theo bài)')
        : tr('Màu nền của mẫu')

  return (
    <div className="start-steps">
      <p className="muted">{tr('Mẫu đã có sẵn cột sóng, chữ và hiệu ứng. Chỉ cần đổi nền và thêm nhạc cho video mới (kéo thả file vào cửa sổ cũng được).')}</p>
      <div className="start-step" data-step="background">
        <span className="start-thumb" style={p && !media ? swatchOf(p) : undefined}>
          {thumb && <img src={thumb} alt="" className={media?.video ? 'strip' : ''} />}
        </span>
        <div className="start-info">
          <b>{tr('Ảnh / video nền')}</b>
          <span className="muted" title={media?.path}>
            {bgText}
          </span>
        </div>
        <button type="button" className="btn" onClick={() => void chooseBackground()}>
          <Icon name="image" size={16} /> {tr('Chọn ảnh / video…')}
        </button>
      </div>
      <div className="start-step" data-step="music">
        <span className="start-thumb icon-only">
          <Icon name="music" size={20} />
        </span>
        <div className="start-info">
          <b>{tr('Nhạc')}</b>
          <span className="muted">{tracks.length ? tr('{n} bài, dài {time}', { n: tracks.length, time: formatTime(tl.total, tl.total >= 3600) }) : tr('Chưa có bài nào')}</span>
        </div>
        <button type="button" className={`btn${tracks.length ? '' : ' primary'}`} onClick={async () => importPaths(await api.openFiles('audio', true))}>
          <Icon name="add" size={16} /> {tr('Thêm nhạc…')}
        </button>
      </div>
    </div>
  )
}
