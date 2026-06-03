/*
 * Copyright (c) 2026 Lucas Vann (陆凯文)
 * Released under the MIT License. See LICENSE for details.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface MetricPoint {
  step: number
  loss?: number
  val_loss?: number
  lr?: number
  epoch?: number
  [key: string]: number | undefined
}

type TabMode = 'tensorboard' | 'logfile'

// ── Log parsers ──────────────────────────────────────────────────────────────

// Parse llama.cpp finetune log lines like:
//   iter 100: loss = 1.2345, lr = 0.00010, t = 12.3 secs
// or json-lines: {"step":100,"loss":1.234,"lr":0.0001,"epoch":1}
function parseLine(line: string): MetricPoint | null {
  line = line.trim()
  if (!line) return null

  // Try JSON-lines first
  if (line.startsWith('{')) {
    try {
      const obj = JSON.parse(line)
      if (obj.step != null || obj.loss != null) {
        return {
          step: obj.step ?? obj.iter ?? obj.global_step ?? 0,
          loss: obj.loss ?? obj.train_loss,
          val_loss: obj.val_loss ?? obj.eval_loss,
          lr: obj.lr ?? obj.learning_rate,
          epoch: obj.epoch,
        }
      }
    } catch {
      // fall through to regex
    }
  }

  // llama.cpp finetune: "iter N: loss = X, lr = Y, t = Z secs"
  const llamaMatch = line.match(
    /iter\s+(\d+).*?loss\s*=\s*([\d.eE+-]+)(?:.*?lr\s*=\s*([\d.eE+-]+))?/i
  )
  if (llamaMatch) {
    return {
      step: parseInt(llamaMatch[1]),
      loss: parseFloat(llamaMatch[2]),
      lr: llamaMatch[3] ? parseFloat(llamaMatch[3]) : undefined,
    }
  }

  // Generic: "step=N loss=X"
  const genericMatch = line.match(/step[=\s]+(\d+).*?loss[=:\s]+([\d.eE+-]+)/i)
  if (genericMatch) {
    return {
      step: parseInt(genericMatch[1]),
      loss: parseFloat(genericMatch[2]),
    }
  }

  // "epoch N/M  step M  loss X"
  const epochMatch = line.match(/epoch[\s/]+(\d+).*?loss[:\s]+([\d.eE+-]+)/i)
  if (epochMatch) {
    const lrMatch = line.match(/lr[:\s]+([\d.eE+-]+)/i)
    return {
      step: parseInt(epochMatch[1]) * 1000, // approximate
      epoch: parseInt(epochMatch[1]),
      loss: parseFloat(epochMatch[2]),
      lr: lrMatch ? parseFloat(lrMatch[1]) : undefined,
    }
  }

  return null
}

// ── Webview TensorBoard tab ───────────────────────────────────────────────────
function TensorBoardTab() {
  const { t } = useTranslation()
  const [url, setUrl] = useState('http://127.0.0.1:6006')
  const [inputUrl, setInputUrl] = useState('http://127.0.0.1:6006')
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b border-dark-600 bg-dark-800">
        <label className="text-sm text-dark-300 whitespace-nowrap">{t('training.tbAddress')}:</label>
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          className="input-field flex-1 max-w-sm font-mono text-xs"
          placeholder="http://127.0.0.1:6006"
        />
        <button
          onClick={() => {
            setUrl(inputUrl)
            setLoaded(false)
          }}
          className="btn-primary text-sm px-4"
        >
          {t('training.load')}
        </button>
      </div>

      <div className="flex-1 relative">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-900 z-10">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <div className="text-sm text-dark-400">{t('training.loadingTb')}</div>
              <div className="text-xs text-dark-500 mt-1">{url}</div>
            </div>
          </div>
        )}
        {/* @ts-ignore */}
        <webview
          src={url}
          className="w-full h-full"
          onLoad={() => setLoaded(true)}
          partition="persist:tensorboard"
          style={{ display: 'flex', flex: 1, height: '100%' }}
        />
      </div>

      <div className="px-4 py-2 bg-dark-800 border-t border-dark-600 text-xs text-dark-400">
        {t('training.tbHint')}
      </div>
    </div>
  )
}

