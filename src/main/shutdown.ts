// Lệnh tắt máy theo hệ điều hành (dùng cho tuỳ chọn "Tắt máy khi xuất xong").

export interface ShellCommand {
  cmd: string
  args: string[]
}

/**
 * Windows: "/t 0" tắt ngay nhưng không kèm "/f", nên chương trình khác còn dữ liệu chưa lưu
 * vẫn được hỏi (Windows chỉ tự thêm /f khi thời gian chờ lớn hơn 0).
 */
export function shutdownCommand(platform: NodeJS.Platform): ShellCommand {
  switch (platform) {
    case 'win32':
      return { cmd: 'shutdown', args: ['/s', '/t', '0'] }
    case 'darwin':
      return { cmd: 'osascript', args: ['-e', 'tell app "System Events" to shut down'] }
    default:
      return { cmd: 'systemctl', args: ['poweroff'] }
  }
}

/**
 * Chuẩn bị tắt máy (khi người dùng vừa tích "Tắt máy khi xuất xong"): trên Mac, lệnh tắt máy gửi tới
 * System Events nên macOS hỏi quyền lần đầu — hỏi ngay lúc này (người dùng đang ngồi ở máy), không đợi tới lúc
 * xuất xong lúc nửa đêm (hộp hỏi quyền sẽ chặn việc tắt máy). Hệ điều hành khác không cần gì.
 */
export function shutdownPermissionCommand(platform: NodeJS.Platform): ShellCommand | null {
  return platform === 'darwin' ? { cmd: 'osascript', args: ['-e', 'tell application "System Events" to return name of current user'] } : null
}
