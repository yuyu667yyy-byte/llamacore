/*
 * Copyright (c) 2026 Lucas Vann (陆凯文)
 * Released under the MIT License. See LICENSE for details.
 */

import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'
import type { Conversation } from '../types'

export default function Sidebar() {
  const { t } = useTranslation()
  const {
    conversations,
    activeConvId,
    setActiveConvId,
    setMessages,
    upsertConversation,
    removeConversation,
    models,
    activeModelId,
    view,
    setView,
  } = useAppStore()

  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    conv: Conversation
  } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const api = window.electronAPI

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingId])

  useEffect(() => {
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [])

  const createConversation = async () => {
    const activeModel = models.find((m) => m.id === activeModelId)
    const conv = await api.conv.create(activeModel?.name ?? '')
    upsertConversation(conv)
    setActiveConvId(conv.id)
    setMessages([])
    setView('chat')
  }

  const selectConv = async (conv: Conversation) => {
    if (conv.id === activeConvId) { setView('chat'); return }
    // Clear immediately so the previous conversation's messages don't flash
    // under the new one during the async load.
    setActiveConvId(conv.id)
    setMessages([])
    setView('chat')
    const msgs = await api.msg.list(conv.id)
    // Guard against a race if the user clicked another conversation meanwhile.
    if (useAppStore.getState().activeConvId === conv.id) setMessages(msgs)
  }

  const handleContextMenu = (e: React.MouseEvent, conv: Conversation) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, conv })
  }

  const startRename = (conv: Conversation) => {
    setContextMenu(null)
    setRenamingId(conv.id)
    setRenameValue(conv.title)
  }

  const confirmRename = async () => {
    if (!renamingId) return
    const trimmed = renameValue.trim()
    if (trimmed) {
      await api.conv.rename(renamingId, trimmed)
      const existing = conversations.find((c) => c.id === renamingId)
      upsertConversation(
        existing
          ? { ...existing, title: trimmed }
          : { id: renamingId, title: trimmed, model_name: '', created_at: 0, updated_at: Date.now() }
      )
    }
    setRenamingId(null)
  }

  const deleteConv = async (conv: Conversation) => {
    setContextMenu(null)
    await api.conv.delete(conv.id)
    removeConversation(conv.id)
    if (activeConvId === conv.id) {
      setActiveConvId(null)
      setMessages([])
    }
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (diffDays === 1) return t('sidebar.yesterday')
    if (diffDays < 7) return t('sidebar.daysAgo', { count: diffDays })
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  return (
    <>
      <aside className="w-64 flex-shrink-0 bg-dark-800 border-r border-dark-600 flex flex-col h-full">
        <div className="px-4 py-4 border-b border-dark-600">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center text-white text-xs font-bold">
              L
            </div>
            <span className="font-semibold text-dark-100 text-sm">{t('appName')}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 p-2 border-b border-dark-600">
          {([
            { id: 'chat', label: t('nav.chat') },
            { id: 'models', label: t('nav.models') },
            { id: 'training', label: t('nav.training') },
            { id: 'convert', label: t('nav.convert') },
            { id: 'workflow', label: t('nav.workflow') },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`text-xs py-1.5 rounded-md transition-colors ${
                view === tab.id
                  ? 'bg-accent text-white'
                  : 'text-dark-300 hover:text-dark-100 hover:bg-dark-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="px-3 py-2">
          <button
            onClick={createConversation}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-dark-200 hover:text-dark-100 text-sm transition-colors border border-dark-500"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('sidebar.newChat')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          {conversations.length === 0 && (
            <div className="text-center text-dark-400 text-xs py-8 px-4">
              {t('sidebar.noChats')}<br />{t('sidebar.noChatsHint')}
            </div>
          )}
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onContextMenu={(e) => handleContextMenu(e, conv)}
              onClick={() => selectConv(conv)}
              className={`group flex items-center px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                activeConvId === conv.id
                  ? 'bg-accent/20 border border-accent/30'
                  : 'hover:bg-dark-700 border border-transparent'
              }`}
            >
              {renamingId === conv.id ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={confirmRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmRename()
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="input-field text-xs py-0.5 px-1 flex-1"
                />
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-dark-100 truncate leading-snug">
                    {conv.title || t('chat.newChat')}
                  </div>
                  <div className="text-xs text-dark-400 mt-0.5 flex justify-between">
                    <span className="truncate max-w-[100px]">{conv.model_name || '—'}</span>
                    <span>{formatTime(conv.updated_at)}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      {contextMenu && (
        <div
          className="fixed z-50 bg-dark-700 border border-dark-500 rounded-lg shadow-xl py-1 min-w-[140px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-4 py-2 text-sm text-dark-200 hover:bg-dark-600 hover:text-dark-100 transition-colors"
            onClick={() => startRename(contextMenu.conv)}
          >
            {t('sidebar.rename')}
          </button>
          <button
            className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
            onClick={() => deleteConv(contextMenu.conv)}
          >
            {t('sidebar.deleteChat')}
          </button>
        </div>
      )}
    </>
  )
}
