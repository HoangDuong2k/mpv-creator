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
