; Tuỳ biến bộ cài NSIS (electron-builder nạp qua nsis.include)

!macro customUnInstall
  ; Gỡ hẳn app (không phải cập nhật lên bản mới): xoá bộ nhớ đệm âm thanh — có thể vài GB, tạo lại được
  ${ifNot} ${isUpdated}
    RMDir /r "$LOCALAPPDATA\PlaylistVideoMaker\Cache"
    RMDir "$LOCALAPPDATA\PlaylistVideoMaker"
  ${endIf}
!macroend
