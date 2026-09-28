import { useMemo, useState, type ReactNode } from 'react'
import { safeFileName } from '../../../shared/files'
import { buildChapters } from '../../../shared/time'
import { useTimeline } from '../hooks'
import { useStore } from '../store'
import { Icon, Modal, Row } from './ui'

const api = window.api

const TEMPLATES: Array<[string, string]> = [
  ['{time} {title}{ - artist}', '0:00 Tên bài - Ca sĩ'],
  ['{time} {title}', '0:00 Tên bài'],
  ['{time} {index}. {title}{ - artist}', '0:00 01. Tên bài - Ca sĩ'],
  ['{time} | {title}{ - artist}', '0:00 | Tên bài - Ca sĩ']
]

export function ChaptersDialog(): ReactNode {
  const timeline = useTimeline()
  const project = useStore((s) => s.project)
  const { openDialog, toast } = useStore.getState()
  const [template, setTemplate] = useState(TEMPLATES[0][0])
  const text = useMemo(() => buildChapters(timeline, { template }), [timeline, template])

  const tooShort = timeline.entries.filter((e) => e.displayEnd - e.displayStart < 10).length
  const warnings: string[] = []
  if (timeline.entries.length < 3) warnings.push('YouTube cần ít nhất 3 mốc thời gian để hiện chương (chapter).')
  if (tooShort > 0) warnings.push(`${tooShort} bài ngắn hơn 10 giây — YouTube yêu cầu mỗi chương dài tối thiểu 10 giây.`)

  return (
    <Modal
      title="Timestamp cho mô tả YouTube"
      onClose={() => openDialog(null)}
      wide
      footer={
        <>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const p = await api.saveFile('text', `${safeFileName(project.name)} - timestamp.txt`)
              if (p) {
                await api.writeText(p, text)
                toast('success', 'Đã lưu file timestamp')
              }
            }}
          >
            Lưu file .txt
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={async () => {
              await api.copyText(text)
              toast('success', 'Đã copy timestamp — dán vào phần mô tả video')
            }}
          >
            <Icon name="copy" size={16} /> Copy
          </button>
        </>
      }
    >
      <Row label="Định dạng">
        <select value={template} onChange={(e) => setTemplate(e.target.value)}>
          {TEMPLATES.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </Row>
      <textarea className="chapters" readOnly value={text} rows={Math.min(18, Math.max(6, timeline.entries.length + 1))} />
      {warnings.map((w) => (
        <p key={w} className="warn">
          {w}
        </p>
      ))}
      <p className="muted small">Mốc thời gian lấy ở giữa đoạn crossfade — đúng lúc bài mới nghe rõ.</p>
    </Modal>
  )
}
