import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject
} from 'react'
import type { TrackFeatures } from '../../../engine'
import { ctaStartTimes } from '../../../engine/layers/cta'
import { clamp } from '../../../engine/util'
import { LAYER_LABELS } from '../../../shared/defaults'
import { FEATURE_RATE, OFF_WAVE, WAVE_POINTS } from '../../../shared/featureFormat'
import { formatTime, formatTimePrecise } from '../../../shared/time'
import type { TimelineEntry } from '../../../shared/timeline'
import type { CtaProps, Layer, LayerTiming } from '../../../shared/types'
import { features, player } from '../engineHost'
import { useTimeline } from '../hooks'
import { useStore } from '../store'
import {
  AUDIO_ROW_H,
  CTA_MAX_DURATION,
  CTA_MIN_DURATION,
  HEAD_W,
  MAX_ZOOM,
  MIN_TRACK,
  MIN_ZOOM,
  ROW_H,
  RULER_H,
  addAppearance,
  dragRange,
  fitZoom,
  formatTick,
  groupDeltaRange,
  insertionIndex,
  insertionIndexAt,
  layerRange,
  moveAppearance,
  removeAppearance,
  ROW_COLORS,
  rowBounds,
  snapCandidates,
  snapTime,
  tickStep,
  timelineRows,
  type RangeBounds,
  type RangePart,
  type TimelineRow
} from '../timelineModel'
import { mediaKind } from '../../../shared/files'
import { deleteSelection, dropFiles, splitAtPlayhead } from '../timelineActions'
import { dropLibraryItem, endLibraryDrag, libraryDropTip, libraryItemOf } from '../libraryActions'
import { ctaMenu, laneMenu, layerMenu, trackMenu } from '../contextMenus'
import { ContextMenu, type MenuState } from './ContextMenu'
import { useThumbUrl } from '../thumbs'
import { useLayout } from '../layout'
import { Icon, IconButton, rangeFill } from './ui'
import { tr } from '../../../shared/i18n'

const SNAP_PX = 8
/** Chiều cao timeline khi đang tập trung preview (thước + vài hàng + hàng nhạc) */
const FOCUS_TL_H = 170
const HEIGHT_KEY = 'pvm.timelineHeight'


type Session =
  | { kind: 'seek' }
  | { kind: 'layer'; part: RangePart; layerId: string; t0: number; timing0: LayerTiming; bounds: RangeBounds; key: string }
  | { kind: 'group'; layerId: string; ids: string[]; t0: number; timings0: Record<string, LayerTiming>; range: RangeBounds; key: string; moved: boolean }
  | { kind: 'cta'; part: 'move' | 'dur'; layerId: string; index: number; t0: number; starts0: number[]; key: string }
  | { kind: 'track-move'; from: number; x0: number; grab: number; moved: boolean; to: number }
  /** Kéo cả nhóm clip nhạc đang chọn để đổi thứ tự */
  | { kind: 'tracks-move'; ids: string[]; anchorId: string; x0: number; grab: number; moved: boolean; to: number; excl: Set<number>; len: number }
  /** Nhấp vùng trống: tua; kéo: khoanh khung chọn nhiều thanh / clip */
  | { kind: 'marquee'; x0: number; y0: number; active: boolean; additive: boolean; baseLayers: string[]; baseTracks: string[]; row: string | null }
  | { kind: 'track-trim'; side: 'start' | 'end'; trackId: string; t0: number; entry: TimelineEntry; value: number | null }

interface Visual {
  snapT: number | null
  tip: { t: number; text: string } | null
  trackMove?: { from: number; to: number; ghostStart: number }
  trim?: { trackId: string; side: 'start' | 'end'; edgeT: number }
  groupMove?: { ghostStart: number; len: number; insertT: number; ids: string[] }
  /** Khung chọn (toạ độ trong vùng nội dung timeline) */
  marquee?: { x: number; y: number; w: number; h: number }
  /** Kéo file từ ngoài vào: vạch vị trí thả, vạch chèn bài trên hàng nhạc */
  dropT?: number
  dropInsertT?: number
}

/** Timeline không cao quá 60% cửa sổ: luôn còn chỗ cho preview */
function maxHeight(): number {
  return Math.max(160, Math.round(window.innerHeight * 0.6))
}

function loadHeight(): number {
  try {
    const v = Number(localStorage.getItem(HEIGHT_KEY))
    if (v >= 140) return Math.min(v, maxHeight())
  } catch {
    // bộ nhớ trình duyệt không dùng được
  }
  // Mặc định: khoảng 1/3 chiều cao cửa sổ (170–270px)
  return Math.round(clamp(window.innerHeight * 0.32, 170, 270))
}

function seekTo(t: number): void {
  const v = Math.max(0, Math.min(t, player.total || t))
  player.seek(v)
  useStore.getState().setTime(v)
}

