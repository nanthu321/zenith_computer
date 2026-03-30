import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import ArtifactCard from './ArtifactCard.jsx'
import BotIcon from './icons/BotIcon.jsx'
import UserIcon from './icons/UserIcon.jsx'
import ProjectStatusIndicator from './ProjectStatusIndicator.jsx'
import TaskScheduledBadge from './TaskScheduledBadge.jsx'
import { useProjectStatus } from '../context/ProjectStatusContext.jsx'
import './MessageBubble.css'

/* ── Copy-to-clipboard SVG icons ── */
const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
)
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

/* ── Retry icon ── */
const RetryIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <polyline points="1 4 1 10 7 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

/* ── Tool activity config — icon + labels for every known tool ── */
const TOOL_SUMMARY_CONFIG = {
  web_search:    { icon: '🌐', label: 'Searched the web',    liveLabel: 'Searching the web' },
  web_fetch:     { icon: '🌐', label: 'Searched the web',    liveLabel: 'Fetching page' },
  execute_code:  { icon: '⚡', label: 'Executed code',       liveLabel: 'Running code' },
  execute_command: { icon: '⚡', label: 'Ran a command',     liveLabel: 'Running command' },
  create_project: { icon: '📁', label: 'Created a project',  liveLabel: 'Creating project' },
  create_file:   { icon: '📄', label: 'Created files',       liveLabel: 'Creating file' },
  read_file:     { icon: '📖', label: 'Read files',          liveLabel: 'Reading file' },
  update_file:   { icon: '✏️', label: 'Updated files',       liveLabel: 'Updating file' },
  delete_file:   { icon: '🗑️', label: 'Deleted files',       liveLabel: 'Deleting file' },
  list_files:    { icon: '📂', label: 'Listed files',        liveLabel: 'Listing files' },
  schedule_task: { icon: '⏰', label: 'Scheduled a task',    liveLabel: 'Scheduling task' },
  cancel_scheduled_task: { icon: '🚫', label: 'Cancelled a task', liveLabel: 'Cancelling task' },
  browser_launch:    { icon: '🖥️', label: 'Used browser',   liveLabel: 'Launching browser' },
  browser_navigate:  { icon: '🖥️', label: 'Used browser',   liveLabel: 'Navigating' },
  browser_click:     { icon: '🖥️', label: 'Used browser',   liveLabel: 'Clicking' },
  browser_type:      { icon: '🖥️', label: 'Used browser',   liveLabel: 'Typing in browser' },
  browser_screenshot:{ icon: '🖥️', label: 'Used browser',   liveLabel: 'Taking screenshot' },
  browser_wait_for:  { icon: '🖥️', label: 'Used browser',   liveLabel: 'Waiting for element' },
  browser_get_text:  { icon: '🖥️', label: 'Used browser',   liveLabel: 'Reading page text' },
  browser_execute_js:{ icon: '🖥️', label: 'Used browser',   liveLabel: 'Running script' },
  memory_store:    { icon: '🧠', label: 'Used memory',       liveLabel: 'Saving to memory' },
  memory_retrieve: { icon: '🧠', label: 'Used memory',       liveLabel: 'Reading memory' },
  memory_list:     { icon: '🧠', label: 'Used memory',       liveLabel: 'Listing memory' },
  memory_delete:   { icon: '🧠', label: 'Used memory',       liveLabel: 'Clearing memory' },
  extract_data:    { icon: '📊', label: 'Extracted data',    liveLabel: 'Extracting data' },
  write_excel:     { icon: '📊', label: 'Created spreadsheet', liveLabel: 'Writing spreadsheet' },
  parse_csv:       { icon: '📊', label: 'Parsed data',       liveLabel: 'Parsing CSV' },
  run_tests:       { icon: '🧪', label: 'Ran tests',         liveLabel: 'Running tests' },
  install_package: { icon: '📦', label: 'Installed packages',liveLabel: 'Installing packages' },
  download_project:{ icon: '📥', label: 'Downloaded project',liveLabel: 'Downloading' },
}

