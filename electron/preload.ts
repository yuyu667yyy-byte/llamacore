/*
 * Copyright (c) 2026 Lucas Vann (陆凯文)
 * Released under the MIT License. See LICENSE for details.
 */

import { contextBridge, ipcRenderer } from 'electron'

// Type-safe IPC bridge exposed to the renderer process
const api = {
  // Conversations
  conv: {
    list: () => ipcRenderer.invoke('conv:list'),
    create: (modelName: string) => ipcRenderer.invoke('conv:create', modelName),
    rename: (id: string, title: string) => ipcRenderer.invoke('conv:rename', id, title),
    delete: (id: string) => ipcRenderer.invoke('conv:delete', id),
    touch: (id: string, title?: string) => ipcRenderer.invoke('conv:touch', id, title),
  },

  // Messages
  msg: {
    list: (convId: string) => ipcRenderer.invoke('msg:list', convId),
    add: (convId: string, role: string, content: string, attachments?: any[]) =>
      ipcRenderer.invoke('msg:add', convId, role, content, attachments),
    update: (id: number, content: string) => ipcRenderer.invoke('msg:update', id, content),
    deleteFrom: (convId: string, fromTimestamp: number) =>
      ipcRenderer.invoke('msg:deleteFrom', convId, fromTimestamp),
  },

  // Model configs
  model: {
    list: () => ipcRenderer.invoke('model:list'),
    add: (config: { name: string; ggufPath: string; port: number; extraArgs: string; webSearchSupported?: boolean; multimodal?: boolean }) =>
      ipcRenderer.invoke('model:add', config),
    update: (
      id: string,
      config: { name: string; ggufPath: string; port: number; extraArgs: string; webSearchSupported?: boolean; multimodal?: boolean }
    ) => ipcRenderer.invoke('model:update', id, config),
    delete: (id: string) => ipcRenderer.invoke('model:delete', id),
  },

  // Server process management
  server: {
    start: (modelId: string) => ipcRenderer.invoke('server:start', modelId),
    stop: (modelId: string) => ipcRenderer.invoke('server:stop', modelId),
    status: (modelId: string) => ipcRenderer.invoke('server:status', modelId),
    statusAll: () => ipcRenderer.invoke('server:statusAll'),
    onLog: (callback: (modelId: string, line: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, modelId: string, line: string) =>
        callback(modelId, line)
      ipcRenderer.on('server:log', handler)
      return () => ipcRenderer.removeListener('server:log', handler)
    },
    onStopped: (callback: (modelId: string, code: number | null) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, modelId: string, code: number | null) =>
        callback(modelId, code)
      ipcRenderer.on('server:stopped', handler)
      return () => ipcRenderer.removeListener('server:stopped', handler)
    },
    onError: (callback: (modelId: string, message: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, modelId: string, message: string) =>
        callback(modelId, message)
      ipcRenderer.on('server:error', handler)
      return () => ipcRenderer.removeListener('server:error', handler)
    },
  },

  // Dialogs
  dialog: {
    openGguf: () => ipcRenderer.invoke('dialog:openGguf'),
    openLog: () => ipcRenderer.invoke('dialog:openLog'),
    openDir: () => ipcRenderer.invoke('dialog:openDir'),
    saveGguf: (defaultPath?: string) => ipcRenderer.invoke('dialog:saveGguf', defaultPath),
    openScript: () => ipcRenderer.invoke('dialog:openScript'),
  },

  // Log reading
  log: {
    readTail: (filePath: string, lines?: number) =>
      ipcRenderer.invoke('log:readTail', filePath, lines),
  },

  // Settings
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
  },

  // Shell
  shell: {
    openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),
  },

  // GGUF Conversion
  convert: {
    checkPython: (pythonCmd?: string) => ipcRenderer.invoke('convert:checkPython', pythonCmd),
    checkScript: (scriptPath: string) => ipcRenderer.invoke('convert:checkScript', scriptPath),
    start: (opts: {
      scriptPath: string
      pythonCmd?: string
      sourceType: 'local' | 'hf'
      modelDir?: string
      hfId?: string
      outPath?: string
      outType?: string
    }) => ipcRenderer.invoke('convert:start', opts),
    stop: () => ipcRenderer.invoke('convert:stop'),
    onLog: (callback: (line: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, line: string) => callback(line)
      ipcRenderer.on('convert:log', handler)
      return () => ipcRenderer.removeListener('convert:log', handler)
    },
    onDone: (callback: (exitCode: number) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, code: number) => callback(code)
      ipcRenderer.on('convert:done', handler)
      return () => ipcRenderer.removeListener('convert:done', handler)
    },
  },

  // Workflows
  workflow: {
    list: () => ipcRenderer.invoke('workflow:list'),
    save: (wf: any) => ipcRenderer.invoke('workflow:save', wf),
    delete: (id: string) => ipcRenderer.invoke('workflow:delete', id),
    execTool: (command: string, workingDir?: string) =>
      ipcRenderer.invoke('workflow:execTool', command, workingDir),
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