/** Timeline kiểu CapCut: mỗi lớp một hàng, hàng nhạc dưới cùng, đầu phát kéo để tua. */
export function Timeline(): ReactNode {
  const layers = useStore((s) => s.project.layers)
  const selectedLayerId = useStore((s) => s.selectedLayerId)
  const selectedLayerIds = useStore((s) => s.selectedLayerIds)
  const selectedTrackId = useStore((s) => s.selectedTrackId)
  const selectedTrackIds = useStore((s) => s.selectedTrackIds)
  const selectedCta = useStore((s) => s.selectedCta)
  const featuresVersion = useStore((s) => s.featuresVersion)
  const tl = useTimeline()
  const total = tl.total
  const displayTotal = total > 0 ? total : 60
  const withHours = total >= 3600

  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  /** Vạch đầu phát riêng trong hàng nhạc (hàng này ghim ở đáy, nằm trên các hàng khác) */
  const audioPlayheadRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  const [zoom, setZoom] = useState(8)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const [autoFit, setAutoFit] = useState(true)
  const [view, setView] = useState({ w: 900, left: 0 })
  const [snapOn, setSnapOn] = useState(true)
  const [visual, setVisual] = useState<Visual | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const [height, setHeight] = useState(loadHeight)
  // Chế độ tập trung preview (hai cột bên đã ẩn): timeline thu gọn tạm thời để preview cao hơn
  const focused = useLayout((s) => !s.leftOpen && !s.rightOpen)
  // Cửa sổ thấp lại (thu nhỏ, đổi màn hình): timeline thấp theo
  useEffect(() => {
    const onResize = (): void => setHeight((h) => Math.min(h, maxHeight()))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const session = useRef<Session | null>(null)
  const pendingScroll = useRef<number | null>(null)
  const laneViewW = Math.max(100, view.w - HEAD_W)
  const laneW = Math.max(laneViewW, displayTotal * zoom + 240)
  const rows = useMemo(() => timelineRows(layers), [layers])
  const selectedSet = useMemo(() => new Set(selectedLayerIds), [selectedLayerIds])

  // Đo bề ngang và theo dõi cuộn ngang
  useEffect(() => {
    const el = scrollRef.current!
    const update = (): void => setView({ w: el.clientWidth, left: el.scrollLeft })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    el.addEventListener('scroll', update, { passive: true })
    update()
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', update)
    }
  }, [])

  // Chọn một lớp (ở danh sách, preview hay timeline) → cuộn cho hàng của nó hiện ra, không bị hàng nhạc ghim ở đáy che
  useEffect(() => {
    const el = scrollRef.current
    const idx = selectedLayerId ? rows.findIndex((r) => r.layers.some((l) => l.id === selectedLayerId)) : -1
    if (!el || idx < 0 || idx >= rows.length) return
    const top = RULER_H + idx * ROW_H
    const bottom = top + ROW_H
    if (top < el.scrollTop + RULER_H) el.scrollTop = top - RULER_H
    else if (bottom > el.scrollTop + el.clientHeight - AUDIO_ROW_H) el.scrollTop = bottom - el.clientHeight + AUDIO_ROW_H
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLayerId])

  // Tự vừa khung cho tới khi người dùng tự zoom
  useEffect(() => {
    if (!autoFit) return
    setZoom(fitZoom(displayTotal, laneViewW))
    // Vừa khung = thấy toàn bộ video từ 0:00
    const raf = requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollLeft = 0
    })
    return () => cancelAnimationFrame(raf)
  }, [autoFit, displayTotal, laneViewW])

  useLayoutEffect(() => {
    if (pendingScroll.current !== null && scrollRef.current) {
      scrollRef.current.scrollLeft = pendingScroll.current
      pendingScroll.current = null
    }
  }, [zoom])

  /** Zoom giữ nguyên thời điểm dưới con trỏ (hoặc đầu phát) */
  const zoomTo = useCallback((z: number, anchorClientX?: number) => {
    const el = scrollRef.current
    if (!el) return
    const nz = clamp(z, MIN_ZOOM, MAX_ZOOM)
    const r = el.getBoundingClientRect()
    const vis = el.clientWidth - HEAD_W
    const playX = player.time() * zoomRef.current - el.scrollLeft
    const ax = anchorClientX !== undefined ? clamp(anchorClientX - r.left - HEAD_W, 0, vis) : playX >= 0 && playX <= vis ? playX : vis / 2
    const tAnchor = (el.scrollLeft + ax) / zoomRef.current
    pendingScroll.current = Math.max(0, tAnchor * nz - ax)
    setAutoFit(false)
    setZoom(nz)
  }, [])

  // Ctrl + lăn chuột để zoom (listener không passive để chặn zoom trang)
  useEffect(() => {
    const el = scrollRef.current!
    const onWheel = (e: WheelEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      zoomTo(zoomRef.current * Math.exp(-e.deltaY * 0.0015), e.clientX)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomTo])

  // Đầu phát chạy mượt 60fps bằng cách gán style trực tiếp (không render lại React)
  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      raf = requestAnimationFrame(tick)
      const t = player.time()
      const x = t * zoomRef.current
      const el0 = scrollRef.current
      if (playheadRef.current) {
        playheadRef.current.style.transform = `translateX(${HEAD_W + x}px)`
        // Ẩn khi đầu phát đã cuộn khuất sau cột tên hàng
        playheadRef.current.style.visibility = el0 && x < el0.scrollLeft ? 'hidden' : 'visible'
      }
      if (audioPlayheadRef.current) {
        audioPlayheadRef.current.style.transform = `translateX(${x}px)`
        audioPlayheadRef.current.style.visibility = el0 && x < el0.scrollLeft ? 'hidden' : 'visible'
      }
      if (knobRef.current) knobRef.current.style.transform = `translateX(${x}px)`
      if (timeRef.current) timeRef.current.textContent = formatTimePrecise(t, withHours)
      const el = scrollRef.current
      if (player.playing && el && !session.current) {
        const vis = el.clientWidth - HEAD_W
        if (x < el.scrollLeft || x > el.scrollLeft + vis - 24) el.scrollLeft = Math.max(0, x - vis * 0.1)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [withHours])

  const timeAt = (clientX: number): number => {
    const el = scrollRef.current!
    const r = el.getBoundingClientRect()
    return Math.max(0, (clientX - r.left - HEAD_W + el.scrollLeft) / zoomRef.current)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-hit]')
    if (!hit) return
    rootRef.current?.focus({ preventScroll: true })
    const t = timeAt(e.clientX)
    const st = useStore.getState()
    const d = hit.dataset
    const key = `drag-tl-${Date.now()}`
    switch (d.hit) {
      case 'ruler':
        seekTo(t)
        session.current = { kind: 'seek' }
        break
      case 'lane':
        // Nhấp: tua tới đó và chọn hàng; kéo: khoanh khung chọn (giữ Ctrl/Shift để chọn thêm)
        seekTo(t)
        session.current = {
          kind: 'marquee',
          x0: e.clientX,
          y0: e.clientY,
          active: false,
          additive: e.ctrlKey || e.metaKey || e.shiftKey,
          baseLayers: st.selectedLayerIds,
          baseTracks: st.selectedTrackIds,
          row: d.row ?? null
        }
        break
      case 'layer': {
        const layer = st.project.layers.find((l) => l.id === d.id)
        if (!layer) return
        // Ctrl / Shift + nhấp: thêm / bớt thanh khỏi nhóm đang chọn
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          st.toggleLayerSelection(layer.id)
          return
        }
        const inGroup = d.part === 'move' && st.selectedLayerIds.length > 1 && st.selectedLayerIds.includes(layer.id)
        if (layer.locked) {
          if (!inGroup) st.selectLayer(layer.id)
          setVisual({ snapT: null, tip: { t, text: tr('Lớp đang khoá. Bấm biểu tượng ổ khoá ở đầu hàng để mở.') } })
          return
        }
        if (inGroup) {
          // Kéo cả nhóm: bỏ qua lớp khoá và nút Đăng ký (có lịch hiện riêng)
          const ids = st.selectedLayerIds.filter((id) => {
            const l = st.project.layers.find((x) => x.id === id)
            return l && !l.locked && l.type !== 'cta'
          })
          const timings0 = Object.fromEntries(ids.map((id) => [id, { ...st.project.layers.find((l) => l.id === id)!.timing }]))
          const range = groupDeltaRange(st.project.layers, ids, total)
          session.current = { kind: 'group', layerId: layer.id, ids, t0: t, timings0, range, key, moved: false }
          break
        }
        st.selectLayer(layer.id)
        const bounds = rowBounds(st.project.layers, layer.id, total)
        session.current = { kind: 'layer', part: d.part as RangePart, layerId: layer.id, t0: t, timing0: { ...layer.timing }, bounds, key }
        break
      }
      case 'cta': {
        const layer = st.project.layers.find((l) => l.id === d.id)
        if (!layer || layer.type !== 'cta') return
        const index = Number(d.index)
        st.selectCta({ layerId: layer.id, index })
        session.current = { kind: 'cta', part: d.part === 'dur' ? 'dur' : 'move', layerId: layer.id, index, t0: t, starts0: ctaStartTimes(layer.props, tl), key }
        break
      }
      case 'track': {
        const index = Number(d.index)
        const entry = tl.entries[index]
        if (!entry) return
        // Ctrl / Shift + nhấp: thêm / bớt clip khỏi nhóm đang chọn
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          st.toggleTrackSelection(entry.track.id)
          return
        }
        if (d.part === 'move' && st.selectedTrackIds.length > 1 && st.selectedTrackIds.includes(entry.track.id)) {
          const picked = tl.entries.filter((x) => st.selectedTrackIds.includes(x.track.id))
          const before = picked.filter((x) => x.index < index).reduce((sum, x) => sum + x.length, 0)
          session.current = {
            kind: 'tracks-move',
            ids: picked.map((x) => x.track.id),
            anchorId: entry.track.id,
            x0: e.clientX,
            grab: t - entry.start + before,
            moved: false,
            to: 0,
            excl: new Set(picked.map((x) => x.index)),
            len: picked.reduce((sum, x) => sum + x.length, 0)
          }
          break
        }
        st.selectTrack(entry.track.id)
        if (d.part === 'move') session.current = { kind: 'track-move', from: index, x0: e.clientX, grab: t - entry.start, moved: false, to: index }
        else session.current = { kind: 'track-trim', side: d.part === 'start' ? 'start' : 'end', trackId: entry.track.id, t0: t, entry, value: null }
        break
      }
      default:
        return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const s = session.current
    if (!s) return
    const t = timeAt(e.clientX)
    const st = useStore.getState()
    const thr = snapOn && !e.shiftKey ? SNAP_PX / zoomRef.current : 0
    const layersNow = st.project.layers
    switch (s.kind) {
      case 'seek':
        seekTo(t)
        return
      case 'layer': {
        const cands = snapCandidates(layersNow, tl, player.time(), { layerId: s.layerId })
        let value: number
        let snapped: number | null = null
        if (s.part === 'move') {
          const r = layerRange(s.timing0, total)
          let dlt = t - s.t0
          const a = snapTime(r.start + dlt, cands, thr)
          // Layer "đến hết video": mép phải cố định ở cuối video, chỉ bắt dính mép trái
          const b = s.timing0.end === null ? { t: r.end + dlt, snapped: null } : snapTime(r.end + dlt, cands, thr)
          if (a.snapped !== null && (b.snapped === null || Math.abs(a.t - (r.start + dlt)) <= Math.abs(b.t - (r.end + dlt)))) {
            dlt = a.t - r.start
            snapped = a.snapped
          } else if (b.snapped !== null) {
            dlt = b.t - r.end
            snapped = b.snapped
          }
          value = dlt
        } else {
          const sn = snapTime(t, cands, thr)
          value = sn.t
          snapped = sn.snapped
        }
        const patch = dragRange(s.part, s.timing0, total, value, s.bounds)
        st.setLayerTiming(s.layerId, patch, s.key)
        const next = { ...s.timing0, ...patch }
        const r = layerRange(next, total)
        const tips: Record<RangePart, { t: number; text: string }> = {
          move: { t: r.start, text: `${formatTimePrecise(r.start, withHours)} → ${next.end === null ? tr('hết video') : formatTimePrecise(r.end, withHours)}` },
          start: { t: r.start, text: tr('Bắt đầu {time}', { time: formatTimePrecise(r.start, withHours) }) },
          end: { t: r.end, text: next.end === null ? tr('Đến hết video') : tr('Kết thúc {time}', { time: formatTimePrecise(r.end, withHours) }) },
          fadeIn: { t: r.start + next.fadeIn, text: tr('Hiện dần {s}s', { s: next.fadeIn.toFixed(1) }) },
          fadeOut: { t: r.end - next.fadeOut, text: tr('Ẩn dần {s}s', { s: next.fadeOut.toFixed(1) }) }
        }
        setVisual({ snapT: snapped, tip: tips[s.part] })
        return
      }
      case 'group': {
        // Dời cả nhóm theo thanh đang nắm: bắt dính mép của nó, cùng một độ dời cho mọi thanh
        const r = layerRange(s.timings0[s.layerId], total)
        const cands = snapCandidates(layersNow, tl, player.time(), { layerIds: new Set(s.ids) })
        let dlt = t - s.t0
        if (!s.moved && Math.abs(dlt * zoomRef.current) < 3) return
        s.moved = true
        const a = snapTime(r.start + dlt, cands, thr)
        const b = s.timings0[s.layerId].end === null ? { t: r.end + dlt, snapped: null } : snapTime(r.end + dlt, cands, thr)
        let snapped: number | null = null
        if (a.snapped !== null && (b.snapped === null || Math.abs(a.t - (r.start + dlt)) <= Math.abs(b.t - (r.end + dlt)))) {
          dlt = a.t - r.start
          snapped = a.snapped
        } else if (b.snapped !== null) {
          dlt = b.t - r.end
          snapped = b.snapped
        }
        const d = clamp(dlt, s.range.min, s.range.max)
        if (d !== dlt) snapped = null
        const patches = Object.fromEntries(s.ids.map((id) => [id, dragRange('move', s.timings0[id], total, d)]))
        st.setLayersTiming(patches, s.key)
        setVisual({ snapT: snapped, tip: { t: r.start + d, text: tr('Dời {n} lớp {delta}', { n: s.ids.length, delta: `${d >= 0 ? '+' : '−'}${formatTimePrecise(Math.abs(d), withHours)}` }) } })
        return
      }
      case 'cta': {
        if (s.part === 'move') {
          const cands = snapCandidates(layersNow, tl, player.time(), { layerId: s.layerId, ctaIndex: s.index })
          const sn = snapTime(s.starts0[s.index] + (t - s.t0), cands, thr)
          const r = moveAppearance(s.starts0, s.index, sn.t, total)
          st.setLayerProps(s.layerId, { schedule: 'times', times: r.times }, s.key)
          st.selectCta({ layerId: s.layerId, index: r.index })
          setVisual({ snapT: sn.snapped, tip: { t: sn.t, text: tr('Hiện lúc {time}', { time: formatTimePrecise(Math.max(0, sn.t), withHours) }) } })
        } else {
          const dur = Math.round(clamp(t - s.starts0[s.index], CTA_MIN_DURATION, CTA_MAX_DURATION) * 10) / 10
          st.setLayerProps(s.layerId, { duration: dur }, s.key)
          setVisual({ snapT: null, tip: { t: s.starts0[s.index] + dur, text: tr('Hiện {s}s (mọi lần)', { s: dur.toFixed(1) }) } })
        }
        return
      }
      case 'marquee': {
        if (!s.active && Math.hypot(e.clientX - s.x0, e.clientY - s.y0) < 5) return
        s.active = true
        const inner = e.currentTarget.getBoundingClientRect()
        const x1 = Math.min(s.x0, e.clientX)
        const x2 = Math.max(s.x0, e.clientX)
        const y1 = Math.min(s.y0, e.clientY)
        const y2 = Math.max(s.y0, e.clientY)
        const hitLayers: string[] = []
        const hitTracks: string[] = []
        e.currentTarget.querySelectorAll<HTMLElement>('[data-part="move"][data-hit="layer"], [data-part="move"][data-hit="track"]').forEach((el) => {
          const r = el.getBoundingClientRect()
          if (r.right < x1 || r.left > x2 || r.bottom < y1 || r.top > y2) return
          ;(el.dataset.hit === 'layer' ? hitLayers : hitTracks).push(el.dataset.id!)
        })
        st.setSelection(
          s.additive ? [...new Set([...s.baseLayers, ...hitLayers])] : hitLayers,
          s.additive ? [...new Set([...s.baseTracks, ...hitTracks])] : hitTracks
        )
        setVisual({ snapT: null, tip: null, marquee: { x: x1 - inner.left, y: y1 - inner.top, w: x2 - x1, h: y2 - y1 } })
        return
      }
      case 'tracks-move': {
        if (!s.moved && Math.abs(e.clientX - s.x0) < 4) return
        s.moved = true
        s.to = insertionIndexAt(tl.entries, t, s.excl)
        const others = tl.entries.filter((x) => !s.excl.has(x.index))
        const insertT = s.to === 0 ? 0 : others[s.to - 1].end
        setVisual({
          snapT: null,
          tip: { t, text: tr('Chuyển {n} bài tới vị trí {k}', { n: s.ids.length, k: s.to + 1 }) },
          groupMove: { ghostStart: t - s.grab, len: s.len, insertT, ids: s.ids }
        })
        return
      }
      case 'track-move': {
        if (!s.moved && Math.abs(e.clientX - s.x0) < 4) return
        s.moved = true
        s.to = insertionIndex(tl.entries, s.from, t)
        setVisual({ snapT: null, tip: { t, text: tr('Chuyển tới vị trí {n}', { n: s.to + 1 }) }, trackMove: { from: s.from, to: s.to, ghostStart: t - s.grab } })
        return
      }
      case 'track-trim': {
        const e0 = s.entry
        const track = e0.track
        const cands = snapCandidates(layersNow, tl, player.time())
        if (s.side === 'start') {
          const sn = snapTime(e0.start + (t - s.t0), cands, thr)
          const v = clamp(track.trimStart + (sn.t - e0.start), 0, track.duration - track.trimEnd - MIN_TRACK)
          s.value = Math.round(v * 100) / 100
          const edgeT = e0.start + (s.value - track.trimStart)
          setVisual({ snapT: sn.snapped, tip: { t: edgeT, text: tr('Cắt đầu {time}', { time: formatTimePrecise(s.value) }) }, trim: { trackId: track.id, side: 'start', edgeT } })
        } else {
          const sn = snapTime(e0.end + (t - s.t0), cands, thr)
          const v = clamp(track.trimEnd - (sn.t - e0.end), 0, track.duration - track.trimStart - MIN_TRACK)
          s.value = Math.round(v * 100) / 100
          const edgeT = e0.end - (s.value - track.trimEnd)
          setVisual({ snapT: sn.snapped, tip: { t: edgeT, text: tr('Cắt cuối {time}', { time: formatTimePrecise(s.value) }) }, trim: { trackId: track.id, side: 'end', edgeT } })
        }
        return
      }
    }
  }

  const onPointerUp = (): void => {
    const s = session.current
    session.current = null
    const st = useStore.getState()
    // Nhấp (không kéo) vào một thanh trong nhóm: chỉ chọn thanh đó
    if (s?.kind === 'group' && !s.moved) st.selectLayer(s.layerId)
    if (s?.kind === 'tracks-move') {
      if (s.moved) st.moveTracks(s.ids, s.to)
      else st.selectTrack(s.anchorId)
    }
    // Nhấp (không kéo) vào vùng trống: chọn hàng đó (hàng nhạc: bỏ chọn)
    if (s?.kind === 'marquee' && !s.active && !s.additive) {
      if (s.row === 'audio') st.setSelection([], [])
      else if (s.row) st.selectLayer(s.row)
    }
    if (s?.kind === 'track-move' && s.moved && s.to !== s.from) st.moveTrack(s.from, s.to)
    if (s?.kind === 'track-trim' && s.value !== null) {
      const cur = s.side === 'start' ? s.entry.track.trimStart : s.entry.track.trimEnd
      if (s.value !== cur) st.updateTrack(s.trackId, s.side === 'start' ? { trimStart: s.value } : { trimEnd: s.value })
    }
    setVisual(null)
  }

  const onDoubleClick = (e: MouseEvent<HTMLDivElement>): void => {
    // Sau pointer capture, Chromium gửi dblclick về khung timeline → tìm phần tử thật dưới con trỏ
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    const hit = under?.closest<HTMLElement>('[data-hit]')
    if (!hit) return
    const st = useStore.getState()
    const d = hit.dataset
    const t = timeAt(e.clientX)
    if (d.hit === 'lane' && d.row) {
      // Nhấp đúp vào hàng nút Đăng ký: thêm một lần hiện
      const layer = st.project.layers.find((l) => l.id === d.row)
      if (layer?.type === 'cta') {
        const r = addAppearance(ctaStartTimes(layer.props, tl), t, total)
        st.setLayerProps(layer.id, { schedule: 'times', times: r.times })
        st.selectCta({ layerId: layer.id, index: r.index })
      }
    } else if (d.hit === 'layer') {
      const layer = st.project.layers.find((l) => l.id === d.id)
      if (layer) seekTo(layerRange(layer.timing, total).start)
    } else if (d.hit === 'track') {
      const entry = tl.entries[Number(d.index)]
      if (entry) seekTo(entry.index === 0 ? 0 : entry.displayStart)
    }
  }

  /** Delete / Backspace: xoá mục đang chọn · Ctrl+A: chọn mọi thanh · Esc: bỏ chọn nhóm */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const st = useStore.getState()
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      st.setSelection(
        st.project.layers.filter((l) => l.type !== 'cta').map((l) => l.id),
        st.project.tracks.map((t) => t.id)
      )
      return
    }
    if (e.key === 'Escape' && st.selectedLayerIds.length + st.selectedTrackIds.length > 1) {
      if (st.selectedTrackId) st.selectTrack(st.selectedTrackId)
      else st.selectLayer(st.selectedLayerId)
      return
    }
    if (e.key !== 'Delete' && e.key !== 'Backspace') return
    if (st.selectedCta) {
      const layer = st.project.layers.find((l) => l.id === st.selectedCta!.layerId)
      if (layer?.type === 'cta') {
        const times = removeAppearance(ctaStartTimes(layer.props, tl), st.selectedCta.index, total)
        st.setLayerProps(layer.id, { schedule: 'times', times })
        st.selectCta(null)
      }
    } else if (!deleteSelection()) return
    e.preventDefault()
  }

  /** Chuột phải: menu theo đối tượng dưới con trỏ (thanh, clip nhạc, lần hiện nút Đăng ký, vùng trống) */
  const onContextMenu = (e: MouseEvent<HTMLDivElement>): void => {
    e.preventDefault()
    if (session.current) return
    const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-hit]')
    if (!hit) return
    rootRef.current?.focus({ preventScroll: true })
    const d = hit.dataset
    const t = timeAt(e.clientX)
    const items =
      d.hit === 'layer' && d.id
        ? layerMenu(d.id)
        : d.hit === 'track' && d.id
          ? trackMenu(d.id)
          : d.hit === 'cta' && d.id
            ? ctaMenu(d.id, Number(d.index))
            : d.hit === 'lane' || d.hit === 'ruler'
              ? laneMenu(t, d.row ?? null)
              : []
    if (items.length) setMenu({ x: e.clientX, y: e.clientY, items })
  }

  /** Kéo file từ ngoài vào: thời điểm thả (đã bắt dính) và lớp nằm dưới con trỏ */
  const dropInfo = (e: DragEvent<HTMLElement>): { t: number; snapped: number | null; targetLayerId: string | null } => {
    const st = useStore.getState()
    const thr = snapOn && !e.shiftKey ? SNAP_PX / zoomRef.current : 0
    const sn = snapTime(timeAt(e.clientX), snapCandidates(st.project.layers, tl, player.time()), thr)
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-hit]')
    const id = el?.dataset.hit === 'layer' ? el.dataset.id : el?.dataset.hit === 'lane' && el.dataset.row !== 'audio' ? el.dataset.row : undefined
    return { t: Math.max(0, sn.t), snapped: sn.snapped, targetLayerId: id ?? null }
  }
  const lastDropTip = useRef('')

  const onDragOver = (e: DragEvent<HTMLElement>): void => {
    // Mục kéo từ thư viện (hiệu ứng, bộ lọc, chữ mẫu, ảnh / video) hoặc file kéo từ ngoài vào
    const lib = libraryItemOf(e)
    if (!lib && !e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    const { t, snapped, targetLayerId } = dropInfo(e)
    if (lib) {
      const text = libraryDropTip(lib, t, targetLayerId)
      const key = `lib|${t}|${snapped}|${text}`
      if (key === lastDropTip.current) return
      lastDropTip.current = key
      setVisual({ snapT: snapped, tip: { t, text }, dropT: t })
      return
    }
    // Loại file theo MIME (tên file chưa đọc được khi đang kéo)
    const items = [...e.dataTransfer.items].filter((it) => it.kind === 'file')
    const audio = items.filter((it) => it.type.startsWith('audio/')).length
    const media = items.filter((it) => it.type.startsWith('image/') || it.type.startsWith('video/')).length
    const other = items.length - audio - media
    const target = useStore.getState().project.layers.find((l) => l.id === targetLayerId)
    let text: string
    let insertT: number | undefined
    if (media === 1 && audio + other === 0 && target?.type === 'background') text = tr('Thả để thay ảnh / video của lớp "{name}"', { name: tr(target.name) })
    else {
      const parts: string[] = []
      if (audio + other > 0) {
        const k = insertionIndexAt(tl.entries, t)
        insertT = k === 0 ? 0 : tl.entries[k - 1].end
        parts.push(audio > 0 ? tr('Chèn {n} bài vào vị trí {k}', { n: audio, k: k + 1 }) : tr('Chèn nhạc vào vị trí {k}', { k: k + 1 }))
      }
      if (media > 0) parts.push(tr('Thêm {n} nền từ {time}', { n: media, time: formatTimePrecise(t, withHours) }))
      text = parts.join(' · ')
    }
    const key = `${t}|${snapped}|${text}|${insertT}`
    if (key === lastDropTip.current) return
    lastDropTip.current = key
    setVisual({ snapT: snapped, tip: { t, text }, dropT: t, dropInsertT: insertT })
  }

  const onDragLeave = (e: DragEvent<HTMLElement>): void => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    lastDropTip.current = ''
    setVisual(null)
  }

  const onDrop = (e: DragEvent<HTMLElement>): void => {
    lastDropTip.current = ''
    setVisual(null)
    const lib = libraryItemOf(e)
    if (lib) {
      e.preventDefault()
      e.stopPropagation()
      const { t, targetLayerId } = dropInfo(e)
      endLibraryDrag()
      dropLibraryItem(lib, t, targetLayerId)
      rootRef.current?.focus({ preventScroll: true })
      return
    }
    if (!e.dataTransfer.files.length) return
    const paths = [...e.dataTransfer.files].map((f) => window.api.pathForFile(f)).filter(Boolean)
    // Một file project (.json): để cửa sổ mở project như khi thả vào chỗ khác
    if (paths.length === 1 && mediaKind(paths[0]) === 'project') return
    e.preventDefault()
    e.stopPropagation()
    const { t, targetLayerId } = dropInfo(e)
    void dropFiles(paths, t, targetLayerId)
  }

  const startResize = (e: PointerEvent<HTMLDivElement>): void => {
    const y0 = e.clientY
    const h0 = height
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const move = (ev: globalThis.PointerEvent): void => setHeight(Math.round(clamp(h0 - (ev.clientY - y0), 140, maxHeight())))
    const up = (): void => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      setHeight((h) => {
        try {
          localStorage.setItem(HEIGHT_KEY, String(h))
        } catch {
          // bỏ qua
        }
        return h
      })
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  const contentH = RULER_H + rows.length * ROW_H + AUDIO_ROW_H
  const logZ = Math.log(zoom)

  return (
    <section
      className="timeline"
      style={{ height: focused ? Math.min(height, FOCUS_TL_H) : height }}
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-label="Timeline"
    >
      <div className="tl-resize" onPointerDown={startResize} title={tr('Kéo để đổi chiều cao timeline')} />
      <div className="tl-bar">
        <span className="tl-time">
          <span ref={timeRef}>0:00</span>
          <span className="muted"> / {formatTime(total, withHours)}</span>
        </span>
        {selectedLayerIds.length + selectedTrackIds.length > 1 ? (
          <span className="tl-hint tl-multi">
            {tr('Đang chọn {n} mục. Kéo để dời cả nhóm, Delete để xoá, Esc để bỏ chọn.', { n: selectedLayerIds.length + selectedTrackIds.length })}
          </span>
        ) : (
          <span className="tl-hint muted">
            {tr('Kéo thanh để dời, kéo mép để đổi thời gian, kéo vùng trống để chọn nhiều. Bấm ? để xem phím tắt')}
          </span>
        )}
        <span className="tl-tools">
          <IconButton icon="help" title={tr('Phím tắt và thao tác chuột (?)')} onClick={() => useStore.getState().openDialog('shortcuts')} size={16} />
          <IconButton icon="split" title={tr('Tách thanh đang chọn tại đầu phát (Ctrl+B)')} onClick={splitAtPlayhead} size={16} />
          <span className="sep" />
          <IconButton icon="magnet" title={snapOn ? tr('Bắt dính: bật (giữ Shift để tạm tắt)') : tr('Bắt dính: tắt')} onClick={() => setSnapOn(!snapOn)} active={snapOn} size={16} />
          <span className="sep" />
          <IconButton icon="zoomOut" title={tr('Thu nhỏ')} onClick={() => zoomTo(zoom / 1.5)} size={16} />
          <input
            className="tl-zoom"
            type="range"
            min={Math.log(MIN_ZOOM)}
            max={Math.log(MAX_ZOOM)}
            step={0.01}
            value={logZ}
            style={rangeFill(logZ, Math.log(MIN_ZOOM), Math.log(MAX_ZOOM))}
            onChange={(e) => zoomTo(Math.exp(parseFloat(e.target.value)))}
            aria-label={tr('Mức zoom timeline')}
          />
          <IconButton icon="zoomIn" title={tr('Phóng to')} onClick={() => zoomTo(zoom * 1.5)} size={16} />
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setAutoFit(true)
              if (scrollRef.current) scrollRef.current.scrollLeft = 0
            }}
            title={tr('Vừa khung cả video')}
          >
            {tr('Vừa khung')}
          </button>
        </span>
      </div>
      <div className="tl-scroll" ref={scrollRef}>
        <div
          className="tl-inner"
          style={{ width: HEAD_W + laneW, height: contentH }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenu}
        >
          <div className="tl-ruler-row" style={{ height: RULER_H }}>
            <div className="tl-corner" style={{ width: HEAD_W }}>
              {total > 0 ? tr('{n} bài', { n: tl.entries.length }) : tr('Chưa có nhạc')}
            </div>
            <Ruler zoom={zoom} left={view.left} viewW={laneViewW} laneW={laneW} withHours={withHours} knobRef={knobRef} tip={visual?.tip ?? null} />
          </div>
          {rows.map((row) => {
            const head = row.layers[0]
            return (
              <LayerRow
                key={row.key}
                row={row}
                zoom={zoom}
                total={total}
                laneW={laneW}
                selIds={row.layers.filter((l) => selectedSet.has(l.id)).map((l) => l.id).join(',')}
                primaryId={!selectedTrackId && row.layers.some((l) => l.id === selectedLayerId) ? selectedLayerId : null}
                ctaIndex={selectedCta?.layerId === head.id ? selectedCta.index : null}
                starts={head.type === 'cta' ? ctaStartTimes(head.props as CtaProps, tl) : null}
              />
            )
          })}
          <AudioRow
            entries={tl.entries}
            zoom={zoom}
            laneW={laneW}
            left={view.left}
            viewW={laneViewW}
            selTracks={selectedTrackIds.join(',')}
            featuresVersion={featuresVersion}
            visual={visual}
            playheadRef={audioPlayheadRef}
          />
          <div className="tl-playhead" ref={playheadRef} />
          {visual?.snapT !== null && visual?.snapT !== undefined && <div className="tl-snapline" style={{ left: HEAD_W + visual.snapT * zoom }} />}
          {visual?.dropT !== undefined && <div className="tl-dropline" style={{ left: HEAD_W + visual.dropT * zoom }} />}
          {visual?.marquee && <div className="tl-marquee" style={{ left: visual.marquee.x, top: visual.marquee.y, width: visual.marquee.w, height: visual.marquee.h }} />}
        </div>
      </div>
      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
    </section>
  )
}

