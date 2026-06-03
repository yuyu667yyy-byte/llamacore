/*
 * Copyright (c) 2026 Lucas Vann (陆凯文)
 * Released under the MIT License. See LICENSE for details.
 */

import React, { useMemo, useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import type { Message } from '../types'
import type { ChatMetric } from '../store'
import { fmtTps } from '../utils/tps'
import ImageLightbox from './ImageLightbox'

interface Props {
  message: Message
  isStreaming?: boolean
  onEdit?: () => void
  isBeingEdited?: boolean
  metric?: ChatMetric
}

// Split <think>...</think> blocks from the main content. Tolerates an
// unclosed <think> (still streaming): everything after the opening tag is
// treated as an in-progress thinking block so the raw tag never leaks into
// the rendered bubble.
function parseThinkingBlocks(content: string): Array<{ type: 'think' | 'text'; text: string }> {
  const parts: Array<{ type: 'think' | 'text'; text: string }> = []
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g
  let lastIndex = 0
  let match
  while ((match = thinkRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: content.slice(lastIndex, match.index) })
    }
    parts.push({ type: 'think', text: match[1] })
    lastIndex = match.index + match[0].length
  }
  const rest = content.slice(lastIndex)
  // An opening <think> with no matching close → the thinking phase is still
  // streaming; render the remainder as a think block, not literal text.
  const openIdx = rest.indexOf('<think>')
  if (openIdx !== -1) {
    if (openIdx > 0) parts.push({ type: 'text', text: rest.slice(0, openIdx) })
    parts.push({ type: 'think', text: rest.slice(openIdx + '<think>'.length) })
  } else if (rest.length > 0) {
    parts.push({ type: 'text', text: rest })
  }
  return parts.length > 0 ? parts : [{ type: 'text', text: content }]
}

// Attach a "copy latex" button to each rendered math node by injecting after-render.
// This reparents React-managed DOM nodes into wrapper spans, so it must NOT run
// while the message is still streaming — doing so races with React re-rendering
// the markdown on every token and scrambles the output. Gated on `enabled`
// (false during streaming) and re-run when the settled `content` changes.
function MathCopyButtons({ container, enabled, content }: { container: HTMLDivElement | null; enabled: boolean; content: string }) {
  const { t } = useTranslation()
  useEffect(() => {
    if (!container || !enabled) return
    const nodes = container.querySelectorAll<HTMLElement>('.katex-display, .katex')
    const cleanups: Array<() => void> = []
    nodes.forEach((node) => {
      // Skip inline katex inside katex-display
      if (node.classList.contains('katex') && node.closest('.katex-display')) return
      if (node.dataset.copyAttached) return
      node.dataset.copyAttached = '1'
      const tex = node.querySelector<HTMLElement>('annotation[encoding="application/x-tex"]')?.textContent
      if (!tex) return

      const btn = document.createElement('button')
      btn.type = 'button'
      btn.textContent = '</>'
      btn.title = t('chat.copyLatex')
      btn.className =
        'math-copy-btn absolute -top-1 -right-1 text-[10px] px-1.5 py-0.5 rounded bg-dark-600 hover:bg-dark-500 text-dark-200 opacity-0 group-hover:opacity-100 transition-opacity'
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(tex)
        const orig = btn.textContent
        btn.textContent = '✓'
        setTimeout(() => (btn.textContent = orig), 800)
      })

      // Wrap node in a relative + group container so the button positions correctly
      const wrap = document.createElement('span')
      wrap.className = 'math-wrap relative group inline-block max-w-full'
      if (node.classList.contains('katex-display')) wrap.classList.add('block', 'overflow-x-auto')
      node.parentNode?.insertBefore(wrap, node)
      wrap.appendChild(node)
      wrap.appendChild(btn)

      cleanups.push(() => {
        if (wrap.parentNode) wrap.parentNode.insertBefore(node, wrap)
        wrap.remove()
        delete node.dataset.copyAttached
      })
    })
    return () => cleanups.forEach((c) => c())
  }, [container, enabled, content, t])
  return null
}

