/**
 * AI căn lời phía giao diện: trạng thái công việc giữ ngoài hộp Lời bài hát (đóng hộp vẫn chạy tiếp, xong thì tự áp
 * vào bài), mô hình đã tải, mô hình người dùng chọn lần trước.
 */
import { create } from 'zustand'
import type { AiModelInfo, AiModelKey, AiProgress } from '../../shared/api'
import { tr } from '../../shared/i18n'
import { applyAlignment } from '../../shared/lyrics'
import { LOW_CONFIDENCE, alignLyrics, lyricsLanguage } from '../../shared/lyricsAlign'
import { errorText } from './hooks'
import { useStore } from './store'

const api = window.api
const PREF_KEY = 'pvm.aiModel'

export interface LyricsAiJob {
  trackId: string
  model: AiModelKey
  progress: AiProgress | null
}

interface LyricsAiState {
  job: LyricsAiJob | null
  /** Các mô hình và đã tải về chưa (null: chưa hỏi main) */
  models: AiModelInfo[] | null
}

export const useLyricsAi = create<LyricsAiState>(() => ({ job: null, models: null }))

api.on('lyrics:ai-progress', (p) => useLyricsAi.setState((s) => (s.job ? { job: { ...s.job, progress: p } } : s)))

export async function refreshAiModels(): Promise<void> {
  useLyricsAi.setState({ models: await api.aiModels() })
}

/** Mô hình người dùng chọn lần trước; null nếu chưa chọn bao giờ */
export function storedModel(): AiModelKey | null {
  try {
    const v = localStorage.getItem(PREF_KEY)
    if (v === 'fast' || v === 'accurate') return v
  } catch {
    // không có localStorage: dùng mặc định
  }
  return null
}

/** Chưa chọn bao giờ: lời tiếng Việt dùng mô hình Chính xác (mô hình Nhanh nghe tiếng Việt kém) */
export function defaultModel(lines: string[]): AiModelKey {
  return lyricsLanguage(lines) === 'vi' ? 'accurate' : 'fast'
}

export function rememberModel(model: AiModelKey): void {
  try {
    localStorage.setItem(PREF_KEY, model)
  } catch {
    // không lưu được thì lần sau hỏi lại theo mặc định
  }
}

/** "80 MB", "762 MB", "1,2 GB" */
export function sizeText(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1).replace('.', ',')} GB` : `${Math.round(bytes / 1e6)} MB`
}

/** AI nghe bài `trackId` rồi căn lời đang có của bài; một bài một lúc */
export async function runLyricsAi(trackId: string, model: AiModelKey): Promise<void> {
  if (useLyricsAi.getState().job) return
  const track = useStore.getState().project.tracks.find((t) => t.id === trackId)
  if (!track?.lyrics?.lines.length) return
  const { toast, updateTrack } = useStore.getState()
  useLyricsAi.setState({ job: { trackId, model, progress: null } })
  try {
    const res = await api.aiTranscribe(track.path, model, lyricsLanguage(track.lyrics.lines.map((l) => l.text)))
    if ('cancelled' in res) return
    // Lời có thể đã sửa trong lúc AI nghe: căn theo lời hiện tại của bài
    const lyrics = useStore.getState().project.tracks.find((t) => t.id === trackId)?.lyrics
    if (!lyrics?.lines.length) return
    const aligned = alignLyrics(
      lyrics.lines.map((l) => l.text),
      res.words
    )
    if (!res.words.length || !aligned.some((l) => !l.estimated)) {
      toast('error', tr('AI không nghe ra lời hát nào khớp với lời đã dán. Kiểm tra lại lời, hoặc thử mô hình Chính xác.'))
      return
    }
    const next = applyAlignment(lyrics, aligned)
    updateTrack(trackId, { lyrics: next })
    const doubt = next.lines.filter((l) => l.conf !== undefined && l.conf < LOW_CONFIDENCE).length
    const n = aligned.length
    toast(
      'success',
      doubt
        ? tr('AI đã căn {n} dòng; {k} dòng tô vàng AI chưa chắc, nên nghe lại. Ctrl+Z để hoàn tác.', { n, k: doubt })
        : tr('AI đã căn {n} dòng. Ctrl+Z để hoàn tác.', { n })
    )
  } catch (err) {
    toast('error', errorText(err))
  } finally {
    useLyricsAi.setState({ job: null })
    void refreshAiModels()
  }
}

export function cancelLyricsAi(): void {
  void api.aiCancel()
}
