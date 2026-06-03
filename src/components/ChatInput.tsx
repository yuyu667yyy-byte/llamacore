/*
 * Copyright (c) 2026 Lucas Vann (陆凯文)
 * Released under the MIT License. See LICENSE for details.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'
import { fileToCompressedDataUrl } from '../utils/image'
import type { ImageAttachment } from '../types'

interface Props {
  onSend: (text: string, attachments: ImageAttachment[]) => void
  onStop?: () => void
  disabled?: boolean
  multimodalSupported?: boolean
  isStreaming?: boolean
}

export default function ChatInput({
  onSend,
  onStop,
  disabled,
  multimodalSupported,
  isStreaming,
}: Props) {
  const { t } = useTranslation()
  const {
    editingMessageId,
    editingDraft,
    setEditingDraft,
    cancelEdit,
    pendingAttachments,
    addPendingAttachment,
    removePendingAttachment,
    setPendingAttachments,
  } = useAppStore()

  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // When editing starts, hydrate the textarea from editingDraft
  useEffect(() => {
    if (editingMessageId !== null) {
      setValue(editingDraft)
      textareaRef.current?.focus()
      // resize
      const ta = textareaRef.current
      if (ta) {
        ta.style.height = 'auto'
        ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
      }
    }
  }, [editingMessageId])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed && pendingAttachments.length === 0) return
    if (disabled) return
    onSend(trimmed, pendingAttachments)
    setValue('')
    setPendingAttachments([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [value, disabled, onSend, pendingAttachments, setPendingAttachments])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    } else if (e.key === 'Escape' && editingMessageId !== null) {
      handleCancelEdit()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    if (editingMessageId !== null) setEditingDraft(e.target.value)
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
    }
  }

  const handlePickFile = () => fileInputRef.current?.click()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // reset so picking the same file twice still triggers
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      try {
        const { dataUrl, mime } = await fileToCompressedDataUrl(file)
        addPendingAttachment({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          dataUrl,
          mime,
          name: file.name,
        })
      } catch (err) {
        console.error('Failed to read image', file.name, err)
      }
    }
  }

  const handleCancelEdit = () => {
    cancelEdit()
    setValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const sendDisabled = disabled || (!value.trim() && pendingAttachments.length === 0)

  return (
    <div className="px-4 pb-4">
      {editingMessageId !== null && (
        <div className="mb-2 flex items-center justify-between px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-xs text-blue-300">
          <span>{t('chat.editingHint')}</span>
          <button
            onClick={handleCancelEdit}
            className="text-xs px-2 py-0.5 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-200"
          >
            {t('chat.editCancel')}
          </button>
        </div>
      )}

      {pendingAttachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {pendingAttachments.map((a) => (
            <div
              key={a.id}
              className="relative group w-20 h-20 rounded-lg overflow-hidden border border-dark-500 bg-dark-700 flex-shrink-0"
            >
              <img src={a.dataUrl} alt={a.name} className="w-full h-full object-cover" />
              <button
                onClick={() => removePendingAttachment(a.id)}
                title={t('chat.removeAttachment')}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 bg-dark-700 border border-dark-500 rounded-2xl px-4 py-3 focus-within:border-accent/50 transition-colors">
        {multimodalSupported && (
          <button
            onClick={handlePickFile}
            disabled={disabled}
            title={t('chat.attachImage')}
            className="flex-shrink-0 w-8 h-8 rounded-lg text-dark-300 hover:text-dark-100 hover:bg-dark-600 transition-colors flex items-center justify-center disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
              />
            </svg>
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />

        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={t('chat.inputPlaceholder')}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent text-sm text-dark-100 placeholder-dark-400 resize-none focus:outline-none disabled:opacity-50 min-h-[24px] max-h-[200px] leading-relaxed"
        />

        {isStreaming && onStop ? (
          <button
            onClick={onStop}
            title={t('chat.stopGeneration')}
            className="flex-shrink-0 w-8 h-8 rounded-lg bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="1.5" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={sendDisabled}
            className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        )}
      </div>
      <p className="text-xs text-dark-500 mt-1.5 text-center">{t('chat.disclaimer')}</p>
    </div>
  )
}
