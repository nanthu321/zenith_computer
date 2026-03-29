import React, { useEffect, useRef, useMemo } from 'react'
import MessageBubble from './MessageBubble.jsx'
import ChatInput from './ChatInput.jsx'
import ChatQueue from './ChatQueue.jsx'
import zenithLogo from '../assets/zenith.png'

import './ChatArea.css'

/* ── Date grouping helpers (WhatsApp-style) ── */
function getDateLabel(dateStr) {
  if (!dateStr) return null
  const msgDate = new Date(dateStr)
  if (isNaN(msgDate.getTime())) return null

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const msgDay = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate())

  if (msgDay.getTime() === today.getTime()) return 'Today'
  if (msgDay.getTime() === yesterday.getTime()) return 'Yesterday'

  const diffDays = Math.floor((today - msgDay) / 86400000)
  if (diffDays < 7) {
    return msgDate.toLocaleDateString(undefined, { weekday: 'long' })
  }

  return msgDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: msgDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

function getDateKey(dateStr) {
  if (!dateStr) return 'unknown'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 'unknown'
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export default function ChatArea({
  messages: rawMessages, isStreaming, error, session, agentEvents, artifacts,
  onSendMessage, onQueueMessage, onCancelStream, onClearError, user,
  tasksByMessage, onViewTasks,
  queueItems, isQueueing, onClearQueueCompleted,
}) {
  const bottomRef    = useRef(null)
  const containerRef = useRef(null)

  // Ensure messages is always an array (defensive against backend format mismatches)
  const messages = Array.isArray(rawMessages) ? rawMessages : []

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  const isEmpty = messages.length === 0

  // Compute which messages need a date separator above them
  const dateSeparatorIndices = useMemo(() => {
    const indices = new Set()
    let lastKey = null
    messages.forEach((msg, idx) => {
      const key = getDateKey(msg.created_at)
      if (key !== lastKey) {
        indices.add(idx)
        lastKey = key
      }
    })
    return indices
  }, [messages])

  // Get the user's first name for the welcome message
  const firstName = user?.username
    ? user.username.charAt(0).toUpperCase() + user.username.slice(1).split(/[\s@._-]/)[0]
    : null

  return (
    <div className={`chat-area${isEmpty ? ' chat-area--empty' : ''}`}>
      {/* Error banner */}
      {error && (
        <div className="chat-error-banner" role="alert">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
          <button className="error-dismiss" onClick={onClearError} aria-label="Dismiss">×</button>
        </div>
      )}

      {isEmpty ? (
        /* ══════════════════════════════════════════════
           LANDING / EMPTY STATE — full-page centered layout
           Input is in the CENTER of the page
           ══════════════════════════════════════════════ */
        <div className="chat-landing">
          {/* Top brand mark */}
          <div className="landing-brand">
            <img src={zenithLogo} alt="Zenith" className="landing-logo" />
          </div>

          {/* Greeting */}
          <h1 className="landing-greeting">
            {firstName
              ? <>Good to see you, <span className="landing-name">{firstName}</span></>
              : 'How can I help you today?'
            }
          </h1>
          <p className="landing-sub">
            Ask me anything — I can run code, build projects, search the web &amp; schedule tasks.
          </p>

          {/* ── CENTERED INPUT ── */}
          <div className="landing-input-wrap">
            <ChatInput
              onSend={onSendMessage}
              onQueue={onQueueMessage}
              disabled={false}
              isGenerating={isStreaming}
              sessionTitle={session?.title}
              isLanding
            />
          </div>
        </div>
      ) : (
        /* ══════════════════════════════════════════════
           ACTIVE CHAT — messages + bottom-pinned input
           ══════════════════════════════════════════════ */
        <>
          {/* Messages */}
          <div className="chat-messages" ref={containerRef}>
            <div className="messages-list">
              {messages.map((msg, idx) => {
                // Guard: skip malformed messages that have neither an id nor a role
                if (!msg.message_id && !msg.role) return null

                const isLast = idx === messages.length - 1
                const showDateSep = dateSeparatorIndices.has(idx)
                const dateLabel = showDateSep ? getDateLabel(msg.created_at) : null

                // Use message_id as the stable React key when available.
                // Streaming messages have temp_ IDs which are fine as keys.
                // Fall back to idx only for messages that truly lack an ID.
                const msgKey = msg.message_id != null ? String(msg.message_id) : `idx_${idx}`

                return (
                  <React.Fragment key={msgKey}>
                    {dateLabel && (
                      <div className="date-separator">
                        <span className="date-separator-label">{dateLabel}</span>
                      </div>
                    )}
                    <MessageBubble
                      message={msg}
                      isLast={isLast}
                      agentEvents={isLast && msg.role === 'assistant' ? agentEvents : undefined}
                      artifacts={isLast && msg.role === 'assistant' ? artifacts : undefined}
                      scheduledTask={
                        msg.role === 'assistant' && tasksByMessage
                          ? tasksByMessage[String(msg.message_id)] || null
                          : null
                      }
                      onViewTasks={onViewTasks}
                    />
                  </React.Fragment>
                )
              })}
            </div>
            <div ref={bottomRef} />
          </div>

          {/* Chat Queue Display */}
          {queueItems && queueItems.length > 0 && (
            <ChatQueue
              items={queueItems}
              onClearCompleted={onClearQueueCompleted}
              isQueueing={isQueueing}
            />
          )}

          {/* Stop Generation Button */}
          {isStreaming && (
            <div className="stop-generation-wrapper">
              <button className="stop-generation-btn" onClick={onCancelStream} aria-label="Stop generating">
                <span className="stop-icon" />
                <span>Stop generating</span>
              </button>
            </div>
          )}

          {/* Bottom-pinned input */}
          <ChatInput
            onSend={onSendMessage}
            onQueue={onQueueMessage}
            disabled={false}
            isGenerating={isStreaming}
            sessionTitle={session?.title}
          />
        </>
      )}
    </div>
  )
}
