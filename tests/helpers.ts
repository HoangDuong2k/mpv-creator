import type { Track } from '../src/shared/types'

export function track(id: string, duration: number, extra: Partial<Track> = {}): Track {
  return { id, path: `/music/${id}.mp3`, title: `Bài ${id}`, artist: `Ca sĩ ${id}`, album: '', duration, trimStart: 0, trimEnd: 0, analysisKey: `key-${id}`, ...extra }
}
