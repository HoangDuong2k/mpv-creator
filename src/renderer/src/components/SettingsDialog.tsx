import { useEffect, useState, type ReactNode } from 'react'
import { Button, Input, NativeSelect } from 'momi-ui'
import { RESOLUTION_PRESETS } from '../../../shared/defaults'
import type { TransitionType } from '../../../shared/types'
import { player } from '../engineHost'
import { errorText } from '../hooks'
import { useStore } from '../store'
import { Modal, NumberInput, Row } from './ui'
import { LANGS, tr, type Lang } from '../../../shared/i18n'

/** Chọn độ phân giải của video (dùng ở Cài đặt project và hộp Xuất video) */
export function ResolutionSelect({ disabled }: { disabled?: boolean }): ReactNode {
  const s = useStore((st) => st.project.settings)
  const presetId = RESOLUTION_PRESETS.find((p) => p.width === s.width && p.height === s.height)?.id ?? 'custom'
  return (
    <NativeSelect
      size="sm"
      value={presetId}
      disabled={disabled}
      onChange={(e) => {
        const p = RESOLUTION_PRESETS.find((x) => x.id === e.target.value)
        if (p) useStore.getState().setSettings({ width: p.width, height: p.height })
      }}
    >
      {RESOLUTION_PRESETS.map((p) => (
        <option key={p.id} value={p.id}>
          {tr(p.label)}
        </option>
      ))}
      {presetId === 'custom' && (
        <option value="custom">
          {tr('Tuỳ chỉnh {w}×{h}', { w: s.width, h: s.height })}
        </option>
      )}
    </NativeSelect>
  )
}

/** Chọn số khung hình / giây (dùng ở Cài đặt project và hộp Xuất video) */
export function FpsSelect({ disabled }: { disabled?: boolean }): ReactNode {
  const fps = useStore((st) => st.project.settings.fps)
  return (
    <NativeSelect size="sm" value={fps} disabled={disabled} onChange={(e) => useStore.getState().setSettings({ fps: Number(e.target.value) })}>
      {[24, 25, 30, 50, 60].map((f) => (
        <option key={f} value={f}>
          {f} fps{f === 30 ? tr(' (khuyên dùng)') : ''}
        </option>
      ))}
    </NativeSelect>
  )
}

export function SettingsDialog(): ReactNode {
  const project = useStore((s) => s.project)
  const { update, setSettings, openDialog } = useStore.getState()
  const s = project.settings
  const lang = useStore((st) => st.lang)

  return (
    <Modal title={tr('Cài đặt project')} onClose={() => openDialog(null)}>
      <Row label={tr('Ngôn ngữ giao diện / Language')}>
        <NativeSelect size="sm" value={lang} onChange={(e) => useStore.getState().setLanguage(e.target.value as Lang)}>
          {LANGS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </NativeSelect>
      </Row>
      <Row label={tr('Tên project')}>
        <Input
          size="sm"
          value={tr(project.name)}
          onChange={(e) =>
            update(
              (p) => {
                p.name = e.target.value
              },
              { coalesce: 'project-name' }
            )
          }
        />
      </Row>
      <div className="two">
        <Row label={tr('Độ phân giải')}>
          <ResolutionSelect />
        </Row>
        <Row label={tr('Số khung hình / giây')}>
          <FpsSelect />
        </Row>
      </div>
      <div className="two">
        <Row label={tr('Rộng (px)')}>
          <NumberInput value={s.width} min={320} max={7680} step={2} onChange={(v) => setSettings({ width: Math.round(v / 2) * 2 })} />
        </Row>
        <Row label={tr('Cao (px)')}>
          <NumberInput value={s.height} min={320} max={7680} step={2} onChange={(v) => setSettings({ height: Math.round(v / 2) * 2 })} />
        </Row>
      </div>
      <div className="section-title">{tr('Chuyển bài')}</div>
      <div className="two">
        <Row label={tr('Kiểu chuyển')}>
          <NativeSelect size="sm" value={s.transition.type} onChange={(e) => setSettings({ transition: { ...s.transition, type: e.target.value as TransitionType } })}>
            <option value="crossfade">{tr('Crossfade (hoà tiếng)')}</option>
            <option value="gap">{tr('Khoảng lặng')}</option>
            <option value="none">{tr('Nối liền')}</option>
          </NativeSelect>
        </Row>
        <Row label={s.transition.type === 'gap' ? tr('Khoảng lặng (giây)') : tr('Thời gian crossfade (giây)')}>
          <NumberInput
            value={s.transition.duration}
            min={0}
            max={15}
            step={0.5}
            onChange={(v) => setSettings({ transition: { ...s.transition, duration: v } })}
          />
        </Row>
      </div>
      <div className="two">
        <Row label={tr('Fade in đầu video (giây)')}>
          <NumberInput value={s.fadeIn} min={0} max={20} step={0.5} onChange={(v) => setSettings({ fadeIn: v })} />
        </Row>
        <Row label={tr('Fade out cuối video (giây)')}>
          <NumberInput value={s.fadeOut} min={0} max={30} step={0.5} onChange={(v) => setSettings({ fadeOut: v })} />
        </Row>
      </div>
      <CacheSection />
    </Modal>
  )
}

const api = window.api

function formatBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`
  if (b >= 1024 ** 2) return `${Math.round(b / 1024 ** 2)} MB`
  return `${Math.round(b / 1024)} KB`
}

/** Bộ nhớ đệm âm thanh: xem dung lượng / vị trí, mở thư mục, xoá (các bài sẽ được phân tích lại) */
function CacheSection(): ReactNode {
  const [info, setInfo] = useState<{ dir: string; bytes: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const load = (): void => {
    api.cacheInfo().then(setInfo, () => setInfo(null))
  }
  useEffect(load, [])
  const clear = async (): Promise<void> => {
    if (!window.confirm(tr('Xoá bộ nhớ đệm âm thanh? Các bài trong project sẽ được phân tích lại (mất vài giây đến vài phút).'))) return
    setBusy(true)
    const { toast, update } = useStore.getState()
    try {
      player.pause()
      await api.clearCache()
      // Xoá trạng thái rồi xoá khoá phân tích → các bài được phân tích lại
      useStore.setState({ trackStatus: {} })
      update(
        (p) => {
          for (const t of p.tracks) t.analysisKey = undefined
        },
        { silent: true }
      )
      toast('success', tr('Đã xoá bộ nhớ đệm âm thanh'))
    } catch (err) {
      toast('error', tr('Không xoá được bộ nhớ đệm: {err}', { err: errorText(err) }))
    } finally {
      setBusy(false)
      load()
    }
  }
  return (
    <>
      <div className="section-title">{tr('Bộ nhớ đệm âm thanh')}</div>
      <p className="muted small">
        {tr('Âm thanh đã giải mã để phát preview và xuất video nhanh (khoảng 660 MB mỗi giờ nhạc). Khi vượt 10 GB, app tự xoá các bài lâu không dùng.')}
      </p>
      <div className="static-value cache-info" title={info?.dir}>
        {info ? (
          <>
            <b>{formatBytes(info.bytes)}</b>
            <span className="muted">{info.dir}</span>
          </>
        ) : (
          '…'
        )}
      </div>
      <div className="row-actions">
        <Button variant="outline" tone="neutral" size="xs" onClick={() => api.openCacheDir()}>
          {tr('Mở thư mục')}
        </Button>
        <Button variant="soft" tone="danger" size="xs" disabled={busy} onClick={clear}>
          {busy ? tr('Đang xoá…') : tr('Xoá bộ nhớ đệm')}
        </Button>
      </div>
    </>
  )
}
