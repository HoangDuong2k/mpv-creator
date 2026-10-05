import type { ReactNode } from 'react'
import { DensityProvider, LocaleProvider, ThemeProvider, TooltipProvider, vi } from 'momi-ui'
import { useStore } from '../store'

/**
 * Bọc app trong các provider của momi-ui: nền tối cố định (màu video trên preview không bị giao diện sáng làm
 * lệch mắt), chữ có sẵn của component theo nút VI / EN, control cỡ nhỏ gọn như bảng thuộc tính của trình dựng.
 */
export function UiProviders({ children }: { children: ReactNode }): ReactNode {
  const lang = useStore((s) => s.lang)
  return (
    <ThemeProvider forcedTheme="dark">
      <LocaleProvider locale={lang === 'vi' ? 'vi-VN' : 'en-US'} messages={lang === 'vi' ? vi : undefined}>
        <TooltipProvider delayDuration={450}>
          <DensityProvider density="compact">{children}</DensityProvider>
        </TooltipProvider>
      </LocaleProvider>
    </ThemeProvider>
  )
}
