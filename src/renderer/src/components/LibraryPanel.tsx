import { useCallback, useEffect, useMemo, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { FILTER_PRESETS } from '../../../shared/filterPresets'
import { mediaKind } from '../../../shared/files'
import { tr, trKey } from '../../../shared/i18n'
import { EFFECT_GROUPS, localizePresetProps, TEXT_PRESETS, type LayerPreset } from '../../../shared/presets'
import { player } from '../engineHost'
import { useLayout, type LibraryTab } from '../layout'
import { addImageLayer, addLibraryItem, endLibraryDrag, itemName, startLibraryDrag, type LibraryItem } from '../libraryActions'
import { clearLibraryPreview, sameItem, toggleLibraryPreview, useLibPreview } from '../libraryPreview'
import { presetScene, sceneLayer, type PreviewScene } from '../previewRender'
import { useStore } from '../store'
import { layerMediaPaths, useMediaThumbUrl } from '../thumbs'
import { dropFiles } from '../timelineActions'
import { ContextMenu, type MenuState } from './ContextMenu'
import { MusicTab } from './MusicTab'
import { CollapseButton, ColumnResizer } from './PanelFrame'
import { PreviewThumb } from './PreviewThumb'
import { Icon, type IconName } from './ui'
import { createLayer, FULL_TIMING } from '../../../shared/defaults'
import type { Layer } from '../../../shared/types'

const api = window.api

const TABS: Array<{ id: LibraryTab; icon: IconName; label: string; title: string }> = [
  { id: 'music', icon: 'music', label: trKey('Nhạc'), title: trKey('Nhạc trong playlist') },
  { id: 'media', icon: 'image', label: trKey('Ảnh/video'), title: trKey('Ảnh và video làm nền, logo') },
  { id: 'effects', icon: 'sparkle', label: trKey('Hiệu ứng'), title: trKey('Cột sóng, hạt bay, nháy sáng, nút Đăng ký…') },
  { id: 'filters', icon: 'filter', label: trKey('Bộ lọc'), title: trKey('Bộ lọc màu') },
  { id: 'text', icon: 'text', label: trKey('Chữ'), title: trKey('Chữ mẫu: tên bài, ca sĩ, tên kênh…') }
]

/** Cột trái: Thư viện nhạc, ảnh / video, hiệu ứng, bộ lọc và chữ mẫu — bấm để xem thử, bấm + để thêm, kéo vào timeline để đặt đúng chỗ */
export function LibraryPanel(): ReactNode {
  const tab = useLayout((s) => s.libTab)
  const setTab = useLayout((s) => s.setLibTab)
  // Đổi thẻ hoặc thu gọn cột: thôi xem thử
  useEffect(() => clearLibraryPreview, [tab])
  return (
    <aside className="panel left library">
      <ColumnResizer side="left" />
      <div className="panel-head lib-head">
        <div className="lib-tabs" role="tablist" aria-label={tr('Thư viện')}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`lib-tab${tab === t.id ? ' on' : ''}`}
              data-tab={t.id}
              title={tr(t.title)}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} size={18} />
              <span>{tr(t.label)}</span>
            </button>
          ))}
        </div>
        <CollapseButton side="left" />
      </div>
      {tab === 'music' && <MusicTab />}
      {tab === 'media' && <MediaTab />}
      {tab === 'effects' && <EffectsTab />}
      {tab === 'filters' && <FiltersTab />}
      {tab === 'text' && <TextTab />}
    </aside>
  )
}

/** Gợi ý chung ở đầu các thẻ mẫu */
function LibHint({ children }: { children: ReactNode }): ReactNode {
  return <p className="lib-hint">{children}</p>
}

/** Mục đang được xem thử trên preview */
function usePreviewing(item: LibraryItem): boolean {
  return useLibPreview((s) => sameItem(s.preview?.item, item))
}

/** Bấm ô mẫu (chuột hoặc Enter / Space): xem thử trên preview */
function cardHandlers(item: LibraryItem): { onClick: () => void; onDoubleClick: () => void; onKeyDown: (e: KeyboardEvent) => void } {
  return {
    onClick: () => toggleLibraryPreview(item, player.time()),
    // Nhấp đúp: thêm luôn
    onDoubleClick: () => addLibraryItem(item),
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
      // Không để phím Space tới phím tắt phát / dừng của app
      e.preventDefault()
      e.stopPropagation()
      toggleLibraryPreview(item, player.time())
    }
  }
}

/** Nút + ở góc ô mẫu: thêm vào video */
function AddButton({ item, title }: { item: LibraryItem; title: string }): ReactNode {
  return (
    <button
      type="button"
      className="lib-card-add"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation()
        addLibraryItem(item)
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <Icon name="add" size={14} />
    </button>
  )
}

/**
 * Ô mẫu: ảnh xem trước (rê chuột để xem chuyển động), bấm để xem thử trên preview, bấm + để thêm,
 * kéo vào timeline để đặt đúng chỗ. `selected`: mẫu đang dùng của lớp đang chọn (bộ lọc).
 */
