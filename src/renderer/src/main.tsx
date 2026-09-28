import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useStore } from './store'
import './styles.css'

// Cho kiểm thử tự động đọc trạng thái
;(window as unknown as { __pvm: Record<string, unknown> }).__pvm.store = useStore

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