const Ruler = memo(function Ruler({
  zoom,
  left,
  viewW,
  laneW,
  withHours,
  knobRef,
  tip
}: {
  zoom: number
  left: number
  viewW: number
  laneW: number
  withHours: boolean
  knobRef: RefObject<HTMLDivElement | null>
  tip: { t: number; text: string } | null
}): ReactNode {
  const { major, minor } = tickStep(zoom)
  // Chỉ vẽ vạch trong vùng đang nhìn thấy và không vượt bề rộng timeline
  // (vạch nằm ngoài sẽ giữ vùng cuộn rộng như cũ sau khi thu nhỏ)
  const kMax = Math.floor(laneW / zoom / minor)
  const k0 = Math.min(kMax, Math.max(0, Math.floor(left / zoom / minor) - 1))
  const k1 = Math.min(kMax, Math.ceil((left + viewW) / zoom / minor) + 1)
  const ticks: ReactNode[] = []
  const perMajor = Math.round(major / minor)
  for (let k = k0; k <= k1; k++) {
    const t = k * minor
    const isMajor = k % perMajor === 0
    ticks.push(
      <div key={k} className={`tick${isMajor ? ' major' : ''}`} style={{ left: t * zoom }}>
        {isMajor && <span>{formatTick(t, major, withHours)}</span>}
      </div>
    )
  }
  return (
    <div className="tl-ruler" data-hit="ruler" style={{ width: laneW }}>
      {ticks}
      <div className="tl-knob-head" ref={knobRef} />
      {tip && (
        <div className="tl-tip" style={{ left: Math.min(tip.t * zoom, laneW - 60) }}>
          {tip.text}
        </div>
      )}
    </div>
  )
})