/* ── Derive a single "current phase" from all live SSE events ── */
function deriveLivePhase(agentEvents, toolCalls, hasContent) {
  if (!agentEvents || agentEvents.length === 0) return null

  const runningTool = toolCalls?.find(tc => tc.status === 'running')
  if (runningTool) {
    const cfg = TOOL_SUMMARY_CONFIG[runningTool.tool] || { icon: '🔧', liveLabel: `Running ${runningTool.tool}` }
    const args = runningTool.input?.query
      || runningTool.input?.url
      || runningTool.input?.path
      || runningTool.input?.name
      || runningTool.input?.language
      || null
    return { phase: 'tool', label: cfg.liveLabel, icon: cfg.icon, tool: runningTool.tool, args }
  }

  const activeStatus = [...agentEvents].reverse().find(
    ev => ev.type === 'status' && ev.status !== 'done'
  )
  if (activeStatus) {
    const cfg = TOOL_SUMMARY_CONFIG[activeStatus.tool] || { icon: '🔧', liveLabel: 'Working' }
    return { phase: 'tool', label: cfg.liveLabel, icon: cfg.icon, tool: activeStatus.tool, args: null }
  }

  const thinking = agentEvents.find(ev => ev.type === 'thinking' && ev.status === 'active')
  if (thinking && !hasContent) {
    const iteration = agentEvents.find(ev => ev.type === 'iteration')
    return {
      phase: 'thinking',
      label: thinking.label || 'Thinking',
      icon: '✦',
      iteration: iteration ? { current: iteration.current, total: iteration.total } : null,
    }
  }

  if (hasContent) return { phase: 'generating' }
  return null
}

/**
 * Build a Claude-style summary of all completed tool calls.
 */
function buildToolSummaries(toolCalls) {
  if (!toolCalls || toolCalls.length === 0) return []
  const seen = new Map()
  for (const tc of toolCalls) {
    const config = TOOL_SUMMARY_CONFIG[tc.tool] || { icon: '🔧', label: `Used ${tc.tool}` }
    const key = config.label
    if (seen.has(key)) {
      const entry = seen.get(key)
      entry.count++
      if (!entry.tools.includes(tc.tool)) entry.tools.push(tc.tool)
    } else {
      seen.set(key, { icon: config.icon, label: config.label, count: 1, tools: [tc.tool] })
    }
  }
  return Array.from(seen.values())
}

/* ═══════════════════════════════════════════════════════════════
   LiveStatusBar — the animated bar shown WHILE streaming.
   ═══════════════════════════════════════════════════════════════ */
function LiveStatusBar({ phase }) {
  const prevLabelRef = useRef(null)
  const [displayLabel, setDisplayLabel] = useState(null)
  const [animKey, setAnimKey] = useState(0)

  useEffect(() => {
    if (!phase) return
    const newLabel = phase.phase === 'thinking'
      ? (phase.label || 'Thinking')
      : phase.phase === 'tool'
      ? phase.label
      : null

    if (newLabel !== prevLabelRef.current) {
      prevLabelRef.current = newLabel
      setDisplayLabel(newLabel)
      setAnimKey(k => k + 1)
    }
  }, [phase])

  if (!phase || phase.phase === 'generating') return null
  if (!displayLabel) return null

  const isThinking = phase.phase === 'thinking'
  const isTool = phase.phase === 'tool'

  return (
    <div className={`live-status-bar ${isThinking ? 'lsb-thinking' : 'lsb-tool'}`} key={animKey}>
      <span className={`lsb-icon ${isThinking ? 'lsb-icon-thinking' : 'lsb-icon-tool'}`}>
        {phase.icon}
      </span>
      <span className="lsb-label">
        {displayLabel}
        {isTool && phase.args && (
          <span className="lsb-args">
            &ldquo;{String(phase.args).length > 45
              ? String(phase.args).substring(0, 45) + '…'
              : String(phase.args)}&rdquo;
          </span>
        )}
        {isThinking && phase.iteration?.current && (
          <span className="lsb-iteration">step {phase.iteration.current}</span>
        )}
      </span>
      <span className={`lsb-spinner ${isThinking ? 'lsb-spinner-thinking' : ''}`} />
    </div>
  )
}