function LibCard({ item, name, scene, selected, title, addTitle }: { item: LibraryItem; name: string; scene: () => PreviewScene; selected?: boolean; title?: string; addTitle?: string }): ReactNode {
  const [hover, setHover] = useState(false)
  const previewing = usePreviewing(item)
  const id = item.kind === 'media' ? item.path : item.id
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={previewing}
      className={`lib-card${selected ? ' selected' : ''}${previewing ? ' previewing' : ''}`}
      draggable
      data-item={id}
      title={title ?? tr('Bấm để xem thử trên preview, bấm + để thêm vào video, hoặc kéo vào timeline để đặt từ chỗ thả đến hết bài')}
      {...cardHandlers(item)}
      onDragStart={(e) => {
        setHover(false)
        startLibraryDrag(e, item)
      }}
      onDragEnd={endLibraryDrag}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <PreviewThumb id={`${item.kind}:${id}`} build={scene} hover={hover} />
      <span className="lib-card-name">{name}</span>
      <AddButton item={item} title={addTitle ?? tr('Thêm vào video')} />
    </div>
  )
}

const presetBuild = (p: LayerPreset): (() => PreviewScene) => {
  // Chữ viết sẵn trong mẫu theo ngôn ngữ giao diện (như khi thêm vào video)
  const props = localizePresetProps(p.type, p.props as Record<string, unknown>, tr)
  return () => presetScene(p.id, p.type, props, p.type === 'text' ? 0.5 : 0.35)
}