/** Màu riêng của lớp (nếu có) → biến CSS --c của thanh / chấm màu */
function colorStyle(color: string | undefined): CSSProperties | undefined {
  return color ? ({ '--c': color } as CSSProperties) : undefined
}

const LayerRow = memo(function LayerRow({
  row,
  zoom,
  total,
  laneW,
  selIds,
  primaryId,
  ctaIndex,
  starts
}: {
  row: TimelineRow
  zoom: number
  total: number
  laneW: number
  /** Id các lớp đang chọn trong hàng, nối bằng dấu phẩy (chuỗi để memo so sánh được) */
  selIds: string
  primaryId: string | null
  ctaIndex: number | null
  starts: number[] | null
}): ReactNode {
  const { selectLayer, toggleLayerSelection, setLayersEnabled, setLayersLocked } = useStore.getState()
  const [palette, setPalette] = useState<{ x: number; y: number } | null>(null)
  const closePalette = useCallback(() => setPalette(null), [])
  const layer = row.layers[0]
  const ids = row.layers.map((l) => l.id)
  const selected = selIds ? new Set(selIds.split(',')) : null
  const enabled = row.layers.some((l) => l.enabled)
  const locked = row.layers.every((l) => l.locked)
  const parts = row.layers.length
  return (
    <div className={`tl-row${selected ? ' selected' : ''}${enabled ? '' : ' off'}`} style={{ height: ROW_H }}>
      <div
        className="tl-head"
        style={{ width: HEAD_W }}
        onClick={(e) => (e.ctrlKey || e.metaKey || e.shiftKey ? toggleLayerSelection(layer.id) : selectLayer(layer.id))}
        title={parts > 1 ? `${tr(LAYER_LABELS[layer.type])} · ${tr('{n} đoạn', { n: parts })}` : tr(LAYER_LABELS[layer.type])}
      >
        <button
          type="button"
          className={`tl-dot t-${layer.type}`}
          style={colorStyle(layer.color)}
          title={tr('Đổi màu hàng')}
          aria-label={tr('Đổi màu hàng')}
          onClick={(e) => {
            e.stopPropagation()
            const r = e.currentTarget.getBoundingClientRect()
            setPalette(palette ? null : { x: r.left, y: r.bottom + 4 })
          }}
        />
        <span className="tl-name">
          {tr(layer.name)}
          {parts > 1 && <small className="muted"> ×{parts}</small>}
        </span>
        {/* Nút khoá / ẩn hiện khi di chuột qua hàng (luôn hiện khi đang khoá / đang ẩn): nhường chỗ cho tên */}
        <span className={`tl-head-tools${locked || !enabled ? ' on' : ''}`} onClick={(e) => e.stopPropagation()}>
          <IconButton
            icon={locked ? 'lock' : 'lockOpen'}
            title={locked ? tr('Đang khoá. Bấm để mở khoá') : tr('Khoá lớp (không kéo, tách, xoá nhầm)')}
            onClick={() => setLayersLocked(ids, !locked)}
            active={locked}
            size={14}
          />
          <IconButton icon={enabled ? 'eye' : 'eyeOff'} title={enabled ? tr('Ẩn lớp') : tr('Hiện lớp')} onClick={() => setLayersEnabled(ids, !enabled)} size={14} />
        </span>
      </div>
      {palette && <RowPalette at={palette} ids={ids} current={layer.color} onClose={closePalette} />}
      <div className="tl-lane" data-hit="lane" data-row={layer.id} style={{ width: laneW }}>
        {layer.type === 'cta' && starts ? (
          starts.map((s, i) => {
            const auto = (layer.props as CtaProps).schedule !== 'times'
            const dur = (layer.props as CtaProps).duration
            return (
              <div
                key={`${i}-${s}`}
                className={`tl-clip t-cta${auto ? ' auto' : ''}${ctaIndex === i ? ' selected' : ''}`}
                style={{ left: s * zoom, width: Math.max(8, dur * zoom), ...colorStyle(layer.color) }}
                data-hit="cta"
                data-id={layer.id}
                data-index={i}
                data-part="move"
                title={tr('Lần hiện {n}: {time}', { n: i + 1, time: formatTimePrecise(s) }) + (auto ? tr(' (đang tự động theo lịch, kéo để chỉnh riêng từng lần)') : '')}
              >
                <span className="tl-label">{i + 1}</span>
                <div className="tl-edge r" data-hit="cta" data-id={layer.id} data-index={i} data-part="dur" />
              </div>
            )
          })
        ) : (
          row.layers.map((l) => <LayerClip key={l.id} layer={l} zoom={zoom} total={total} selected={!!selected?.has(l.id)} primary={l.id === primaryId} />)
        )}
      </div>
    </div>
  )
})

