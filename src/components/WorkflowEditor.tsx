/*
 * Copyright (c) 2026 Lucas Vann (陆凯文)
 * Released under the MIT License. See LICENSE for details.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { v4 as uuidv4 } from 'uuid'
import { useAppStore } from '../store'
import { runWorkflow, validateWorkflow, type ValidationIssue } from '../workflow/engine'
import { fmtTps } from '../utils/tps'
import type { WFNode, WFEdge, WFNodeData, Point, WorkflowDef } from '../workflow/types'

// ── Constants ──────────────────────────────────────────────────────────────────
const NODE_W = 150
const NODE_H = 56
const PORT_R = 5
const BRANCH_GAP = 20 // vertical spacing between router output ports

const TYPE_COLORS: Record<string, string> = {
  input: '#1d4ed8', output: '#065f46', llm: '#6d28d9',
  tool: '#92400e', router: '#0e7490', merge: '#9d174d',
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function defaultData(type: WFNodeData['type']): WFNodeData {
  const label = type.charAt(0).toUpperCase() + type.slice(1)
  if (type === 'llm') return { type, label, modelId: '', systemPrompt: '', userPromptTemplate: '{{input}}', temperature: 0.7 }
  if (type === 'tool') return { type, label, command: 'echo {{input}}', workingDir: '' }
  if (type === 'router') return { type, label, routes: [{ keyword: '', handle: 'branch' }] }
  if (type === 'merge') return { type, label, strategy: 'concat', separator: '\n---\n' }
  if (type === 'input') return { type, label: 'Input', defaultValue: '' }
  return { type: 'output', label: 'Output' }
}

// The output handles a node exposes. Routers fan out one port per route handle
// plus an implicit `default` (taken when no keyword matches); everything else
// has a single unlabelled output.
function outputHandles(node: WFNode): string[] {
  if (node.data.type === 'router') {
    const handles = node.data.routes.map((r) => r.handle).filter(Boolean)
    const unique = Array.from(new Set(handles))
    return [...unique, 'default']
  }
  return ['']
}

// Visual height grows so a router's stacked output ports stay separated.
function nodeHeight(node: WFNode): number {
  const outs = outputHandles(node).length
  return Math.max(NODE_H, 28 + outs * BRANCH_GAP)
}

function inPortPos(node: WFNode): Point {
  return { x: node.position.x, y: node.position.y + nodeHeight(node) / 2 }
}

// Output port position. `handle` selects which stacked port on a router.
function outPortPos(node: WFNode, handle = ''): Point {
  const handles = outputHandles(node)
  const idx = Math.max(0, handles.indexOf(handle))
  const h = nodeHeight(node)
  const top = h / 2 - ((handles.length - 1) * BRANCH_GAP) / 2
  return { x: node.position.x + NODE_W, y: node.position.y + top + idx * BRANCH_GAP }
}

function edgePath(a: Point, b: Point): string {
  const dx = Math.abs(b.x - a.x) * 0.5
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
}

// ── Node props panel ──────────────────────────────────────────────────────────
function NodePropsPanel({
  node, onChange, onDelete, models,
}: {
  node: WFNode | null
  onChange: (id: string, data: Partial<any>) => void
  onDelete: (id: string) => void
  models: { id: string; name: string }[]
}) {
  const { t } = useTranslation()
  if (!node) return <div className="text-xs text-dark-400 p-4">{t('workflow.selectNode')}</div>
  const d = node.data

  const field = (label: string, key: string, value: string, multiline = false) => (
    <div key={key} className="mb-3">
      <label className="text-xs text-dark-300 mb-1 block">{label}</label>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(node.id, { [key]: e.target.value })}
          className="input-field text-xs font-mono h-20 resize-none" />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(node.id, { [key]: e.target.value })}
          className="input-field text-xs" />
      )}
    </div>
  )

  return (
    <div className="p-3 space-y-1 overflow-y-auto flex-1">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-dark-200">{t('workflow.nodeProps')}</span>
        <button onClick={() => onDelete(node.id)}
          className="text-xs text-red-400 hover:text-red-300 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20">
          {t('common.delete')}
        </button>
      </div>
      {field(t('workflow.name'), 'label', (d as any).label ?? '')}

      {d.type === 'llm' && (
        <>
          <div className="mb-3">
            <label className="text-xs text-dark-300 mb-1 block">{t('workflow.llmModel')}</label>
            <select value={d.modelId} onChange={(e) => onChange(node.id, { modelId: e.target.value })}
              className="input-field text-xs">
              <option value="">{t('workflow.noModel')}</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          {field(t('workflow.llmSystemPrompt'), 'systemPrompt', d.systemPrompt, true)}
          {field(t('workflow.llmUserTemplate'), 'userPromptTemplate', d.userPromptTemplate, true)}
          <div className="mb-3">
            <label className="text-xs text-dark-300 mb-1 block">{t('workflow.llmTemperature')}: {d.temperature}</label>
            <input type="range" min={0} max={2} step={0.1} value={d.temperature}
              onChange={(e) => onChange(node.id, { temperature: parseFloat(e.target.value) })}
              className="w-full accent-accent" />
          </div>
        </>
      )}

      {d.type === 'tool' && (
        <>
          {field(t('workflow.toolCommand'), 'command', d.command, true)}
          {field(t('workflow.toolWorkingDir'), 'workingDir', d.workingDir)}
        </>
      )}

      {d.type === 'router' && (
        <div className="mb-3">
          <label className="text-xs text-dark-300 mb-2 block">{t('workflow.routerRoutes')}</label>
          <p className="text-[10px] text-dark-400 mb-2 leading-snug">{t('workflow.routerBranchHint')}</p>
          {d.routes.map((r, i) => (
            <div key={i} className="flex gap-1 mb-1">
              <input value={r.keyword} onChange={(e) => {
                const routes = [...d.routes]; routes[i] = { ...routes[i], keyword: e.target.value }
                onChange(node.id, { routes })
              }} placeholder="keyword" className="input-field text-xs flex-1" />
              <input value={r.handle} onChange={(e) => {
                const routes = [...d.routes]; routes[i] = { ...routes[i], handle: e.target.value }
                onChange(node.id, { routes })
              }} placeholder="handle" className="input-field text-xs w-20" />
              <button onClick={() => onChange(node.id, { routes: d.routes.filter((_, j) => j !== i) })}
                className="text-red-400 hover:text-red-300 px-1">×</button>
            </div>
          ))}
          <button onClick={() => onChange(node.id, { routes: [...d.routes, { keyword: '', handle: 'branch' }] })}
            className="text-xs text-accent hover:text-accent-hover mt-1">+ {t('workflow.routerAddRoute')}</button>
        </div>
      )}

      {d.type === 'merge' && (
        <>
          <div className="mb-3">
            <label className="text-xs text-dark-300 mb-1 block">{t('workflow.mergeStrategy')}</label>
            <select value={d.strategy} onChange={(e) => onChange(node.id, { strategy: e.target.value })}
              className="input-field text-xs">
              <option value="concat">{t('workflow.mergeConcat')}</option>
              <option value="vote">{t('workflow.mergeVote')}</option>
              <option value="first">{t('workflow.mergeFirst')}</option>
            </select>
          </div>
          {d.strategy === 'concat' && field(t('workflow.mergeSeparator'), 'separator', d.separator)}
        </>
      )}
    </div>
  )
}

// ── Edge renderer (pure, memo-friendly) ───────────────────────────────────────
function EdgeLines({
  edges, nodes, connectingFrom, edgeColor, edgeSelColor, onDeleteEdge,
}: {
  edges: WFEdge[]; nodes: WFNode[]; connectingFrom: { node: string; handle: string } | null
  edgeColor: string; edgeSelColor: string
  onDeleteEdge: (id: string) => void
}) {
  return (
    <>
      {edges.map((edge) => {
        const src = nodes.find((n) => n.id === edge.source)
        const tgt = nodes.find((n) => n.id === edge.target)
        if (!src || !tgt) return null
        const a = outPortPos(src, edge.sourceHandle ?? ''); const b = inPortPos(tgt)
        const active = edge.source === connectingFrom?.node
        return (
          <g key={edge.id}>
            <path d={edgePath(a, b)} stroke="transparent" strokeWidth={14} fill="none"
              style={{ cursor: 'pointer' }} onClick={() => onDeleteEdge(edge.id)} />
            <path d={edgePath(a, b)} stroke={active ? edgeSelColor : edgeColor}
              strokeWidth={2} fill="none" strokeDasharray={active ? '6 3' : undefined}
              style={{ cursor: 'pointer', transition: 'stroke 0.2s' }}
              onClick={() => onDeleteEdge(edge.id)} />
          </g>
        )
      })}
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WorkflowEditor() {
  const { t } = useTranslation()
  const {
    workflows, upsertWorkflow, deleteWorkflow,
    activeWorkflowId, setActiveWorkflowId,
    workflowRunState, setWorkflowRunState,
    models, theme,
  } = useAppStore()

  const api = (window as any).electronAPI

  // ── All data in refs for O(1) access without re-render ─────────────────────
  const nodesRef = useRef<WFNode[]>([])
  const edgesRef = useRef<WFEdge[]>([])
  const activeIdRef = useRef<string | null>(null)
  const wfNameRef = useRef('')

  // State used only for rendering (minimized updates)
  const [nodes, setNodes] = useState<WFNode[]>([])
  const [edges, setEdges] = useState<WFEdge[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [wfName, setWfName] = useState('')
  const [wfDesc, setWfDesc] = useState('')
  const [runInput, setRunInput] = useState('')
  const [runOutput, setRunOutput] = useState('')
  // The output port a pending connection is being dragged from, or null.
  const [connectingFrom, setConnectingFrom] = useState<{ node: string; handle: string } | null>(null)
  // Live cursor position while dragging a connection (canvas-local coords).
  const [dragCursor, setDragCursor] = useState<Point | null>(null)
  // Validation issues blocking a run, shown as a banner.
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([])

  const canvasRef = useRef<HTMLDivElement>(null)

  // Sync refs whenever state updates
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { edgesRef.current = edges }, [edges])
  useEffect(() => { activeIdRef.current = activeWorkflowId }, [activeWorkflowId])
  useEffect(() => { wfNameRef.current = wfName }, [wfName])

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null

  // ── Persistence (stable ref, no dependency churn) ──────────────────────────
  const persistRef = useRef(async (n: WFNode[], e: WFEdge[]) => {
    const id = activeIdRef.current
    if (!id) return
    const wf: WorkflowDef = {
      id, name: wfNameRef.current, description: wfDesc,
      nodes: n, edges: e, createdAt: 0, updatedAt: Date.now(),
    }
    await api.workflow.save(wf)
    // Update store without triggering re-render cascade
    upsertWorkflow(wf)
  })

  const syncAndPersist = useCallback(async (n: WFNode[], e: WFEdge[]) => {
    nodesRef.current = n
    edgesRef.current = e
    setNodes(n); setEdges(e)
    await persistRef.current(n, e)
  }, [])

  // ── Load / unload ──────────────────────────────────────────────────────────
  const loadWorkflow = useCallback((wf: WorkflowDef) => {
    setActiveWorkflowId(wf.id)
    setWfName(wf.name); setWfDesc(wf.description)
    nodesRef.current = wf.nodes; edgesRef.current = wf.edges
    setNodes(wf.nodes); setEdges(wf.edges)
    setSelectedNodeId(null); setRunOutput('')
    setValidationIssues([])
    setWorkflowRunState(null)
  }, [setActiveWorkflowId, setWorkflowRunState])

  const newWorkflow = async () => {
    const wf: WorkflowDef = {
      id: uuidv4(), name: t('workflow.new'), description: '',
      nodes: [], edges: [], createdAt: Date.now(), updatedAt: Date.now(),
    }
    upsertWorkflow(wf)
    await api.workflow.save(wf)
    loadWorkflow(wf)
  }

  const removeWorkflow = async (id: string) => {
    if (!confirm(t('workflow.confirmDelete'))) return
    deleteWorkflow(id)
    await api.workflow.delete(id)
    if (activeWorkflowId === id) {
      setActiveWorkflowId(null)
      nodesRef.current = []; edgesRef.current = []
      setNodes([]); setEdges([]); setSelectedNodeId(null)
    }
  }

  // ── Node mutations ─────────────────────────────────────────────────────────
  const addNode = useCallback(async (type: WFNodeData['type'], pos: Point) => {
    const node: WFNode = { id: uuidv4(), type: 'wf', position: pos, data: defaultData(type) }
    const updated = [...nodesRef.current, node]
    await syncAndPersist(updated, edgesRef.current)
    setSelectedNodeId(node.id)
  }, [syncAndPersist])

  const deleteNode = useCallback(async (id: string) => {
    const updatedN = nodesRef.current.filter((n) => n.id !== id)
    const updatedE = edgesRef.current.filter((e) => e.source !== id && e.target !== id)
    await syncAndPersist(updatedN, updatedE)
    if (selectedNodeId === id) setSelectedNodeId(null)
    setConnectingFrom(null)
  }, [selectedNodeId, syncAndPersist])

  const updateNodeData = useCallback(async (id: string, patch: Partial<any>) => {
    const updated = nodesRef.current.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, ...patch } } : n
    )
    await syncAndPersist(updated, edgesRef.current)
  }, [syncAndPersist])

  const addEdge = useCallback(async (src: string, tgt: string, sourceHandle = '') => {
    if (src === tgt) return
    const cur = edgesRef.current
    // Same source-handle → same target may only connect once.
    if (cur.find((e) => e.source === src && e.target === tgt && (e.sourceHandle ?? '') === sourceHandle)) return
    const edge: WFEdge = { id: uuidv4(), source: src, target: tgt, sourceHandle: sourceHandle || undefined }
    await syncAndPersist(nodesRef.current, [...cur, edge])
  }, [syncAndPersist])

  const deleteEdge = useCallback(async (edgeId: string) => {
    const updated = edgesRef.current.filter((e) => e.id !== edgeId)
    await syncAndPersist(nodesRef.current, updated)
  }, [syncAndPersist])

  // ── Drag-to-move (DOM-direct, no React re-render per frame) ─────────────────
  const dragNodeRef = useRef<string | null>(null)
  const dragStart = useRef<Point>({ x: 0, y: 0 })
  const nodePosStart = useRef<Point>({ x: 0, y: 0 })

  // Pending connection drag: which output port we started from, and the node
  // the cursor is currently hovering over (a candidate connection target).
  const connectingRef = useRef<{ node: string; handle: string } | null>(null)
  const hoverTargetRef = useRef<string | null>(null)

  const onNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation()
    e.preventDefault()
    setSelectedNodeId(nodeId)

    const node = nodesRef.current.find((n) => n.id === nodeId)
    if (!node) return
    dragNodeRef.current = nodeId
    dragStart.current = { x: e.clientX, y: e.clientY }
    nodePosStart.current = { x: node.position.x, y: node.position.y }
  }, [])

  // Global listeners for drag — managed once, not re-subscribed
  const isDragging = useRef(false)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      // Connection drag takes priority over node-move.
      if (connectingRef.current) {
        const bounds = canvasRef.current?.getBoundingClientRect()
        if (bounds) setDragCursor({ x: e.clientX - bounds.left, y: e.clientY - bounds.top })
        return
      }
      const nid = dragNodeRef.current
      if (!nid) return
      isDragging.current = true
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      // Direct DOM update — no React state
      const el = document.getElementById(`wf-node-${nid}`)
      if (el) {
        el.style.left = `${nodePosStart.current.x + dx}px`
        el.style.top = `${nodePosStart.current.y + dy}px`
      }
    }

    const onUp = () => {
      // Finish a connection drag: connect to whatever node the cursor is over.
      if (connectingRef.current) {
        const from = connectingRef.current
        const target = hoverTargetRef.current
        connectingRef.current = null
        hoverTargetRef.current = null
        setConnectingFrom(null)
        setDragCursor(null)
        if (target && target !== from.node) addEdge(from.node, target, from.handle)
        return
      }

      const nid = dragNodeRef.current
      if (!nid) return
      dragNodeRef.current = null
      if (!isDragging.current) return
      isDragging.current = false

      // Commit final position into React state + persist
      setNodes((prev) => {
        const el = document.getElementById(`wf-node-${nid}`)
        if (!el) return prev
        const x = parseFloat(el.style.left) || 0
        const y = parseFloat(el.style.top) || 0
        const updated = prev.map((n) =>
          n.id === nid ? { ...n, position: { x, y } } : n
        )
        // Persist after state settles
        setTimeout(() => persistRef.current(updated, edgesRef.current), 0)
        return updated
      })
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [addEdge])

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        deleteNode(selectedNodeId)
      }
      if (e.key === 'Escape') {
        connectingRef.current = null
        setConnectingFrom(null); setDragCursor(null); setSelectedNodeId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedNodeId, deleteNode])

  // ── Ports → drag-to-connect ──────────────────────────────────────────────────
  // Press an output port to start a connection; release over a target node's
  // input port (or anywhere on it) to complete. Hover tracking lives in refs so
  // the global mouseup can read the latest target without re-subscribing.
  const onOutPortMouseDown = useCallback((e: React.MouseEvent, nodeId: string, handle: string) => {
    e.stopPropagation()
    e.preventDefault()
    connectingRef.current = { node: nodeId, handle }
    hoverTargetRef.current = null
    setConnectingFrom({ node: nodeId, handle })
    setSelectedNodeId(nodeId)
    const bounds = canvasRef.current?.getBoundingClientRect()
    if (bounds) setDragCursor({ x: e.clientX - bounds.left, y: e.clientY - bounds.top })
  }, [])

  const onNodeMouseEnter = useCallback((nodeId: string) => {
    if (connectingRef.current) hoverTargetRef.current = nodeId
  }, [])

  const onNodeMouseLeave = useCallback((nodeId: string) => {
    if (connectingRef.current && hoverTargetRef.current === nodeId) hoverTargetRef.current = null
  }, [])

  // ── Drop from palette ──────────────────────────────────────────────────────
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/wf-node-type') as WFNodeData['type']
    if (!type) return
    const bounds = canvasRef.current?.getBoundingClientRect()
    if (!bounds) return
    addNode(type, { x: e.clientX - bounds.left - NODE_W / 2, y: e.clientY - bounds.top - NODE_H / 2 })
  }, [addNode])

  // ── Run ────────────────────────────────────────────────────────────────────
  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'ok' | 'err'>('idle')
  const handleRun = async () => {
    if (!activeWorkflowId) return
    const n = nodesRef.current
    const e = edgesRef.current

    const wf: WorkflowDef = {
      id: activeWorkflowId, name: wfName, description: wfDesc,
      nodes: n, edges: e, createdAt: 0, updatedAt: 0,
    }

    // Gate the run on static validation so failures are explained up front
    // rather than surfacing as a confusing mid-run error or empty output.
    const issues = validateWorkflow(wf, models)
    setValidationIssues(issues)
    if (issues.length > 0) {
      setRunStatus('idle')
      return
    }

    setRunOutput('')
    setRunStatus('running')
    setWorkflowRunState(null)
    await persistRef.current(n, e)

    try {
      const result = await runWorkflow(
        wf, runInput, models,
        (state) => setWorkflowRunState({ ...state }),
        (modelId) => {
          const m = models.find((x) => x.id === modelId)
          return m ? `http://127.0.0.1:${m.port}` : 'http://127.0.0.1:8080'
        }
      )
      setRunOutput(result)
      setRunStatus('ok')
    } catch (err: any) {
      const msg = err.message === 'NO_OUTPUT_REACHED'
        ? t('workflow.validate.noOutputReached')
        : err.message
      setRunOutput(`[Error] ${msg}`)
      setRunStatus('err')
    }
  }

  // ── Theme ──────────────────────────────────────────────────────────────────
  const isDark = theme === 'dark'
  const canvasBg = isDark ? '#111' : '#f0f0f0'
  const edgeColor = isDark ? '#555' : '#aaa'
  const edgeSelColor = '#7c3aed'
  const gridColor = isDark ? '#1c1c1c' : '#ddd'

  // ── Status helpers ─────────────────────────────────────────────────────────
  const statusBorder = (nodeId: string) => {
    const s = workflowRunState?.nodeStates[nodeId]?.status
    if (s === 'running') return '#7c3aed'
    if (s === 'done') return '#22c55e'
    if (s === 'error') return '#ef4444'
    if (s === 'skipped') return '#52525b'
    return 'transparent'
  }

  const isRunning = workflowRunState?.running ?? false

  const nodeTypeList: Array<{ type: WFNodeData['type']; key: string }> = [
    { type: 'input', key: 'nodeInput' }, { type: 'llm', key: 'nodeLLM' },
    { type: 'tool', key: 'nodeTool' }, { type: 'router', key: 'nodeRouter' },
    { type: 'merge', key: 'nodeMerge' }, { type: 'output', key: 'nodeOutput' },
  ]

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: workflow list ── */}
      <div className="w-52 flex-shrink-0 border-r border-dark-600 flex flex-col bg-dark-800">
        <div className="p-3 border-b border-dark-600">
          <div className="text-xs font-semibold text-dark-200 mb-2">{t('workflow.title')}</div>
          <button onClick={newWorkflow} className="w-full btn-primary text-xs py-1.5">
            + {t('workflow.new')}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {workflows.length === 0 && (
            <div className="text-xs text-dark-400 text-center py-6">
              {t('workflow.noWorkflows')}<br />{t('workflow.noWorkflowsHint')}
            </div>
          )}
          {workflows.map((wf) => (
            <div key={wf.id} onClick={() => loadWorkflow(wf)}
              className={`group flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
                activeWorkflowId === wf.id
                  ? 'bg-accent/20 border border-accent/30 text-dark-100'
                  : 'hover:bg-dark-700 text-dark-300 border border-transparent'
              }`}>
              <span className="truncate flex-1">{wf.name}</span>
              <button onClick={(ev) => { ev.stopPropagation(); removeWorkflow(wf.id) }}
                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 ml-1 px-1">×</button>
            </div>
          ))}
        </div>
        {activeWorkflowId && (
          <div className="border-t border-dark-600 p-2">
            <div className="text-xs text-dark-400 mb-2">{t('workflow.nodeTypes')}</div>
            <div className="space-y-1">
              {nodeTypeList.map(({ type, key }) => (
                <div key={type}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('application/wf-node-type', type)}
                  className="text-white text-xs px-2 py-1 rounded cursor-grab active:cursor-grabbing select-none"
                  style={{ background: TYPE_COLORS[type] }}>
                  {t(`workflow.${key}`)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Centre: canvas + I/O ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeWorkflowId ? (
          <>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-600 bg-dark-800 flex-shrink-0">
              <input value={wfName} onChange={(e) => setWfName(e.target.value)}
                className="input-field text-sm font-medium max-w-[200px] py-1" />
              {/* Save is automatic; button kept for explicit feedback */}
              <div className="flex-1" />
              {connectingFrom ? (
                <span className="text-xs text-purple-400">{t('workflow.connectHint')}</span>
              ) : (
                <span className="text-xs text-dark-500 hidden lg:inline">{t('workflow.connectHint')}</span>
              )}
              <button onClick={handleRun} disabled={isRunning}
                className="btn-primary text-xs py-1.5 px-4 disabled:opacity-50">
                {isRunning ? t('workflow.running') : t('workflow.run')}
              </button>
            </div>

            {/* SVG + Node canvas */}
            <div ref={canvasRef} className="flex-1 relative overflow-hidden"
              style={{ background: canvasBg }}
              onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
              onClick={() => { setSelectedNodeId(null) }}>

              {/* Grid */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.4 }}>
                <defs>
                  <pattern id="wf-grid" width={20} height={20} patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke={gridColor} strokeWidth={0.5} />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#wf-grid)" />
              </svg>

              {/* Edges SVG layer */}
              <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 10 }}>
                <EdgeLines edges={edges} nodes={nodes} connectingFrom={connectingFrom}
                  edgeColor={edgeColor} edgeSelColor={edgeSelColor} onDeleteEdge={deleteEdge} />
                {connectingFrom && dragCursor && (() => {
                  const src = nodes.find((n) => n.id === connectingFrom.node)
                  if (!src) return null
                  const a = outPortPos(src, connectingFrom.handle)
                  return <path d={edgePath(a, dragCursor)} stroke={edgeSelColor}
                    strokeWidth={2} fill="none" strokeDasharray="6 3" pointerEvents="none" />
                })()}
              </svg>

              {/* Nodes */}
              {nodes.map((node) => {
                const sel = node.id === selectedNodeId
                const con = node.id === connectingFrom?.node
                const bg = TYPE_COLORS[node.data.type] ?? '#374151'
                const status = workflowRunState?.nodeStates[node.id]
                const h = nodeHeight(node)
                const handles = outputHandles(node)
                const isRouter = node.data.type === 'router'
                return (
                  <div key={node.id} id={`wf-node-${node.id}`}
                    onMouseDown={(e) => onNodeMouseDown(e, node.id)}
                    onMouseEnter={() => onNodeMouseEnter(node.id)}
                    onMouseLeave={() => onNodeMouseLeave(node.id)}
                    onClick={(e) => { e.stopPropagation(); setSelectedNodeId(node.id) }}
                    className="absolute select-none"
                    style={{
                      left: node.position.x, top: node.position.y,
                      width: NODE_W, height: h, zIndex: sel || con ? 30 : 20,
                    }}>
                    {/* Input port */}
                    <div onMouseDown={(e) => e.stopPropagation()}
                      className="absolute rounded-full border-2 transition-transform"
                      style={{
                        left: -PORT_R, top: h / 2 - PORT_R,
                        width: PORT_R * 2, height: PORT_R * 2,
                        background: connectingFrom ? '#7c3aed' : (isDark ? '#444' : '#ccc'),
                        borderColor: connectingFrom ? '#a78bfa' : '#999', zIndex: 5,
                      }} />
                    {/* Body */}
                    <div style={{
                      background: bg,
                      border: `2px solid ${sel ? '#fff' : con ? '#a78bfa' : statusBorder(node.id)}`,
                      borderRadius: 10, width: '100%', height: '100%',
                      color: '#fff', fontSize: 12, fontWeight: 600, textAlign: 'center',
                      padding: '6px 10px',
                      opacity: status?.status === 'skipped' ? 0.45 : 1,
                      boxShadow: status?.status === 'running' ? '0 0 12px #7c3aed88'
                        : sel ? '0 0 0 2px #ffffff44' : undefined,
                      cursor: 'grab', display: 'flex', flexDirection: 'column',
                      justifyContent: 'center', overflow: 'hidden',
                    }}>
                      <div style={{ fontSize: 10, opacity: 0.7, textTransform: 'uppercase' }}>
                        {node.data.type}
                        {status?.status === 'running' && ' ⏳'}
                        {status?.status === 'done' && ' ✓'}
                        {status?.status === 'error' && ' ✗'}
                        {status?.status === 'skipped' && ' ⊘'}
                      </div>
                      <div className="truncate">{(node.data as any).label}</div>
                      {status?.error && (
                        <div className="text-red-300 text-[9px] truncate" title={status.error}>{status.error}</div>
                      )}
                    </div>
                    {/* Output port(s) — routers fan out one per route handle + default */}
                    {handles.map((handle) => {
                      const p = outPortPos(node, handle)
                      const top = p.y - node.position.y
                      const activeOut = con && connectingFrom?.handle === handle
                      return (
                        <React.Fragment key={handle || '_out'}>
                          <div
                            onMouseDown={(e) => onOutPortMouseDown(e, node.id, handle)}
                            className="absolute rounded-full border-2 cursor-crosshair hover:scale-125 transition-transform"
                            style={{
                              right: -PORT_R, top: top - PORT_R,
                              width: PORT_R * 2, height: PORT_R * 2,
                              background: activeOut ? '#7c3aed' : (isDark ? '#444' : '#ccc'),
                              borderColor: activeOut ? '#a78bfa' : '#999', zIndex: 6,
                            }}
                            title={handle || undefined} />
                          {isRouter && (
                            <div className="absolute text-[8px] text-white/70 pointer-events-none truncate"
                              style={{ right: -PORT_R - 4, top: top - 5, transform: 'translateX(100%)', maxWidth: 70 }}>
                              {handle === 'default' ? t('workflow.branchDefault') : handle}
                            </div>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </div>
                )
              })}

              {nodes.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-dark-400 text-xs pointer-events-none">
                  {t('workflow.addNodeHint')}
                </div>
              )}
            </div>

            {/* Validation banner — blocks the run until issues are resolved */}
            {validationIssues.length > 0 && (
              <div className="px-4 py-2 border-t bg-red-500/10 border-red-500/30 text-red-300 text-xs flex-shrink-0">
                <div className="font-semibold mb-1">{t('workflow.validate.title')}</div>
                <ul className="list-disc list-inside space-y-0.5">
                  {validationIssues.map((iss, i) => (
                    <li key={i}>{t(`workflow.validate.${iss.code}`, { node: iss.node })}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Run I/O strip */}
            <div className="border-t border-dark-600 bg-dark-800 p-3 flex gap-3 flex-shrink-0">
              <div className="flex-1">
                <label className="text-xs text-dark-400 mb-1 block">{t('workflow.inputLabel')}</label>
                <textarea value={runInput} onChange={(e) => setRunInput(e.target.value)}
                  placeholder={t('workflow.inputPlaceholder')}
                  className="input-field text-xs h-16 resize-none font-mono" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-dark-400 mb-1 block">{t('workflow.output')}</label>
                <textarea readOnly value={runOutput}
                  placeholder="Result will appear here after run"
                  className="input-field text-xs h-16 resize-none font-mono"
                  style={{ background: isDark ? '#0a0a0a' : '#fafafa', color: isDark ? '#e0e0e0' : '#111' }} />
              </div>
            </div>

            {/* Run status banner */}
            {runStatus !== 'idle' && (
              <div className={`px-4 py-2 text-xs font-medium border-t flex items-center gap-2 ${
                runStatus === 'running'
                  ? 'bg-purple-500/10 border-purple-500/30 text-purple-300'
                  : runStatus === 'ok'
                  ? 'bg-green-500/10 border-green-500/30 text-green-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}>
                {runStatus === 'running' && <span className="inline-block w-2 h-2 rounded-full bg-purple-400 animate-pulse" />}
                {runStatus === 'ok' && '✓ ' + t('workflow.runSuccess')}
                {runStatus === 'err' && '✗ ' + t('workflow.runError')}
                {/* Live tokens/sec of the currently-streaming LLM node */}
                {runStatus === 'running' && (workflowRunState?.liveTps ?? 0) > 0 && (
                  <span className="font-mono">{fmtTps(workflowRunState!.liveTps!)} {t('metrics.tps')}</span>
                )}
                {/* Aggregate avg/peak across all LLM nodes after completion */}
                {runStatus === 'ok' && workflowRunState?.aggTps && (
                  <span className="font-mono text-dark-300">
                    {t('metrics.avg')} {fmtTps(workflowRunState.aggTps.avg)} · {t('metrics.peak')} {fmtTps(workflowRunState.aggTps.peak)} {t('metrics.tps')} · {t('metrics.tokens', { count: workflowRunState.aggTps.tokens })}
                  </span>
                )}
                {workflowRunState?.finalOutput && runStatus === 'ok' && (
                  <span className="text-dark-400 truncate flex-1">
                    — {workflowRunState.finalOutput.slice(0, 120)}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-dark-400 text-sm">
            {t('workflow.noWorkflowsHint')}
          </div>
        )}
      </div>

      {/* ── Right: node properties + last-run output ── */}
      {activeWorkflowId && (
        <div className="w-60 flex-shrink-0 border-l border-dark-600 bg-dark-800 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-dark-600 text-xs font-semibold text-dark-200">
            {t('workflow.nodeProps')}
          </div>
          <NodePropsPanel node={selectedNode} onChange={updateNodeData}
            onDelete={deleteNode} models={models} />

          {/* Inspect the selected node's output from the last run */}
          {selectedNode && (
            <div className="border-t border-dark-600 flex flex-col" style={{ maxHeight: '45%' }}>
              <div className="px-3 py-2 text-xs font-semibold text-dark-200 flex-shrink-0">
                {t('workflow.nodeOutputTitle')}
              </div>
              <div className="px-3 pb-3 overflow-y-auto">
                {(() => {
                  const st = workflowRunState?.nodeStates[selectedNode.id]
                  if (st?.status === 'error')
                    return <div className="text-xs text-red-300 font-mono whitespace-pre-wrap break-words">{st.error}</div>
                  if (st?.status === 'skipped')
                    return <div className="text-xs text-dark-400">{t('workflow.statusSkipped')}</div>
                  return (
                    <>
                      {st?.tps && st.tps.tokens > 0 && (
                        <div className="text-[11px] text-green-400 font-mono mb-1.5">
                          {t('metrics.avg')} {fmtTps(st.tps.avg)} · {t('metrics.peak')} {fmtTps(st.tps.peak)} {t('metrics.tps')} · {t('metrics.tokens', { count: st.tps.tokens })}
                        </div>
                      )}
                      {st?.output
                        ? <pre className="text-[11px] text-dark-200 font-mono whitespace-pre-wrap break-words"
                            style={{ background: isDark ? '#0a0a0a' : '#fafafa', padding: 8, borderRadius: 6 }}>{st.output}</pre>
                        : <div className="text-xs text-dark-400">{t('workflow.noNodeOutput')}</div>}
                    </>
                  )
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
