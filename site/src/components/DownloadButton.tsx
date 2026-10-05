import type { ReactNode } from 'react'
import { buttonVariants, cn, usePlatform } from 'momi-ui'
import type { Downloads } from '../release'
import { formatSize } from '../release'
import { AppleIcon, GithubIcon, Icon, LinuxIcon, WindowsIcon } from './icons'

export interface DownloadLabels {
  generic: string
  forWindows: string
  forMac: string
  forLinux: string
  macIntel: string
  otherSystems: string
}

/**
 * Nút tải theo hệ điều hành của người xem (island, chạy trên trình duyệt). Khi render sẵn trên server chưa biết
 * hệ điều hành: hiện "Tải về" trỏ tới phần Tải về; trên trình duyệt đổi thành file đúng máy.
 * Mac: trình duyệt không cho biết chắc chip Apple hay Intel, nên tải bản chip Apple và có link riêng cho Mac Intel.
 */
export function DownloadButton({
  downloads: d,
  labels,
  anchor,
  secondary
}: {
  downloads: Downloads
  labels: DownloadLabels
  /** id của phần Tải về */
  anchor: string
  /** Nút phụ cùng hàng (Xem cách làm, Xem trên GitHub…); dòng thông tin file nằm dưới, căn giữa cả hai nút */
  secondary?: { href: string; label: string; github?: boolean }
}): ReactNode {
  const platform = usePlatform()
  const other = { href: `#${anchor}`, label: labels.otherSystems }
  let main: { href: string; label: string; icon: ReactNode; meta?: string } = { href: `#${anchor}`, label: labels.generic, icon: <Icon name="download" /> }
  let extra: { href: string; label: string } | null = null
  if (platform === 'windows' && d.windows.setup) {
    main = { href: d.windows.setup.url, label: labels.forWindows, icon: <WindowsIcon />, meta: `Windows 10, 11 · ${formatSize(d.windows.setup.size)}` }
  } else if (platform === 'mac' && d.mac.arm64) {
    main = { href: d.mac.arm64.url, label: labels.forMac, icon: <AppleIcon />, meta: `Apple silicon · ${formatSize(d.mac.arm64.size)}` }
    if (d.mac.x64) extra = { href: d.mac.x64.url, label: labels.macIntel }
  } else if (platform === 'linux' && d.linux.appimage) {
    main = { href: d.linux.appimage.url, label: labels.forLinux, icon: <LinuxIcon />, meta: `AppImage · ${formatSize(d.linux.appimage.size)}` }
  }
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <a href={main.href} className={cn(buttonVariants({ variant: 'solid', tone: 'primary', size: 'lg' }), 'download-btn')} data-platform={platform}>
          {main.icon}
          {main.label}
        </a>
        {secondary && (
          <a href={secondary.href} className={buttonVariants({ variant: 'outline', tone: 'neutral', size: 'lg' })}>
            {secondary.github && <GithubIcon />}
            {secondary.label}
          </a>
        )}
      </div>
      {main.meta && (
        <p className="flex flex-wrap items-center justify-center gap-x-2 text-xs text-muted-foreground">
          <span>{main.meta}</span>
          {extra && (
            <a className="underline-offset-4 hover:text-foreground hover:underline" href={extra.href}>
              {extra.label}
            </a>
          )}
          <a className="underline-offset-4 hover:text-foreground hover:underline" href={other.href}>
            {other.label}
          </a>
        </p>
      )}
    </div>
  )
}
