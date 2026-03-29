
import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import zenithLogo from '../assets/zenith.png'
import TasksPanel from './TasksPanel.jsx'
import ProjectsPanel from './ProjectsPanel.jsx'
import LoadingSpinner from './LoadingSpinner.jsx'
import ThemeToggle from './ThemeToggle.jsx'
import ProfileMenu from './ProfileMenu.jsx'
import { useProjectStatus } from '../context/ProjectStatusContext.jsx'
import { SIDEBAR_TABS, TASK_STATUS } from '../utils/constants.js'
import './Sidebar.css'
import './ProjectStatusIndicator.css'

/* ── Format date for tooltip ── */
function formatSessionDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

  if (msgDay.getTime() === today.getTime()) return `Today at ${time}`
  if (msgDay.getTime() === yesterday.getTime()) return `Yesterday at ${time}`

  const diffDays = Math.floor((today - msgDay) / 86400000)
  if (diffDays < 7) {
    const weekday = d.toLocaleDateString(undefined, { weekday: 'long' })
    return `${weekday} at ${time}`
  }

  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  }) + ` at ${time}`
}

export default function Sidebar({
  sessions, activeSessionId, sidebarTab, collapsed, mobileOpen,
  tasks, tasksLoading, tasksError,
  projects, user, sessionsLoading,
  onNewChat, onSelectSession, onDeleteSession, onTabChange, onToggleCollapse,
  onLogout, onCancelTask, onDownloadTask, onDownloadProject,
  onRefreshTasks, onRefreshProjects, isSessionStreaming,

  unreadSessionIds = new Set(),
  onMarkSessionRead,
}) {
  const navigate = useNavigate()
  const { unviewedCount, hasActiveGeneration } = useProjectStatus()
  const [deletingId, setDeletingId]       = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [searchQuery, setSearchQuery]     = useState('')
  const [searchOpen, setSearchOpen]       = useState(false)
  const searchRef                         = useRef(null)
  // ── Sort sessions: most recently updated/created first ──
  // When a user sends a message in Chat C, touchSession() updates its updated_at.
  // Sorting by updated_at (desc) ensures that chat bubbles to the top immediately.
  const sortedSessions = [...sessions].sort((a, b) => {
    const dateA = new Date(a.updated_at || a.created_at || 0).getTime()
    const dateB = new Date(b.updated_at || b.created_at || 0).getTime()
    return dateB - dateA  // newest first
  })

  const filteredSessions = searchQuery
    ? sortedSessions.filter(s => s.title?.toLowerCase().includes(searchQuery.toLowerCase()))
    : sortedSessions

  const runningTasksCount = tasks.filter(t => t.status === TASK_STATUS.RUNNING || t.status === TASK_STATUS.SCHEDULED).length

  const handleDeleteClick = (e, sessionId) => {
    e.stopPropagation()
    setConfirmDelete(sessionId)
  }

  const handleDeleteConfirm = async (e, sessionId) => {
    e.stopPropagation()
    setDeletingId(sessionId)
    try {
      await onDeleteSession(sessionId)
    } finally {
      setDeletingId(null)
      setConfirmDelete(null)
    }
  }

  const handleDeleteCancel = (e) => {
    e.stopPropagation()
    setConfirmDelete(null)
  }

  useEffect(() => {
    const handler = () => setConfirmDelete(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  useEffect(() => {
    if (searchOpen && searchRef.current) {
      searchRef.current.focus()
    }
  }, [searchOpen])

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'sidebar-mobile-open' : ''}`}>

      {/* ── Header: Brand + Collapse ── */}
      <div className="sidebar-header">
        <div className="sidebar-logo" onClick={() => navigate('/')} title="Go to home page" style={{ cursor: 'pointer' }}>
          <img src={zenithLogo} alt="Zenith Logo" className="sidebar-brand-logo" />
          {!collapsed && <span className="sidebar-brand">Zenith</span>}
        </div>
        <div className="sidebar-header-actions">
          {!collapsed && (
            <button className="sidebar-collapse-btn" onClick={onToggleCollapse} title="Collapse sidebar">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                <line x1="9" y1="3" x2="9" y2="15" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
            </button>
          )}
          {collapsed && (
            <button className="sidebar-collapse-btn" onClick={onToggleCollapse} title="Expand sidebar">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Top Actions: New Chat, Search ── */}
      {!collapsed && (
        <div className="sidebar-actions">
          <button className="sidebar-action-btn" onClick={onNewChat}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            <span>New chat</span>
          </button>
          <button className="sidebar-action-btn" onClick={() => { setSearchOpen(v => !v); if (searchOpen) setSearchQuery('') }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <span>Search</span>
          </button>
        </div>
      )}

      {/* ── Search Input (expandable) ── */}
      {!collapsed && searchOpen && (
        <div className="sidebar-search">
          <svg className="search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M10 10l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <input
            ref={searchRef}
            type="text"
            className="sidebar-search-input"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')}>×</button>
          )}
        </div>
      )}

      {/* ── Navigation Tabs ── */}
      {!collapsed && (
        <nav className="sidebar-nav">
          <button
            className={`sidebar-nav-btn ${sidebarTab === SIDEBAR_TABS.CHATS ? 'sidebar-nav-active' : ''}`}
            onClick={() => onTabChange(SIDEBAR_TABS.CHATS)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M1.5 2h13v9.5H8.5l-3 3V11.5H1.5V2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            </svg>
            <span>Chats</span>
          </button>
          <button
            className={`sidebar-nav-btn ${sidebarTab === SIDEBAR_TABS.TASKS ? 'sidebar-nav-active' : ''}`}
            onClick={() => onTabChange(SIDEBAR_TABS.TASKS)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M8 4.5v3.5l2.5 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <span>Tasks</span>
            {runningTasksCount > 0 && (
              <span className="nav-badge">{runningTasksCount}</span>
            )}
          </button>
<button
            className="sidebar-nav-btn"
            onClick={() => navigate('/workspace')}
            title="Open Projects"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="2" width="13" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
              <line x1="5.5" y1="2" x2="5.5" y2="14" stroke="currentColor" strokeWidth="1.3"/>
              <line x1="5.5" y1="5.5" x2="14.5" y2="5.5" stroke="currentColor" strokeWidth="1.3"/>
            </svg>
            <span>Projects</span>
            {(unviewedCount > 0 || hasActiveGeneration) && (
              <span className={`projects-nav-badge ${unviewedCount > 0 ? 'projects-nav-badge--alert' : ''}`}>
                {unviewedCount > 0 ? unviewedCount : '•'}
              </span>
            )}
          </button>

        </nav>      )}

      {/* Collapsed icon nav */}
      {collapsed && (
        <div className="sidebar-collapsed-nav">
          <button
            className={`sidebar-icon-btn ${sidebarTab === SIDEBAR_TABS.CHATS ? 'sidebar-icon-active' : ''}`}
            onClick={() => { onToggleCollapse(); onTabChange(SIDEBAR_TABS.CHATS) }}
            title="Chats"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M1.5 2h13v9.5H8.5l-3 3V11.5H1.5V2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            </svg>
          </button>
          <button className="sidebar-icon-btn" onClick={onNewChat} title="New chat">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
          <button
            className={`sidebar-icon-btn ${sidebarTab === SIDEBAR_TABS.TASKS ? 'sidebar-icon-active' : ''}`}
            onClick={() => { onToggleCollapse(); onTabChange(SIDEBAR_TABS.TASKS) }}
            title="Tasks"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M8 4.5v3.5l2.5 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
          <button
            className="sidebar-icon-btn"
            onClick={() => navigate('/workspace')}
            title="Projects"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="2" width="13" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
              <line x1="5.5" y1="2" x2="5.5" y2="14" stroke="currentColor" strokeWidth="1.3"/>
              <line x1="5.5" y1="5.5" x2="14.5" y2="5.5" stroke="currentColor" strokeWidth="1.3"/>
            </svg>
          </button>
        </div>
      )}

      {/* ── Content ── */}
      <div className="sidebar-content">

        {/* CHATS TAB */}
        {sidebarTab === SIDEBAR_TABS.CHATS && !collapsed && (
          <>
            {sessions.length > 0 && (
              <div className="sidebar-section-label">Recents</div>
            )}

            {sessionsLoading ? (
              <div className="sidebar-loading">
                <LoadingSpinner size="sm" />
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="sidebar-empty">
                <div className="empty-icon">💬</div>
                <p>{searchQuery ? 'No conversations found' : 'No conversations yet'}</p>
                {!searchQuery && (
                  <button className="empty-start-btn" onClick={onNewChat}>Start one →</button>
                )}
              </div>
            ) : (
              <ul className="session-list" role="list">
                {filteredSessions.map((session) => {
                  const lastDate = formatSessionDate(session.updated_at || session.created_at)
                  const isUnread = unreadSessionIds.has(session.session_id)
                  const isActive = String(session.session_id) === String(activeSessionId)
                  return (
                    <li key={session.session_id}>
                      <div
                        className={`session-item ${isActive ? 'session-active' : ''} ${isUnread ? 'session-unread' : ''}`}
                        onClick={() => onSelectSession(session.session_id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && onSelectSession(session.session_id)}
                      >
                        <div className="session-info">
                          <span className="session-title">
                            {session.title || 'New conversation'}
                          </span>
                          {lastDate && (
                            <span className="session-date-hint">{lastDate}</span>
                          )}
                        </div>

                        {/* Right-side indicators */}
                        <div className="session-actions-right">
                          {isSessionStreaming && isSessionStreaming(session.session_id) && !isActive && (
                            <span className="session-streaming-dot" title="Generating response..."></span>
                          )}

                          {/* Red unread dot — shows when not hovered */}
                          {isUnread && (
                            <span className="session-unread-dot" title="Unread" />
                          )}

                          {/* Mark-as-read button — shows on hover only when unread */}
                          {isUnread && (
                            <button
                              className="session-mark-read-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                onMarkSessionRead?.(session.session_id)
                              }}
                              title="Mark as read"
                              aria-label="Mark as read"
                            >
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                <path d="M2.5 8.5l3.5 3.5 7.5-7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          )}

                          {confirmDelete === session.session_id ? (
                            <div className="session-confirm-del" onClick={e => e.stopPropagation()}>
                              <button className="confirm-yes" onClick={(e) => handleDeleteConfirm(e, session.session_id)} disabled={deletingId === session.session_id}>
                                {deletingId === session.session_id ? '...' : '✓'}
                              </button>
                              <button className="confirm-no" onClick={handleDeleteCancel}>✕</button>
                            </div>
                          ) : (
                            <button
                              className="session-delete-btn"
                              onClick={(e) => handleDeleteClick(e, session.session_id)}
                              title="Delete conversation"
                              aria-label="Delete conversation"
                            >
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <path d="M2 4h10M5 4V3h4v1M3 4l.7 8h6.6L11 4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}

        {/* TASKS TAB */}
        {sidebarTab === SIDEBAR_TABS.TASKS && !collapsed && (
          <TasksPanel
            tasks={tasks}
            loading={tasksLoading}
            error={tasksError}
            onCancel={onCancelTask}
            onDownload={onDownloadTask}
            onRefresh={onRefreshTasks}
          />
        )}

        {/* PROJECTS TAB */}
        {sidebarTab === SIDEBAR_TABS.PROJECTS && !collapsed && (
          <ProjectsPanel
            projects={projects}
            onDownload={onDownloadProject}
            onRefresh={onRefreshProjects}
            onProjectClick={(project) => {
              navigate(`/workspace?project=${encodeURIComponent(project.name)}`)
            }}
          />
        )}

        
      </div>

      {/* ── Footer: Theme Toggle + Profile Menu ── */}
      <div className="sidebar-footer">
        <div className={`sidebar-footer-row ${collapsed ? 'sidebar-footer-center' : ''}`}>
          <ThemeToggle size="sm" />
        </div>

        {/* Profile Menu — replaces old logout row */}
        {user && (
          <ProfileMenu user={user} onLogout={onLogout} />
        )}
      </div>
    </aside>
  )
}
