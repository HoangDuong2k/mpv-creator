import { useEffect, useMemo } from 'react'
import { buildTimeline, type Timeline } from '../../shared/timeline'
import { features, player } from './engineHost'
import type { AudioSpec } from '../../shared/api'
import type { Project } from '../../shared/types'
import { useStore, type TrackStatus } from './store'

const api = window.api

/** Bỏ tiền tố "Error invoking remote method ..." của lỗi IPC */
export function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export function useTimeline(): Timeline {
  const tracks = useStore((s) => s.project.tracks)
  const transition = useStore((s) => s.project.settings.transition)
  return useMemo(() => buildTimeline(tracks, { transition }), [tracks, transition])
}

/** Phân tích âm thanh cho các bài mới thêm (chạy nền, có cache theo file). */
export function useAnalysis(): void {
  const tracks = useStore((s) => s.project.tracks)

  useEffect(
    () =>
      api.on('analysis:progress', ({ path, progress }) => {
        const st = useStore.getState().trackStatus[path]
        if (st?.state === 'analyzing') useStore.getState().setTrackStatus(path, { state: 'analyzing', progress })
      }),
    []
  )

  useEffect(() => {
    const { trackStatus, setTrackStatus } = useStore.getState()
    const seen = new Set<string>()
    for (const t of tracks) {
      if (seen.has(t.path)) continue
      seen.add(t.path)
      const st = trackStatus[t.path]
      if (st && st.state !== 'pending') {
        // Bài đã phân tích nhưng còn bản trong playlist chưa có analysisKey: project mới mở,
        // hoặc thêm lại cùng một bài để lặp playlist (lấy lại từ cache, không phân tích lại)
        const missing = tracks.some((x) => x.path === t.path && !x.analysisKey)
        if (st.state === 'ready' && missing) setTrackStatus(t.path, { state: 'pending', progress: 0 })
        else continue
      }
      setTrackStatus(t.path, { state: 'analyzing', progress: 0 })
      api
        .ensureAnalysis(t.path, t.duration)
        .then(async (r) => {
          await features.load(r.analysisKey)
          useStore.getState().update(
            (p) => {
              for (const x of p.tracks)
                if (x.path === t.path) {
                  x.analysisKey = r.analysisKey
                  x.duration = r.duration
                }
            },
            { silent: true }
          )
          useStore.getState().setTrackStatus(t.path, { state: 'ready', progress: 1 })
          useStore.getState().bumpFeatures()
        })
        .catch((err) => useStore.getState().setTrackStatus(t.path, { state: 'error', progress: 0, error: errorText(err) }))
    }
  }, [tracks])
}

/** Phần dữ liệu quyết định âm thanh; null khi còn bài chưa phân tích xong */
export function audioSpecOf(project: Project, trackStatus: Record<string, TrackStatus>): AudioSpec | null {
  const { tracks, settings } = project
  if (tracks.length === 0 || tracks.some((t) => !t.analysisKey || trackStatus[t.path]?.state !== 'ready')) return null
  return {
    tracks: tracks.map((t) => ({ analysisKey: t.analysisKey, duration: t.duration, trimStart: t.trimStart, trimEnd: t.trimEnd })),
    transition: settings.transition,
    fadeIn: settings.fadeIn,
    fadeOut: settings.fadeOut
  }
}

/** Đưa dữ liệu âm thanh mới nhất cho trình phát preview (đổi thứ tự/cắt bài có tiếng ngay). Trả về true khi đã có tiếng. */
export function useAudioSpec(): boolean {
  const project = useStore((s) => s.project)
  const trackStatus = useStore((s) => s.trackStatus)
  const spec = useMemo(() => audioSpecOf(project, trackStatus), [project, trackStatus])
  const key = spec ? JSON.stringify(spec) : ''
  useEffect(() => {
    player.setSpec(spec)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return spec !== null
}

/** Tự lưu tạm project mỗi 20 giây để không mất khi app bị tắt đột ngột. */
export function useAutosave(): void {
  useEffect(() => {
    const id = setInterval(() => {
      const { dirty, project } = useStore.getState()
      if (dirty) void api.autosave(project)
    }, 20000)
    const beforeUnload = (e: BeforeUnloadEvent): void => {
      const { dirty, project } = useStore.getState()
      if (dirty && project.tracks.length > 0) {
        void api.autosave(project)
        e.preventDefault()
        e.returnValue = false
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      clearInterval(id)
      window.removeEventListener('beforeunload', beforeUnload)
    }
  }, [])
}
