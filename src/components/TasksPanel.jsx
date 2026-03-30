/**
 * TasksPanel — Enhanced Task Scheduling UI Panel
 *
 * Displays scheduled tasks in the sidebar with:
 *   - Loading skeleton state
 *   - Error state with retry
 *   - Empty state (no tasks yet)
 *   - Task cards sorted latest-first
 *   - Status badge, interval, progress bar, dates
 *   - Cancel / Download actions
 */

import React, { useState } from 'react'
import { TASK_STATUS } from '../utils/constants.js'
import './TasksPanel.css'

const STATUS_PROPS = {
  [TASK_STATUS.RUNNING]:   { label: 'Running',   color: 'var(--accent-green)',  icon: '▶', pulse: true  },
  [TASK_STATUS.SCHEDULED]: { label: 'Scheduled', color: 'var(--accent-blue)',   icon: '⏳', pulse: true  },
  [TASK_STATUS.COMPLETED]: { label: 'Done',      color: 'var(--text-muted)',    icon: '✓', pulse: false },
  [TASK_STATUS.CANCELLED]: { label: 'Cancelled', color: 'var(--accent-red)',    icon: '✗', pulse: false },
  [TASK_STATUS.FAILED]:    { label: 'Failed',    color: 'var(--accent-orange)', icon: '!', pulse: false },
}

// Fallback for unknown statuses
const UNKNOWN_STATUS = { label: 'Unknown', color: 'var(--text-muted)', icon: '?', pulse: false }

