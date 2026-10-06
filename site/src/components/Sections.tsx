/**
 * Các phần của trang dựng bằng block của momi-ui. Phần có hiệu ứng hiện dần khi cuộn (Reveal) hoặc cần bấm
 * (Hỏi đáp) được Astro chạy như island (client:idle); phần còn lại render sẵn thành HTML tĩnh.
 */
import type { ReactNode } from 'react'
import { Badge, BentoCard, BentoGrid, Container, Cta, Faq, SectionHeader, Steps } from 'momi-ui'
import type { Chapter, Copy } from '../content'
import type { Downloads } from '../release'
import { DownloadButton, type DownloadLabels } from './DownloadButton'

/** Ảnh đã tối ưu (Astro getImage) truyền vào island: chỉ dữ liệu thuần */
export interface Img {
  src: string
  width: number
  height: number
}

/** Dòng trên tiêu đề mỗi phần: mốc thời gian kiểu chương YouTube + tên phần */
export function ChapterLabel({ chapter }: { chapter: Chapter }): ReactNode {
  return (
    <p className="flex items-center gap-2 text-sm font-medium">
      <span className="chapter-time">{chapter.time}</span>
      <span className="text-muted-foreground">{chapter.label}</span>
    </p>
  )
}

type FeatureKey = Copy['features']['items'][number]['key']

/**
 * Cách xếp ô theo hình dạng ảnh chụp: ảnh dọc chiếm 2 hàng, ảnh ngang chiếm 2 cột. `center`: ảnh căn giữa thay vì
 * góc trên trái (dải khung video có dòng lời ở giữa).
 */
const LAYOUT: Record<FeatureKey, { col: 1 | 2; row: 1 | 2; fit: 'top' | 'frame'; center?: boolean }> = {
  effects: { col: 1, row: 2, fit: 'top' },
  timeline: { col: 2, row: 1, fit: 'top' },
  chapters: { col: 1, row: 1, fit: 'frame' },
  export: { col: 1, row: 1, fit: 'frame' },
  styles: { col: 2, row: 1, fit: 'top' },
  inspector: { col: 1, row: 1, fit: 'top' },
  lyrics: { col: 2, row: 1, fit: 'top', center: true },
  aiLyrics: { col: 1, row: 1, fit: 'top' }
}
const ORDER: FeatureKey[] = ['effects', 'timeline', 'chapters', 'export', 'styles', 'inspector', 'lyrics', 'aiLyrics']

/** "v0.3.0" → [0, 3, 0] */
const versionParts = (v: string): number[] => v.replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0)
function compareVersions(a: string, b: string): number {
  const [x, y] = [versionParts(a), versionParts(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
  return 0
}

/** Tính năng có từ bản `since`: "Mới" nếu bản phát hành mới nhất chính là bản đó, "Sắp có" nếu chưa phát hành */
function featureBadge(since: string | undefined, latest: string | null, badges: Copy['features']['badges']): ReactNode {
  if (!since) return null
  const released = latest !== null && compareVersions(latest, since) >= 0
  if (released && compareVersions(latest!, since) > 0) return null
  return (
    <Badge size="sm" shape="rounded" tone={released ? 'primary' : 'neutral'} className="ml-2 align-middle">
      {released ? badges.new : badges.soon}
    </Badge>
  )
}

export function Features({
  copy,
  chapter,
  images,
  latest
}: {
  copy: Copy['features']
  chapter: Chapter
  images: Record<FeatureKey, Img>
  /** Tag của bản phát hành mới nhất (vd. v0.2.0); null nếu chưa lấy được */
  latest: string | null
}): ReactNode {
  const items = ORDER.map((key) => copy.items.find((i) => i.key === key)!)
  return (
    <section id={chapter.id} className="py-24 sm:py-32">
      <Container size="xl">
        <SectionHeader eyebrow={<ChapterLabel chapter={chapter} />} title={copy.title} description={copy.description} />
        <BentoGrid columns={3} className="mt-14 auto-rows-[minmax(17rem,auto)]">
          {items.map((item, i) => {
            const l = LAYOUT[item.key]
            const img = images[item.key]
            return (
              <BentoCard
                key={item.key}
                title={
                  <>
                    {item.title}
                    {featureBadge(item.since, latest, copy.badges)}
                  </>
                }
                description={item.description}
                colSpan={l.col}
                rowSpan={l.row}
                delay={i * 70}
                visual={
                  l.fit === 'top' ? (
                    <img
                      src={img.src}
                      width={img.width}
                      height={img.height}
                      alt={item.alt}
                      loading="lazy"
                      decoding="async"
                      className={`absolute inset-0 h-full w-full object-cover ${l.center ? 'object-center' : 'object-left-top'}`}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-start justify-center overflow-hidden px-6 pt-6">
                      <img src={img.src} width={img.width} height={img.height} alt={item.alt} loading="lazy" decoding="async" className="w-full max-w-[34rem] rounded-lg border border-border-strong shadow-2xl shadow-black/50" />
                    </div>
                  )
                }
              />
            )
          })}
        </BentoGrid>
      </Container>
    </section>
  )
}

export function HowItWorks({ copy, chapter }: { copy: Copy['how']; chapter: Chapter }): ReactNode {
  return (
    <section id={chapter.id} className="border-y border-border bg-[var(--bg-0)] py-24 sm:py-32">
      <Container size="xl">
        <SectionHeader eyebrow={<ChapterLabel chapter={chapter} />} title={copy.title} description={copy.description} />
        <Steps className="mt-14" items={copy.steps.map((s) => ({ title: s.title, description: s.description }))} />
      </Container>
    </section>
  )
}

export function FaqSection({ copy, chapter }: { copy: Copy['faq']; chapter: Chapter }): ReactNode {
  return (
    <section id={chapter.id} className="py-24 sm:py-32">
      <Container size="xl">
        <Faq layout="split" variant="default" eyebrow={<ChapterLabel chapter={chapter} />} title={copy.title} description={copy.description} items={copy.items} />
      </Container>
    </section>
  )
}

export function FinalCta({
  copy,
  downloads,
  labels,
  anchor,
  repoUrl
}: {
  copy: Copy['cta']
  downloads: Downloads
  labels: DownloadLabels
  anchor: string
  repoUrl: string
}): ReactNode {
  return (
    <section className="pb-24 sm:pb-32">
      <Container size="xl">
        <Cta
          variant="card"
          title={copy.title}
          description={copy.description}
          actions={<DownloadButton downloads={downloads} labels={labels} anchor={anchor} secondary={{ href: repoUrl, label: copy.github, github: true }} />}
        />
      </Container>
    </section>
  )
}
