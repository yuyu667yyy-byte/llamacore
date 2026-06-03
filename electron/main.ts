/*
 * Copyright (c) 2026 Lucas Vann (陆凯文)
 * Released under the MIT License. See LICENSE for details.
 */

import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
} from 'electron'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'

// ── Paths ────────────────────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const userDataPath = app.getPath('userData')
const storePath = path.join(userDataPath, 'llamacore.json')

// ── JSON file store (replaces SQLite — no native compilation needed) ──────────
type ConvRow = { id: string; title: string; model_name: string; created_at: number; updated_at: number }
type MsgRow  = { id: number; conversation_id: string; role: string; content: string; attachments?: any[]; timestamp: number }
type ModelRow = { id: string; name: string; gguf_path: string; port: number; extra_args: string; web_search_supported?: boolean; multimodal?: boolean; created_at: number }

interface Store {
  conversations: ConvRow[]
  messages: MsgRow[]
  model_configs: ModelRow[]
  app_settings: Record<string, string>
  workflows: any[]
  _nextMsgId: number
}

let store: Store

function initDb() {
  if (fs.existsSync(storePath)) {
    try {
      store = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
      // migrate: ensure _nextMsgId exists
      if (!store._nextMsgId) {
        store._nextMsgId = (store.messages.reduce((m, r) => Math.max(m, r.id), 0)) + 1
      }
      if (!store.app_settings) store.app_settings = {}
      if (!store.workflows) store.workflows = []
    } catch {
      store = { conversations: [], messages: [], model_configs: [], app_settings: {}, workflows: [], _nextMsgId: 1 }
    }
  } else {
    store = { conversations: [], messages: [], model_configs: [], app_settings: {}, workflows: [], _nextMsgId: 1 }
  }
}

function saveDb() {
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8')
}

// ── Server process registry ───────────────────────────────────────────────────
const runningServers = new Map<string, ChildProcess>()

// ── Window ───────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d0d0d',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      // Allow webview to load localhost TensorBoard
      webSecurity: false,
    },
    show: false,
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  initDb()
  createWindow()
  Menu.setApplicationMenu(null)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Stop all running servers on exit
  runningServers.forEach((proc) => proc.kill())
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC: Conversations ────────────────────────────────────────────────────────
ipcMain.handle('conv:list', () => {
  return [...store.conversations].sort((a, b) => b.updated_at - a.updated_at)
})

ipcMain.handle('conv:create', (_e, modelName: string) => {
  const now = Date.now()
  const row: ConvRow = { id: uuidv4(), title: '新对话', model_name: modelName || '', created_at: now, updated_at: now }
  store.conversations.push(row)
  saveDb()
  return row
})

ipcMain.handle('conv:rename', (_e, id: string, title: string) => {
  const c = store.conversations.find(c => c.id === id)
  if (c) { c.title = title; c.updated_at = Date.now(); saveDb() }
  return true
})

ipcMain.handle('conv:delete', (_e, id: string) => {
  store.conversations = store.conversations.filter(c => c.id !== id)
  store.messages = store.messages.filter(m => m.conversation_id !== id)
  saveDb()
  return true
})

ipcMain.handle('conv:touch', (_e, id: string, title?: string) => {
  const c = store.conversations.find(c => c.id === id)
  if (c) {
    c.updated_at = Date.now()
    if (title) c.title = title
    saveDb()
  }
  return true
})

// ── IPC: Messages ─────────────────────────────────────────────────────────────
ipcMain.handle('msg:list', (_e, convId: string) => {
  return store.messages
    .filter(m => m.conversation_id === convId)
    .sort((a, b) => a.timestamp - b.timestamp)
})

ipcMain.handle(
  'msg:add',
  (_e, convId: string, role: string, content: string, attachments?: any[]) => {
    const ts = Date.now()
    const id = store._nextMsgId++
    store.messages.push({
      id,
      conversation_id: convId,
      role,
      content,
      attachments: attachments && attachments.length ? attachments : undefined,
      timestamp: ts,
    })
    const c = store.conversations.find(c => c.id === convId)
    if (c) c.updated_at = ts
    saveDb()
    return id
  }
)

