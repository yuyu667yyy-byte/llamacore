/*
 * Copyright (c) 2026 Lucas Vann (陆凯文)
 * Released under the MIT License. See LICENSE for details.
 */

import { create } from 'zustand'
import type { Conversation, Message, ModelConfig, ImageAttachment } from './types'
import type { WorkflowDef, WorkflowRunState } from './workflow/types'

// Per-message generation metrics shown beneath each AI bubble. Lives in the
// store (not on disk) so it persists on screen for the session.
export interface ChatMetric {
  tokens: number
  live: number    // live tok/s while generating
  avg: number     // final avg tok/s
  peak: number    // peak tok/s
  thinkMs: number // time spent in the <think> phase
  thinking: boolean   // currently in the thinking phase
  generating: boolean // generation still in progress
}

export type ViewName = 'chat' | 'models' | 'training' | 'convert' | 'workflow'
export type Theme = 'dark' | 'light'

interface AppState {
  // Navigation
  view: ViewName
  setView: (v: ViewName) => void

  // Theme
  theme: Theme
  setTheme: (t: Theme) => void

  // Conversations
  conversations: Conversation[]
  activeConvId: string | null
  setConversations: (c: Conversation[]) => void
  setActiveConvId: (id: string | null) => void
  upsertConversation: (c: Conversation) => void
  removeConversation: (id: string) => void

  // Messages
  messages: Message[]
  setMessages: (m: Message[]) => void
  appendMessage: (m: Message) => void
  updateLastAssistantMessage: (content: string) => void

  // Models
  models: ModelConfig[]
  setModels: (m: ModelConfig[]) => void
  serverStatuses: Record<string, { running: boolean; pid?: number }>
  setServerStatus: (id: string, status: { running: boolean; pid?: number }) => void
  activeModelId: string | null
  setActiveModelId: (id: string | null) => void

  // Chat options
  streamingEnabled: boolean
  setStreamingEnabled: (v: boolean) => void
  thinkingEnabled: boolean
  setThinkingEnabled: (v: boolean) => void
  reasoningEffort: 'low' | 'medium' | 'high'
  setReasoningEffort: (v: 'low' | 'medium' | 'high') => void
  webSearchEnabled: boolean
  setWebSearchEnabled: (v: boolean) => void
  systemPrompt: string
  setSystemPrompt: (v: string) => void
  formattingPrompt: string
  setFormattingPrompt: (v: string) => void
  jsonMode: boolean
  setJsonMode: (v: boolean) => void
  temperature: number
  setTemperature: (v: number) => void
  maxTokens: number
  setMaxTokens: (v: number) => void

  // Streaming state
  isStreaming: boolean
  setIsStreaming: (v: boolean) => void
  // Which conversation currently has an in-flight generation (null if none).
  streamingConvId: string | null
  setStreamingConvId: (id: string | null) => void
  abortController: AbortController | null
  setAbortController: (c: AbortController | null) => void
  // Per-AI-message generation metrics, keyed by message id. Persists on screen.
  chatMetrics: Record<number, ChatMetric>
  setChatMetric: (msgId: number, m: ChatMetric) => void

  // Edit / draft state
  editingMessageId: number | null
  editingDraft: string
  pendingAttachments: ImageAttachment[]
  startEditMessage: (id: number, content: string) => void
  cancelEdit: () => void
  setEditingDraft: (v: string) => void
  setPendingAttachments: (atts: ImageAttachment[]) => void
  addPendingAttachment: (att: ImageAttachment) => void
  removePendingAttachment: (id: string) => void

