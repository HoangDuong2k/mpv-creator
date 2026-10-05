import type { ReactNode } from 'react'
import { buttonVariants, cn, Navbar } from 'momi-ui'
import { BrandName } from './icons'

/** Thanh điều hướng (island: menu trên điện thoại cần JavaScript) */
export function SiteNav({
  home,
  links,
  langHref,
  langLabel,
  downloadHref,
  downloadLabel,
  menuLabel
}: {
  home: string
  links: Array<{ label: string; href: string }>
  langHref: string
  langLabel: string
  downloadHref: string
  downloadLabel: string
  menuLabel: string
}): ReactNode {
  return (
    <Navbar
      variant="blur"
      sticky
      menuLabel={menuLabel}
      brand={
        <a href={home} className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
          <BrandName />
        </a>
      }
      links={links}
      actions={
        <>
          <a href={langHref} className={buttonVariants({ variant: 'ghost', tone: 'neutral', size: 'sm' })} hrefLang={langHref.startsWith('/en') || langHref.endsWith('/en/') ? 'en' : 'vi'}>
            {langLabel}
          </a>
          <a href={downloadHref} className={cn(buttonVariants({ variant: 'solid', tone: 'primary', size: 'sm' }), 'download-btn')}>
            {downloadLabel}
          </a>
        </>
      }
    />
  )
}