/** Bảng chọn màu cho hàng (vị trí cố định theo màn hình để không bị khung cuộn của timeline cắt mất) */
function RowPalette({ at, ids, current, onClose }: { at: { x: number; y: number }; ids: string[]; current: string | undefined; onClose: () => void }): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: globalThis.PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    // Đăng ký sau nhịp hiện tại để cú nhấp mở bảng không đóng nó ngay
    const id = setTimeout(() => window.addEventListener('pointerdown', onDown), 0)
    return () => {
      clearTimeout(id)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [onClose])
  const pick = (c: string | undefined): void => {
    useStore.getState().setLayersColor(ids, c)
    onClose()
  }
  const y = Math.min(at.y, window.innerHeight - 60)
  return (
    <div className="tl-palette" ref={ref} style={{ left: at.x, top: y }} role="menu" aria-label={tr('Màu hàng')}>
      {ROW_COLORS.map((c) => (
        <button type="button" key={c} className={`swatch${current === c ? ' on' : ''}`} style={{ background: c }} title={c} aria-label={c} onClick={() => pick(c)} />
      ))}
      <button type="button" className={`swatch reset${current ? '' : ' on'}`} title={tr('Màu mặc định theo loại lớp')} onClick={() => pick(undefined)}>
        ↺
      </button>
    </div>
  )
}

