/*
 * Copyright (c) 2026 Lucas Vann (陆凯文)
 * Released under the MIT License. See LICENSE for details.
 */

// Global type declarations for the Electron IPC bridge

export interface Conversation {
  id: string
  title: string
  model_name: string
  created_at: number
  updated_at: number
}

export interface Message {
  id: number
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  attachments?: ImageAttachment[]
  timestamp: number
}

export interface ModelConfig {
  id: string
  name: string
  gguf_path: string
  port: number
  extra_args: string
  web_search_supported?: boolean
  multimodal?: boolean
  created_at: number
}

export interface ImageAttachment {
  id: string
  dataUrl: string // base64-encoded data: URL after compression
  mime: string
  name: string
}

export interface ServerStatus {
  running: boolean
  pid?: number
}

declare global {
  interface Window {
    electronAPI: {
      conv: {
        list: () => Promise<Conversation[]>
        create: (modelName: string) => Promise<Conversation>
        rename: (id: string, title: string) => Promise<boolean>
        delete: (id: string) => Promise<boolean>
        touch: (id: string, title?: string) => Promise<boolean>
      }
      msg: {
        list: (convId: string) => Promise<Message[]>
        add: (convId: string, role: string, content: string, attachments?: ImageAttachment[]) => Promise<number>
        update: (id: number, content: string) => Promise<boolean>
        deleteFrom: (convId: string, fromTimestamp: number) => Promise<boolean>
      }
      model: {
        list: () => Promise<ModelConfig[]>
        add: (config: {
          name: string
          ggufPath: string
          port: number
          extraArgs: string
          webSearchSupported?: boolean
          multimodal?: boolean
        }) => Promise<ModelConfig>
        update: (
          id: string,
          config: {
            name: string
            ggufPath: string
            port: number
            extraArgs: string
            webSearchSupported?: boolean
            multimodal?: boolean
          }
        ) => Promise<boolean>
        delete: (id: string) => Promise<boolean>
      }
      server: {
        start: (modelId: string) => Promise<{ success: boolean; pid?: number; error?: string }>
        stop: (modelId: string) => Promise<{ success: boolean; error?: string }>
        status: (modelId: string) => Promise<ServerStatus>
        statusAll: () => Promise<Record<string, ServerStatus>>
        onLog: (callback: (modelId: string, line: string) => void) => () => void
        onStopped: (callback: (modelId: string, code: number | null) => void) => () => void
        onError: (callback: (modelId: string, message: string) => void) => () => void
      }
      dialog: {
        openGguf: () => Promise<string | null>
        openLog: () => Promise<string | null>
        openDir: () => Promise<string | null>
        saveGguf: (defaultPath?: string) => Promise<string | null>
        openScript: () => Promise<string | null>
      }
      log: {
        readTail: (
          filePath: string,
          lines?: number
        ) => Promise<{ lines: string[]; error: string | null }>
      }
      settings: {
        get: (key: string) => Promise<string | null>
        set: (key: string, value: string) => Promise<boolean>
      }
      shell: {
        openPath: (filePath: string) => void
      }
      convert: {
        checkPython: (pythonCmd?: string) => Promise<{ ok: boolean; version?: string; error?: string }>
        checkScript: (scriptPath: string) => Promise<{ ok: boolean }>
        start: (opts: {
          scriptPath: string
          pythonCmd?: string
          sourceType: 'local' | 'hf'
          modelDir?: string
          hfId?: string
          outPath?: string
          outType?: string
        }) => Promise<{ success: boolean; error?: string }>
        stop: () => Promise<void>
        onLog: (callback: (line: string) => void) => () => void
        onDone: (callback: (exitCode: number) => void) => () => void
      }
      workflow: {
        list: () => Promise<any[]>
        save: (wf: any) => Promise<any>
        delete: (id: string) => Promise<boolean>
        execTool: (command: string, workingDir?: string) => Promise<{
          success: boolean
          stdout: string
          stderr: string
          error?: string
        }>
      }
    }
  }
}
