// Hệ điều hành đang chạy (nạp đầu tiên, trước mọi module giao diện): trên macOS hiện phím tắt kiểu Mac (⌘…).
import { setMacKeys } from '../../shared/i18n'

export const isMac = /Mac/i.test(navigator.platform || navigator.userAgent)

setMacKeys(isMac)
