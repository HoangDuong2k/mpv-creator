import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { EventMap, PvmApi } from '../shared/api'

const invoke = ipcRenderer.invoke.bind(ipcRenderer)

const api: PvmApi = {
  info: () => invoke('app:info'),
  openFiles: (kind, multi) => invoke('dialog:open', kind, multi),
  saveFile: (kind, defaultName) => invoke('dialog:save', kind, defaultName),
  importMedia: (paths) => invoke('media:import', paths),
  thumbStrip: (path) => invoke('media:thumbStrip', path),
  ensureAnalysis: (path, duration) => invoke('analysis:ensure', path, duration),
  loadAnalysis: (key) => invoke('analysis:load', key),
  audioChunk: (spec, fromFrame, frames) => invoke('audio:chunk', spec, fromFrame, frames),
  listEncoders: () => invoke('export:encoders'),
  startExport: (project, range) => invoke('export:start', project, range),
  cancelExport: () => invoke('export:cancel'),
  prepareShutdown: () => invoke('system:prepare-shutdown'),
  shutdown: () => invoke('system:shutdown'),
  setLanguage: (lang) => invoke('app:set-language', lang),
  listTemplates: () => invoke('templates:list'),
  saveTemplate: (template) => invoke('templates:save', template),
  deleteTemplate: (id) => invoke('templates:delete', id),
  readProject: (path) => invoke('project:read', path),
  writeProject: (path, project) => invoke('project:write', path, project),
  writeText: (path, text) => invoke('file:write-text', path, text),
  autosave: (project) => invoke('project:autosave', project),
  loadAutosave: () => invoke('project:load-autosave'),
  showItem: (path) => invoke('shell:show-item', path),
  copyText: (text) => invoke('clipboard:write', text),
  cacheInfo: () => invoke('cache:info'),
  clearCache: () => invoke('cache:clear'),
  openCacheDir: () => invoke('cache:open'),
  initialFiles: () => invoke('app:initial-files'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  fileUrl: (path) => `pvm://file/${encodeURIComponent(path)}`,
  on: <K extends keyof EventMap>(channel: K, cb: (data: EventMap[K]) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, data: EventMap[K]): void => cb(data)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
