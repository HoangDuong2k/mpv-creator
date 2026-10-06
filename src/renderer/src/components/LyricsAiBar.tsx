import { useEffect, useState, type ReactNode } from 'react'
import { Button, NativeSelect, Progress } from 'momi-ui'
import type { AiModelKey, AiProgress } from '../../../shared/api'
import { tr } from '../../../shared/i18n'
import { cancelLyricsAi, defaultModel, refreshAiModels, rememberModel, runLyricsAi, sizeText, storedModel, useLyricsAi } from '../lyricsAi'
import { Icon } from './ui'

const api = window.api

/** Dòng trạng thái và phần trăm (null: chưa biết, thanh chạy qua lại) của từng bước */
function stepText(p: AiProgress | null, modelReady: boolean): { label: string; value: number | null } {
  if (!p || p.phase === 'decode') return { label: tr('Đang chuẩn bị âm thanh…'), value: null }
  if (p.phase === 'download' && !modelReady && p.total > 0)
    return { label: tr('Đang tải mô hình AI… {done} / {total}', { done: sizeText(p.done), total: sizeText(p.total) }), value: (p.done / p.total) * 100 }
  if (p.phase === 'download' || p.phase === 'load') return { label: tr('Đang nạp mô hình AI…'), value: null }
  return { label: tr('AI đang nghe bài hát… {done}/{total} đoạn', { done: p.done, total: p.total }), value: p.total ? (p.done / p.total) * 100 : null }
}

/**
 * AI căn lời: nghe giọng hát của bài rồi đặt mốc cho lời đã dán, tới từng chữ. Lần đầu hỏi trước khi tải mô hình
 * (ghi rõ dung lượng); trong lúc chạy hiện tiến độ và nút Huỷ.
 */
export function LyricsAiBar({ trackId, lines }: { trackId: string; lines: string[] }): ReactNode {
  const job = useLyricsAi((s) => s.job)
  const models = useLyricsAi((s) => s.models)
  // Chưa chọn bao giờ thì theo lời đang soạn (dán lời tiếng Việt vào là chuyển sang mô hình Chính xác)
  const [picked, setPicked] = useState<AiModelKey | null>(storedModel)
  const model = picked ?? defaultModel(lines)
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    void refreshAiModels()
  }, [])

  const info = models?.find((m) => m.key === model)
  const hasLyrics = lines.some((l) => l.trim())
  const start = (): void => {
    rememberModel(model)
    if (info && !info.ready && !confirming) return setConfirming(true)
    setConfirming(false)
    void runLyricsAi(trackId, model)
  }

  if (job?.trackId === trackId) {
    const step = stepText(job.progress, !!models?.find((m) => m.key === job.model)?.ready)
    return (
      <div className="lyrics-ai running" data-lyrics-ai="running">
        <Progress className="lyrics-ai-progress" size="sm" value={step.value} label={step.label} />
        <Button variant="outline" tone="neutral" size="sm" onClick={cancelLyricsAi}>
          {tr('Huỷ')}
        </Button>
      </div>
    )
  }

  if (confirming && info) {
    return (
      <div className="lyrics-ai confirm" data-lyrics-ai="confirm">
        <p className="small">
          {tr('Lần đầu dùng cần tải mô hình AI {name} ({size}) từ Hugging Face, chỉ tải một lần. Nhạc của bạn được xử lý ngay trên máy, không gửi đi đâu.', {
            name: model === 'fast' ? tr('Nhanh') : tr('Chính xác'),
            size: sizeText(info.bytes)
          })}
        </p>
        <div className="lyrics-tools">
          <Button variant="solid" tone="primary" size="sm" data-action="lyrics-ai-download" onClick={start}>
            {tr('Tải và căn lời')}
          </Button>
          <Button variant="ghost" tone="neutral" size="sm" onClick={() => setConfirming(false)}>
            {tr('Thôi')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="lyrics-ai" data-lyrics-ai="idle">
      <div className="lyrics-tools">
        <Button variant="soft" tone="primary" size="sm" data-action="lyrics-ai" disabled={!hasLyrics || !!job} onClick={start}>
          <Icon name="sparkle" size={14} /> {tr('AI căn lời')}
        </Button>
        <NativeSelect
          size="sm"
          wrapperClassName="w-auto min-w-[150px] shrink-0"
          className="lyrics-ai-model"
          aria-label={tr('Mô hình AI')}
          value={model}
          disabled={!!job}
          onChange={(e) => {
            setPicked(e.target.value as AiModelKey)
            rememberModel(e.target.value as AiModelKey)
          }}
        >
          {(models ?? []).map((m) => (
            <option key={m.key} value={m.key}>
              {m.key === 'fast' ? tr('Nhanh') : tr('Chính xác')}
              {m.ready ? '' : ` · ${tr('tải {size}', { size: sizeText(m.bytes) })}`}
            </option>
          ))}
        </NativeSelect>
        {info?.ready && !job && (
          <Button
            variant="ghost"
            tone="neutral"
            size="xs"
            className="lyrics-ai-remove"
            onClick={() => void api.aiRemoveModel(model).then(refreshAiModels)}
          >
            {tr('Xoá mô hình ({size})', { size: sizeText(info.bytes) })}
          </Button>
        )}
      </div>
      <p className="muted small">
        {job
          ? tr('AI đang căn lời một bài khác, đợi xong rồi thử lại.')
          : !hasLyrics
            ? tr('Dán lời vào ô bên trái trước, AI sẽ nghe giọng hát và đặt mốc cho từng câu, từng chữ.')
            : model === 'fast'
              ? tr('AI nghe giọng hát và đặt mốc cho từng câu, từng chữ. Nhanh: khoảng nửa phút mỗi bài, hợp với lời tiếng Anh.')
              : tr('AI nghe giọng hát và đặt mốc cho từng câu, từng chữ. Chính xác: 1–3 phút mỗi bài, nghe tiếng Việt tốt hơn nhiều.')}
      </p>
    </div>
  )
}
