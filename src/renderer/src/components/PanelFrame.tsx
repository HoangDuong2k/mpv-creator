import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { tr } from '../../../shared/i18n'
import { LEFT_W, RIGHT_W, useLayout } from '../layout'
import { Icon, IconButton, type IconName } from './ui'

/** Bước đổi kích thước bằng phím mũi tên trên vạch kéo (giữ Shift: bước lớn) */
export const RESIZE_STEP = 16
export const RESIZE_STEP_BIG = 64

/**
 * Vạch kéo đổi độ rộng cột (mép trong của cột); nhấp đúp để thu gọn cột.
 * Bàn phím (Tab tới vạch): mũi tên dời vạch, Home / End: hẹp nhất / rộng nhất, Enter: thu gọn cột.
 */
export function ColumnResizer({ side }: { side: 'left' | 'right' }): ReactNode {
  const width = useLayout((s) => (side === 'left' ? s.leftW : s.rightW))
  const range = side === 'left' ? LEFT_W : RIGHT_W
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
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const { leftW, rightW, setWidth, setOpen } = useLayout.getState()
    const w = side === 'left' ? leftW : rightW
    const step = e.shiftKey ? RESIZE_STEP_BIG : RESIZE_STEP
    // Mũi tên dời vạch chia: cột trái rộng ra khi sang phải, cột phải rộng ra khi sang trái
    if (e.key === (side === 'left' ? 'ArrowRight' : 'ArrowLeft')) setWidth(side, w + step)
    else if (e.key === (side === 'left' ? 'ArrowLeft' : 'ArrowRight')) setWidth(side, w - step)
    else if (e.key === 'Home') setWidth(side, range.min)
    else if (e.key === 'End') setWidth(side, range.max)
    else if (e.key === 'Enter') {
      setOpen(side, false)
      // Cột thành dải dọc: đưa focus sang dải đó, Enter lần nữa mở lại
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`.panel-rail.${side}`)?.focus())
    } else return
    e.preventDefault()
  }
  return (
    <div
      className={`col-resize ${side}`}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => useLayout.getState().setOpen(side, false)}
      title={tr('Kéo để đổi độ rộng, nhấp đúp để thu gọn')}
      role="separator"
      tabIndex={0}
      aria-label={side === 'left' ? tr('Độ rộng cột Thư viện') : tr('Độ rộng cột Lớp hiệu ứng')}
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={range.min}
      aria-valuemax={range.max}
    />
  )
}

/** Nút thu gọn cột, đặt ở đầu cột */
export function CollapseButton({ side }: { side: 'left' | 'right' }): ReactNode {
  return (
    <IconButton
      className="collapse-btn"
      icon={side === 'left' ? 'chevronLeft' : 'chevronRight'}
      size={16}
      title={tr('Thu gọn cột')}
      onClick={() => useLayout.getState().setOpen(side, false)}
    />
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
