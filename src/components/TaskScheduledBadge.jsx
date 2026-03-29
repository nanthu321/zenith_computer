/**
 * TaskScheduledBadge
 *
 * A compact inline badge attached to an assistant chat message
 * whenever that message resulted in a `schedule_task` tool call.
 *
 * Shows:
 *   - "Task Scheduled ✅" pill with task name
 *   - Interval / schedule info
 *   - "View in Tasks" action button to open the Tasks panel
 *
 * Props:
 *   task         – normalized task object from TasksContext
 *   onViewTasks  – callback to switch sidebar to Tasks tab
 *   onDismiss    – callback to remove the badge (optional)
 */

import React, { useState } from 'react'
import { TASK_STATUS } from '../utils/constants.js'
import './TaskScheduledBadge.css'

function formatInterval(secs) {
  if (!secs || secs === 0) return null
  if (secs < 60)   return `every ${secs}s`
  if (secs < 3600) return `every ${Math.round(secs / 60)}m`
  if (secs < 86400) return `every ${Math.round(secs / 3600)}h`
  return `every ${Math.round(secs / 86400)}d`
}

const STATUS_INDICATOR = {
  [TASK_STATUS.RUNNING]:   { dot: '#10b981', label: 'Running'   },
  [TASK_STATUS.SCHEDULED]: { dot: '#226DB4', label: 'Scheduled' },
  [TASK_STATUS.COMPLETED]: { dot: '#6b7280', label: 'Completed' },
  [TASK_STATUS.CANCELLED]: { dot: '#ef4444', label: 'Cancelled' },
  [TASK_STATUS.FAILED]:    { dot: '#f59e0b', label: 'Failed'    },
}

export default function TaskScheduledBadge({ task, onViewTasks, onDismiss }) {
  const [dismissed, setDismissed] = useState(false)
  const [hovered, setHovered] = useState(false)

  if (!task || dismissed) return null

  const statusInfo = STATUS_INDICATOR[task.status] || STATUS_INDICATOR[TASK_STATUS.SCHEDULED]
  const intervalText = formatInterval(task.interval_seconds)
  const isActive = task.status === TASK_STATUS.RUNNING || task.status === TASK_STATUS.SCHEDULED

  const handleDismiss = (e) => {
    e.stopPropagation()
    setDismissed(true)
    onDismiss?.()
  }

  const handleView = (e) => {
    e.stopPropagation()
    onViewTasks?.()
  }

  return (
    <div
      className={`task-scheduled-badge ${isActive ? 'task-scheduled-badge--active' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="status"
      aria-label={`Task scheduled: ${task.description || task.task_id}`}
    >
      {/* Left: icon + text */}
      <div className="task-badge-left">
        {/* Animated status dot */}
        <span
          className={`task-badge-dot ${isActive ? 'task-badge-dot--pulse' : ''}`}
          style={{ background: statusInfo.dot }}
        />

        <div className="task-badge-content">
          <span className="task-badge-title">
            Task Scheduled ✅
          </span>
          {task.description && (
            <span className="task-badge-name">
              {task.description.length > 48
                ? task.description.substring(0, 48) + '…'
                : task.description}
            </span>
          )}
          {intervalText && (
            <span className="task-badge-meta">
              🔄 Runs {intervalText}
              {task.total_runs > 0 && ` · ${task.total_runs} runs`}
            </span>
          )}
        </div>
      </div>

      {/* Right: actions */}
      <div className="task-badge-actions">
        <button
          className="task-badge-view-btn"
          onClick={handleView}
          title="Open Tasks panel"
          aria-label="View in Tasks panel"
        >
          View in Tasks
        </button>
        <button
          className="task-badge-dismiss-btn"
          onClick={handleDismiss}
          title="Dismiss"
          aria-label="Dismiss task badge"
        >
          ×
        </button>
      </div>
    </div>
  )
}
