import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { keyLabel } from '../../../shared/i18n'
import { Icon, type IconName } from './ui'

export type MenuItem =
  | { kind?: 'item'; label: string; onClick: () => void; icon?: IconName; shortcut?: string; disabled?: boolean; danger?: boolean }
  | { kind: 'separator' }
  | { kind: 'swatches'; label: string; colors: string[]; current?: string; onPick: (color: string | undefined) => void }

export interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

/**
 * Menu chuột phải (kiểu CapCut): hiện tại vị trí con trỏ, tự lùi vào trong nếu sát mép cửa sổ;
 * đóng khi nhấp ra ngoài, Esc, cuộn hoặc đổi cỡ cửa sổ. ↑ ↓ Enter để chọn bằng bàn phím.
 */
export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: menu.x, y: menu.y })
  const [active, setActive] = useState(-1)
  const actionable = menu.items.map((it, i) => ((it.kind ?? 'item') === 'item' && !(it as { disabled?: boolean }).disabled ? i : -1)).filter((i) => i >= 0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ x: Math.max(4, Math.min(menu.x, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(menu.y, window.innerHeight - r.height - 4)) })
    el.focus({ preventScroll: true })
  }, [menu])

  useEffect(() => {
    const onDown = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const close = (): void => onClose()
    // Đăng ký sau nhịp hiện tại: cú nhấp chuột phải mở menu không đóng nó ngay
    const id = setTimeout(() => {
      window.addEventListener('pointerdown', onDown, true)
      window.addEventListener('resize', close)
      window.addEventListener('wheel', close, { passive: true })
    }, 0)
    return () => {
      clearTimeout(id)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('wheel', close)
    }
  }, [onClose])

  const run = (i: number): void => {
    const it = menu.items[i]
    if ((it.kind ?? 'item') !== 'item' || (it as { disabled?: boolean }).disabled) return
    onClose()
    ;(it as { onClick: () => void }).onClick()
  }

  return (
    <div
      className="ctx-menu"
      ref={ref}
      role="menu"
      tabIndex={-1}
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') onClose()
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          const k = actionable.indexOf(active)
          const next = e.key === 'ArrowDown' ? actionable[(k + 1) % actionable.length] : actionable[(k - 1 + actionable.length) % actionable.length]
          setActive(next ?? -1)
        } else if (e.key === 'Enter' && active >= 0) {
          e.preventDefault()
          run(active)
        }
      }}
    >
      {menu.items.map((it, i) => {
        if (it.kind === 'separator') return <div key={i} className="ctx-sep" role="separator" />
        if (it.kind === 'swatches')
          return (
            <div key={i} className="ctx-swatches" role="group" aria-label={it.label}>
              <span className="ctx-label">{it.label}</span>
              <span className="ctx-swatch-row">
                {it.colors.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`swatch${it.current === c ? ' on' : ''}`}
                    style={{ background: c }}
                    aria-label={c}
                    onClick={() => {
                      onClose()
                      it.onPick(c)
                    }}
                  />
                ))}
                <button
                  type="button"
                  className={`swatch reset${it.current ? '' : ' on'}`}
                  aria-label="↺"
                  onClick={() => {
                    onClose()
                    it.onPick(undefined)
                  }}
                >
                  ↺
                </button>
              </span>
            </div>
          )
        return (
          <button
            type="button"
            key={i}
            role="menuitem"
            className={`ctx-item${it.danger ? ' danger' : ''}${active === i ? ' active' : ''}`}
            disabled={it.disabled}
            onMouseEnter={() => setActive(i)}
            onClick={() => run(i)}
          >
            <span className="ctx-icon">{it.icon && <Icon name={it.icon} size={15} />}</span>
            <span className="ctx-label">{it.label}</span>
            {it.shortcut && <kbd>{keyLabel(it.shortcut)}</kbd>}
          </button>
        )
      })}
    </div>
  )
}
