/*
 * Copyright (c) 2026 Lucas Vann (陆凯文)
 * Released under the MIT License. See LICENSE for details.
 */

import React, { useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import type { Message, ImageAttachment } from '../types'
import { TpsMeter } from '../utils/tps'

export default function ChatView() {
  const { t } = useTranslation()
  const {
    activeConvId,
    messages,
    setMessages,
    appendMessage,
    updateLastAssistantMessage,
    setIsStreaming,
    setAbortController,
    setChatMetric,
    isStreaming,
    streamingConvId,
    setStreamingConvId,
    abortController,
    models,
    activeModelId,
    serverStatuses,
    streamingEnabled,
    thinkingEnabled,
    reasoningEffort,
    webSearchEnabled,
    systemPrompt,
    formattingPrompt,
    jsonMode,
    temperature,
    maxTokens,
    conversations,
    upsertConversation,
    editingMessageId,
    startEditMessage,
    cancelEdit,
    chatMetrics,
  } = useAppStore()

  const bottomRef = useRef<HTMLDivElement>(null)
  const api = window.electronAPI

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const activeModel = models.find((m) => m.id === activeModelId)
  const isServerRunning = activeModelId ? serverStatuses[activeModelId]?.running : false
  const multimodalSupported = !!activeModel?.multimodal

  // Whether the *currently shown* conversation is the one streaming. A stream
  // for another conversation can run in the background without disabling this
  // conversation's input or showing a streaming cursor here.
  const streamingHere = isStreaming && streamingConvId === activeConvId

  const getApiBase = () => {
    return activeModel ? `http://127.0.0.1:${activeModel.port}` : 'http://127.0.0.1:8080'
  }

  // Build the API message payload from a list of UI messages.
  // If any user message has attachments, that message uses OpenAI multipart format.
  const buildApiMessages = useCallback(
    (uiMessages: Message[]) => {
      const composedSystem = [systemPrompt, formattingPrompt].filter((s) => s && s.trim()).join('\n\n')
      const head = composedSystem ? [{ role: 'system', content: composedSystem }] : []
      const body = uiMessages.map((m) => {
        if (m.role === 'user' && m.attachments && m.attachments.length > 0) {
          return {
            role: 'user',
            content: [
              ...(m.content ? [{ type: 'text', text: m.content }] : []),
              ...m.attachments.map((a) => ({
                type: 'image_url',
                image_url: { url: a.dataUrl },
              })),
            ],
          }
        }
        return { role: m.role, content: m.content }
      })
      return [...head, ...body]
    },
    [systemPrompt, formattingPrompt]
  )

  const runCompletion = useCallback(
    async (convId: string, uiMessages: Message[]) => {
      // Live UI mutations (message text, streaming flag) must only apply while
      // this generation's conversation is still on screen. If the user switches
      // conversations mid-stream, we keep persisting to the DB but stop touching
      // the visible message list — otherwise the old stream overwrites the newly
      // loaded conversation's last assistant message.
      const isActive = () => useAppStore.getState().activeConvId === convId
      const body: Record<string, unknown> = {
        model: activeModel?.name ?? 'local-model',
        messages: buildApiMessages(uiMessages),
        stream: streamingEnabled,
        temperature,
        max_tokens: maxTokens,
      }
      if (thinkingEnabled) body.reasoning_effort = reasoningEffort
      if (webSearchEnabled && activeModel?.web_search_supported) body.web_search = true
      if (jsonMode) body.response_format = { type: 'json_object' }

      const abortCtrl = new AbortController()
      setAbortController(abortCtrl)
      setIsStreaming(true)
      setStreamingConvId(convId)

      // Per-message tokens/sec metering + thinking timer. During streaming we
      // approximate one token per SSE delta (how llama.cpp emits them); the
      // final numbers are replaced by the server's `timings` block when present.
      const meter = new TpsMeter()
      let thinkStart = 0   // first reasoning token time
      let thinkEnd = 0     // first answer token time (thinking ended)
      let lastTpsPush = 0

      const asstMsgId = (await api.msg.add(convId, 'assistant', '')) as number
      const pushMetric = (over: Partial<import('../store').ChatMetric>) => {
        const s = meter.snapshot()
        const thinkMs = thinkStart ? (thinkEnd || Date.now()) - thinkStart : 0
        setChatMetric(asstMsgId, {
          tokens: s.tokens, live: s.live, avg: s.avg, peak: s.peak,
          thinkMs, thinking: thinkStart > 0 && thinkEnd === 0, generating: true,
          ...over,
        })
      }
      const asstMsg: Message = {
        id: asstMsgId,
        conversation_id: convId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      }
      appendMessage(asstMsg)
      pushMetric({})

      try {
        const response = await fetch(`${getApiBase()}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: abortCtrl.signal,
        })

        if (!response.ok) {
          const errText = await response.text()
          throw new Error(`HTTP ${response.status}: ${errText}`)
        }

        // Final exact metrics from the server's timings block, when available.
      // llama.cpp reports predicted_n tokens and predicted_per_second tok/s.
      let finalTimings: any = null
      const finalizeMetric = (tm: any) => {
        const s = meter.snapshot()
        const thinkMs = thinkStart ? (thinkEnd || Date.now()) - thinkStart : 0
        const avg = tm?.predicted_per_second ?? s.avg
        setChatMetric(asstMsgId, {
          tokens: tm?.predicted_n ?? s.tokens,
          live: 0,
          avg,
          peak: Math.max(s.peak, avg),
          thinkMs,
          thinking: false,
          generating: false,
        })
      }

      if (streamingEnabled) {
          const reader = response.body!.getReader()
          const decoder = new TextDecoder()
          let reasoningContent = ''
          let answerContent = ''
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed || trimmed === 'data: [DONE]') continue
              if (!trimmed.startsWith('data: ')) continue
              try {
                const json = JSON.parse(trimmed.slice(6))
                const delta = json.choices?.[0]?.delta
                if (delta?.reasoning_content) {
                  reasoningContent += delta.reasoning_content
                  if (!thinkStart) thinkStart = Date.now()
                } else if (delta?.content) {
                  // First answer token marks the end of the thinking phase.
                  if (thinkStart && !thinkEnd) thinkEnd = Date.now()
                  answerContent += delta.content
                }
                if (delta?.reasoning_content || delta?.content) {
                  meter.add(1)
                  const now = Date.now()
                  if (now - lastTpsPush > 100) { pushMetric({}); lastTpsPush = now }
                }
                // Some servers attach final timings on the terminal chunk.
                if (json.timings) finalTimings = json.timings
                const full =
                  (reasoningContent ? `<think>${reasoningContent}</think>` : '') + answerContent
                if (isActive()) updateLastAssistantMessage(full)
              } catch {
                // skip malformed
              }
            }
          }
          const finalContent =
            (reasoningContent ? `<think>${reasoningContent}</think>` : '') + answerContent
          await api.msg.update(asstMsgId, finalContent)
          if (isActive()) finalizeMetric(finalTimings)
        } else {
          const data = await response.json()
          const content = data.choices?.[0]?.message?.content ?? ''
          if (isActive()) updateLastAssistantMessage(content)
          await api.msg.update(asstMsgId, content)
          if (isActive()) finalizeMetric(data.timings)
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // Find this message's own partial text (by id), not "the last
          // assistant message", which may now belong to another conversation.
          const all = useAppStore.getState().messages
          const partial = all.find((m) => m.id === asstMsgId)?.content ?? ''
          const aborted = partial + `\n\n*[${t('chat.aborted')}]*`
          await api.msg.update(asstMsgId, aborted)
          if (isActive()) updateLastAssistantMessage(aborted)
        } else {
          const errMsg = `*${t('chat.requestFailed')}: ${err.message}*\n\n${t('chat.requestFailedHint', { url: getApiBase() })}`
          if (isActive()) updateLastAssistantMessage(errMsg)
          await api.msg.update(asstMsgId, errMsg)
        }
      } finally {
        // Clear the global streaming flags only if this generation still owns
        // them. If the user started a new generation in another conversation,
        // that one now owns streamingConvId and we must not stomp its state.
        if (useAppStore.getState().streamingConvId === convId) {
          setIsStreaming(false)
          setStreamingConvId(null)
          setAbortController(null)
        }
        // Ensure the metric never stays stuck in a "generating" state.
        const m = useAppStore.getState().chatMetrics[asstMsgId]
        if (m && m.generating) setChatMetric(asstMsgId, { ...m, live: 0, thinking: false, generating: false })
        await api.conv.touch(convId)
      }
    },
    [
      activeModel,
      streamingEnabled,
      temperature,
      maxTokens,
      thinkingEnabled,
      reasoningEffort,
      webSearchEnabled,
      jsonMode,
      buildApiMessages,
      api,
      appendMessage,
      setAbortController,
      setIsStreaming,
      setStreamingConvId,
      setChatMetric,
      t,
      updateLastAssistantMessage,
    ]
  )

  const sendMessage = useCallback(
    async (userText: string, attachments: ImageAttachment[]) => {
      if (!userText.trim() && attachments.length === 0) return
      // Block only if THIS conversation is mid-generation; other conversations
      // may stream in the background.
      const s = useAppStore.getState()
      if (s.isStreaming && s.streamingConvId === activeConvId) return
      const convId = activeConvId
      if (!convId) return

      // ── Edit path: replace existing user message + clear everything after ──
      if (editingMessageId !== null) {
        const editedMsg = messages.find((m) => m.id === editingMessageId)
        if (!editedMsg) {
          cancelEdit()
          return
        }
        const confirmed = window.confirm(t('chat.editConfirmBody'))
        if (!confirmed) return

        // Delete original + everything after (by timestamp)
        await api.msg.deleteFrom(convId, editedMsg.timestamp)
        const remaining = messages.filter((m) => m.timestamp < editedMsg.timestamp)

        // Re-add as a fresh user message with the new content + attachments
        const newId = (await api.msg.add(
          convId,
          'user',
          userText,
          attachments.length ? attachments : undefined
        )) as number
        const newUserMsg: Message = {
          id: newId,
          conversation_id: convId,
          role: 'user',
          content: userText,
          attachments: attachments.length ? attachments : undefined,
          timestamp: Date.now(),
        }
        const newMessages = [...remaining, newUserMsg]
        setMessages(newMessages)
        cancelEdit()
        await runCompletion(convId, newMessages)
        return
      }

      // ── Normal send path ──
      const userMsgId = (await api.msg.add(
        convId,
        'user',
        userText,
        attachments.length ? attachments : undefined
      )) as number
      const userMsg: Message = {
        id: userMsgId,
        conversation_id: convId,
        role: 'user',
        content: userText,
        attachments: attachments.length ? attachments : undefined,
        timestamp: Date.now(),
      }
      appendMessage(userMsg)

      const conv = conversations.find((c) => c.id === convId)
      if (conv && conv.title === t('chat.newChat')) {
        const newTitle = (userText || (attachments[0]?.name ?? '附件')).slice(0, 40)
        await api.conv.touch(convId, newTitle)
        upsertConversation({ ...conv, title: newTitle, updated_at: Date.now() })
      }

      const currentMessages = [...useAppStore.getState().messages]
      await runCompletion(convId, currentMessages)
    },
    [
      activeConvId,
      isStreaming,
      editingMessageId,
      messages,
      conversations,
      api,
      appendMessage,
      setMessages,
      cancelEdit,
      upsertConversation,
      runCompletion,
      t,
    ]
  )

  const handleStop = useCallback(() => {
    if (abortController) abortController.abort()
  }, [abortController])

  const handleEditClick = useCallback(
    (msg: Message) => {
      if (streamingHere) return
      startEditMessage(msg.id, msg.content)
    },
    [streamingHere, startEditMessage]
  )

  if (!activeConvId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full text-center px-8">
        <div className="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">{t('chat.startNewChat')}</h2>
        <p className="text-sm text-dark-400 max-w-sm">{t('chat.startHint')}</p>
        {!activeModelId && (
          <p className="text-xs text-yellow-400/80 mt-3">{t('chat.selectModelHint')}</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-dark-400 text-sm py-12">{t('chat.sendMessage')}</div>
        )}
        {messages.map((msg, idx) => (
          <MessageBubble
            key={msg.id || idx}
            message={msg}
            isStreaming={streamingHere && idx === messages.length - 1 && msg.role === 'assistant'}
            onEdit={msg.role === 'user' ? () => handleEditClick(msg) : undefined}
            isBeingEdited={editingMessageId === msg.id}
            metric={msg.role === 'assistant' ? chatMetrics[msg.id] : undefined}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {activeModelId && !isServerRunning && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs flex items-center gap-2">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {t('chat.serverNotRunning', { name: activeModel?.name })}
        </div>
      )}

      <ChatInput
        onSend={sendMessage}
        onStop={handleStop}
        disabled={!activeConvId}
        multimodalSupported={multimodalSupported}
        isStreaming={streamingHere}
      />
    </div>
  )
}
