import React, { useMemo } from 'react'
import './ChatQueue.css'

/* ── Status config ── */
const STATUS_CONFIG = {
  queued:     { label: 'Queued',     icon: '⏳', className: 'cq-status--queued' },
  processing: { label: 'Processing', icon: '⚙️', className: 'cq-status--processing' },
  completed:  { label: 'Completed',  icon: '✅', className: 'cq-status--completed' },
  failed:     { label: 'Failed',     icon: '❌', className: 'cq-status--failed' },
}

function getStatusConfig(status) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.queued
}

/* ── Truncate text ── */
function truncate(text, maxLen = 80) {
  if (!text) return ''
  return text.length > maxLen ? text.substring(0, maxLen) + '…' : text
}

/* ── Time formatting ── */
function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/**
 * ChatQueue — displays queued prompts for the active session.
 *
 * Props:
 *   items          — Array of queue items from the backend
 *   onClearCompleted — Callback to clear completed/failed items
 *   isQueueing     — Whether a queue request is currently in-flight
 */
export default function ChatQueue({ items = [], onClearCompleted, isQueueing = false }) {
  // Sort items by queue position
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => (a.queuePosition || 0) - (b.queuePosition || 0))
  }, [items])

  const activeItems = useMemo(() =>
    sortedItems.filter(q => q.status === 'queued' || q.status === 'processing'),
    [sortedItems]
  )

  const completedItems = useMemo(() =>
    sortedItems.filter(q => q.status === 'completed' || q.status === 'failed'),
    [sortedItems]
  )

  if (sortedItems.length === 0 && !isQueueing) return null

  return (
    <div className="cq-container">
      {/* Header */}
      <div className="cq-header">
        <div className="cq-header-left">
          <span className="cq-header-icon">📋</span>
          <span className="cq-header-title">Message Queue</span>
          {activeItems.length > 0 && (
            <span className="cq-badge">{activeItems.length}</span>
          )}
        </div>
        {completedItems.length > 0 && onClearCompleted && (
          <button className="cq-clear-btn" onClick={onClearCompleted}>
            Clear completed
          </button>
        )}
      </div>

      {/* Queue items */}
      <div className="cq-list">
        {sortedItems.map((item) => {
          const config = getStatusConfig(item.status)

          return (
            <div key={item.id} className={`cq-item ${config.className}`}>
              {/* Position indicator */}
              <div className="cq-position">
                {item.status === 'processing' ? (
                  <span className="cq-spinner" />
                ) : item.status === 'completed' || item.status === 'failed' ? (
                  <span className="cq-status-icon">{config.icon}</span>
                ) : (
                  <span className="cq-pos-num">#{item.queuePosition}</span>
                )}
              </div>

              {/* Content */}
              <div className="cq-content">
                <div className="cq-message">{truncate(item.message)}</div>
                <div className="cq-meta">
                  <span className={`cq-status-badge ${config.className}`}>
                    {config.icon} {config.label}
                  </span>
                  {item.createdAt && (
                    <span className="cq-time">{formatTime(item.createdAt)}</span>
                  )}
                  {item.status === 'completed' && item.responseContent && (
                    <span className="cq-preview" title={item.responseContent}>
                      {truncate(item.responseContent, 50)}
                    </span>
                  )}
                  {item.status === 'failed' && item.errorMessage && (
                    <span className="cq-error-text" title={item.errorMessage}>
                      {truncate(item.errorMessage, 60)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {/* Queueing indicator */}
        {isQueueing && (
          <div className="cq-item cq-item--adding">
            <div className="cq-position">
              <span className="cq-spinner" />
            </div>
            <div className="cq-content">
              <div className="cq-message cq-message--placeholder">Adding to queue…</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
