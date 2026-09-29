import { spawn } from 'child_process'
import { existsSync, statSync } from 'fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { BrowserWindow, Menu, Notification, app, clipboard, dialog, ipcMain, powerSaveBlocker, shell, type IpcMainInvokeEvent } from 'electron'
import type { AppInfo, AudioSpec, EncoderOption, EventMap, FileKind, SaveKind } from '../shared/api'
import { normalizeProject } from '../shared/defaults'
import { withExtension } from '../shared/files'
import { formatTime } from '../shared/time'
import type { Project } from '../shared/types'
import { MixSource, toS16 } from './audio/mix'
import { CancelledError } from './ffmpeg'
import { ENCODERS, detectEncoders } from './export/encoders'
import { exportVideo } from './export/exporter'
import { AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, isAudioFile, readTrackInfo, videoThumbStrip } from './media'
import { asarUnpacked, defaultCacheDir } from './paths'
import { registerFileProtocol, registerSchemePrivileges } from './protocol'
import { shutdownCommand, type ShellCommand } from './shutdown'
import { Workspace } from './workspace'
import { TemplateStore } from './templates'
import type { StyleTemplate } from '../shared/templates'
import { isLang, setLang, tr, trKey } from '../shared/i18n'

registerSchemePrivileges()

// Cho phép đặt thư mục dữ liệu riêng (kiểm thử tự động, bản portable)
if (process.env.PVM_USER_DATA) app.setPath('userData', process.env.PVM_USER_DATA)

// Cache lớn (âm thanh đã giải mã) để ở thư mục cache của hệ điều hành — trên Windows là %LOCALAPPDATA%,
// không nằm trong AppData\Roaming. Khi kiểm thử (PVM_USER_DATA) dùng thư mục riêng.
const cacheDir = process.env.PVM_USER_DATA ? join(app.getPath('userData'), 'cache') : defaultCacheDir()
const workspace = new Workspace(cacheDir)
const fontsDir = app.isPackaged ? join(process.resourcesPath, 'fonts') : join(app.getAppPath(), 'resources', 'fonts')
const autosavePath = join(app.getPath('userData'), 'autosave.pvm.json')
const templates = new TemplateStore(join(app.getPath('userData'), 'templates'))
let mainWindow: BrowserWindow | null = null
/** Thoát để tắt máy: không hỏi "Project chưa lưu" (phiên làm việc đã được tự lưu) */
let quittingForShutdown = false

/** Chữ main process hiện ra khi xuất video xong (thông báo của hệ điều hành) */
const EXPORT_TEXT = {
  doneTitle: (): string => tr('Đã xuất xong video'),
  doneBody: (file: string, seconds: number): string => tr('{file} — xong sau {time}', { file, time: formatTime(seconds, seconds >= 3600) }),
  failTitle: (): string => tr('Xuất video không thành công'),
  shutdownFailed: (detail: string): string => tr('Không tắt được máy: {detail}', { detail })
}

/** Tên nhóm file trong hộp thoại mở / lưu theo ngôn ngữ giao diện */
function localized(filters: Electron.FileFilter[]): Electron.FileFilter[] {
  return filters.map((f) => ({ ...f, name: tr(f.name) }))
}

function send<K extends keyof EventMap>(channel: K, data: EventMap[K]): void {
  mainWindow?.webContents.send(channel, data)
}

// Giữ tham chiếu tới thông báo đang hiện, nếu không có thể bị thu hồi bộ nhớ và mất sự kiện bấm
let lastNotice: Notification | null = null

