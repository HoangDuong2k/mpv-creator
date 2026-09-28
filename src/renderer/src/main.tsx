import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useStore } from './store'
import './styles.css'

// Cho kiểm thử tự động đọc trạng thái
;(window as unknown as { __pvm: Record<string, unknown> }).__pvm.store = useStore

// Thả thứ mà không chỗ nào nhận (đường link, chữ, ảnh bìa kéo nhầm…): chặn hành vi mặc định của
// Chromium là mở luôn thứ đó trong cửa sổ app — làm mất giao diện và project đang làm
window.addEventListener('dragover', (e) => {
  if (e.defaultPrevented) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
})
window.addEventListener('drop', (e) => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