ipcMain.handle('msg:update', (_e, id: number, content: string) => {
  const m = store.messages.find(m => m.id === id)
  if (m) { m.content = content; saveDb() }
  return true
})

ipcMain.handle('msg:deleteFrom', (_e, convId: string, fromTimestamp: number) => {
  store.messages = store.messages.filter(
    m => !(m.conversation_id === convId && m.timestamp >= fromTimestamp)
  )
  saveDb()
  return true
})

// ── IPC: Model configs ────────────────────────────────────────────────────────
ipcMain.handle('model:list', () => {
  return [...store.model_configs].sort((a, b) => a.created_at - b.created_at)
})

ipcMain.handle(
  'model:add',
  (_e, config: { name: string; ggufPath: string; port: number; extraArgs: string; webSearchSupported?: boolean; multimodal?: boolean }) => {
    const row: ModelRow = {
      id: uuidv4(),
      name: config.name,
      gguf_path: config.ggufPath,
      port: config.port,
      extra_args: config.extraArgs || '',
      web_search_supported: !!config.webSearchSupported,
      multimodal: !!config.multimodal,
      created_at: Date.now(),
    }
    store.model_configs.push(row)
    saveDb()
    return row
  }
)

ipcMain.handle(
  'model:update',
  (_e, id: string, config: { name: string; ggufPath: string; port: number; extraArgs: string; webSearchSupported?: boolean; multimodal?: boolean }) => {
    const m = store.model_configs.find(m => m.id === id)
    if (m) {
      m.name = config.name
      m.gguf_path = config.ggufPath
      m.port = config.port
      m.extra_args = config.extraArgs || ''
      m.web_search_supported = !!config.webSearchSupported
      m.multimodal = !!config.multimodal
      saveDb()
    }
    return true
  }
)

ipcMain.handle('model:delete', (_e, id: string) => {
  const proc = runningServers.get(id)
  if (proc) { proc.kill(); runningServers.delete(id) }
  store.model_configs = store.model_configs.filter(m => m.id !== id)
  saveDb()
  return true
})

// ── IPC: Server process management ───────────────────────────────────────────
ipcMain.handle('server:start', async (_e, modelId: string) => {
  const model = store.model_configs.find(m => m.id === modelId)

  if (!model) return { success: false, error: 'Model not found' }
  if (runningServers.has(modelId)) return { success: true, pid: runningServers.get(modelId)!.pid }

  // Find llama-server executable
  const llamaServerPaths = [
    'llama-server',
    'llama-server.exe',
    path.join(process.resourcesPath || '', 'llama-server'),
    path.join(process.resourcesPath || '', 'llama-server.exe'),
  ]

  const extraArgsList = model.extra_args
    ? model.extra_args.split(' ').filter(Boolean)
    : []

  const args = [
    '--model', model.gguf_path,
    '--port', String(model.port),
    '--host', '127.0.0.1',
    ...extraArgsList,
  ]

  let proc: ChildProcess | null = null
  let lastError = ''

  for (const serverPath of llamaServerPaths) {
    try {
      proc = spawn(serverPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      })
      break
    } catch {
      // try next
    }
  }

  if (!proc) {
    return { success: false, error: 'llama-server not found. Add it to PATH or place it next to this app.' }
  }

  runningServers.set(modelId, proc)

  const logs: string[] = []

  proc.stdout?.on('data', (data: Buffer) => {
    const line = data.toString()
    logs.push(line)
    mainWindow?.webContents.send('server:log', modelId, line)
  })

  proc.stderr?.on('data', (data: Buffer) => {
    const line = data.toString()
    logs.push(line)
    mainWindow?.webContents.send('server:log', modelId, line)
  })

  proc.on('exit', (code) => {
    runningServers.delete(modelId)
    mainWindow?.webContents.send('server:stopped', modelId, code)
  })

  proc.on('error', (err) => {
    lastError = err.message
    runningServers.delete(modelId)
    mainWindow?.webContents.send('server:error', modelId, err.message)
  })

  // Wait briefly for startup
  await new Promise((r) => setTimeout(r, 500))

  return { success: true, pid: proc.pid }
})