  // Workflows
  workflows: WorkflowDef[]
  setWorkflows: (w: WorkflowDef[]) => void
  upsertWorkflow: (w: WorkflowDef) => void
  deleteWorkflow: (id: string) => void
  activeWorkflowId: string | null
  setActiveWorkflowId: (id: string | null) => void
  workflowRunState: WorkflowRunState | null
  setWorkflowRunState: (s: WorkflowRunState | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  // Navigation
  view: 'chat',
  setView: (v) => set({ view: v }),

  // Theme
  theme: 'dark',
  setTheme: (theme) => set({ theme }),

  // Conversations
  conversations: [],
  activeConvId: null,
  setConversations: (conversations) => set({ conversations }),
  setActiveConvId: (activeConvId) => set({ activeConvId }),
  upsertConversation: (c) =>
    set((s) => {
      const idx = s.conversations.findIndex((x) => x.id === c.id)
      if (idx >= 0) {
        const updated = [...s.conversations]
        updated[idx] = c
        return { conversations: updated.sort((a, b) => b.updated_at - a.updated_at) }
      }
      return {
        conversations: [c, ...s.conversations].sort((a, b) => b.updated_at - a.updated_at),
      }
    }),
  removeConversation: (id) =>
    set((s) => ({ conversations: s.conversations.filter((c) => c.id !== id) })),

  // Messages
  messages: [],
  setMessages: (messages) => set({ messages }),
  appendMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  updateLastAssistantMessage: (content) =>
    set((s) => {
      const msgs = [...s.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], content }
          return { messages: msgs }
        }
      }
      return {}
    }),

  // Models
  models: [],
  setModels: (models) => set({ models }),
  serverStatuses: {},
  setServerStatus: (id, status) =>
    set((s) => ({ serverStatuses: { ...s.serverStatuses, [id]: status } })),
  activeModelId: null,
  setActiveModelId: (activeModelId) => set({ activeModelId }),

  // Chat options
  streamingEnabled: true,
  setStreamingEnabled: (streamingEnabled) => set({ streamingEnabled }),
  thinkingEnabled: false,
  setThinkingEnabled: (thinkingEnabled) => set({ thinkingEnabled }),
  reasoningEffort: 'medium',
  setReasoningEffort: (reasoningEffort) => set({ reasoningEffort }),
  webSearchEnabled: false,
  setWebSearchEnabled: (webSearchEnabled) => set({ webSearchEnabled }),
  systemPrompt: '',
  setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
  formattingPrompt: '',
  setFormattingPrompt: (formattingPrompt) => set({ formattingPrompt }),
  jsonMode: false,
  setJsonMode: (jsonMode) => set({ jsonMode }),
  temperature: 0.7,
  setTemperature: (temperature) => set({ temperature }),
  maxTokens: 2048,
  setMaxTokens: (maxTokens) => set({ maxTokens }),

  // Streaming state
  isStreaming: false,
  setIsStreaming: (isStreaming) => set({ isStreaming }),
  streamingConvId: null,
  setStreamingConvId: (streamingConvId) => set({ streamingConvId }),
  abortController: null,
  setAbortController: (abortController) => set({ abortController }),
  chatMetrics: {},
  setChatMetric: (msgId, m) =>
    set((s) => ({ chatMetrics: { ...s.chatMetrics, [msgId]: m } })),

  // Edit / draft state
  editingMessageId: null,
  editingDraft: '',
  pendingAttachments: [],
  startEditMessage: (id, content) => set({ editingMessageId: id, editingDraft: content }),
  cancelEdit: () => set({ editingMessageId: null, editingDraft: '' }),
  setEditingDraft: (editingDraft) => set({ editingDraft }),
  setPendingAttachments: (pendingAttachments) => set({ pendingAttachments }),
  addPendingAttachment: (att) =>
    set((s) => ({ pendingAttachments: [...s.pendingAttachments, att] })),
  removePendingAttachment: (id) =>
    set((s) => ({ pendingAttachments: s.pendingAttachments.filter((a) => a.id !== id) })),

  // Workflows
  workflows: [],
  setWorkflows: (workflows) => set({ workflows }),
  upsertWorkflow: (w) =>
    set((s) => {
      const idx = s.workflows.findIndex((x) => x.id === w.id)
      if (idx >= 0) {
        const updated = [...s.workflows]
        updated[idx] = w
        return { workflows: updated }
      }
      return { workflows: [...s.workflows, w] }
    }),
  deleteWorkflow: (id) =>
    set((s) => ({ workflows: s.workflows.filter((w) => w.id !== id) })),
  activeWorkflowId: null,
  setActiveWorkflowId: (activeWorkflowId) => set({ activeWorkflowId }),
  workflowRunState: null,
  setWorkflowRunState: (workflowRunState) => set({ workflowRunState }),
}))