/** Thông báo của hệ điều hành khi người dùng đang làm việc khác (cửa sổ app không được chọn) */
function notifyUnfocused(title: string, body: string): void {
  const win = mainWindow
  if (!win || win.isFocused()) return
  // Nháy biểu tượng trên thanh tác vụ tới khi người dùng quay lại app
  win.flashFrame(true)
  win.once('focus', () => win.flashFrame(false))
  if (!Notification.isSupported()) return
  lastNotice?.close()
  const n = new Notification({ title, body })
  n.on('click', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  n.show()
  lastNotice = n
}

/** File nhạc truyền qua dòng lệnh ("Mở bằng…" hoặc kéo thả lên icon app) */
function audioArgs(argv: string[]): string[] {
  // Khi chạy dev bằng "electron ." thì argv[1] là thư mục app, không phải file người dùng
  const args = argv.slice(process.defaultApp ? 2 : 1)
  return args.filter((a) => !a.startsWith('-') && existsSync(a) && (isAudioFile(a) || statSync(a).isDirectory()))
}

const FILTERS: Record<FileKind, Electron.FileFilter[]> = {
  audio: [{ name: trKey('Âm thanh'), extensions: AUDIO_EXTENSIONS }],
  image: [{ name: trKey('Ảnh'), extensions: IMAGE_EXTENSIONS }],
  video: [{ name: 'Video', extensions: VIDEO_EXTENSIONS }],
  media: [
    { name: trKey('Ảnh và video'), extensions: [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS] },
    { name: trKey('Ảnh'), extensions: IMAGE_EXTENSIONS },
    { name: 'Video', extensions: VIDEO_EXTENSIONS }
  ],
  project: [{ name: 'Project Playlist Video', extensions: ['json'] }]
}

const SAVE_FILTERS: Record<SaveKind, Electron.FileFilter[]> = {
  video: [{ name: 'Video MP4', extensions: ['mp4'] }],
  project: [{ name: 'Project Playlist Video', extensions: ['json'] }],
  text: [{ name: trKey('Văn bản'), extensions: ['txt'] }]
}

async function expandAudioPaths(paths: string[]): Promise<string[]> {
  const out: string[] = []
  for (const p of paths) {
    if (!existsSync(p)) continue
    if (statSync(p).isDirectory()) {
      const entries = (await readdir(p)).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }))
      for (const e of entries) if (isAudioFile(e)) out.push(join(p, e))
    } else if (isAudioFile(p)) out.push(p)
  }
  return out
}

// Giới hạn số bài phân tích cùng lúc
let running = 0
const queue: Array<() => void> = []
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= 3) await new Promise<void>((r) => queue.push(r))
  running++
  try {
    return await fn()
  } finally {
    running--
    queue.shift()?.()
  }
}

let chunkSource: { key: string; source: MixSource } | null = null
let exportAbort: AbortController | null = null

function workerPath(): string {
  // Worker thread không nạp được file trong app.asar → dùng bản giải nén (asarUnpack)
  return asarUnpacked(join(__dirname, 'exportWorker.js'))
}

