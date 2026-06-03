/*
 * Copyright (c) 2026 Lucas Vann (陆凯文)
 * Released under the MIT License. See LICENSE for details.
 */

import React, { useEffect } from 'react'
import { useAppStore } from './store'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import ModelManager from './components/ModelManager'
import TrainingMonitor from './components/TrainingMonitor'
import ConvertView from './components/ConvertView'
import WorkflowEditor from './components/WorkflowEditor'
import TopBar from './components/TopBar'
import { syncLanguageFromSettings } from './i18n'

export default function App() {
  const {
    view,
    setModels,
    setServerStatus,
    setConversations,
    theme,
    setTheme,
    setFormattingPrompt,
    setJsonMode,
    setWorkflows,
  } = useAppStore()

  // Apply theme class to <html> element
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Load initial data and restore settings
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    // Restore persisted theme
    api.settings.get('theme').then((saved) => {
      if (saved === 'light' || saved === 'dark') {
        setTheme(saved)
      } else {
        // Default to system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        setTheme(prefersDark ? 'dark' : 'light')
      }
    })

    // Restore persisted language
    syncLanguageFromSettings()

    // Restore persisted formatting
    api.settings.get('formattingPrompt').then((v) => {
      if (typeof v === 'string') setFormattingPrompt(v)
    })
    api.settings.get('jsonMode').then((v) => {
      if (v === 'true') setJsonMode(true)
    })

    // Load models
    api.model.list().then((models) => {
      useAppStore.getState().setModels(models)
      api.server.statusAll().then((statuses) => {
        Object.entries(statuses).forEach(([id, status]) => {
          setServerStatus(id, status)
        })
      })
    })

    // Load conversations
    api.conv.list().then(setConversations)

    // Load workflows
    api.workflow.list().then(setWorkflows)

    // Subscribe to server events
    const unsubLog = api.server.onLog(() => {})
    const unsubStopped = api.server.onStopped((modelId) => {
      setServerStatus(modelId, { running: false })
    })
    const unsubError = api.server.onError((modelId) => {
      setServerStatus(modelId, { running: false })
    })

    return () => {
      unsubLog()
      unsubStopped()
      unsubError()
    }
  }, [])

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
        <div className="flex-1 overflow-hidden">
          {view === 'chat' && <ChatView />}
          {view === 'models' && <ModelManager />}
          {view === 'training' && <TrainingMonitor />}
          {view === 'convert' && <ConvertView />}
          {view === 'workflow' && <WorkflowEditor />}
        </div>
      </div>
    </div>
  )
}