function formatInterval(secs) {
  if (!secs || secs === 0) return '—'
  if (secs < 60)   return `${secs}s`
  if (secs < 3600) return `${Math.round(secs / 60)}m`
  if (secs < 86400) return `${Math.round(secs / 3600)}h`
  return `${Math.round(secs / 86400)}d`
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '—'
    const now = new Date()
    const diffMs = now - d
    if (diffMs < 60_000) return 'just now'
    if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`
    if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return '—'
  }
}

function formatDateFull(dateStr) {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return '—'
  }
}

/* ── Skeleton loader for loading state ── */
function TaskSkeleton() {
  return (
    <li className="task-item task-item--skeleton">
      <div className="task-status-dot task-skeleton-dot" />
      <div className="task-body">
        <div className="task-skeleton-line task-skeleton-line--title" />
        <div className="task-skeleton-row">
          <div className="task-skeleton-line task-skeleton-line--short" />
          <div className="task-skeleton-line task-skeleton-line--badge" />
        </div>
      </div>
    </li>
  )
}

/* ── Individual Task Card ── */
function TaskCard({ task, onCancel, onDownload, cancellingId }) {
  const [expanded, setExpanded] = useState(false)
  const sp = STATUS_PROPS[task.status] || UNKNOWN_STATUS
  // A task is active ONLY if its status is running or scheduled.
  // Do NOT rely on is_active alone — after an optimistic cancel update,
  // is_active is set to false but the status check is the source of truth.
  const isActive = task.status === TASK_STATUS.RUNNING ||
    task.status === TASK_STATUS.SCHEDULED

  const progress = task.total_runs > 0
    ? Math.min(100, Math.round((task.completed_runs / task.total_runs) * 100))
    : 0

  const isCancelling = cancellingId === task.task_id

  return (
    <li className={`task-item ${isActive ? 'task-item--active' : ''}`}>
      {/* Status indicator dot */}
      <div
        className={`task-status-dot ${sp.pulse ? 'task-status-pulse' : ''}`}
        style={{ background: sp.color }}
        title={sp.label}
      />

      <div className="task-body">
        {/* Description + expand toggle */}
        <div
          className="task-desc-row"
          onClick={() => setExpanded(v => !v)}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && setExpanded(v => !v)}
          aria-expanded={expanded}
        >
          <span className="task-desc" title={task.description}>
            {task.description || `Task ${task.task_id}`}
          </span>
          <svg
            className={`task-expand-chevron ${expanded ? 'task-expand-chevron--open' : ''}`}
            width="12" height="12" viewBox="0 0 12 12" fill="none"
          >
            <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {/* Meta row: interval + status badge */}
        <div className="task-meta-row">
          {task.interval_seconds > 0 && (
            <span className="task-interval" title="Run interval">
              🔄 Every {formatInterval(task.interval_seconds)}
            </span>
          )}
          <span className="task-status-badge" style={{ color: sp.color }}>
            {sp.icon} {sp.label}
          </span>
        </div>

        {/* Progress bar (only if total_runs is known) */}
        {task.total_runs > 0 && (
          <div className="task-progress-wrapper" title={`${task.completed_runs}/${task.total_runs} runs completed`}>
            <div className="task-progress-bar">
              <div
                className="task-progress-fill"
                style={{ width: `${progress}%`, background: sp.color }}
              />
            </div>
            <span className="task-progress-label">
              {task.completed_runs}/{task.total_runs}
            </span>
          </div>
        )}

        {/* Expanded details */}
        {expanded && (
          <div className="task-expanded">
            {task.task_id && (
              <div className="task-detail-row">
                <span className="task-detail-key">ID</span>
                <span className="task-detail-val task-detail-val--mono">{task.task_id}</span>
              </div>
            )}
            {task.started_at && (
              <div className="task-detail-row">
                <span className="task-detail-key">Started</span>
                <span className="task-detail-val">{formatDate(task.started_at)}</span>
              </div>
            )}
            {task.ends_at && (
              <div className="task-detail-row">
                <span className="task-detail-key">Ends</span>
                <span className="task-detail-val">{formatDateFull(task.ends_at)}</span>
              </div>
            )}
            {task.next_run && isActive && (
              <div className="task-detail-row">
                <span className="task-detail-key">Next run</span>
                <span className="task-detail-val">{formatDate(task.next_run)}</span>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="task-actions">
          {isActive && (
            <button
              className="task-btn task-btn--cancel"
              onClick={() => onCancel?.(task.task_id)}
              disabled={isCancelling}
              title="Cancel this task"
              aria-label={`Cancel task ${task.description || task.task_id}`}
            >
              {isCancelling ? (
                <span className="task-btn-spinner" />
              ) : (
                '⏹ Cancel'
              )}
            </button>
          )}
          {task.output_file && (
            <button
              className="task-btn task-btn--download"
              onClick={() => onDownload?.(task.task_id)}
              title="Download task output file"
              aria-label="Download output"
            >
              ⬇ Download
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

export default function TasksPanel({
  tasks = [],
  loading = false,
  error = null,
  onCancel,
  onDownload,
  onRefresh,
}) {
  const [cancellingId, setCancellingId] = useState(null)

  const [cancelError, setCancelError] = useState(null)

  // Track task IDs that have already been submitted for cancellation
  // to prevent duplicate API calls from rapid clicks
  const cancelledIdsRef = React.useRef(new Set())

  const handleCancel = async (taskId) => {
    // Prevent duplicate cancel requests for the same task
    if (cancellingId || cancelledIdsRef.current.has(taskId)) return
    cancelledIdsRef.current.add(taskId)

    setCancellingId(taskId)
    setCancelError(null)
    try {
      await onCancel?.(taskId)
    } catch (err) {
      console.error('[TasksPanel] Cancel failed for task', taskId, ':', err.message)
      setCancelError(err.message || 'Failed to cancel task')
      // Auto-clear the error after 5 seconds
      setTimeout(() => setCancelError(null), 5000)
      // Allow retry for non-404 errors
      cancelledIdsRef.current.delete(taskId)
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <div className="tasks-panel">
      {/* ── Cancel Error Toast ── */}
      {cancelError && (
        <div className="panel-error panel-error--cancel" role="alert">
          <span className="panel-error-icon">⚠️</span>
          <div className="panel-error-content">
            <span className="panel-error-detail">{cancelError}</span>
          </div>
          <button
            className="panel-error-dismiss"
            onClick={() => setCancelError(null)}
            title="Dismiss"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Panel Header ── */}
      <div className="panel-header">
        <span className="panel-title">Scheduled Tasks</span>
        <button
          className="panel-refresh-btn"
          onClick={onRefresh}
          title="Refresh task list"
          aria-label="Refresh tasks"
          disabled={loading}
        >
          <svg
            width="13" height="13" viewBox="0 0 12 12" fill="none"
            className={loading ? 'panel-refresh-icon--spinning' : ''}
          >
            <path d="M10 6A4 4 0 102 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M10 3v3H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* ── Loading State ── */}
      {loading && tasks.length === 0 && (
        <ul className="tasks-list" aria-label="Loading tasks" aria-busy="true">
          <TaskSkeleton />
          <TaskSkeleton />
          <TaskSkeleton />
        </ul>
      )}

      {/* ── Error State ── */}
      {error && !loading && (
        <div className="panel-error" role="alert">
          <span className="panel-error-icon">⚠️</span>
          <div className="panel-error-content">
            <p className="panel-error-msg">Failed to load tasks</p>
            <span className="panel-error-detail">{error}</span>
          </div>
          <button
            className="panel-error-retry"
            onClick={onRefresh}
            title="Retry loading tasks"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Empty State ── */}
      {!loading && !error && tasks.length === 0 && (
        <div className="panel-empty">
          <div className="panel-empty-icon">⏰</div>
          <p className="panel-empty-title">No scheduled tasks yet</p>
          <span className="panel-empty-hint">
            Ask Zenith to schedule a recurring task, e.g.<br />
            <em>"Check gold prices every hour"</em>
          </span>
        </div>
      )}

      {/* ── Task List ── */}
      {tasks.length > 0 && !error && (
        <ul className="tasks-list" aria-label="Scheduled tasks">
          {/* Show loading indicator while refreshing without clearing list */}
          {loading && (
            <li className="tasks-list-refreshing" aria-live="polite">
              <span className="tasks-refreshing-dot" />
              <span className="tasks-refreshing-label">Refreshing…</span>
            </li>
          )}
          {tasks.map(task => (
            <TaskCard
              key={task.task_id}
              task={task}
              onCancel={handleCancel}
              onDownload={onDownload}
              cancellingId={cancellingId}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