/**
 * Unified markdown renderer — used for BOTH streaming and completed messages.
 * Claude renders markdown live during streaming, so we do the same.
 *
 * HTML/visualization code blocks that look like full documents (contain
 * <!DOCTYPE or <html) are suppressed — users should view those in Explorer.
 */
function renderMarkdown(text) {
  if (!text) return ''

  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Code blocks (must be done first)
  // Suppress full HTML document blocks — replace with a muted "view in Explorer" hint
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const trimmed = code.trim()
    const isHtmlDoc =
      (lang === 'html' || lang === 'HTML' || lang === '') &&
      (/<!doctype\s+html/i.test(trimmed) || /<html[\s>]/i.test(trimmed))
    if (isHtmlDoc) {
      return `<div class="code-block-suppressed">
        <span class="code-block-suppressed-icon">🌐</span>
        <span class="code-block-suppressed-text">HTML preview available in Explorer</span>
      </div>`
    }
    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : ''
    return `<div class="code-block-wrapper">${langLabel}<pre class="code-block"><code>${trimmed}</code></pre></div>`
  })

  // Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>')

  // Tables (GFM-style)
  html = html.replace(
    /((?:^\|.+\|$\n?)+)/gm,
    (tableBlock) => {
      const rows = tableBlock.trim().split('\n').filter(r => r.trim())
      if (rows.length < 2) return tableBlock
      const isSeparator = (row) => /^\|[\s\-:]+(\|[\s\-:]+)+\|?$/.test(row.trim())
      let headerRow = null
      let bodyRows = rows
      if (rows.length >= 2 && isSeparator(rows[1])) {
        headerRow = rows[0]
        bodyRows = rows.slice(2)
      }
      const parseRow = (row) =>
        row.split('|').slice(1, -1).map(cell => cell.trim())
      let tableHtml = '<div class="md-table-wrapper"><table class="md-table">'
      if (headerRow) {
        const cells = parseRow(headerRow)
        tableHtml += '<thead><tr>'
        cells.forEach(c => { tableHtml += `<th>${c}</th>` })
        tableHtml += '</tr></thead>'
      }
      tableHtml += '<tbody>'
      bodyRows.forEach(row => {
        if (isSeparator(row)) return
        const cells = parseRow(row)
        tableHtml += '<tr>'
        cells.forEach(c => { tableHtml += `<td>${c}</td>` })
        tableHtml += '</tr>'
      })
      tableHtml += '</tbody></table></div>'
      return tableHtml
    }
  )

  // Bold and italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
  html = html.replace(/^## (.+)$/gm,  '<h2 class="md-h2">$1</h2>')
  html = html.replace(/^# (.+)$/gm,   '<h1 class="md-h1">$1</h1>')

  // Lists — unordered (- / *) and ordered (1. 2. 3.) handled separately
  // Step 1: Mark unordered list items with a sentinel class
  html = html.replace(/^[-*] (.+)$/gm, '<li class="md-ul-item">$1</li>')
  // Step 2: Mark ordered list items with a sentinel class
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="md-ol-item">$1</li>')
  // Step 3: Wrap consecutive unordered items in <ul>
  html = html.replace(/(<li class="md-ul-item">.*?<\/li>\n?)+/g, (match) => {
    const cleaned = match.replace(/ class="md-ul-item"/g, '')
    return `<ul class="md-list">${cleaned}</ul>`
  })
  // Step 4: Wrap consecutive ordered items in <ol>
  html = html.replace(/(<li class="md-ol-item">.*?<\/li>\n?)+/g, (match) => {
    const cleaned = match.replace(/ class="md-ol-item"/g, '')
    return `<ol class="md-list md-ol">${cleaned}</ol>`
  })

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr class="md-hr"/>')

  // Paragraphs — split on double newlines, wrap non-HTML segments in <p>
  // This avoids wrapping already-converted block elements (headings, lists, etc.) in <p> tags
  const BLOCK_TAG_RE = /^\s*<(h[1-6]|ul|ol|li|pre|div|table|thead|tbody|tr|th|td|blockquote|hr)/i
  const parts = html.split(/\n\n+/)
  html = parts.map(part => {
    const trimmed = part.trim()
    if (!trimmed) return ''
    if (BLOCK_TAG_RE.test(trimmed)) return trimmed
    return `<p class="md-p">${trimmed}</p>`
  }).filter(Boolean).join('\n')

  return html
}

/* ── Icons used in the View Project card ── */
function ViewProjectFolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 3a1 1 0 011-1h3.172a1 1 0 01.707.293L8.414 3.5H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1V3z"
        stroke="currentColor" strokeWidth="1.25" fill="none"/>
    </svg>
  )
}
function ViewProjectArrowIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 10L10 2M10 2H5.5M10 2V6.5"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

