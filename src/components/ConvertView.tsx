/*
 * Copyright (c) 2026 Lucas Vann (陆凯文)
 * Released under the MIT License. See LICENSE for details.
 */

import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'

type SourceType = 'local' | 'hf'

export default function ConvertView() {
  const { t } = useTranslation()
  const { models, setModels } = useAppStore()
  const api = window.electronAPI

  const [sourceType, setSourceType] = useState<SourceType>('local')
  const [modelDir, setModelDir] = useState('')
  const [hfId, setHfId] = useState('')
  const [outPath, setOutPath] = useState('')
  const [outType, setOutType] = useState('f16')
  const [scriptPath, setScriptPath] = useState('')
  const [pythonCmd, setPythonCmd] = useState('')

  const [pythonStatus, setPythonStatus] = useState<{ ok: boolean; version?: string } | null>(null)
  const [scriptStatus, setScriptStatus] = useState<{ ok: boolean } | null>(null)

  const [converting, setConverting] = useState(false)
  const [done, setDone] = useState<{ exitCode: number } | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [addedToModels, setAddedToModels] = useState(false)

  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Auto-detect script on mount: look next to this process or common spots
  useEffect(() => {
    // Try to find convert_hf_to_gguf.py in the repo root (sibling to electron/)
    const candidates = [
      'convert_hf_to_gguf.py',
    ]
    for (const c of candidates) {
      api.convert.checkScript(c).then((r) => {
        if (r.ok) setScriptPath(c)
      })
    }
  }, [])

  const checkPython = async () => {
    const result = await api.convert.checkPython(pythonCmd || undefined)
    setPythonStatus(result)
  }

  const browseScript = async () => {
    const p = await api.dialog.openScript()
    if (p) {
      setScriptPath(p)
      const r = await api.convert.checkScript(p)
      setScriptStatus(r)
    }
  }

  const browseModelDir = async () => {
    const p = await api.dialog.openDir()
    if (p) setModelDir(p)
  }

  const browseOutPath = async () => {
    const suggestion = modelDir
      ? modelDir.replace(/[/\\]$/, '') + '/model.gguf'
      : undefined
    const p = await api.dialog.saveGguf(suggestion)
    if (p) setOutPath(p)
  }

  const startConvert = async () => {
    if (!scriptPath) return
    if (sourceType === 'local' && !modelDir) return
    if (sourceType === 'hf' && !hfId.trim()) return

    setLogs([])
    setDone(null)
    setAddedToModels(false)
    setConverting(true)

    const unsubLog = api.convert.onLog((line) => {
      setLogs((prev) => [...prev, line])
    })
    const unsubDone = api.convert.onDone((exitCode) => {
      setConverting(false)
      setDone({ exitCode })
      unsubLog()
      unsubDone()
    })

    const result = await api.convert.start({
      scriptPath,
      pythonCmd: pythonCmd || undefined,
      sourceType,
      modelDir: sourceType === 'local' ? modelDir : undefined,
      hfId: sourceType === 'hf' ? hfId.trim() : undefined,
      outPath: outPath || undefined,
      outType: outType || undefined,
    })

    if (!result.success) {
      setLogs([`[ERROR] ${result.error}`])
      setConverting(false)
      unsubLog()
      unsubDone()
    }
  }

  const stopConvert = async () => {
    await api.convert.stop()
    setConverting(false)
  }

  const addToModels = async () => {
    const ggufPath = outPath || (modelDir ? modelDir.replace(/[/\\]$/, '') + '/model.gguf' : '')
    if (!ggufPath) return
    const name = ggufPath.split(/[/\\]/).pop()?.replace('.gguf', '') ?? 'converted-model'
    await api.model.add({ name, ggufPath, port: 8080, extraArgs: '-c 4096 --threads 4' })
    const updated = await api.model.list()
    setModels(updated)
    setAddedToModels(true)
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel: config */}
      <div className="w-80 flex-shrink-0 border-r border-dark-600 overflow-y-auto p-4 space-y-4">
        <div>
          <h1 className="text-base font-semibold text-dark-100">{t('convert.title')}</h1>
          <p className="text-xs text-dark-400 mt-0.5">{t('convert.subtitle')}</p>
        </div>

        {/* Security note */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 text-xs text-yellow-300">
          {t('convert.securityNote')}
        </div>

        {/* Python */}
        <div>
          <label className="text-xs text-dark-300 mb-1 block">{t('convert.pythonPath')}</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={pythonCmd}
              onChange={(e) => setPythonCmd(e.target.value)}
              placeholder={t('convert.pythonPlaceholder')}
              className="input-field text-xs font-mono"
            />
            <button
              onClick={checkPython}
              className="flex-shrink-0 px-2 py-1.5 bg-dark-600 hover:bg-dark-500 border border-dark-500 rounded-lg text-xs text-dark-200 transition-colors whitespace-nowrap"
            >
              {t('convert.checkPython')}
            </button>
          </div>
          {pythonStatus && (
            <p className={`text-xs mt-1 ${pythonStatus.ok ? 'text-green-400' : 'text-red-400'}`}>
              {pythonStatus.ok ? `✓ ${pythonStatus.version}` : t('convert.pythonNotFound')}
            </p>
          )}
        </div>

        {/* Script path */}
        <div>
          <label className="text-xs text-dark-300 mb-1 block">{t('convert.scriptPath')}</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={scriptPath}
              onChange={(e) => setScriptPath(e.target.value)}
              placeholder={t('convert.scriptPlaceholder')}
              className="input-field text-xs font-mono"
            />
            <button
              onClick={browseScript}
              className="flex-shrink-0 px-2 py-1.5 bg-dark-600 hover:bg-dark-500 border border-dark-500 rounded-lg text-xs text-dark-200 transition-colors"
            >
              …
            </button>
          </div>
          {scriptStatus !== null && (
            <p className={`text-xs mt-1 ${scriptStatus.ok ? 'text-green-400' : 'text-red-400'}`}>
              {scriptStatus.ok ? `✓ ${t('convert.scriptFound')}` : t('convert.scriptNotFound')}
            </p>
          )}
        </div>

        {/* Source type */}
        <div>
          <label className="text-xs text-dark-300 mb-1 block">{t('convert.sourceType')}</label>
          <div className="flex gap-2">
            {(['local', 'hf'] as SourceType[]).map((type) => (
              <button
                key={type}
                onClick={() => setSourceType(type)}
                className={`flex-1 text-xs py-1.5 rounded border transition-colors ${
                  sourceType === type
                    ? 'bg-accent text-white border-accent'
                    : 'bg-dark-700 border-dark-500 text-dark-300 hover:text-dark-100'
                }`}
              >
                {type === 'local' ? t('convert.localDir') : t('convert.hfId')}
              </button>
            ))}
          </div>
        </div>

        {/* Model source input */}
        {sourceType === 'local' ? (
          <div>
            <label className="text-xs text-dark-300 mb-1 block">{t('convert.modelDir')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={modelDir}
                onChange={(e) => setModelDir(e.target.value)}
                placeholder={t('convert.modelDirPlaceholder')}
                className="input-field text-xs font-mono"
              />
              <button
                onClick={browseModelDir}
                className="flex-shrink-0 px-2 py-1.5 bg-dark-600 hover:bg-dark-500 border border-dark-500 rounded-lg text-xs text-dark-200 transition-colors"
              >
                …
              </button>
            </div>
          </div>
        ) : (
          <div>
            <label className="text-xs text-dark-300 mb-1 block">{t('convert.hfIdLabel')}</label>
            <input
              type="text"
              value={hfId}
              onChange={(e) => setHfId(e.target.value)}
              placeholder={t('convert.hfIdPlaceholder')}
              className="input-field text-xs font-mono"
            />
            <p className="text-xs text-dark-400 mt-1">{t('convert.hfHint')}</p>
          </div>
        )}

        {/* Output path */}
        <div>
          <label className="text-xs text-dark-300 mb-1 block">{t('convert.outPath')}</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={outPath}
              onChange={(e) => setOutPath(e.target.value)}
              placeholder={t('convert.outPathPlaceholder')}
              className="input-field text-xs font-mono"
            />
            <button
              onClick={browseOutPath}
              className="flex-shrink-0 px-2 py-1.5 bg-dark-600 hover:bg-dark-500 border border-dark-500 rounded-lg text-xs text-dark-200 transition-colors"
            >
              …
            </button>
          </div>
        </div>

        {/* Output type */}
        <div>
          <label className="text-xs text-dark-300 mb-1 block">{t('convert.outType')}</label>
          <input
            type="text"
            value={outType}
            onChange={(e) => setOutType(e.target.value)}
            placeholder="f16"
            className="input-field text-xs font-mono"
          />
          <p className="text-xs text-dark-400 mt-1">{t('convert.outTypeHint')}</p>
        </div>

        {/* Action buttons */}
        <div className="pt-2">
          {converting ? (
            <button onClick={stopConvert} className="w-full btn-danger border border-red-500/30">
              {t('convert.stopConvert')}
            </button>
          ) : (
            <button
              onClick={startConvert}
              disabled={!scriptPath || (sourceType === 'local' ? !modelDir : !hfId.trim())}
              className="w-full btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('convert.startConvert')}
            </button>
          )}
        </div>

        {/* Done state */}
        {done && (
          <div className={`rounded-lg px-3 py-2 text-xs border ${
            done.exitCode === 0
              ? 'bg-green-500/10 border-green-500/30 text-green-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}>
            {done.exitCode === 0 ? t('convert.done') : t('convert.failed', { code: done.exitCode })}
          </div>
        )}

        {/* Add to models */}
        {done?.exitCode === 0 && !addedToModels && (
          <button onClick={addToModels} className="w-full btn-primary text-xs">
            {t('convert.addToModels')}
          </button>
        )}
        {addedToModels && (
          <p className="text-xs text-green-400 text-center">{t('convert.addedToModels')}</p>
        )}
      </div>

      {/* Right panel: log */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-dark-600">
          <span className="text-xs font-medium text-dark-300">{t('convert.log')}</span>
          {logs.length > 0 && (
            <button
              onClick={() => setLogs([])}
              className="text-xs text-dark-400 hover:text-dark-100 transition-colors"
            >
              {t('convert.clearLog')}
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs text-dark-300 bg-dark-900">
          {logs.length === 0 ? (
            <div className="text-dark-500 text-center py-12">{t('convert.noLog')}</div>
          ) : (
            logs.map((line, i) => (
              <div key={i} className="leading-relaxed whitespace-pre-wrap break-all">
                {line}
              </div>
            ))
          )}
          {converting && <div className="text-accent animate-pulse">{t('convert.converting')}</div>}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  )
}