ipcMain.handle('server:stop', (_e, modelId: string) => {
  const proc = runningServers.get(modelId)
  if (!proc) return { success: false, error: 'Server not running' }
  proc.kill('SIGTERM')
  runningServers.delete(modelId)
  return { success: true }
})

ipcMain.handle('server:status', (_e, modelId: string) => {
  return { running: runningServers.has(modelId), pid: runningServers.get(modelId)?.pid }
})

ipcMain.handle('server:statusAll', () => {
  const result: Record<string, { running: boolean; pid?: number }> = {}
  runningServers.forEach((proc, id) => {
    result[id] = { running: true, pid: proc.pid }
  })
  return result
})

// ── IPC: File dialogs ─────────────────────────────────────────────────────────
ipcMain.handle('dialog:openGguf', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '选择 GGUF 模型文件',
    filters: [{ name: 'GGUF Models', extensions: ['gguf'] }],
    properties: ['openFile'],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:openLog', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '选择训练日志文件',
    filters: [
      { name: 'Log files', extensions: ['log', 'txt', 'jsonl'] },
      { name: 'All files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  })
  return result.canceled ? null : result.filePaths[0]
})

// ── IPC: Log file reading for training monitor ────────────────────────────────
ipcMain.handle('log:readTail', (_e, filePath: string, lines: number = 200) => {
  try {
    if (!fs.existsSync(filePath)) return { error: 'File not found', lines: [] }
    const content = fs.readFileSync(filePath, 'utf-8')
    const allLines = content.split('\n').filter(Boolean)
    return { lines: allLines.slice(-lines), error: null }
  } catch (err: any) {
    return { error: err.message, lines: [] }
  }
})

ipcMain.handle('log:watchStart', (_e, filePath: string) => {
  // Notify renderer with updates; polling-based since fs.watch can be flaky on Windows
  return true
})

// ── IPC: Settings ─────────────────────────────────────────────────────────────
ipcMain.handle('settings:get', (_e, key: string) => {
  return store.app_settings[key] ?? null
})

ipcMain.handle('settings:set', (_e, key: string, value: string) => {
  store.app_settings[key] = value
  saveDb()
  return true
})

ipcMain.handle('shell:openPath', (_e, filePath: string) => {
  shell.openPath(filePath)
})

// ── IPC: GGUF Conversion ──────────────────────────────────────────────────────
let convertProc: ChildProcess | null = null

ipcMain.handle('dialog:openDir', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:saveGguf', async (_e, defaultPath?: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: '保存 GGUF 文件',
    defaultPath: defaultPath,
    filters: [{ name: 'GGUF Models', extensions: ['gguf'] }],
  })
  return result.canceled ? null : result.filePath
})