/* ── Live Search Results Panel (shown while web_search is running) ── */
function LiveSearchPanel({ toolCall }) {
  const { tool, result, status, input } = toolCall
  const isRunning = status === 'running'
  const isDone    = status === 'done'

  // Show panel only for web tools that have partial or full results
  const isWebTool = tool === 'web_search' || tool === 'web_fetch'
  if (!isWebTool) return null

  // During running: show animated placeholder cards
  // During done: show actual results (handled by ToolResultOutput below)
  if (!isRunning && !isDone) return null

  const results = result?.results || []
  const query   = input?.query || input?.url || ''

  if (isRunning && results.length === 0) {
    // Show skeleton/pulse cards while waiting for results
    return (
      <div className="live-search-panel live-search-panel--loading">
        <div className="live-search-header">
          <span className="live-search-icon">🌐</span>
          <span className="live-search-label">
            {query ? `Searching for "${query.length > 40 ? query.substring(0, 40) + '…' : query}"` : 'Searching the web…'}
          </span>
          <span className="live-search-spinner" />
        </div>
        <div className="live-search-skeletons">
          {[0, 1, 2].map(i => (
            <div key={i} className="live-search-skeleton" style={{ animationDelay: `${i * 0.15}s` }}>
              <div className="live-search-skeleton-title" />
              <div className="live-search-skeleton-line" />
              <div className="live-search-skeleton-line live-search-skeleton-line--short" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (results.length > 0) {
    return (
      <div className={`live-search-panel ${isRunning ? 'live-search-panel--streaming' : 'live-search-panel--done'}`}>
        {isRunning && (
          <div className="live-search-header">
            <span className="live-search-icon">🌐</span>
            <span className="live-search-label">Results streaming in…</span>
            <span className="live-search-spinner" />
          </div>
        )}
        <div className="live-search-results">
          {results.slice(0, 5).map((r, i) => (
            <div
              key={i}
              className="live-search-result-item"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              {r.url && (
                <div className="live-search-result-url">
                  <span className="live-search-favicon">🌐</span>
                  <span className="live-search-domain">
                    {(() => { try { return new URL(r.url).hostname } catch { return r.url.substring(0, 40) } })()}
                  </span>
                </div>
              )}
              {r.title && (
                <a
                  href={r.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="live-search-result-title"
                  onClick={e => !r.url && e.preventDefault()}
                >
                  {r.title}
                </a>
              )}
              {r.snippet && (
                <div className="live-search-result-snippet">{r.snippet}</div>
              )}
            </div>
          ))}
        </div>
        {results.length > 5 && (
          <div className="live-search-more">+{results.length - 5} more results</div>
        )}
      </div>
    )
  }

  return null
}

/* ── Tool Result Output Renderer ── */
function ToolResultOutput({ toolCall, onNavigate }) {
  const { tool, result, input } = toolCall
  if (!result) return null

  if (tool === 'execute_code' || tool === 'execute_command' || tool === 'run_tests') {
    const hasOutput = result.stdout || result.stderr
    if (!hasOutput) return null
    return (
      <div className="tool-result-output">
        {result.stdout && (
          <div className="tool-result-stdout">
            <span className="tool-result-label">Output</span>
            <pre className="tool-result-pre">{result.stdout}</pre>
          </div>
        )}
        {result.stderr && (
          <div className="tool-result-stderr">
            <span className="tool-result-label tool-result-label-err">stderr</span>
            <pre className="tool-result-pre tool-result-pre-err">{result.stderr}</pre>
          </div>
        )}
        {result.exit_code !== undefined && (
          <span className={`tool-result-exit ${result.exit_code === 0 ? 'tool-result-exit-ok' : 'tool-result-exit-err'}`}>
            exit {result.exit_code}
          </span>
        )}
      </div>
    )
  }

  if ((tool === 'web_search' || tool === 'web_fetch') && result.results && result.results.length > 0) {
    // After done, results are shown via LiveSearchPanel above (already rendered)
    return null
  }

  if (tool === 'create_project') {
    const projectName = input?.name || result?.project_name || result?.name || null
    const fileCount = result?.files_created?.length || 0
    return (
      <div className="tool-result-output tool-result-project-card">
        {/* Project icon + name */}
        <div className="project-card-info">
          <span className="project-card-icon">📁</span>
          <div className="project-card-details">
            {projectName && (
              <span className="project-card-name">{projectName}</span>
            )}
            {fileCount > 0 && (
              <span className="project-card-meta">
                {fileCount} file{fileCount !== 1 ? 's' : ''} created
              </span>
            )}
          </div>
        </div>

        {/* "View Project" navigation button */}
        <button
          className="view-project-btn"
          onClick={() => onNavigate && onNavigate(projectName || '')}
          title={projectName ? `Open "${projectName}" in Explorer` : 'Open in Explorer'}
        >
          <ViewProjectFolderIcon />
          <span>{projectName ? `View Project: ${projectName}` : 'View Project'}</span>
          <ViewProjectArrowIcon />
        </button>
      </div>
    )
  }

  if (tool === 'create_file' && result.files_created) {
    return (
      <div className="tool-result-output">
        <div className="tool-result-files-list">
          {result.files_created.map((f, i) => (
            <span key={i} className="tool-result-file-chip">📄 {f}</span>
          ))}
        </div>
      </div>
    )
  }

  if (result.content) {
    const text = typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content, null, 2)
    return (
      <div className="tool-result-output">
        <pre className="tool-result-pre">{text.substring(0, 600)}{text.length > 600 ? '\n…' : ''}</pre>
      </div>
    )
  }

  if (result.output) {
    const text = typeof result.output === 'string'
      ? result.output
      : JSON.stringify(result.output, null, 2)
    return (
      <div className="tool-result-output">
        <pre className="tool-result-pre">{text.substring(0, 600)}{text.length > 600 ? '\n…' : ''}</pre>
      </div>
    )
  }

  if (result.status && result.status !== 'success') {
    return (
      <div className="tool-result-output">
        <span className="tool-result-status">{String(result.status)}</span>
      </div>
    )
  }

  return null
}

function shouldAutoExpand(toolCall) {
  if (!toolCall || !toolCall.result) return false
  const { tool, result } = toolCall
  if ((tool === 'execute_code' || tool === 'execute_command' || tool === 'run_tests') &&
      (result.stdout || result.stderr)) {
    return true
  }
  return false
}

/* ── Tool Activity Summary ── */
function ToolActivitySummary({ toolCalls, agentEvents, isStreaming, onNavigate }) {
  const [expandedTools, setExpandedTools] = useState(() => {
    const initial = new Set()
    if (toolCalls) {
      toolCalls.forEach((tc, i) => {
        if (shouldAutoExpand(tc)) initial.add(tc.tool_use_id || i)
      })
    }
    return initial
  })

  const prevToolCallsRef = useRef([])
  useEffect(() => {
    if (!toolCalls || toolCalls.length === 0) return
    const prev = prevToolCallsRef.current
    toolCalls.forEach((tc, i) => {
      const key = tc.tool_use_id || i
      const wasDone = prev.find(p => (p.tool_use_id || prev.indexOf(p)) === key)?.status === 'done'
      if (!wasDone && tc.status === 'done' && shouldAutoExpand(tc)) {
        setExpandedTools(s => { const n = new Set(s); n.add(key); return n })
      }
    })
    prevToolCallsRef.current = toolCalls
  }, [toolCalls])

  const toggleTool = useCallback((id) => {
    setExpandedTools(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])

  const summaries = buildToolSummaries(toolCalls)

  if ((!toolCalls || toolCalls.length === 0) && summaries.length === 0) return null

  return (
    <div className="claude-activity-summary">
      {toolCalls && toolCalls.length > 0 ? (
        toolCalls.map((tc, i) => {
          const config = TOOL_SUMMARY_CONFIG[tc.tool] || { icon: '🔧', label: `Used ${tc.tool}` }
          const isDone    = tc.status === 'done'
          const isRunning = tc.status === 'running'
          const isError   = isDone && (
            tc.result?.status === 'error' ||
            (tc.result?.exit_code !== undefined && tc.result.exit_code !== 0)
          )
          const key        = tc.tool_use_id || i
          const isExpanded = expandedTools.has(key)
          const hasResult  = isDone && tc.result && (
            tc.result.stdout || tc.result.stderr || tc.result.results ||
            tc.result.files_created || tc.result.content || tc.result.output
          )

          // web_search / web_fetch: always show LiveSearchPanel (running or done)
          const isWebTool = tc.tool === 'web_search' || tc.tool === 'web_fetch'
          const showLiveSearch = isWebTool && (isRunning || (isDone && tc.result?.results?.length > 0))

          return (
            <div key={key} className="claude-tool-block">
              <div
                className={`claude-activity-indicator ${isRunning ? 'claude-activity-live' : 'claude-activity-done'} ${isExpanded ? 'claude-activity-expanded' : ''}`}
                onClick={() => !isWebTool && hasResult && toggleTool(key)}
                role={!isWebTool && hasResult ? 'button' : undefined}
                tabIndex={!isWebTool && hasResult ? 0 : undefined}
                onKeyDown={e => !isWebTool && hasResult && e.key === 'Enter' && toggleTool(key)}
                style={{ cursor: (!isWebTool && hasResult) ? 'pointer' : 'default' }}
              >
                {isRunning ? (
                  <span className="claude-activity-spinner" style={{ marginRight: 0 }} />
                ) : (
                  <span className={`claude-tool-status-dot ${isError ? 'claude-tool-status-dot-err' : isDone ? 'claude-tool-status-dot-ok' : 'claude-tool-status-dot-pending'}`} />
                )}
                <span className="claude-activity-icon">{config.icon}</span>
                <span className="claude-activity-label">{config.label}</span>
                {tc.input?.query && (
                  <span className="claude-activity-args">
                    &quot;{String(tc.input.query).substring(0, 40)}{String(tc.input.query).length > 40 ? '…' : ''}&quot;
                  </span>
                )}
                {tc.input?.language && !tc.input?.query && (
                  <span className="claude-activity-args">{tc.input.language}</span>
                )}
                {tc.input?.name && !tc.input?.query && (
                  <span className="claude-activity-args">{tc.input.name}</span>
                )}
                {tc.input?.url && !tc.input?.query && (
                  <span className="claude-activity-args">
                    {String(tc.input.url).substring(0, 40)}{String(tc.input.url).length > 40 ? '…' : ''}
                  </span>
                )}
                {tc.input?.path && !tc.input?.query && !tc.input?.name && (
                  <span className="claude-activity-args">{String(tc.input.path).split('/').pop()}</span>
                )}
                {!isWebTool && hasResult && (
                  <svg
                    className={`claude-activity-chevron ${isExpanded ? 'claude-activity-chevron-open' : ''}`}
                    width="12" height="12" viewBox="0 0 12 12" fill="none"
                  >
                    <path d="M4 4.5l2 2 2-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>

              {/* Live search panel — always visible for web tools */}
              {showLiveSearch && (
                <LiveSearchPanel toolCall={tc} />
              )}

              {/* Non-web tool result (expandable) */}
              {!isWebTool && isDone && (isExpanded || shouldAutoExpand(tc)) && (
                <ToolResultOutput toolCall={tc} autoExpand={shouldAutoExpand(tc)} onNavigate={onNavigate} />
              )}
            </div>
          )
        })
      ) : (
        summaries.map((summary, idx) => (
          <div key={idx} className="claude-activity-indicator claude-activity-done">
            <span className="claude-activity-icon">{summary.icon}</span>
            <span className="claude-activity-label">{summary.label}</span>
            {summary.count > 1 && (
              <span className="claude-activity-count">({summary.count}×)</span>
            )}
          </div>
        ))
      )}
    </div>
  )
}

export default function MessageBubble({ message, isLast, agentEvents, artifacts, scheduledTask, onViewTasks }) {
  const navigate       = useNavigate()
  const isUser         = message.role === 'user'
  const toolCalls      = message.tool_calls || []
  const images         = message.images || []
  const msgArtifacts   = artifacts || message.artifacts || []
  const isStreamingNow = message.isStreaming

  const [copied, setCopied] = useState(false)

  // ── Project status indicators for this message ──
  const { statuses: allProjectStatuses, markProjectViewed } = useProjectStatus()
  const messageProjectStatuses = useMemo(() => {
    if (isUser) return []
    const msgId = message.message_id
    if (!msgId) return []
    // Filter statuses linked to this specific message
    return Object.values(allProjectStatuses).filter(
      s => s.messageId === String(msgId)
    )
  }, [message.message_id, isUser, allProjectStatuses])

  

  const handleOpenInExplorer = useCallback((projectName) => {
    // Mark the project as viewed when user clicks "View Project"
    if (projectName) {
      markProjectViewed(projectName)
    }
    navigate(`/workspace?project=${encodeURIComponent(projectName)}`)
  }, [navigate, markProjectViewed])

  const handleCopy = useCallback(async () => {
    const text = message.content || ''
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [message.content])

  /* ── UNIFIED markdown render — same for streaming AND completed.
     Claude renders markdown live during streaming. No more raw text. ── */
  const renderedContent = useMemo(() => {
    if (isUser) return null
    return renderMarkdown(message.content || '')
  }, [message.content, isUser])

  const livePhase = isStreamingNow
    ? deriveLivePhase(agentEvents, toolCalls, !!message.content)
    : null

  const hasCompletedTools = toolCalls.length > 0

  const showTypingDots = !isUser &&
    isStreamingNow &&
    !message.content &&
    !message.isError &&
    !livePhase &&
    toolCalls.length === 0

  return (
    <div className={`msg-row ${isUser ? 'msg-row--user' : 'msg-row--assistant'} ${isLast ? 'msg-row--last' : ''}`}>

      {/* Bot avatar */}
      {!isUser && (
        <div className={`msg-avatar ${isStreamingNow ? 'msg-avatar--streaming' : ''}`}>
          <BotIcon size={22} />
        </div>
      )}

      <div className={`msg-body ${isUser ? 'msg-body--user' : 'msg-body--assistant'}`}>

        {/* Sender label for assistant */}
        {!isUser && (
          <div className="msg-sender">Zenith</div>
        )}

        {/* User images */}
        {isUser && images.length > 0 && (
          <div className="msg-images">
            {images.map((img, idx) => (
              <div key={idx} className="msg-image-wrap">
                <img
                  src={img.data}
                  alt={img.name || `Attached image ${idx + 1}`}
                  className="msg-image"
                  loading="lazy"
                  onClick={() => window.open(img.data, '_blank')}
                  title={`${img.name || 'Image'} — Click to view full size`}
                />
                {img.name && <span className="msg-image-label">{img.name}</span>}
              </div>
            ))}
          </div>
        )}

        {/* ── USER MESSAGE CONTENT ── */}
        {isUser && message.content && (
          <div className="msg-bubble msg-bubble--user">{message.content}</div>
        )}

        {/* ── Project Status Indicators (attached to relevant message) ── */}
        {!isUser && messageProjectStatuses.length > 0 && (
          <div className="msg-project-statuses">
            {messageProjectStatuses.map((ps, idx) => (
              <ProjectStatusIndicator
                key={ps.projectName + idx}
                status={ps.status}
                projectName={ps.projectName}
              />
            ))}
          </div>
        )}

        {/* ── Tool Activity Summary (tool calls, live search, results) ── */}
        {!isUser && (hasCompletedTools || (isStreamingNow && toolCalls.length > 0)) && (
          <ToolActivitySummary
            toolCalls={toolCalls}
            agentEvents={agentEvents}
            isStreaming={isStreamingNow}
            onNavigate={handleOpenInExplorer}
          />
        )}

        {/* ── Live Status Bar (thinking / tool phases during streaming) ── */}
        {!isUser && isStreamingNow && livePhase && (
          <LiveStatusBar phase={livePhase} />
        )}

        {/* ═══════════════════════════════════════════════════════
            LOADING HEADER BAR — slim status bar above 3 dots
            Visible only while waiting for first token (showTypingDots).
            ═══════════════════════════════════════════════════════ */}
        {showTypingDots && (
          <div className="msg-loading-bar">
            <div className="msg-loading-bar__shimmer" />
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            DIV 2 — FINAL RESPONSE CONTAINER
            Holds streamed / completed message text + artifacts.
            Always rendered for the assistant (shows dots when empty).
            ═══════════════════════════════════════════════════════ */}
        {!isUser && (
          <div className={`sse-final-response${isStreamingNow ? ' sse-final-response--streaming' : ''}${message.isError ? ' sse-final-response--error' : ''}`}>

            {/* ── MESSAGE CONTENT ── */}
            {showTypingDots ? (
              /* Three-dot loader */
              <div className="msg-thinking-dots"><span /><span /><span /></div>

            ) : isStreamingNow && message.content ? (
              /* ── STREAMING: Live markdown + cursor ── */
              <div className="msg-content msg-content--streaming">
                <div
                  className="msg-markdown"
                  dangerouslySetInnerHTML={{ __html: renderedContent }}
                />
                <span className="msg-cursor" />
              </div>

            ) : (message.content || message.isError) ? (
              /* ── COMPLETED: Same markdown render ── */
              <div className={`msg-content ${message.isError ? 'msg-content--error' : ''}`}>
                {message.isError ? (
                  <div className="msg-error-inner">
                    <span>⚠️</span>
                    <span>Failed to generate response. Please try again.</span>
                  </div>
                ) : (
                  <div
                    className="msg-markdown"
                    dangerouslySetInnerHTML={{ __html: renderedContent }}
                  />
                )}
              </div>
            ) : null}

            {/* Artifacts */}
            {msgArtifacts.length > 0 && (
              <div className="msg-artifacts">
                {msgArtifacts.map(artifact => (
                  <ArtifactCard key={artifact.id} artifact={artifact} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Task Scheduled Badge — shown when this message created a task ── */}
        {!isUser && !isStreamingNow && scheduledTask && (
          <TaskScheduledBadge
            task={scheduledTask}
            onViewTasks={onViewTasks}
          />
        )}

        {/* ── Action bar: timestamp → retry → copy ── */}
        {!isUser && !message.isStreaming && message.content && (
          <div className={`msg-actions ${isLast ? 'msg-actions--visible' : ''}`}>
            {message.created_at && (
              <span className="msg-timestamp">
                {new Date(message.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
              </span>
            )}
            <button className="msg-action-btn" title="Retry">
              <RetryIcon />
            </button>
            <button
              className={`msg-action-btn ${copied ? 'msg-action-btn--active' : ''}`}
              onClick={handleCopy}
              title={copied ? 'Copied!' : 'Copy'}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
        )}

        {/* User message footer — timestamp + copy */}
        {isUser && !message.isStreaming && message.content && (
          <div className={`msg-footer--user ${isLast ? 'msg-footer--user-visible' : ''}`}>
            {message.created_at && (
              <span className="msg-timestamp">
                {new Date(message.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
              </span>
            )}
            <button
              className={`msg-action-btn msg-action-btn--user ${copied ? 'msg-action-btn--active' : ''}`}
              onClick={handleCopy}
              title={copied ? 'Copied!' : 'Copy message'}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="msg-avatar msg-avatar--user">
          <UserIcon size={18} />
        </div>
      )}
    </div>
  )
}