function EffectsTab(): ReactNode {
  return (
    <div className="lib-body">
      <LibHint>{tr('Bấm một mẫu để xem thử trên preview, bấm + để thêm cho cả video, hoặc kéo vào timeline để đặt từ chỗ thả đến hết bài.')}</LibHint>
      {EFFECT_GROUPS.map((g) => (
        <section key={g.id} className="lib-group">
          <h4>{tr(g.name)}</h4>
          <div className="lib-grid">
            {g.items.map((p) => (
              <LibCard
                key={p.id}
                item={{ kind: 'preset', id: p.id }}
                name={tr(p.name)}
                scene={presetBuild(p)}
                title={p.type === 'cta' ? tr('Bấm để xem thử, bấm + để thêm theo lịch mặc định, hoặc kéo vào timeline để hiện một lần tại chỗ thả') : undefined}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function TextTab(): ReactNode {
  return (
    <div className="lib-body">
      <LibHint>{tr('Chữ tự đổi theo bài đang phát ({title}, {artist}…). Bấm để xem thử, bấm + để thêm, hoặc kéo vào timeline để đặt đúng chỗ.')}</LibHint>
      <div className="lib-grid">
        {TEXT_PRESETS.map((p) => (
          <LibCard key={p.id} item={{ kind: 'preset', id: p.id }} name={tr(p.name)} scene={presetBuild(p)} />
        ))}
      </div>
    </div>
  )
}

function filterScene(id: string): () => PreviewScene {
  const preset = FILTER_PRESETS.find((p) => p.id === id)!
  return () => ({
    layers: [sceneLayer(0), { ...createLayer('filter', { ...preset.values, preset: preset.id, intensity: 1 }), id: `pv-filter-${id}`, timing: { ...FULL_TIMING } } as Layer]
  })
}

function FiltersTab(): ReactNode {
  const selected = useStore((s) => s.project.layers.find((l) => l.id === s.selectedLayerId))
  const current = selected?.type === 'filter' ? selected.props.preset : null
  return (
    <div className="lib-body">
      <LibHint>
        {current !== null
          ? tr('Đang chọn một lớp bộ lọc: bấm mẫu để xem thử, bấm + để đổi bộ lọc của lớp đó')
          : tr('Bấm để xem thử, bấm + để lọc cả video. Kéo vào timeline để lọc một đoạn, hoặc thả lên hàng bộ lọc có sẵn để đổi mẫu.')}
      </LibHint>
      <div className="lib-grid">
        {FILTER_PRESETS.filter((p) => p.id !== 'none').map((p) => (
          <LibCard
            key={p.id}
            item={{ kind: 'filter', id: p.id }}
            name={tr(p.name)}
            scene={filterScene(p.id)}
            selected={current === p.id}
            addTitle={current !== null ? tr('Đổi bộ lọc của lớp đang chọn') : tr('Thêm vào video')}
          />
        ))}
      </div>
    </div>
  )
}

/** Ảnh / video trong thư viện: đã nhập vào project và đang được các lớp dùng */
function useMediaList(): Array<{ path: string; used: boolean; inLibrary: boolean }> {
  const library = useStore((s) => s.project.library)
  const layers = useStore((s) => s.project.layers)
  return useMemo(() => {
    const used = new Set(layers.flatMap(layerMediaPaths))
    const lib = library ?? []
    const all = [...lib, ...[...used].filter((x) => !lib.includes(x))]
    return all.filter((x) => mediaKind(x) === 'image' || mediaKind(x) === 'video').map((path) => ({ path, used: used.has(path), inLibrary: lib.includes(path) }))
  }, [library, layers])
}

async function importMedia(): Promise<void> {
  const paths = await api.openFiles('media', true)
  if (!paths.length) return
  const n = useStore.getState().addLibraryMedia(paths)
  if (n > 0) useStore.getState().toast('info', tr('Đã nhập {n} ảnh / video vào thư viện', { n }))
}

function MediaTab(): ReactNode {
  const items = useMediaList()
  const [menu, setMenu] = useState<MenuState | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const [over, setOver] = useState(false)

  // Thả file vào thẻ này: chỉ nhập vào thư viện (cửa sổ không hiện lớp phủ "thả để đặt làm nền")
  const onDragOver = (e: DragEvent<HTMLElement>): void => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setOver(true)
  }
  const onDrop = (e: DragEvent<HTMLElement>): void => {
    setOver(false)
    if (!e.dataTransfer.files.length) return
    e.preventDefault()
    e.stopPropagation()
    const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean)
    const n = useStore.getState().addLibraryMedia(paths)
    useStore.getState().toast(n > 0 ? 'info' : 'error', n > 0 ? tr('Đã nhập {n} ảnh / video vào thư viện', { n }) : tr('Không có ảnh / video mới (jpg, png, webp, mp4, mov, webm…)'))
  }

  const openMenu = (e: MouseEvent, path: string, used: boolean, inLibrary: boolean): void => {
    e.preventDefault()
    const kind = mediaKind(path)
    const item: LibraryItem = { kind: 'media', path }
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: tr('Đặt làm nền cho cả video'), icon: 'image', onClick: () => addLibraryItem(item) },
        { label: tr('Thêm làm nền từ đầu phát'), icon: 'add', onClick: () => void dropFiles([path], player.time()) },
        ...(kind === 'image' ? [{ label: tr('Thêm làm ảnh / logo'), icon: 'add' as IconName, onClick: () => addImageLayer(path) }] : []),
        { kind: 'separator' },
        { label: tr('Hiện trong thư mục'), icon: 'folder', onClick: () => void api.showItem(path) },
        {
          label: used ? tr('Đang dùng trong video nên không xoá được') : tr('Xoá khỏi thư viện'),
          icon: 'delete',
          danger: true,
          disabled: used || !inLibrary,
          onClick: () => useStore.getState().removeLibraryMedia(path)
        }
      ]
    })
  }

  return (
    <div
      className={`lib-body media-drop${over ? ' drop-over' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false)}
      onDrop={onDrop}
    >
      <div className="lib-bar">
        <span className="lib-bar-title">{tr('Ảnh & video')}</span>
        <button type="button" className="btn small primary" onClick={() => void importMedia()}>
          <Icon name="add" size={16} /> {tr('Nhập')}
        </button>
      </div>
      {items.length === 0 ? (
        <div className="empty-drop">
          <Icon name="image" size={40} />
          <p>{tr('Kéo thả ảnh, video vào đây')}</p>
          <p className="muted">{tr('Rồi kéo vào timeline để làm nền cho từng đoạn, hoặc bấm + để làm nền cả video')}</p>
        </div>
      ) : (
        <>
          <LibHint>{tr('Bấm để xem thử làm nền, bấm + để làm nền cho cả video, hoặc kéo vào timeline để làm nền từ chỗ thả. Chuột phải để xem thêm.')}</LibHint>
          <div className="lib-grid">
            {items.map((m) => (
              <MediaCard key={m.path} path={m.path} used={m.used} onMenu={(e) => openMenu(e, m.path, m.used, m.inLibrary)} />
            ))}
          </div>
        </>
      )}
      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
    </div>
  )
}

function MediaCard({ path, used, onMenu }: { path: string; used: boolean; onMenu: (e: MouseEvent) => void }): ReactNode {
  const video = mediaKind(path) === 'video'
  const url = useMediaThumbUrl({ path, video })
  const item: LibraryItem = { kind: 'media', path }
  const name = itemName(item)
  const previewing = usePreviewing(item)
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={previewing}
      className={`lib-card media${previewing ? ' previewing' : ''}`}
      draggable
      data-item={path}
      title={`${path}\n${tr('Bấm để xem thử làm nền, kéo vào timeline để làm nền từ chỗ thả. Chuột phải để xem thêm.')}`}
      {...cardHandlers(item)}
      onDragStart={(e) => startLibraryDrag(e, item)}
      onDragEnd={endLibraryDrag}
      onContextMenu={onMenu}
    >
      <span className="pv-thumb">
        {url ? <img src={url} alt="" draggable={false} className={video ? 'strip' : ''} /> : <span className="pv-thumb-empty" />}
        {video && (
          <span className="lib-badge" title="Video">
            <Icon name="videocam" size={12} />
          </span>
        )}
        {used && (
          <span className="lib-badge used" title={tr('Đang dùng trong video')}>
            <Icon name="check" size={12} />
          </span>
        )}
      </span>
      <span className="lib-card-name">{name}</span>
      <AddButton item={item} title={tr('Đặt làm nền cho cả video')} />
    </div>
  )
}