function LayerClip({ layer, zoom, total, selected, primary }: { layer: Layer; zoom: number; total: number; selected: boolean; primary: boolean }): ReactNode {
  const { start, end } = layerRange(layer.timing, total > 0 ? total : 60)
  const w = Math.max(4, (end - start) * zoom)
  const fi = Math.min(w, layer.timing.fadeIn * zoom)
  const fo = Math.min(w, layer.timing.fadeOut * zoom)
  const part = (p: RangePart): { 'data-hit': string; 'data-id': string; 'data-part': string } => ({ 'data-hit': 'layer', 'data-id': layer.id, 'data-part': p })
  const locked = !!layer.locked
  const thumb = useThumbUrl(layer)
  return (
    <div
      className={`tl-clip t-${layer.type}${selected ? ' selected' : ''}${locked ? ' locked' : ''}${layer.enabled ? '' : ' off'}${thumb ? ' has-thumb' : ''}`}
      style={{ left: start * zoom, width: w, ...colorStyle(layer.color) }}
      {...part('move')}
      title={locked ? tr('{name} (đang khoá)', { name: tr(layer.name) }) : undefined}
    >
      {/* Ảnh nền / video nền / logo: dải ảnh thu nhỏ lặp dọc thanh (như cuộn phim) */}
      {thumb && <div className="tl-thumbs" style={{ backgroundImage: `url("${thumb}")` }} />}
      {fi > 0 && <div className="tl-fade in" style={{ width: fi }} />}
      {fo > 0 && <div className="tl-fade out" style={{ width: fo }} />}
      <span className="tl-label">
        {locked && <Icon name="lock" size={11} />}
        {tr(layer.name)}
      </span>
      {!locked && <div className="tl-edge l" {...part('start')} title={tr('Kéo để đổi thời điểm bắt đầu')} />}
      {!locked && <div className="tl-edge r" {...part('end')} title={tr('Kéo để đổi thời điểm kết thúc')} />}
      {primary && !locked && w > 40 && (
        <>
          {/* Núm hiện/ẩn dần luôn cách mép ≥ 12px để không che tay nắm kéo mép */}
          <div className="tl-fadeknob" style={{ left: Math.max(fi, 12) }} {...part('fadeIn')} title={tr('Kéo để hiện dần')} />
          <div className="tl-fadeknob" style={{ left: Math.min(w - fo, w - 12) }} {...part('fadeOut')} title={tr('Kéo để ẩn dần')} />
        </>
      )}
    </div>
  )
}

