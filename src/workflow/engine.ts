/*
 * Copyright (c) 2026 Lucas Vann (陆凯文)
 * Released under the MIT License. See LICENSE for details.
 */

import type { WorkflowDef, WFNode, NodeRunState, WorkflowRunState } from './types'
import type { ModelConfig } from '../types'
import { TpsMeter } from '../utils/tps'

type SetRunState = (s: WorkflowRunState) => void

function applyTemplate(template: string, input: string): string {
  return template.replace(/\{\{input\}\}/g, input)
}

// ── Validation ────────────────────────────────────────────────────────────────
// A structured issue the UI can translate. `code` maps to an i18n key under
// `workflow.validate.*`; `node` is an optional human label for context.
export interface ValidationIssue {
  code: string
  node?: string
}

export function validateWorkflow(
  workflow: WorkflowDef,
  models: ModelConfig[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const { nodes, edges } = workflow

  if (nodes.length === 0) {
    issues.push({ code: 'emptyGraph' })
    return issues
  }

  const outputs = nodes.filter((n) => n.data.type === 'output')
  if (outputs.length === 0) issues.push({ code: 'noOutput' })

  // LLM nodes must reference a model that still exists
  for (const n of nodes) {
    const d = n.data
    if (d.type === 'llm') {
      const label = d.label || 'LLM'
      if (!d.modelId) issues.push({ code: 'llmNoModel', node: label })
      else if (!models.find((m) => m.id === d.modelId))
        issues.push({ code: 'llmMissingModel', node: label })
    }
  }

  // Cycle detection — topo order shorter than node count means a cycle exists
  if (topoSort(nodes, edges).length < nodes.length) {
    issues.push({ code: 'cycle' })
  }

  return issues
}

// ── Graph ───────────────────────────────────────────────────────────────────
// Topological sort — returns node IDs in execution order. Nodes inside a cycle
// are omitted (caller detects this via length and surfaces a validation error).
function topoSort(nodes: WFNode[], edges: WorkflowDef['edges']): string[] {
  const inDegree: Record<string, number> = {}
  const adj: Record<string, string[]> = {}
  for (const n of nodes) { inDegree[n.id] = 0; adj[n.id] = [] }
  for (const e of edges) {
    if (!(e.source in adj) || !(e.target in inDegree)) continue
    adj[e.source].push(e.target)
    inDegree[e.target] = (inDegree[e.target] ?? 0) + 1
  }
  const queue = nodes.filter((n) => inDegree[n.id] === 0).map((n) => n.id)
  const order: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    for (const next of adj[id]) {
      inDegree[next]--
      if (inDegree[next] === 0) queue.push(next)
    }
  }
  return order
}

// Decide whether an edge leaving `source` should carry data, given how a router
// upstream resolved. Non-router sources always pass. A router only fires the
// edges whose `sourceHandle` matches the route it selected; when no route
// matched it fires the `default`/unlabelled edges instead.
function edgeFires(
  edge: WorkflowDef['edges'][number],
  routerMatches: Record<string, string | null>
): boolean {
  const match = routerMatches[edge.source]
  if (match === undefined) return true // source is not a router
  const handle = edge.sourceHandle
  if (match === null) return handle === 'default' || !handle
  return handle === match
}

// Collect incoming outputs in edge order, respecting router edge filtering.
function getInputs(
  nodeId: string,
  workflow: WorkflowDef,
  outputs: Record<string, string>,
  routerMatches: Record<string, string | null>
): string[] {
  return workflow.edges
    .filter((e) => e.target === nodeId && edgeFires(e, routerMatches))
    .map((e) => outputs[e.source] ?? '')
}

