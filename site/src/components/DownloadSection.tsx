import type { ReactNode } from 'react'
import { Container, Footer, SectionHeader } from 'momi-ui'
import type { Chapter, Copy } from '../content'
import { formatSize, RELEASES_URL, type Asset, type Downloads } from '../release'
import { ChapterLabel } from './Sections'
import { AppleIcon, BrandName, GithubIcon, Icon, LinuxIcon, WindowsIcon } from './icons'

/** Một dòng file tải: tên + dung lượng; chưa có file (chưa phát hành) thì trỏ tới trang Releases */
function FileLink({ asset, label, page }: { asset?: Asset; label: string; page: string }): ReactNode {
  return (
    <a
      href={asset?.url ?? page}
      className="group flex items-center gap-3 rounded-lg border border-border bg-[var(--bg-0)] px-4 py-3 text-sm transition-colors hover:border-[var(--brand-line)] hover:bg-[var(--brand-soft)] focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
    >
      <span className="text-muted-foreground transition-colors group-hover:text-[var(--brand)]">
        <Icon name="download" size={16} />
      </span>
      <span className="flex-1 font-medium">{label}</span>
      {asset && <span className="font-mono text-xs text-muted-foreground">{formatSize(asset.size)}</span>}
    </a>
  )
}

function OsCard({ icon, name, requirement, note, children }: { icon: ReactNode; name: string; requirement: string; note: string; children: ReactNode }): ReactNode {
  return (
    <div className="sd-reveal flex flex-col gap-5 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-lg border border-border bg-[var(--bg-0)] text-foreground">{icon}</span>
        <div>
          <h3 className="font-semibold tracking-tight">{name}</h3>
          <p className="text-sm text-muted-foreground">{requirement}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
      <p className="mt-auto text-xs leading-relaxed text-muted-foreground">{note}</p>
    </div>
  )
}

export function DownloadSection({
  copy,
  chapter,
  downloads: d,
  versionLine
}: {
  copy: Copy['download']
  chapter: Chapter
  downloads: Downloads
  /** "Phiên bản v0.2.0 · 5/10/2026", hoặc null khi chưa đọc được bản phát hành */
  versionLine: string | null
}): ReactNode {
  return (
    <section id={chapter.id} className="py-24 sm:py-32">
      <Container size="xl">
        <SectionHeader eyebrow={<ChapterLabel chapter={chapter} />} title={copy.title} description={copy.description} />
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          <OsCard icon={<WindowsIcon size={20} />} name={copy.windows.name} requirement={copy.windows.requirement} note={copy.windows.note}>
            <FileLink asset={d.windows.setup} label={copy.windows.setup} page={d.page} />
            <FileLink asset={d.windows.portable} label={copy.windows.portable} page={d.page} />
          </OsCard>
          <OsCard icon={<AppleIcon size={20} />} name={copy.mac.name} requirement={copy.mac.requirement} note={copy.mac.note}>
            <FileLink asset={d.mac.arm64} label={copy.mac.arm64} page={d.page} />
            <FileLink asset={d.mac.x64} label={copy.mac.x64} page={d.page} />
          </OsCard>
          <OsCard icon={<LinuxIcon size={20} />} name={copy.linux.name} requirement={copy.linux.requirement} note={copy.linux.note}>
            <FileLink asset={d.linux.appimage} label={copy.linux.appimage} page={d.page} />
            <FileLink asset={d.linux.deb} label={copy.linux.deb} page={d.page} />
          </OsCard>
        </div>
        <p className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-sm text-muted-foreground">
          <span>{versionLine ?? copy.noRelease}</span>
          <span aria-hidden>·</span>
          <a href={RELEASES_URL} className="text-foreground underline-offset-4 hover:underline">
            {copy.allReleases}
          </a>
        </p>
      </Container>
    </section>
  )
}

export function SiteFooter({ copy, links, repoUrl, home }: { copy: Copy['footer']; links: Array<{ label: string; href: string }>; repoUrl: string; home: string }): ReactNode {
  return (
    <Footer
      className="border-t border-border"
      brand={
        <a href={home}>
          <BrandName />
        </a>
      }
      description={copy.description}
      columns={[
        { title: copy.product, links },
        {
          title: copy.resources,
          links: [
            { label: copy.github, href: repoUrl, external: true },
            { label: copy.releases, href: RELEASES_URL, external: true },
            { label: copy.changelog, href: `${repoUrl}/blob/main/CHANGELOG.md`, external: true }
          ]
        }
      ]}
      social={[{ label: 'GitHub', href: repoUrl, icon: <GithubIcon size={16} /> }]}
      copyright={copy.copyright}
    />
  )
}
