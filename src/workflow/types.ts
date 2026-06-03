/*
 * Copyright (c) 2026 Lucas Vann (陆凯文)
 * Released under the MIT License. See LICENSE for details.
 */

// ── Position ──────────────────────────────────────────────────────────────────

export interface Point {
  x: number
  y: number
}

// ── Node data payloads ────────────────────────────────────────────────────────

export interface LLMNodeData {
  label: string
  modelId: string       // references ModelConfig.id
  systemPrompt: string
  userPromptTemplate: string  // may contain {{input}} placeholder
  temperature: number
}

export interface ToolNodeData {
  label: string
  command: string       // shell command template, may contain {{input}}
  workingDir: string
}

export interface RouterNodeData {
  label: string
  // Routes: array of {keyword, targetHandle}. First match wins; fallback = 'default'
  routes: Array<{ keyword: string; handle: string }>
}

export interface MergeNodeData {
  label: string
  strategy: 'concat' | 'vote' | 'first'
  // vote: pick the answer that appears most often (exact match)
  // concat: join all inputs with separator
  separator: string
}

export interface InputNodeData {
  label: string
  defaultValue: string
}

export interface OutputNodeData {
  label: string
}

export type WFNodeData =
  | ({ type: 'llm' } & LLMNodeData)
  | ({ type: 'tool' } & ToolNodeData)
  | ({ type: 'router' } & RouterNodeData)
  | ({ type: 'merge' } & MergeNodeData)
  | ({ type: 'input' } & InputNodeData)
  | ({ type: 'output' } & OutputNodeData)

export interface WFNode {
  id: string
  type: 'wf'
  position: Point
  data: WFNodeData
}

export interface WFEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

// ── Workflow definition ───────────────────────────────────────────────────────

export interface WorkflowDef {
  id: string
  name: string
  description: string
  nodes: WFNode[]
  edges: WFEdge[]
  createdAt: number
  updatedAt: number
}

// ── Runtime state ─────────────────────────────────────────────────────────────

export type NodeStatus = 'idle' | 'running' | 'done' | 'error' | 'skipped'

export interface NodeRunState {
  status: NodeStatus
  output?: string
  error?: string
  // Tokens/sec for LLM nodes: avg over generation, peak live rate, token count.
  tps?: { avg: number; peak: number; tokens: number }
}

export interface WorkflowRunState {
  running: boolean
  nodeStates: Record<string, NodeRunState>
  finalOutput?: string
  error?: string
  // Live tokens/sec of the currently-streaming LLM node (0 when none active).
  liveTps?: number
  // Aggregate across all LLM nodes once the run completes.
  aggTps?: { avg: number; peak: number; tokens: number }
}
