import { useEffect, useState, type ReactNode } from 'react'
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
  // Mục đang xem sáng lên khi cuộn: phần nào chạm dải giữa màn hình thì là phần đang xem. Theo dõi mọi phần của
  // trang (kể cả phần không có trên menu như đầu trang) để về đầu trang thì không mục nào sáng
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>('main section[id]')]
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(`#${e.target.id}`)
      },
      { rootMargin: '-45% 0px -54% 0px' }
    )
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [links])
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
      links={links.map((l) => ({ ...l, active: l.href === active }))}
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