const AudioRow = memo(function AudioRow({
  entries,
  zoom,
  laneW,
  left,
  viewW,
  selTracks,
  featuresVersion,
  visual,
  playheadRef
}: {
  entries: TimelineEntry[]
  zoom: number
  laneW: number
  left: number
  viewW: number
  /** Id các clip nhạc đang chọn, nối bằng dấu phẩy */
  selTracks: string
  featuresVersion: number
  visual: Visual | null
  playheadRef: RefObject<HTMLDivElement | null>
}): ReactNode {
  const api = window.api
  const move = visual?.trackMove
  const group = visual?.groupMove
  const trim = visual?.trim
  const selected = new Set(selTracks ? selTracks.split(',') : [])
  // Vị trí vạch chèn khi đổi chỗ bài
  let insertAt: number | null = null
  let ghostLen = 0
  if (move) {
    const others = entries.filter((_, i) => i !== move.from)
    insertAt = move.to === 0 ? 0 : others[move.to - 1].end
    ghostLen = entries[move.from].length
  }
  return (
    <div className="tl-row audio" style={{ height: AUDIO_ROW_H }}>
      <div className="tl-head audio" style={{ width: HEAD_W }}>
        <Icon name="music" size={16} />
        <span className="tl-name">{tr('Nhạc')}</span>
        <small className="muted">{tr('{n} bài', { n: entries.length })}</small>
      </div>
      <div className="tl-lane" data-hit="lane" data-row="audio" style={{ width: laneW }}>
        <Waveform entries={entries} zoom={zoom} left={left} width={viewW} height={AUDIO_ROW_H} version={featuresVersion} />
        {entries.length === 0 && <div className="tl-empty">{tr('Kéo thả file nhạc vào đây')}</div>}
        {entries.map((e, i) => {
          let s = e.start
          let en = e.end
          if (trim?.trackId === e.track.id) {
            if (trim.side === 'start') s = trim.edgeT
            else en = trim.edgeT
          }
          const hitProps = (p: string): Record<string, string | number> => ({ 'data-hit': 'track', 'data-id': e.track.id, 'data-index': i, 'data-part': p })
          return (
            <div
              key={e.track.id}
              className={`tl-clip t-audio${selected.has(e.track.id) ? ' selected' : ''}${move?.from === i || group?.ids.includes(e.track.id) ? ' dragging' : ''}`}
              style={{ left: s * zoom, width: Math.max(4, (en - s) * zoom) }}
              {...hitProps('move')}
              title={`${e.track.title}${e.track.artist ? ` - ${e.track.artist}` : ''} (${formatTime(e.length)})\n${tr('kéo để đổi thứ tự, kéo mép để cắt')}`}
            >
              <span className="tl-label">
                {e.track.coverPath && <img src={api.fileUrl(e.track.coverPath)} alt="" />}
                <b>{e.track.title || tr('Không tên')}</b>
                <small>{formatTime(e.length)}</small>
              </span>
              <div className="tl-edge l" {...hitProps('start')} title={tr('Kéo để cắt đầu bài')} />
              <div className="tl-edge r" {...hitProps('end')} title={tr('Kéo để cắt cuối bài')} />
            </div>
          )
        })}
        {entries.map((e) =>
          // Chỉ vẽ dấu crossfade khi đoạn chồng đủ rộng, và không bắt chuột (không che tay nắm cắt bài)
          e.overlapIn > 0 && e.overlapIn * zoom >= 24 ? (
            <div key={`x-${e.track.id}`} className="tl-xfade" style={{ left: (e.start + e.overlapIn / 2) * zoom }}>
              ✕
            </div>
          ) : null
        )}
        <div className="tl-playhead in-row" ref={playheadRef} />
        {move && (
          <>
            <div className="tl-ghost" style={{ left: move.ghostStart * zoom, width: Math.max(4, ghostLen * zoom) }} />
            {insertAt !== null && <div className="tl-insert" style={{ left: insertAt * zoom }} />}
          </>
        )}
        {group && (
          <>
            <div className="tl-ghost" style={{ left: group.ghostStart * zoom, width: Math.max(4, group.len * zoom) }} />
            <div className="tl-insert" style={{ left: group.insertT * zoom }} />
          </>
        )}
        {visual?.dropInsertT !== undefined && <div className="tl-insert" style={{ left: visual.dropInsertT * zoom }} />}
      </div>
    </div>
  )
})