// Persistent metrics footer shown beneath an AI bubble: a thinking timer and
// tokens/sec. While the model is in its thinking phase the timer ticks live;
// after generation it shows the final thinking duration plus avg/peak/tokens.
function MetricFooter({ metric }: { metric: ChatMetric }) {
  const { t } = useTranslation()
  const [, force] = useState(0)
  // Tick once a second while still thinking so the live timer advances.
  useEffect(() => {
    if (!metric.thinking) return
    const id = setInterval(() => force((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [metric.thinking])

  const secs = (metric.thinkMs / 1000).toFixed(1)
  return (
    <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-dark-400 font-mono">
      {metric.thinking ? (
        <span className="flex items-center gap-1.5 text-amber-400">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          {t('metrics.thinking')} {secs}s
        </span>
      ) : metric.thinkMs > 0 ? (
        <span className="text-dark-400">{t('metrics.thought', { secs })}</span>
      ) : null}

      {metric.generating ? (
        metric.live > 0 && (
          <span className="flex items-center gap-1.5 text-accent">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            {fmtTps(metric.live)} {t('metrics.tps')}
          </span>
        )
      ) : metric.tokens > 0 ? (
        <>
          <span className="text-green-400">{t('metrics.avg')} {fmtTps(metric.avg)} {t('metrics.tps')}</span>
          {metric.peak > 0 && <span>{t('metrics.peak')} {fmtTps(metric.peak)}</span>}
          <span>{t('metrics.tokens', { count: metric.tokens })}</span>
        </>
      ) : null}
    </div>
  )
}

export default function MessageBubble({ message, isStreaming, onEdit, isBeingEdited, metric }: Props) {
  const { t } = useTranslation()
  const isUser = message.role === 'user'
  const parts = useMemo(() => parseThinkingBlocks(message.content), [message.content])
  const [lightbox, setLightbox] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-3 group/msg`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-lg bg-accent/20 flex-shrink-0 flex items-center justify-center text-accent text-xs font-bold mt-1">
          AI
        </div>
      )}

      {/* Edit button for user messages (left side, before bubble) */}
      {isUser && onEdit && (
        <button
          onClick={onEdit}
          title={t('chat.edit')}
          className="self-center opacity-0 group-hover/msg:opacity-100 transition-opacity p-1.5 rounded-lg text-dark-400 hover:text-dark-100 hover:bg-dark-600"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
      )}

      <div className={`flex flex-col max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`rounded-2xl px-4 py-3 ${
          isUser
            ? `bg-accent text-white rounded-tr-sm ${isBeingEdited ? 'ring-2 ring-blue-400' : ''}`
            : 'bg-dark-700 text-dark-100 rounded-tl-sm border border-dark-600'
        }`}
      >
        {/* Attachments (user) */}
        {isUser && message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {message.attachments.map((a) => (
              <img
                key={a.id}
                src={a.dataUrl}
                alt={a.name}
                onClick={() => setLightbox(a.dataUrl)}
                className="max-w-[160px] max-h-[160px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
              />
            ))}
          </div>
        )}

        {isUser ? (
          message.content && (
            <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          )
        ) : (
          <div className="space-y-2" ref={contentRef}>
            {parts.map((part, i) =>
              part.type === 'think' ? (
                <div key={i} className="thinking-block">
                  <div className="text-xs text-dark-400 mb-1 font-medium">{t('chat.thinkingProcess')}</div>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    className="prose prose-sm prose-invert max-w-none text-dark-300"
                  >
                    {part.text}
                  </ReactMarkdown>
                </div>
              ) : (
                <ReactMarkdown
                  key={i}
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex, rehypeHighlight]}
                  className="prose prose-sm prose-invert max-w-none"
                  components={{
                    pre({ children, ...props }) {
                      return (
                        <div className="relative group">
                          <pre {...props}>{children}</pre>
                          <button
                            onClick={() => {
                              const text = (children as any)?.props?.children ?? ''
                              navigator.clipboard.writeText(
                                typeof text === 'string' ? text : String(text)
                              )
                            }}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-dark-600 hover:bg-dark-500 text-dark-200 text-xs px-2 py-1 rounded"
                          >
                            {t('chat.copy')}
                          </button>
                        </div>
                      )
                    },
                  }}
                >
                  {part.text}
                </ReactMarkdown>
              )
            )}
            <MathCopyButtons container={contentRef.current} enabled={!isStreaming} content={message.content} />
            {isStreaming && <span className="cursor-blink text-sm" />}
          </div>
        )}
      </div>
        {/* Persistent metrics footer (AI messages only) */}
        {!isUser && metric && <MetricFooter metric={metric} />}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-lg bg-dark-600 flex-shrink-0 flex items-center justify-center text-dark-300 text-xs font-bold mt-1">
          You
        </div>
      )}

      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  )
}