function normalizeForVote(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

export async function runWorkflow(
  workflow: WorkflowDef,
  userInput: string,
  models: ModelConfig[],
  setRunState: SetRunState,
  apiBaseForModel: (modelId: string) => string
): Promise<string> {
  const api = (window as any).electronAPI
  const nodeStates: Record<string, NodeRunState> = {}
  for (const n of workflow.nodes) nodeStates[n.id] = { status: 'idle' }

  // Aggregate token throughput across all LLM nodes in this run.
  let aggTokens = 0
  let aggPeak = 0
  let aggMs = 0
  let liveTps = 0

  const emit = () =>
    setRunState({ running: true, nodeStates: { ...nodeStates }, liveTps })
  emit()

  const outputs: Record<string, string> = {}
  const routerMatches: Record<string, string | null> = {}
  const order = topoSort(workflow.nodes, workflow.edges)
  const nodeMap = Object.fromEntries(workflow.nodes.map((n) => [n.id, n]))

  // Track which nodes are actually reached: a node runs only if it has no
  // incoming edges (a source) or at least one of its incoming edges fired.
  const reached = new Set<string>()
  const hasIncoming = (id: string) => workflow.edges.some((e) => e.target === id)

  let finalOutput = ''
  let producedOutput = false

  for (const nodeId of order) {
    const node = nodeMap[nodeId]
    if (!node) continue
    const data = node.data

    const incoming = hasIncoming(nodeId)
    const firedInputs = getInputs(nodeId, workflow, outputs, routerMatches)

    // Skip nodes pruned by a router branch that did not fire.
    if (incoming && firedInputs.length === 0) {
      nodeStates[nodeId] = { status: 'skipped' }
      emit()
      continue
    }
    reached.add(nodeId)

    const input = firedInputs.length > 0 ? firedInputs.join('\n') : userInput

    nodeStates[nodeId] = { status: 'running' }
    emit()

    try {
      let output = ''

      if (data.type === 'input') {
        output = input || data.defaultValue || userInput

      } else if (data.type === 'output') {
        output = input
        finalOutput = input
        producedOutput = true

      } else if (data.type === 'llm') {
        const model = models.find((m) => m.id === data.modelId)
        const base = apiBaseForModel(data.modelId)
        const messages: any[] = []
        if (data.systemPrompt) messages.push({ role: 'system', content: data.systemPrompt })
        messages.push({ role: 'user', content: applyTemplate(data.userPromptTemplate || '{{input}}', input) })

        // Stream so we can meter tokens/sec; the assembled text is the output.
        const res = await fetch(`${base}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model?.name ?? 'local-model',
            messages,
            stream: true,
            temperature: data.temperature ?? 0.7,
          }),
        })
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`)
        }

        const meter = new TpsMeter()
        let timings: any = null
        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        let lastPush = 0
        let acc = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed === 'data: [DONE]' || !trimmed.startsWith('data: ')) continue
            try {
              const j = JSON.parse(trimmed.slice(6))
              const piece = j.choices?.[0]?.delta?.content
              if (piece) {
                acc += piece
                const s = meter.add(1)
                const now = Date.now()
                if (now - lastPush > 120) {
                  liveTps = s.live
                  nodeStates[nodeId] = { status: 'running', output: acc, tps: { avg: s.avg, peak: s.peak, tokens: s.tokens } }
                  emit()
                  lastPush = now
                }
              }
              if (j.timings) timings = j.timings
            } catch { /* skip malformed */ }
          }
        }

        output = acc
        const snap = meter.snapshot()
        const avg = timings?.predicted_per_second ?? snap.avg
        const tokens = timings?.predicted_n ?? snap.tokens
        const peak = Math.max(snap.peak, avg)
        nodeStates[nodeId] = { status: 'running', output, tps: { avg, peak, tokens } }
        aggTokens += tokens
        aggMs += timings?.predicted_ms ?? snap.elapsedMs
        if (peak > aggPeak) aggPeak = peak
        liveTps = 0
        emit()

      } else if (data.type === 'tool') {
        const cmd = applyTemplate(data.command, input)
        const result = await api.workflow.execTool(cmd, data.workingDir || undefined)
        if (!result.success) {
          const detail = result.stderr?.trim() || result.error || 'Tool failed'
          throw new Error(detail)
        }
        output = result.stdout + (result.stderr ? `\n[stderr]\n${result.stderr}` : '')

      } else if (data.type === 'router') {
        const matched = data.routes.find((r) =>
          r.keyword && input.toLowerCase().includes(r.keyword.toLowerCase())
        )
        routerMatches[nodeId] = matched?.handle ?? null
        output = input

      } else if (data.type === 'merge') {
        if (data.strategy === 'vote') {
          const counts: Record<string, { n: number; sample: string }> = {}
          for (const s of firedInputs) {
            const key = normalizeForVote(s)
            if (!counts[key]) counts[key] = { n: 0, sample: s }
            counts[key].n++
          }
          const winner = Object.values(counts).sort((a, b) => b.n - a.n)[0]
          output = winner?.sample ?? input
        } else if (data.strategy === 'first') {
          output = firedInputs[0] ?? input
        } else {
          output = firedInputs.join(data.separator ?? '\n---\n')
        }
      } else {
        output = input
      }

      outputs[nodeId] = output
      // Preserve any tps captured during streaming (LLM nodes).
      nodeStates[nodeId] = { status: 'done', output, tps: nodeStates[nodeId]?.tps }
    } catch (err: any) {
      nodeStates[nodeId] = { status: 'error', error: err.message }
      emit()
      setRunState({ running: false, nodeStates: { ...nodeStates }, error: err.message })
      throw err
    }

    emit()
  }

  if (!producedOutput) {
    const err = 'NO_OUTPUT_REACHED'
    setRunState({ running: false, nodeStates: { ...nodeStates }, error: err })
    throw new Error(err)
  }

  const aggAvg = aggMs > 0 ? (aggTokens / aggMs) * 1000 : 0
  setRunState({
    running: false,
    nodeStates: { ...nodeStates },
    finalOutput,
    liveTps: 0,
    aggTps: aggTokens > 0 ? { avg: aggAvg, peak: aggPeak, tokens: aggTokens } : undefined,
  })
  return finalOutput
}
