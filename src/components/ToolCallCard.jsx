import React, { useState } from 'react'
import { TOOL_ICONS, TOOL_LABELS } from '../utils/constants.js'
import './ToolCallCard.css'

export default function ToolCallCard({ toolCall }) {
  const [expanded, setExpanded] = useState(false)
  const { tool, input, result, status } = toolCall

  const icon    = TOOL_ICONS[tool]  || '🔧'
  const label   = TOOL_LABELS[tool] || tool
  const isRunning = status === 'running'
  const isDone    = status === 'done'

  const getStatusColor = () => {
    if (isRunning) return 'var(--accent-yellow)'
    if (isDone && result?.status === 'error')   return 'var(--accent-red)'
    if (isDone && result?.status === 'timeout') return 'var(--accent-orange)'
    if (isDone) return 'var(--accent-green)'
    return 'var(--text-muted)'
  }

  const getStatusIcon = () => {
    if (isRunning) return <span className="tool-spinner" />
    if (isDone && (result?.status === 'error' || result?.status === 'timeout')) return '✗'
    if (isDone) return '✓'
    return '○'
  }

  const renderResult = () => {
    if (!result) return null

    if (tool === 'execute_code') {
      return (
        <div className="tool-result-code">
          {result.stdout && (
            <div className="tool-output">
              <span className="output-label">stdout</span>
              <pre className="output-pre">{result.stdout}</pre>
            </div>
          )}
          {result.stderr && (
            <div className="tool-output tool-output-err">
              <span className="output-label output-label-err">stderr</span>
              <pre className="output-pre">{result.stderr}</pre>
            </div>
          )}
          <div className="tool-exit-info">
            <span className={`exit-code ${result.exit_code === 0 ? 'exit-ok' : 'exit-err'}`}>
              exit: {result.exit_code}
            </span>
            {result.execution_time_ms > 0 && (
              <span className="exec-time">{result.execution_time_ms}ms</span>
            )}
          </div>
        </div>
      )
    }

    if (tool === 'web_search' && result.results) {
      return (
        <div className="tool-result-search">
          {result.results.slice(0, 3).map((r, i) => (
            <div key={i} className="search-result-item">
              <div className="search-result-title">{r.title}</div>
              {r.snippet && <div className="search-result-snippet">{r.snippet}</div>}
            </div>
          ))}
        </div>
      )
    }

    if (tool === 'create_project' && result.project_id) {
      return (
        <div className="tool-result-project">
          <div className="project-detail">
            <span className="project-label">Project ID</span>
            <span className="project-value">{result.project_id}</span>
          </div>
          {result.files_created?.length > 0 && (
            <div className="project-detail">
              <span className="project-label">Files created</span>
              <div className="project-files">
                {result.files_created.map((f, i) => (
                  <span key={i} className="project-file">{f}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    }

    if (tool === 'schedule_task' && result.task_id) {
      return (
        <div className="tool-result-task">
          <div className="task-detail">
            <span>🆔</span>
            <span>{result.task_id}</span>
          </div>
          <div className="task-detail">
            <span>🔄</span>
            <span>Every {result.interval} for {result.duration}</span>
          </div>
          {result.total_runs && (
            <div className="task-detail">
              <span>📊</span>
              <span>{result.total_runs} total runs</span>
            </div>
          )}
        </div>
      )
    }

    if (tool === 'list_files' && result.files) {
      return (
        <div className="tool-result-files">
          {result.files.map((f, i) => (
            <div key={i} className="file-entry">
              <span>{f.type === 'directory' ? '📁' : '📄'}</span>
              <span>{f.name}</span>
              {f.size && <span className="file-size">{(f.size / 1024).toFixed(1)}KB</span>}
            </div>
          ))}
        </div>
      )
    }

    if (tool === 'read_file' && result.content) {
      return (
        <pre className="tool-result-file-content">{result.content.slice(0, 500)}{result.content.length > 500 ? '...' : ''}</pre>
      )
    }

    // Fallback: JSON display
    return (
      <pre className="tool-result-json">
        {JSON.stringify(result, null, 2).slice(0, 500)}
      </pre>
    )
  }

  return (
    <div
      className={`tool-card tool-card-${status} ${expanded ? 'tool-card-expanded' : ''}`}
      style={{ '--status-color': getStatusColor() }}
    >
      <div
        className="tool-card-header"
        onClick={() => isDone && setExpanded(v => !v)}
        role={isDone ? 'button' : undefined}
        style={{ cursor: isDone ? 'pointer' : 'default' }}
      >
        <div className="tool-card-left">
          <span className="tool-icon">{icon}</span>
          <div className="tool-info">
            <span className="tool-name">{label}</span>
            {input?.language && (
              <span className="tool-sub">{input.language}</span>
            )}
            {input?.query && (
              <span className="tool-sub">&quot;{input.query}&quot;</span>
            )}
            {input?.name && (
              <span className="tool-sub">{input.name}</span>
            )}
          </div>
        </div>

        <div className="tool-card-right">
          <span className="tool-status-icon" style={{ color: getStatusColor() }}>
            {getStatusIcon()}
          </span>
          {isRunning && (
            <span className="tool-running-label">Running...</span>
          )}
          {isDone && (
            <svg
              className={`tool-expand-icon ${expanded ? 'tool-expand-icon-open' : ''}`}
              width="12" height="12" viewBox="0 0 12 12" fill="none"
            >
              <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      </div>

      {/* Expanded result */}
      {expanded && isDone && (
        <div className="tool-card-body">
          {renderResult()}
        </div>
      )}
    </div>
  )
}
