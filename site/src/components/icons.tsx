import type { ReactNode } from 'react'
import { siApple, siGithub, siLinux } from 'simple-icons'

/** Biểu tượng hệ điều hành / GitHub (Simple Icons, CC0); logo Windows vẽ bằng bốn ô vuông */
function Brand({ path, size = 18, title }: { path: string; size?: number; title?: string }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <path d={path} />
    </svg>
  )
}

export const AppleIcon = ({ size }: { size?: number }): ReactNode => <Brand path={siApple.path} size={size} />
export const LinuxIcon = ({ size }: { size?: number }): ReactNode => <Brand path={siLinux.path} size={size} />
export const GithubIcon = ({ size }: { size?: number }): ReactNode => <Brand path={siGithub.path} size={size} />
export const WindowsIcon = ({ size = 18 }: { size?: number }): ReactNode => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M1 3.5 10.5 2.2v9.3H1zm10.7-1.5L23 .5v11H11.7zM1 12.6h9.5v9.2L1 20.5zm10.7 0H23v10.9l-11.3-1.6z" />
  </svg>
)

/** Quả địa cầu (chọn ngôn ngữ) */
export const GlobeIcon = ({ size = 16 }: { size?: number }): ReactNode => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <ellipse cx="12" cy="12" rx="4" ry="9" />
    <path d="M3.5 9h17M3.5 15h17" />
  </svg>
)

/** Biểu tượng nét mảnh (Phosphor Icons, MIT), cùng bộ với app */
const PATHS = {
  music:
    'M212.92,17.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,56V166.08A36,36,0,1,0,88,196V110.25l112-28v51.83A36,36,0,1,0,216,164V24A8,8,0,0,0,212.92,17.69ZM52,216a20,20,0,1,1,20-20A20,20,0,0,1,52,216ZM88,93.75V62.25l112-28v31.5ZM180,184a20,20,0,1,1,20-20A20,20,0,0,1,180,184Z',
  download:
    'M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z',
  arrowRight:
    'M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z'
} as const

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS; size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Logo: ô vuông dải màu nhấn chứa nốt nhạc (giống logo trên thanh trên cùng của app) */
export function BrandMark({ size = 28 }: { size?: number }): ReactNode {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-md text-[var(--brand-ink)] shadow-[0_0_24px_-6px_var(--brand)]"
      style={{ width: size, height: size, background: 'var(--brand-grad)' }}
      aria-hidden
    >
      <Icon name="music" size={Math.round(size * 0.6)} />
    </span>
  )
}

export function BrandName(): ReactNode {
  return (
    <span className="flex items-center gap-2.5 font-semibold tracking-tight">
      <BrandMark />
      Playlist Video Maker
    </span>
  )
}