// ── Log file chart tab ────────────────────────────────────────────────────────
function LogFileTab() {
  const { t } = useTranslation()
  const [logPath, setLogPath] = useState('')
  const [data, setData] = useState<MetricPoint[]>([])
  const [isWatching, setIsWatching] = useState(false)
  const [error, setError] = useState('')
  const [lastStep, setLastStep] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const api = window.electronAPI

  const loadLog = useCallback(async (path: string) => {
    if (!path) return
    const result = await api.log.readTail(path, 500)
    if (result.error) {
      setError(result.error)
      return
    }
    setError('')
    const points: MetricPoint[] = []
    for (const line of result.lines) {
      const pt = parseLine(line)
      if (pt) points.push(pt)
    }
    // Deduplicate by step, keep latest
    const map = new Map<number, MetricPoint>()
    for (const pt of points) map.set(pt.step, pt)
    const sorted = Array.from(map.values()).sort((a, b) => a.step - b.step)
    setData(sorted)
    if (sorted.length > 0) setLastStep(sorted[sorted.length - 1].step)
  }, [])

  const startWatching = () => {
    if (!logPath || isWatching) return
    setIsWatching(true)
    loadLog(logPath)
    intervalRef.current = setInterval(() => loadLog(logPath), 2000)
  }

  const stopWatching = () => {
    setIsWatching(false)
    if (intervalRef.current) clearInterval(intervalRef.current)
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const browsLog = async () => {
    const path = await api.dialog.openLog()
    if (path) setLogPath(path)
  }

  const hasLoss = data.some((d) => d.loss != null)
  const hasValLoss = data.some((d) => d.val_loss != null)
  const hasLr = data.some((d) => d.lr != null)

  const latestPoint = data[data.length - 1]

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 border-b border-dark-600 bg-dark-800">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={logPath}
            onChange={(e) => setLogPath(e.target.value)}
            placeholder={t('training.logPlaceholder')}
            className="input-field flex-1 font-mono text-xs"
          />
          <button onClick={browsLog} className="btn-ghost border border-dark-500 text-sm whitespace-nowrap">
            {t('common.browse')}
          </button>
          {!isWatching ? (
            <button onClick={startWatching} className="btn-primary text-sm whitespace-nowrap">
              {t('training.startWatch')}
            </button>
          ) : (
            <button
              onClick={stopWatching}
              className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm hover:bg-red-500/20 transition-colors whitespace-nowrap"
            >
              {t('training.stopWatch')}
            </button>
          )}
        </div>
        {error && (
          <div className="mt-2 text-xs text-red-400">{t('common.error')}: {error}</div>
        )}
      </div>

      {data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-dark-400 text-sm">
          {isWatching ? t('training.waitingData') : t('training.selectLogHint')}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Stats bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: t('training.currentStep'), value: latestPoint?.step ?? '—' },
              {
                label: t('training.trainLoss'),
                value: latestPoint?.loss != null ? latestPoint.loss.toFixed(4) : '—',
              },
              {
                label: t('training.valLoss'),
                value: latestPoint?.val_loss != null ? latestPoint.val_loss.toFixed(4) : '—',
              },
              {
                label: t('training.lr'),
                value: latestPoint?.lr != null ? latestPoint.lr.toExponential(2) : '—',
              },
            ].map((stat) => (
              <div key={stat.label} className="card text-center">
                <div className="text-xs text-dark-400 mb-1">{stat.label}</div>
                <div className="text-lg font-mono font-semibold text-white">{String(stat.value)}</div>
              </div>
            ))}
          </div>

          {/* Loss chart */}
          {(hasLoss || hasValLoss) && (
            <div className="card">
              <div className="text-sm font-medium text-white mb-4">{t('training.lossChart')}</div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                  <XAxis
                    dataKey="step"
                    stroke="#555"
                    tick={{ fill: '#888', fontSize: 11 }}
                    label={{ value: 'Step', position: 'insideBottomRight', offset: -5, fill: '#888', fontSize: 11 }}
                  />
                  <YAxis
                    stroke="#555"
                    tick={{ fill: '#888', fontSize: 11 }}
                    width={55}
                    tickFormatter={(v) => (typeof v === 'number' ? v.toFixed(3) : v)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#1e1e1e',
                      border: '1px solid #3a3a3a',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: '#aaa' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {hasLoss && (
                    <Line
                      type="monotone"
                      dataKey="loss"
                      name="Train Loss"
                      stroke="#7c3aed"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  )}
                  {hasValLoss && (
                    <Line
                      type="monotone"
                      dataKey="val_loss"
                      name="Val Loss"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Learning rate chart */}
          {hasLr && (
            <div className="card">
              <div className="text-sm font-medium text-white mb-4">{t('training.lrChart')}</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                  <XAxis
                    dataKey="step"
                    stroke="#555"
                    tick={{ fill: '#888', fontSize: 11 }}
                  />
                  <YAxis
                    stroke="#555"
                    tick={{ fill: '#888', fontSize: 11 }}
                    width={70}
                    tickFormatter={(v) => (typeof v === 'number' ? v.toExponential(1) : v)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#1e1e1e',
                      border: '1px solid #3a3a3a',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: any) => [typeof v === 'number' ? v.toExponential(4) : v, 'LR']}
                  />
                  <Line
                    type="monotone"
                    dataKey="lr"
                    name="Learning Rate"
                    stroke="#22d3ee"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Raw last lines */}
          <div className="card">
            <div className="text-sm font-medium text-white mb-2">{t('training.recentPoints', { count: data.length })}</div>
            <div className="bg-dark-900 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-xs text-dark-300 space-y-0.5">
              {data
                .slice(-20)
                .reverse()
                .map((pt, i) => (
                  <div key={i}>
                    step={pt.step}
                    {pt.loss != null ? ` loss=${pt.loss.toFixed(4)}` : ''}
                    {pt.val_loss != null ? ` val_loss=${pt.val_loss.toFixed(4)}` : ''}
                    {pt.lr != null ? ` lr=${pt.lr.toExponential(2)}` : ''}
                    {pt.epoch != null ? ` epoch=${pt.epoch}` : ''}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TrainingMonitor() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<TabMode>('tensorboard')

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex gap-1 px-4 py-3 border-b border-dark-600 bg-dark-800">
        {([
          { id: 'tensorboard', label: t('training.tensorboardTab') },
          { id: 'logfile', label: t('training.logfileTab') },
        ] as const).map((tabItem) => (
          <button
            key={tabItem.id}
            onClick={() => setTab(tabItem.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === tabItem.id
                ? 'bg-accent text-white'
                : 'text-dark-300 hover:text-white hover:bg-dark-700'
            }`}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'tensorboard' ? <TensorBoardTab /> : <LogFileTab />}
      </div>
    </div>
  )
}
