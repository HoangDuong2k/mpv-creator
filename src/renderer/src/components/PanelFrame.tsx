import type { PointerEvent, ReactNode } from 'react'
import { tr } from '../../../shared/i18n'
import { useLayout } from '../layout'
import { Icon, type IconName } from './ui'

/** Vạch kéo đổi độ rộng cột (mép trong của cột); nhấp đúp để thu gọn cột */
export function ColumnResizer({ side }: { side: 'left' | 'right' }): ReactNode {
  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget
    const x0 = e.clientX
    const { leftW, rightW, setWidth } = useLayout.getState()
    const w0 = side === 'left' ? leftW : rightW
    el.setPointerCapture(e.pointerId)
    el.classList.add('active')
    const move = (ev: globalThis.PointerEvent): void => setWidth(side, w0 + (side === 'left' ? ev.clientX - x0 : x0 - ev.clientX))
    const up = (): void => {
      el.classList.remove('active')
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }
  return (
    <div
      className={`col-resize ${side}`}
      onPointerDown={onPointerDown}
      onDoubleClick={() => useLayout.getState().setOpen(side, false)}
      title={tr('Kéo để đổi độ rộng, nhấp đúp để thu gọn')}
      role="separator"
      aria-orientation="vertical"
    />
  )
}

/** Nút thu gọn cột, đặt ở đầu cột */
export function CollapseButton({ side }: { side: 'left' | 'right' }): ReactNode {
  return (
    <button
      type="button"
      className="icon-btn collapse-btn"
      title={tr('Thu gọn cột')}
      aria-label={tr('Thu gọn cột')}
      onClick={() => useLayout.getState().setOpen(side, false)}
    >
      <Icon name={side === 'left' ? 'chevronLeft' : 'chevronRight'} size={16} />
    </button>
  )
}

/** Cột đã thu gọn: dải dọc hẹp, bấm để mở lại */
export function CollapsedRail({ side, title, icon }: { side: 'left' | 'right'; title: string; icon: IconName }): ReactNode {
  return (
    <button type="button" className={`panel-rail ${side}`} onClick={() => useLayout.getState().setOpen(side, true)} title={tr('Mở {name}', { name: title })} aria-label={tr('Mở {name}', { name: title })}>
      <Icon name={side === 'left' ? 'chevronRight' : 'chevronLeft'} size={16} />
      <Icon name={icon} size={16} />
      <span className="rail-title">{title}</span>
    </button>
  )
}