ipcMain.handle('dialog:openScript', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '选择 convert_hf_to_gguf.py',
    filters: [{ name: 'Python scripts', extensions: ['py'] }],
    properties: ['openFile'],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('convert:checkPython', async (_e, pythonCmd?: string) => {
  const cmds = pythonCmd ? [pythonCmd] : ['python', 'python3', 'py']
  for (const cmd of cmds) {
    try {
      const result = await new Promise<{ ok: boolean; version?: string; error?: string }>((resolve) => {
        const p = spawn(cmd, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
        let out = ''
        p.stdout?.on('data', (d: Buffer) => { out += d.toString() })
        p.stderr?.on('data', (d: Buffer) => { out += d.toString() })
        p.on('exit', (code) => {
          if (code === 0) resolve({ ok: true, version: out.trim() })
          else resolve({ ok: false, error: `exit ${code}` })
        })
        p.on('error', (err) => resolve({ ok: false, error: err.message }))
      })
      if (result.ok) return result
    } catch {
      // try next
    }
  }
  return { ok: false, error: 'Python not found' }
})

ipcMain.handle('convert:checkScript', (_e, scriptPath: string) => {
  return { ok: fs.existsSync(scriptPath) }
})

ipcMain.handle('convert:start', async (_e, opts: {
  scriptPath: string
  pythonCmd?: string
  sourceType: 'local' | 'hf'
  modelDir?: string
  hfId?: string
  outPath?: string
  outType?: string
}) => {
  if (convertProc) return { success: false, error: 'Already running' }

  const pythonCmd = opts.pythonCmd || 'python'
  const args: string[] = [opts.scriptPath]

  if (opts.sourceType === 'local') {
    if (!opts.modelDir) return { success: false, error: 'No model dir' }
    args.push(opts.modelDir)
  } else {
    if (!opts.hfId) return { success: false, error: 'No HF model ID' }
    // Pass HF model ID as model dir — convert_hf_to_gguf.py accepts HF model IDs
    args.push(opts.hfId)
  }

  if (opts.outPath) args.push('--outfile', opts.outPath)
  if (opts.outType) args.push('--outtype', opts.outType)

  try {
    convertProc = spawn(pythonCmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err: any) {
    return { success: false, error: err.message }
  }

  convertProc.stdout?.on('data', (data: Buffer) => {
    mainWindow?.webContents.send('convert:log', data.toString())
  })
  convertProc.stderr?.on('data', (data: Buffer) => {
    mainWindow?.webContents.send('convert:log', data.toString())
  })
  convertProc.on('exit', (code) => {
    convertProc = null
    mainWindow?.webContents.send('convert:done', code ?? -1)
  })
  convertProc.on('error', (err) => {
    mainWindow?.webContents.send('convert:log', `[ERROR] ${err.message}\n`)
    mainWindow?.webContents.send('convert:done', -1)
    convertProc = null
  })

  return { success: true }
})

ipcMain.handle('convert:stop', () => {
  if (convertProc) {
    convertProc.kill()
    convertProc = null
  }
})

// ── IPC: Workflows ────────────────────────────────────────────────────────────
ipcMain.handle('workflow:list', () => store.workflows ?? [])

ipcMain.handle('workflow:save', (_e, wf: any) => {
  const idx = store.workflows.findIndex((w: any) => w.id === wf.id)
  if (idx >= 0) store.workflows[idx] = wf
  else store.workflows.push(wf)
  saveDb()
  return wf
})

ipcMain.handle('workflow:delete', (_e, id: string) => {
  store.workflows = store.workflows.filter((w: any) => w.id !== id)
  saveDb()
  return true
})

// ── IPC: Workflow tool execution (shell) ──────────────────────────────────────
ipcMain.handle('workflow:execTool', async (_e, command: string, workingDir?: string) => {
  // Always confirm with the user before running any shell command
  const { response } = await dialog.showMessageBox(mainWindow!, {
    type: 'warning',
    title: 'Execute shell command?',
    message: `A workflow node wants to run:\n\n${command}${workingDir ? `\n\n(in ${workingDir})` : ''}\n\nAllow?`,
    buttons: ['Cancel', 'Run'],
    defaultId: 0,
    cancelId: 0,
  })
  if (response === 0) return { success: false, error: 'User cancelled', stdout: '', stderr: '' }

  // Validate the working directory up front so a bad path is a clear error,
  // not a cryptic spawn failure.
  let cwd: string | undefined
  if (workingDir && workingDir.trim()) {
    cwd = workingDir.trim()
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
      return { success: false, error: `Working directory not found: ${cwd}`, stdout: '', stderr: '' }
    }
  }

  return new Promise<{ success: boolean; stdout: string; stderr: string; error?: string }>((resolve) => {
    let stdout = ''
    let stderr = ''
    // Use shell:true so the command string is interpreted by the OS shell
    const proc = spawn(command, [], { shell: true, cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('exit', (code) => {
      resolve({ success: code === 0, stdout, stderr, error: code !== 0 ? `exit ${code}` : undefined })
    })
    proc.on('error', (err) => {
      resolve({ success: false, stdout, stderr, error: err.message })
    })
  })
})
