/*
 * Copyright (c) 2026 Lucas Vann (陆凯文)
 * Released under the MIT License. See LICENSE for details.
 */

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'
import { SUPPORTED_LANGUAGES, setLanguage, type LanguageCode } from '../i18n'

export default function TopBar() {
  const { t, i18n } = useTranslation()
  const {
    view,
    models,
    activeModelId,
    setActiveModelId,
    serverStatuses,
    thinkingEnabled,
    setThinkingEnabled,
    reasoningEffort,
    setReasoningEffort,
    streamingEnabled,
    setStreamingEnabled,
    webSearchEnabled,
    setWebSearchEnabled,
    temperature,
    setTemperature,
    maxTokens,
    setMaxTokens,
    formattingPrompt,
    setFormattingPrompt,
    jsonMode,
    setJsonMode,
    systemPrompt,
    setSystemPrompt,
    isStreaming,
    abortController,
    theme,
    setTheme,
  } = useAppStore()

  const [showSettings, setShowSettings] = useState(false)
  const [showSysPrompt, setShowSysPrompt] = useState(false)

  const activeModel = models.find((m) => m.id === activeModelId)
  const isModelRunning = activeModelId ? serverStatuses[activeModelId]?.running : false
  const webSearchSupported = !!activeModel?.web_search_supported

  // Auto-disable the toggle if user switches to a model without web-search support
  React.useEffect(() => {
    if (!webSearchSupported && webSearchEnabled) {
      setWebSearchEnabled(false)
    }
  }, [webSearchSupported])

  const toggleTheme = async () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    const api = (window as any).electronAPI
    if (api) await api.settings.set('theme', next)
  }

  const handleLangChange = async (code: LanguageCode) => {
    await setLanguage(code)
  }

  return (
    <div className="h-12 bg-dark-800 border-b border-dark-600 flex items-center px-4 gap-3 flex-shrink-0">
      {view === 'chat' && (
        <>
          <select
            value={activeModelId ?? ''}
            onChange={(e) => setActiveModelId(e.target.value || null)}
            className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-1.5 text-sm text-dark-100 focus:outline-none focus:border-accent max-w-[200px]"
          >
            <option value="">{t('topbar.selectModel')}</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          {activeModelId && (
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2 h-2 rounded-full ${
                  isModelRunning ? 'bg-green-400 animate-pulse' : 'bg-dark-400'
                }`}
              />
              <span className="text-xs text-dark-400">
                {isModelRunning
                  ? `${t('topbar.running')} :${activeModel?.port}`
                  : t('topbar.stopped')}
              </span>
            </div>
          )}

          <div className="flex-1" />

          <button
            onClick={() => setThinkingEnabled(!thinkingEnabled)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              thinkingEnabled
                ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                : 'bg-dark-700 border-dark-500 text-dark-300 hover:text-dark-100'
            }`}
            title={t('topbar.thinkingTooltip')}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            {t('topbar.thinking')}
          </button>

          {thinkingEnabled && (
            <select
              value={reasoningEffort}
              onChange={(e) => setReasoningEffort(e.target.value as any)}
              className="bg-dark-700 border border-purple-500/40 rounded-lg px-2 py-1.5 text-xs text-purple-300 focus:outline-none"
            >
              <option value="low">{t('topbar.low')}</option>
              <option value="medium">{t('topbar.medium')}</option>
              <option value="high">{t('topbar.high')}</option>
            </select>
          )}

          <button
            onClick={() => setStreamingEnabled(!streamingEnabled)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              streamingEnabled
                ? 'bg-green-500/20 border-green-500/40 text-green-300'
                : 'bg-dark-700 border-dark-500 text-dark-300 hover:text-dark-100'
            }`}
            title={t('topbar.streamTooltip')}
          >
            {t('topbar.stream')}
          </button>

          <button
            onClick={() => {
              if (webSearchSupported) setWebSearchEnabled(!webSearchEnabled)
            }}
            disabled={!webSearchSupported}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              !webSearchSupported
                ? 'bg-dark-700 border-dark-500 text-dark-500 cursor-not-allowed opacity-60'
                : webSearchEnabled
                ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                : 'bg-dark-700 border-dark-500 text-dark-300 hover:text-dark-100'
            }`}
            title={webSearchSupported ? t('topbar.webSearchTooltip') : t('topbar.webSearchUnsupported')}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.6 9h16.8M3.6 15h16.8M12 3a14.5 14.5 0 010 18M12 3a14.5 14.5 0 000 18" />
            </svg>
            {t('topbar.webSearch')}
          </button>

          {isStreaming && abortController && (
            <button
              onClick={() => abortController.abort()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              {t('topbar.stopGenerate')}
            </button>
          )}

          <button
            onClick={() => setShowSysPrompt(!showSysPrompt)}
            className={`p-1.5 rounded-lg transition-colors border ${
              systemPrompt
                ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                : 'bg-dark-700 border-dark-500 text-dark-400 hover:text-dark-100'
            }`}
            title={t('topbar.systemPrompt')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
        </>
      )}

      {view === 'models' && (
        <span className="text-sm font-medium text-dark-100">{t('model.title')}</span>
      )}
      {view === 'training' && (
        <span className="text-sm font-medium text-dark-100">{t('nav.training')}</span>
      )}
      {view === 'convert' && (
        <span className="text-sm font-medium text-dark-100">{t('convert.title')}</span>
      )}
      {view === 'workflow' && (
        <span className="text-sm font-medium text-dark-100">{t('workflow.title')}</span>
      )}

      {view !== 'chat' && <div className="flex-1" />}

      {/* Theme toggle (always visible) */}
      <button
        onClick={toggleTheme}
        className="p-1.5 rounded-lg bg-dark-700 border border-dark-500 text-dark-400 hover:text-dark-100 transition-colors"
        title={theme === 'dark' ? t('topbar.themeTooltipDark') : t('topbar.themeTooltipLight')}
      >
        {theme === 'dark' ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>

      {/* Settings button (always visible) */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        className="p-1.5 rounded-lg bg-dark-700 border border-dark-500 text-dark-400 hover:text-dark-100 transition-colors"
        title={t('topbar.settings')}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {/* Settings dropdown */}
      {showSettings && (
        <div className="absolute top-12 right-4 z-50 bg-dark-700 border border-dark-500 rounded-xl shadow-xl p-4 w-72">
          <div className="text-sm font-medium text-dark-100 mb-3">{t('topbar.settings')}</div>
          <div className="space-y-3">
            {/* Language selector */}
            <div>
              <label className="text-xs text-dark-300 mb-1 block">{t('topbar.language')}</label>
              <select
                value={(i18n.resolvedLanguage ?? i18n.language ?? 'zh-CN') as LanguageCode}
                onChange={(e) => handleLangChange(e.target.value as LanguageCode)}
                className="input-field text-xs"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Theme selector */}
            <div>
              <label className="text-xs text-dark-300 mb-1 block">{t('topbar.theme')}</label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setTheme('dark')
                    const api = (window as any).electronAPI
                    if (api) api.settings.set('theme', 'dark')
                  }}
                  className={`flex-1 text-xs py-1.5 rounded border transition-colors ${
                    theme === 'dark'
                      ? 'bg-accent text-white border-accent'
                      : 'bg-dark-800 border-dark-500 text-dark-300 hover:text-dark-100'
                  }`}
                >
                  {t('topbar.darkMode')}
                </button>
                <button
                  onClick={() => {
                    setTheme('light')
                    const api = (window as any).electronAPI
                    if (api) api.settings.set('theme', 'light')
                  }}
                  className={`flex-1 text-xs py-1.5 rounded border transition-colors ${
                    theme === 'light'
                      ? 'bg-accent text-white border-accent'
                      : 'bg-dark-800 border-dark-500 text-dark-300 hover:text-dark-100'
                  }`}
                >
                  {t('topbar.lightMode')}
                </button>
              </div>
            </div>

            {view === 'chat' && (
              <>
                <div className="border-t border-dark-600 pt-3">
                  <div className="text-xs text-dark-400 mb-2 font-medium">{t('topbar.genParams')}</div>
                  <div>
                    <label className="text-xs text-dark-300 mb-1 block">
                      {t('topbar.temperature')}: {temperature.toFixed(1)}
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.1}
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      className="w-full accent-accent"
                    />
                  </div>
                  <div className="mt-3">
                    <label className="text-xs text-dark-300 mb-1 block">{t('topbar.maxTokens')}</label>
                    <input
                      type="number"
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(parseInt(e.target.value) || 2048)}
                      className="input-field text-xs"
                      min={64}
                      max={32768}
                      step={64}
                    />
                  </div>
                </div>

                <div className="border-t border-dark-600 pt-3">
                  <div className="text-xs text-dark-400 mb-2 font-medium">{t('topbar.formatting')}</div>
                  <label className="text-xs text-dark-300 mb-1 block">{t('topbar.formattingPrompt')}</label>
                  <textarea
                    value={formattingPrompt}
                    onChange={async (e) => {
                      const v = e.target.value
                      setFormattingPrompt(v)
                      const api = (window as any).electronAPI
                      if (api) await api.settings.set('formattingPrompt', v)
                    }}
                    placeholder={t('topbar.formattingPromptPlaceholder')}
                    className="input-field text-xs h-20 resize-none"
                  />
                  <label className="mt-3 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={jsonMode}
                      onChange={async (e) => {
                        const v = e.target.checked
                        setJsonMode(v)
                        const api = (window as any).electronAPI
                        if (api) await api.settings.set('jsonMode', String(v))
                      }}
                      className="w-4 h-4 accent-accent"
                    />
                    <span className="text-xs text-dark-200">{t('topbar.jsonMode')}</span>
                  </label>
                  <p className="text-xs text-dark-400 mt-1 ml-6">{t('topbar.jsonModeHint')}</p>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => setShowSettings(false)}
            className="mt-3 w-full btn-ghost text-xs"
          >
            {t('common.close')}
          </button>
        </div>
      )}

      {/* System prompt dropdown */}
      {showSysPrompt && view === 'chat' && (
        <div className="absolute top-12 right-12 z-50 bg-dark-700 border border-dark-500 rounded-xl shadow-xl p-4 w-96">
          <div className="text-sm font-medium text-dark-100 mb-2">{t('topbar.systemPrompt')}</div>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder={t('topbar.systemPromptPlaceholder')}
            className="input-field text-xs h-32 resize-none"
          />
          <button
            onClick={() => setShowSysPrompt(false)}
            className="mt-2 w-full btn-ghost text-xs"
          >
            {t('common.ok')}
          </button>
        </div>
      )}
    </div>
  )
}