const envelopes = new WeakMap<TrackFeatures, Float32Array>()

/** Biên độ đỉnh mỗi frame phân tích (60/giây), tính một lần cho mỗi bài */
function envelopeOf(f: TrackFeatures): Float32Array {
  let env = envelopes.get(f)
  if (!env) {
    env = new Float32Array(f.frames)
    const d = f.data
    const stride = f.header.stride
    for (let i = 0; i < f.frames; i++) {
      let peak = 0
      const base = i * stride + OFF_WAVE
      for (let p = 0; p < WAVE_POINTS; p += 8) {
        const v = Math.abs(d[base + p] - 128) / 127
        if (v > peak) peak = v
      }
      env[i] = peak
    }
    envelopes.set(f, env)
  }
  return env
}

/** Sóng âm của hàng nhạc: một canvas bám theo vùng đang nhìn thấy (không phụ thuộc độ dài video) */
function Waveform({ entries, zoom, left, width, height, version }: { entries: TimelineEntry[]; zoom: number; left: number; width: number; height: number; version: number }): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.max(1, Math.round(width * dpr))
    c.height = Math.round(height * dpr)
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    const top = 20
    const mid = (top + height - 3) / 2
    const half = (height - 3 - top) / 2
    ctx.fillStyle = 'rgba(150, 182, 222, 0.62)'
    for (const e of entries) {
      const x0 = e.start * zoom - left
      const x1 = e.end * zoom - left
      if (x1 < 0 || x0 > width || !e.track.analysisKey) continue
      const f = features.get(e.track.analysisKey)
      if (!f) continue
      const env = envelopeOf(f)
      const trim = e.track.trimStart || 0
      for (let px = Math.max(0, Math.floor(x0)); px < Math.min(width, x1); px++) {
        const ta = (left + px) / zoom - e.start + trim
        const fa = Math.floor(ta * FEATURE_RATE)
        const fb = Math.max(fa + 1, Math.ceil((ta + 1 / zoom) * FEATURE_RATE))
        const step = Math.max(1, Math.floor((fb - fa) / 6))
        let peak = 0
        for (let k = fa; k < fb; k += step) if (k >= 0 && k < env.length && env[k] > peak) peak = env[k]
        const h = Math.max(0.5, peak * half)
        ctx.fillRect(px, mid - h, 1, h * 2)
      }
    }
  }, [entries, zoom, left, width, height, version])
  return <canvas ref={ref} className="tl-wave" style={{ width, height }} />
}
