import type { ReactNode } from 'react'
import { Changelog, Container, LocaleProvider, SectionHeader, vi as viMessages } from 'momi-ui'
import type { Chapter, Copy, Lang } from '../content'
import { RELEASES_URL } from '../release'
import { ChapterLabel } from './Sections'

export interface ReleaseNote {
  version: string
  date: string
  url: string
  /** Ghi chú đã chuyển từ Markdown sang HTML lúc build (nội dung của chính repo, CHANGELOG.md) */
  html: string
}

/** Phần "Có gì mới": các bản phát hành mới nhất, render sẵn thành HTML tĩnh (không cần JavaScript) */
export function ChangelogSection({ copy, chapter, notes, lang }: { copy: Copy['changelog']; chapter: Chapter; notes: ReleaseNote[]; lang: Lang }): ReactNode {
  if (notes.length === 0) return null
  return (
    <LocaleProvider locale={lang === 'vi' ? 'vi-VN' : 'en-US'} messages={lang === 'vi' ? viMessages : undefined}>
      <section id={chapter.id} className="border-y border-border bg-[var(--bg-0)] py-24 sm:py-28">
        <Container size="lg">
          <SectionHeader eyebrow={<ChapterLabel chapter={chapter} />} title={copy.title} description={copy.description} />
          <div className="sd-reveal mt-12">
            <Changelog
              releases={notes.slice(0, 3).map((n) => ({
                version: n.version,
                date: n.date,
                content: <div className="release-notes" dangerouslySetInnerHTML={{ __html: n.html }} />
              }))}
            />
          </div>
          <p className="mt-8 text-center text-sm">
            <a href={RELEASES_URL} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              {copy.all}
            </a>
          </p>
        </Container>
      </section>
    </LocaleProvider>
  )
}
