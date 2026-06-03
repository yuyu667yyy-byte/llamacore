/*
 * Copyright (c) 2026 Lucas Vann (陆凯文)
 * Released under the MIT License. See LICENSE for details.
 */

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'
import type { ModelConfig } from '../types'

interface ModelFormData {
  name: string
  ggufPath: string
  port: number
  extraArgs: string
  webSearchSupported: boolean
  multimodal: boolean
}

const DEFAULT_FORM: ModelFormData = {
  name: '',
  ggufPath: '',
  port: 8080,
  extraArgs: '-c 4096 --threads 4',
  webSearchSupported: false,
  multimodal: false,
}

export default function ModelManager() {
  const { t } = useTranslation()
  const { models, setModels, serverStatuses, setServerStatus, setActiveModelId } = useAppStore()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ModelFormData>(DEFAULT_FORM)
  const [serverLogs, setServerLogs] = useState<Record<string, string[]>>({})
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const api = window.electronAPI

  useEffect(() => {
    // Refresh model list
    api.model.list().then(setModels)

    // Subscribe to server events
    const unsubLog = api.server.onLog((modelId, line) => {
      setServerLogs((prev) => ({
        ...prev,
        [modelId]: [...(prev[modelId] ?? []).slice(-200), line],
      }))
    })
    const unsubStopped = api.server.onStopped((modelId) => {
      setServerStatus(modelId, { running: false })
    })
    const unsubError = api.server.onError((modelId, msg) => {
      setServerStatus(modelId, { running: false })
      setServerLogs((prev) => ({
        ...prev,
        [modelId]: [...(prev[modelId] ?? []), `[ERROR] ${msg}`],
      }))
    })

    return () => {
      unsubLog()
      unsubStopped()
      unsubError()
    }
  }, [])

  const openForm = (model?: ModelConfig) => {
    if (model) {
      setEditingId(model.id)
      setForm({
        name: model.name,
        ggufPath: model.gguf_path,
        port: model.port,
        extraArgs: model.extra_args,
        webSearchSupported: !!model.web_search_supported,
        multimodal: !!model.multimodal,
      })
    } else {
      setEditingId(null)
      setForm(DEFAULT_FORM)
    }
    setShowForm(true)
  }

  const browseGguf = async () => {
    const path = await api.dialog.openGguf()
    if (path) {
      setForm((f) => ({
        ...f,
        ggufPath: path,
        name: f.name || (path.split(/[/\\]/).pop()?.replace('.gguf', '') ?? ''),
      }))
    }
  }

  const saveModel = async () => {
    if (!form.name.trim() || !form.ggufPath.trim()) return

    if (editingId) {
      await api.model.update(editingId, {
        name: form.name,
        ggufPath: form.ggufPath,
        port: form.port,
        extraArgs: form.extraArgs,
        webSearchSupported: form.webSearchSupported,
        multimodal: form.multimodal,
      })
    } else {
      await api.model.add({
        name: form.name,
        ggufPath: form.ggufPath,
        port: form.port,
        extraArgs: form.extraArgs,
        webSearchSupported: form.webSearchSupported,
        multimodal: form.multimodal,
      })
    }

    const updated = await api.model.list()
    setModels(updated)
    setShowForm(false)
    setEditingId(null)
    setForm(DEFAULT_FORM)
  }

  const deleteModel = async (id: string) => {
    if (!confirm(t('model.confirmDelete'))) return
    await api.model.delete(id)
    const updated = await api.model.list()
    setModels(updated)
  }

  const toggleServer = async (model: ModelConfig) => {
    const status = serverStatuses[model.id]
    setLoadingId(model.id)

    if (status?.running) {
      await api.server.stop(model.id)
      setServerStatus(model.id, { running: false })
    } else {
      const result = await api.server.start(model.id)
      if (result.success) {
        setServerStatus(model.id, { running: true, pid: result.pid })
        setActiveModelId(model.id)
      } else {
        alert(`${t('model.startFailed')}: ${result.error}`)
      }
    }

    setLoadingId(null)
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-white">{t('model.title')}</h1>
            <p className="text-sm text-dark-400 mt-0.5">
              {t('model.subtitle')}
            </p>
          </div>
          <button onClick={() => openForm()} className="btn-primary flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('model.add')}
          </button>
        </div>

        {/* Model cards */}
        <div className="space-y-3">
          {models.length === 0 && (
            <div className="card text-center py-12">
              <div className="text-dark-400 text-sm mb-3">{t('model.noModels')}</div>
              <button onClick={() => openForm()} className="btn-primary text-sm">
                {t('model.addFirst')}
              </button>
            </div>
          )}

          {models.map((model) => {
            const isRunning = serverStatuses[model.id]?.running ?? false
            const isLoading = loadingId === model.id
            const logs = serverLogs[model.id] ?? []

            return (
              <div key={model.id} className="card space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Status dot */}
                    <div
                      className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 ${
                        isRunning
                          ? 'bg-green-400 shadow-lg shadow-green-400/30 animate-pulse'
                          : 'bg-dark-500'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-white text-sm">{model.name}</div>
                      <div
                        className="text-xs text-dark-400 truncate max-w-[300px] mt-0.5"
                        title={model.gguf_path}
                      >
                        {model.gguf_path}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    {isRunning && (
                      <span className="text-xs text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-0.5 rounded-full">
                        {t('topbar.running')} :{model.port}
                      </span>
                    )}

                    {/* Toggle server */}
                    <button
                      onClick={() => toggleServer(model)}
                      disabled={isLoading}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border disabled:opacity-50 ${
                        isRunning
                          ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                          : 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20'
                      }`}
                    >
                      {isLoading ? '...' : isRunning ? t('common.stop') : t('common.start')}
                    </button>

                    <button
                      onClick={() => openForm(model)}
                      className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-600 transition-colors"
                      title={t('common.edit')}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>

                    <button
                      onClick={() => deleteModel(model.id)}
                      className="p-1.5 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                      title={t('common.delete')}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Model info pills */}
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs bg-dark-700 border border-dark-600 text-dark-300 px-2 py-0.5 rounded">
                    port: {model.port}
                  </span>
                  {model.extra_args && (
                    <span className="text-xs bg-dark-700 border border-dark-600 text-dark-300 px-2 py-0.5 rounded font-mono">
                      {model.extra_args}
                    </span>
                  )}
                </div>

                {/* Server log accordion */}
                {logs.length > 0 && (
                  <div>
                    <button
                      onClick={() =>
                        setExpandedLog(expandedLog === model.id ? null : model.id)
                      }
                      className="text-xs text-dark-400 hover:text-white flex items-center gap-1"
                    >
                      <svg
                        className={`w-3 h-3 transition-transform ${
                          expandedLog === model.id ? 'rotate-90' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      {t('model.serverLogs')} ({t('model.logsLines', { count: logs.length })})
                    </button>
                    {expandedLog === model.id && (
                      <div className="mt-2 bg-dark-900 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs text-dark-300 space-y-0.5">
                        {logs.map((line, i) => (
                          <div key={i} className="leading-relaxed">
                            {line}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Add/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-base font-semibold text-white mb-4">
              {editingId ? t('model.editTitle') : t('model.addTitle')}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-dark-300 mb-1.5 block">{t('model.name')} *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t('model.namePlaceholder')}
                  className="input-field"
                />
              </div>

              <div>
                <label className="text-xs text-dark-300 mb-1.5 block">{t('model.ggufPath')} *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.ggufPath}
                    onChange={(e) => setForm((f) => ({ ...f, ggufPath: e.target.value }))}
                    placeholder={t('model.ggufPlaceholder')}
                    className="input-field font-mono text-xs"
                  />
                  <button
                    onClick={browseGguf}
                    className="flex-shrink-0 px-3 py-2 bg-dark-600 hover:bg-dark-500 border border-dark-500 rounded-lg text-sm text-dark-200 transition-colors whitespace-nowrap"
                  >
                    {t('common.browse')}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-dark-300 mb-1.5 block">{t('model.port')}</label>
                  <input
                    type="number"
                    value={form.port}
                    onChange={(e) => setForm((f) => ({ ...f, port: parseInt(e.target.value) || 8080 }))}
                    className="input-field"
                    min={1024}
                    max={65535}
                  />
                </div>
                <div>
                  <label className="text-xs text-dark-300 mb-1.5 block">{t('model.extraArgs')}</label>
                  <input
                    type="text"
                    value={form.extraArgs}
                    onChange={(e) => setForm((f) => ({ ...f, extraArgs: e.target.value }))}
                    placeholder="-c 4096 --threads 4"
                    className="input-field font-mono text-xs"
                  />
                </div>
              </div>

              <div className="bg-dark-700 rounded-lg p-3">
                <div className="text-xs text-dark-400 mb-1.5 font-medium">{t('model.tips')}</div>
                <div className="text-xs text-dark-400 space-y-1 font-mono">
                  <div><span className="text-dark-300">-c 4096</span> — {t('model.tipContext')}</div>
                  <div><span className="text-dark-300">--threads 8</span> — {t('model.tipThreads')}</div>
                  <div><span className="text-dark-300">-ngl 33</span> — {t('model.tipNgl')}</div>
                  <div><span className="text-dark-300">--flash-attn</span> — {t('model.tipFlashAttn')}</div>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.webSearchSupported}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, webSearchSupported: e.target.checked }))
                    }
                    className="w-4 h-4 accent-accent"
                  />
                  <span className="text-xs text-dark-200">{t('model.webSearchSupported')}</span>
                </label>
                <p className="text-xs text-dark-400 mt-1 ml-6">{t('model.webSearchHint')}</p>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.multimodal}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, multimodal: e.target.checked }))
                    }
                    className="w-4 h-4 accent-accent"
                  />
                  <span className="text-xs text-dark-200">{t('model.multimodalSupported')}</span>
                </label>
                <p className="text-xs text-dark-400 mt-1 ml-6">{t('model.multimodalHint')}</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowForm(false)
                  setEditingId(null)
                }}
                className="flex-1 btn-ghost border border-dark-500"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={saveModel}
                disabled={!form.name.trim() || !form.ggufPath.trim()}
                className="flex-1 btn-primary"
              >
                {editingId ? t('model.saveChanges') : t('model.add')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