function registerIpc(): void {
  const handle = <A extends unknown[], R>(channel: string, fn: (...args: A) => Promise<R> | R): void => {
    ipcMain.handle(channel, (_e: IpcMainInvokeEvent, ...args: unknown[]) => fn(...(args as A)))
  }

  handle('app:info', (): AppInfo => ({
    version: app.getVersion(),
    platform: process.platform,
    fontsDir,
    cacheDir: workspace.cacheDir,
    videosDir: app.getPath('videos')
  }))

  handle('app:initial-files', () => expandAudioPaths(audioArgs(process.argv)))

  handle('dialog:open', async (kind: FileKind, multi: boolean) => {
    const props: Array<'openFile' | 'multiSelections'> = multi ? ['openFile', 'multiSelections'] : ['openFile']
    const r = await dialog.showOpenDialog(mainWindow!, { properties: props, filters: localized(FILTERS[kind]) })
    return r.canceled ? [] : r.filePaths
  })

  handle('dialog:save', async (kind: SaveKind, defaultName: string) => {
    const dir = kind === 'video' ? app.getPath('videos') : app.getPath('documents')
    const defaultPath = defaultName.includes('/') || defaultName.includes('\\') ? defaultName : join(dir, defaultName)
    const r = await dialog.showSaveDialog(mainWindow!, { defaultPath, filters: localized(SAVE_FILTERS[kind]) })
    if (r.canceled || !r.filePath) return null
    // Luôn đúng đuôi (vd. gõ "video.final" → "video.final.mp4"), FFmpeg dựa vào đuôi để chọn định dạng
    return withExtension(r.filePath, SAVE_FILTERS[kind][0].extensions[0])
  })

  handle('media:thumbStrip', (path: string) => videoThumbStrip(path, workspace.thumbDir))

  handle('media:import', async (paths: string[]) => {
    const files = await expandAudioPaths(paths)
    return Promise.all(files.map((p) => readTrackInfo(p, workspace.coverDir)))
  })

  handle('analysis:ensure', (path: string, duration: number) =>
    withSlot(() => workspace.ensureAnalysis({ path, duration }, { onProgress: (progress) => send('analysis:progress', { path, progress }) }))
  )

  handle('analysis:load', async (key: string) => new Uint8Array(await readFile(workspace.featuresPath(key))))

  // Preview xin từng đoạn âm thanh của bản mix (PCM stereo 16-bit 48kHz)
  handle('audio:chunk', async (spec: AudioSpec, fromFrame: number, frames: number) => {
    const key = JSON.stringify(spec)
    if (chunkSource?.key !== key) {
      void chunkSource?.source.close()
      chunkSource = { key, source: workspace.mixSource(spec.tracks, spec) }
    }
    const pcm = toS16(await chunkSource.source.read(Math.max(0, Math.round(fromFrame)), Math.max(0, Math.round(frames))))
    return new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  })

  handle('export:encoders', async (): Promise<EncoderOption[]> => {
    const ok = await detectEncoders()
    return ENCODERS.map((e) => ({ ...e, available: ok.includes(e.id) }))
  })

  handle('export:start', async (project: Project, range?: { start: number; duration: number }) => {
    if (exportAbort) throw new Error(tr('Đang có một tiến trình xuất video'))
    const ctrl = new AbortController()
    exportAbort = ctrl
    // Video dài xuất mất hàng chục phút, người dùng thường để máy tự chạy: không cho máy ngủ giữa chừng
    const blocker = powerSaveBlocker.start('prevent-app-suspension')
    let failed = false
    try {
      mainWindow?.setProgressBar(0)
      const result = await exportVideo({
        project,
        workspace,
        settings: project.export,
        fontsDir,
        workerPath: workerPath(),
        range,
        appVersion: app.getVersion(),
        signal: ctrl.signal,
        onProgress: (p) => {
          mainWindow?.setProgressBar(p.progress)
          send('export:progress', p)
        }
      })
      // Xuất thử 15 giây thì người dùng đang ngồi xem — chỉ báo khi xuất cả video
      if (!range) notifyUnfocused(EXPORT_TEXT.doneTitle(), EXPORT_TEXT.doneBody(basename(result.outputPath), result.seconds))
      return result
    } catch (err) {
      if (err instanceof CancelledError) throw new Error(tr('Đã huỷ xuất video'))
      failed = true
      if (!range) notifyUnfocused(EXPORT_TEXT.failTitle(), (err as Error).message)
      throw err
    } finally {
      exportAbort = null
      if (powerSaveBlocker.isStarted(blocker)) powerSaveBlocker.stop(blocker)
      if (failed) {
        // Thanh tiến trình trên taskbar chuyển đỏ một lúc (Windows) để người dùng thấy có lỗi
        mainWindow?.setProgressBar(1, { mode: 'error' })
        setTimeout(() => {
          if (!exportAbort) mainWindow?.setProgressBar(-1)
        }, 15000)
      } else mainWindow?.setProgressBar(-1)
    }
  })

  handle('app:set-language', (lang: unknown) => {
    if (isLang(lang)) setLang(lang)
  })

  handle('system:shutdown', async () => {
    const c = shutdownCommand(process.platform)
    // Kiểm thử tự động: chỉ ghi lại lệnh, không tắt máy thật
    if (process.env.PVM_DRY_SHUTDOWN) {
      ;(globalThis as { __pvmShutdown?: ShellCommand }).__pvmShutdown = c
      return
    }
    await new Promise<void>((resolve, reject) => {
      const child = spawn(c.cmd, c.args, { detached: true, stdio: 'ignore', windowsHide: true })
      // Lệnh chưa trả về sau vài giây: coi như máy đang tắt
      const timer = setTimeout(resolve, 5000)
      child.on('error', (e) => {
        clearTimeout(timer)
        reject(new Error(EXPORT_TEXT.shutdownFailed(e.message)))
      })
      child.on('exit', (code) => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new Error(EXPORT_TEXT.shutdownFailed(tr('mã {code}', { code: String(code) }))))
      })
      child.unref()
    })
    quittingForShutdown = true
    app.quit()
  })

  handle('export:cancel', () => {
    exportAbort?.abort()
  })

  handle('project:read', async (path: string) => normalizeProject(JSON.parse(await readFile(path, 'utf8')) as Project))

  handle('project:write', async (path: string, project: Project) => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(project, null, 2), 'utf8')
  })

  handle('file:write-text', async (path: string, text: string) => {
    // Notepad cũ trên Windows cần xuống dòng CRLF
    await writeFile(path, process.platform === 'win32' ? text.replace(/\r?\n/g, '\r\n') : text, 'utf8')
  })

  handle('clipboard:write', (text: string) => clipboard.writeText(text))

  handle('cache:info', async () => ({ dir: workspace.cacheDir, bytes: await workspace.audioCacheSize() }))

  handle('cache:clear', async () => {
    // Đóng file PCM đang mở (Windows không cho xoá file đang mở)
    await chunkSource?.source.close()
    chunkSource = null
    await workspace.clearAudioCache()
  })

  handle('cache:open', async () => {
    await mkdir(workspace.cacheDir, { recursive: true })
    await shell.openPath(workspace.cacheDir)
  })

  handle('project:autosave', async (project: Project) => {
    await writeFile(autosavePath, JSON.stringify(project), 'utf8')
  })

  handle('project:load-autosave', async () => {
    if (!existsSync(autosavePath)) return null
    try {
      return normalizeProject(JSON.parse(await readFile(autosavePath, 'utf8')) as Project)
    } catch {
      return null
    }
  })

  handle('shell:show-item', (path: string) => shell.showItemInFolder(path))

  handle('templates:list', () => templates.list())
  handle('templates:save', (template: StyleTemplate) => templates.save(template))
  handle('templates:delete', (id: string) => templates.remove(id))
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#0f1117',
    title: 'Playlist Video Maker',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // Preview phát tiếng bằng Web Audio ngay khi bấm Play/Space
      autoplayPolicy: 'no-user-gesture-required'
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => (mainWindow = null))

  // Hỏi lại khi đóng cửa sổ mà project chưa lưu (renderer chặn beforeunload)
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    if (quittingForShutdown) {
      event.preventDefault()
      return
    }
    const choice = dialog.showMessageBoxSync(mainWindow!, {
      type: 'question',
      buttons: [tr('Thoát không lưu'), tr('Ở lại')],
      defaultId: 1,
      cancelId: 1,
      title: tr('Project chưa lưu'),
      message: tr('Project có thay đổi chưa lưu. Bạn vẫn muốn thoát?')
    })
    if (choice === 0) event.preventDefault()
  })

  // Link ngoài mở bằng trình duyệt
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // Cửa sổ app không bao giờ rời trang của mình (vd. lỡ thả một đường link vào cửa sổ):
  // trang web lạ không được chạy trong app và không đọc được file cục bộ qua pvm://
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault()
  })

  if (!app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') mainWindow?.webContents.toggleDevTools()
    })
  }

  const screenshot = process.env.PVM_SCREENSHOT
  if (screenshot) {
    // Chụp ảnh cửa sổ để kiểm thử tự động giao diện
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const img = await mainWindow!.webContents.capturePage()
        await writeFile(screenshot, img.toPNG())
        if (process.env.PVM_SCREENSHOT_EXIT) app.exit(0)
      }, Number(process.env.PVM_SCREENSHOT_DELAY ?? 4000))
    })
  }

  if (process.env.ELECTRON_RENDERER_URL) void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()
else {
  app.on('second-instance', async (_e, argv) => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    const files = await expandAudioPaths(audioArgs(argv))
    if (files.length) send('app:open-files', files)
  })

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.playlistvideomaker.app')
    Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null)
    registerFileProtocol()
    registerIpc()
    createWindow()
    // Dọn cache ở nền, không chặn việc mở app (kể cả cache ở vị trí cũ trong thư mục userData)
    setTimeout(() => {
      void workspace.pruneCache()
      const legacy = join(app.getPath('userData'), 'cache')
      if (legacy !== cacheDir) void rm(legacy, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined)
    }, 5000)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    exportAbort?.abort()
    if (process.platform !== 'darwin') app.quit()
  })
}

