/**
 * Video demo và thư viện mẫu phong cách (island). Video chỉ tải khi người xem bấm phát (lúc mở trang chỉ có ảnh
 * bìa), để trang nhẹ; thư viện mẫu dùng Lightbox của momi-ui để xem ảnh lớn.
 */
import { useState, type ReactNode } from 'react'
import { Container, Lightbox, LocaleProvider, SectionHeader, vi as viMessages } from 'momi-ui'
import type { Chapter, Copy, Lang, TemplateId } from '../content'
import { ChapterLabel, type Img } from './Sections'

function PlayIcon(): ReactNode {
  return (
    <svg width="28" height="28" viewBox="0 0 256 256" fill="currentColor" aria-hidden>
      <path d="M240,128a15.74,15.74,0,0,1-7.6,13.51L88.32,229.65a16,16,0,0,1-16.2.3A15.86,15.86,0,0,1,64,216.13V39.87a15.86,15.86,0,0,1,8.12-13.82,16,16,0,0,1,16.2.3L232.4,114.49A15.74,15.74,0,0,1,240,128Z" />
    </svg>
  )
}

export function DemoVideo({ copy, chapter, poster, video }: { copy: Copy['demo']; chapter: Chapter; poster: Img; video: string }): ReactNode {
  const [playing, setPlaying] = useState(false)
  return (
    <section id={chapter.id} className="py-24 sm:py-28">
      <Container size="xl">
        <SectionHeader eyebrow={<ChapterLabel chapter={chapter} />} title={copy.title} description={copy.description} />
        <div className="relative mx-auto mt-12 max-w-5xl">
          <div className="demo-glow" aria-hidden />
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-border-strong bg-[var(--bg-0)] shadow-2xl shadow-black/60">
            {playing ? (
              // Bấm phát là thao tác của người xem nên trình duyệt cho phát có tiếng ngay
              <video className="absolute inset-0 h-full w-full" src={video} poster={poster.src} controls autoPlay playsInline preload="auto" />
            ) : (
              <button type="button" className="group absolute inset-0 cursor-pointer" onClick={() => setPlaying(true)} aria-label={copy.play}>
                <img src={poster.src} width={poster.width} height={poster.height} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]" />
                <span className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                <span className="demo-play absolute top-1/2 left-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[var(--brand-ink)] shadow-[0_0_48px_-6px_var(--brand)] transition-transform duration-200 group-hover:scale-110 group-focus-visible:scale-110">
                  <PlayIcon />
                </span>
              </button>
            )}
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            {copy.credit},{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/" className="underline-offset-4 hover:text-foreground hover:underline">
              {copy.creditLicense}
            </a>
          </p>
        </div>
      </Container>
    </section>
  )
}

export interface TemplateImage {
  id: TemplateId
  thumb: Img
  full: Img
}

export function TemplateGallery({ copy, chapter, images, lang }: { copy: Copy['styles']; chapter: Chapter; images: TemplateImage[]; lang: Lang }): ReactNode {
  const [index, setIndex] = useState<number | null>(null)
  const items = images.map((img) => ({
    src: img.full.src,
    alt: copy.items[img.id].name,
    caption: (
      <span>
        <strong>{copy.items[img.id].name}</strong> · {copy.items[img.id].description}
      </span>
    )
  }))
  return (
    <LocaleProvider locale={lang === 'vi' ? 'vi-VN' : 'en-US'} messages={lang === 'vi' ? viMessages : undefined}>
      <section id={chapter.id} className="py-24 sm:py-28">
        <Container size="xl">
          <SectionHeader eyebrow={<ChapterLabel chapter={chapter} />} title={copy.title} description={copy.description} />
          {/* Máy tính: mẫu đầu lớn 2×2, bốn mẫu nhỏ bên phải, hai mẫu cuối rộng gấp đôi; điện thoại: hai cột */}
          <ul className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {images.map((img, i) => (
              <li key={img.id} className={i === 0 ? 'col-span-2 lg:row-span-2' : i >= 5 ? 'lg:col-span-2' : undefined}>
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  className="tpl-tile group relative block h-full w-full overflow-hidden rounded-xl border border-border bg-card text-start outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <img
                    src={img.thumb.src}
                    width={img.thumb.width}
                    height={img.thumb.height}
                    alt={copy.items[img.id].name}
                    loading="lazy"
                    decoding="async"
                    className="aspect-video h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                  <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pt-10 pb-3">
                    <span className="text-sm font-semibold text-white">{copy.items[img.id].name}</span>
                    <span className="line-clamp-1 text-xs text-white/70">{copy.items[img.id].description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Container>
        <Lightbox items={items} index={index} onIndexChange={setIndex} loop />
      </section>
    </LocaleProvider>
  )
}
