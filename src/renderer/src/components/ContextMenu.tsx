import type { ReactNode } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, type Shortcut } from 'momi-ui'
import { Icon, type IconName } from './ui'

export type MenuItem =
  | { kind?: 'item'; label: string; onClick: () => void; icon?: IconName; shortcut?: Shortcut; disabled?: boolean; danger?: boolean }
  | { kind: 'separator' }
  | { kind: 'swatches'; label: string; colors: string[]; current?: string; onPick: (color: string | undefined) => void }

export interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

/** Phím xoá: Mac dùng phím delete (⌫, là Backspace), máy khác dùng Delete */
export const DELETE_SHORTCUT: Shortcut = { mac: 'backspace', default: 'delete' }

/**
 * Menu chuột phải (kiểu CapCut, momi-ui DropdownMenu mở tại vị trí con trỏ): tự lật vào trong khi sát mép cửa sổ,
 * đóng khi nhấp ra ngoài hoặc Esc; ↑ ↓ Enter để chọn bằng bàn phím.
 */
export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }): ReactNode {
  return (
    <DropdownMenu open position={{ x: menu.x, y: menu.y }} onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuContent className="ctx-menu" onContextMenu={(e) => e.preventDefault()}>
        {menu.items.map((it, i) => {
          if (it.kind === 'separator') return <DropdownMenuSeparator key={i} />
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
            <DropdownMenuItem key={i} className="ctx-item" variant={it.danger ? 'danger' : 'default'} disabled={it.disabled} onSelect={() => it.onClick()}>
              {it.icon ? <Icon name={it.icon} size={15} /> : <span className="ctx-icon" aria-hidden="true" />}
              <span className="ctx-label">{it.label}</span>
              {it.shortcut && <DropdownMenuShortcut keys={it.shortcut} />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
