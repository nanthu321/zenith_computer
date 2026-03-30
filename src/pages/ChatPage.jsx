import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useSessions } from '../hooks/useSessions.js'
import { useChatContext } from '../context/ChatContext.jsx'
import { useTasks } from '../hooks/useTasks.js'
import { useUnreadSessions } from '../hooks/useNotifications.js'
import Sidebar from '../components/Sidebar.jsx'
import ChatArea from '../components/ChatArea.jsx'
import MockModeBanner from '../components/MockModeBanner.jsx'
import { useToast } from '../components/ToastNotification.jsx'

import { useProjectStatus } from '../context/ProjectStatusContext.jsx'

import { SIDEBAR_TABS } from '../utils/constants.js'
import { isMockMode } from '../utils/api.js'
import { getPreference, setPreference, removePreference } from '../utils/preferences.js'
import './ChatPage.css'



/* ─── Persist active session ID ─── */
// We use BOTH server preferences (survives cross-device) and sessionStorage
// (survives page refresh even if the server PUT failed).
const ACTIVE_SESSION_KEY = 'zenith_active_session_id'
const SESSION_STORAGE_KEY = 'zenith_active_session_id'

function loadActiveSessionId() {
  // 1. Try server preferences first (populated by loadPreferences() in AuthContext)
  const serverVal = getPreference(ACTIVE_SESSION_KEY, null)
  if (serverVal) return String(serverVal)

  // 2. Fallback to sessionStorage (survives refresh even if server PUT failed)
  try {
    const localVal = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (localVal) return localVal
  } catch (_) { /* sessionStorage may be unavailable */ }

  return null
}

function saveActiveSessionId(sessionId) {
  if (sessionId) {
    const idStr = String(sessionId)
    // Save to server preferences (async, fire-and-forget)
    setPreference(ACTIVE_SESSION_KEY, idStr)
    // Save to sessionStorage as immediate fallback (sync, survives refresh)
    try { sessionStorage.setItem(SESSION_STORAGE_KEY, idStr) } catch (_) {}
  } else {
    removePreference(ACTIVE_SESSION_KEY)
    try { sessionStorage.removeItem(SESSION_STORAGE_KEY) } catch (_) {}
  }
}

export default function ChatPage() {
  const { user, logout }                               = useAuth()
  const navigate                                       = useNavigate()
  // Restore active session from preferences on mount
  const [activeSessionId, setActiveSessionIdRaw]       = useState(() => loadActiveSessionId())
  const [sidebarTab, setSidebarTab]                    = useState(SIDEBAR_TABS.CHATS)

  const [sidebarCollapsed, setSidebarCollapsed]        = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen]      = useState(false)
  const isCreatingSessionRef                           = useRef(false)

  // Wrapper that also persists to server preferences + sessionStorage
  const setActiveSessionId = useCallback((id) => {
    setActiveSessionIdRaw(id)
    saveActiveSessionId(id)
  }, [])

  // Track which sessions have been SUCCESSFULLY fetched from the API
  const fetchedSessionsRef = useRef(new Set())

  // Tracks whether user has manually selected a session — prevents initial load from overriding
  const userHasSelectedRef = useRef(false)

  // Prevents React StrictMode double-mount from setting activeSessionId twice
  const initialLoadDoneRef = useRef(false)

  const {
    sessions, loading: sessionsLoading, fetchSessions,
    createSession, deleteSession, deleteEmptySessions, updateSessionTitle, touchSession
  } = useSessions()

  // ── FIX: Use ChatContext instead of local useChat() ──
  // useChat state now lives in ChatProvider (above <Routes> in App.jsx).
  // This means the SSE stream connection, message caches, abort controllers,
  // and all streaming refs persist even when ChatPage unmounts during navigation.
  const {
    messages, isStreaming, error: chatError,
    agentEvents, artifacts,
    fetchMessages, sendMessage, cancelStream, setError: setChatError,
    setActiveSession, isSessionStreaming, setOnBackgroundComplete, setOnProjectStatusChange,
    setOnConflictQueue, cleanupSession, recoverStreamState
  } = useChatContext()

  const { toast, ToastPortal } = useToast()

  const {
    tasks, projects, loading: tasksLoading, error: tasksError,
    fetchTasks, fetchProjects,
    addTask, cancelTask, downloadTaskFile, downloadProject,
    startPolling, stopPolling,
  } = useTasks()

  // ── Per-message task badge state ──────────────────────────────────────────
  // Maps assistant messageId (string) → normalized task object.
  // Updated after schedule_task tool results arrive in the SSE stream.
  const [tasksByMessage, setTasksByMessage] = useState({})

  // ── Unread session tracking (server-persisted) ──
  const {
    unreadSessionIds,
    markSessionAsRead,
    addUnreadSession,
  } = useUnreadSessions()

  // ── Project status tracking (real-time indicators) ──
  const { setProjectStatus } = useProjectStatus()

  // Register project status change callback
  useEffect(() => {
    setOnProjectStatusChange((projectName, status, meta) => {
      setProjectStatus(projectName, status, meta)
    })
  }, [setOnProjectStatusChange, setProjectStatus])

  // Register background completion callback for toast + unread marking
  useEffect(() => {
    setOnBackgroundComplete((sessionId, sessionTitle) => {
      // Mark session as unread (red dot in sidebar)
      addUnreadSession(sessionId)

      const truncTitle = sessionTitle.length > 40
        ? sessionTitle.substring(0, 37) + '...'
        : sessionTitle
      toast.chat(
        `Response ready in "${truncTitle}"`,
        {
          title: 'Background generation complete',
          duration: 8000,
          action: {
            label: 'View',
            onClick: () => {
              setActiveSessionId(sessionId)
              markSessionAsRead(sessionId)
              userHasSelectedRef.current = true
              setMobileSidebarOpen(false)
            },
          },
        }
      )
    })
  }, [setOnBackgroundComplete, toast, addUnreadSession, markSessionAsRead])

  // Register 409 Conflict callback
  // When /send returns 409 (another prompt already running), show a toast
  useEffect(() => {
    setOnConflictQueue((sessionId, message) => {
      console.log('[ChatPage] 409 conflict: session', sessionId, '| message:', message.substring(0, 60))
      toast.error(
        'Please wait for the current response to finish before sending another message.',
        { duration: 5000 }
      )
    })
  }, [setOnConflictQueue, toast])

  // ── Initial load: Fetch sessions, validate restored active session ──
  useEffect(() => {
    let cancelled = false

    fetchSessions().then((data) => {
      if (cancelled) return

      const restoredId = loadActiveSessionId()

      // ── STREAM-SAFE GUARD ──
      // If the restored session is currently streaming, do NOT clear or
      // override the active session. The stream is alive in the ChatContext
      // and the activeSessionId effect already synced state on mount.
      // Any clearance here would briefly set activeSessionRef.current = null,
      // causing token updates to stop reaching React state.
      if (restoredId && isSessionStreaming(restoredId)) {
        console.log('[ChatPage] Initial load: session', restoredId,
          'is currently streaming — preserving without interference')
        initialLoadDoneRef.current = true
        return
      }

      if (!data || data.length === 0) {
        // No sessions at all — clear any stale active session ID
        if (restoredId) {
          console.log('[ChatPage] No sessions available, clearing stale activeSessionId:', restoredId)
          setActiveSessionId(null)
        }
        initialLoadDoneRef.current = true
        return
      }

      if (restoredId) {
        const stillExists = data.some(s => String(s.session_id) === String(restoredId))
        if (stillExists) {
          // Session is valid — explicitly (re-)set it to ensure the useEffect
          // for activeSessionId fires and fetches messages properly.
          initialLoadDoneRef.current = true
          // Re-apply in case React batched the initial state before sessions loaded
          setActiveSessionId(restoredId)
          console.log('[ChatPage] Restored session', restoredId, 'is still valid — re-applied')
          return
        }
        // Restored session no longer exists (was deleted, filtered out, etc.)
        console.log('[ChatPage] Restored session', restoredId,
          'no longer exists — clearing and falling back')
        cleanupSession(restoredId)
      }

      // No valid restored session — show new conversation page
      if (!userHasSelectedRef.current && !initialLoadDoneRef.current) {
        initialLoadDoneRef.current = true
        setActiveSessionId(null)
      }
    })
    fetchTasks(true) // Force initial fetch
    fetchProjects()
    startPolling()

    return () => {
      cancelled = true
      stopPolling()
    }
  }, [])

  // ── Sync activeSessionId → useChat (cache/storage restore + API fetch) ──
  const skipFetchForNewSessionRef = useRef(new Set())

  useEffect(() => {
    if (!activeSessionId) {
      // No active session selected (e.g. user clicked "New Chat").
      // Clear the active session in the chat context. If a stream IS running
      // on a different session, it continues in the background — tokens still
      // accumulate in the cache. When the user switches back to that session,
      // setActiveSession re-syncs React state from the cache.
      setActiveSession(null)
      return
    }

    // Step 1: Instantly restore from in-memory cache (fast, no empty flash)
    setActiveSession(activeSessionId)

    // Step 2: Skip API fetch for brand-new sessions (created from landing page)
    if (skipFetchForNewSessionRef.current.has(activeSessionId)) {
      skipFetchForNewSessionRef.current.delete(activeSessionId)
      console.log('[ChatPage] Skipping fetchMessages for brand-new session:', activeSessionId)
      return
    }

    // Step 3: Skip API fetch if this session is CURRENTLY streaming.
    // Calling fetchMessages while streaming is active risks overwriting
    // in-progress content in the UI with a stale API response.
    // useChat.fetchMessages already handles this via the streamingSessionsRef
    // check (it preserves temp streaming messages), but we add a ChatPage-level
    // guard here for belt-and-suspenders safety.
    if (isSessionStreaming(activeSessionId)) {
      console.log('[ChatPage] Skipping fetchMessages for currently-streaming session:', activeSessionId)
      return
    }

    // Step 4: Attempt stream recovery from Service Worker or localStorage.
    // On page refresh, the SW may still be streaming (or have completed).
    // Recovery injects the accumulated response into the message cache BEFORE
    // fetchMessages runs, so the user sees the response immediately.
    // After recovery, fetchMessages still runs to merge in any API data
    // (e.g. user messages the backend persisted).
    const sid = activeSessionId
    recoverStreamState(sid).then(({ recovered, isActive }) => {
      if (recovered) {
        console.log('[ChatPage] Stream recovery succeeded for session', sid,
          '| isActive:', isActive)
        // If the SW stream is still active, skip fetchMessages entirely
        // (the subscription in recoverStreamState handles live updates).
        if (isActive) return
      }

      // Step 5: Fetch from backend API to ensure UI is synced with server
      return fetchMessages(sid).then((result) => {
        if (result && result.length > 0) {
          fetchedSessionsRef.current.add(sid)
          console.log('[ChatPage] Fetched', result.length, 'messages for session', sid)
        }
      })
    }).catch((err) => {
      console.warn('[ChatPage] Recovery/fetchMessages failed for', sid, ':', err.message, '\u2014 will retry on next switch')
    })
  }, [activeSessionId, setActiveSession, fetchMessages, isSessionStreaming, recoverStreamState])

  useEffect(() => {
    if (sidebarTab === SIDEBAR_TABS.TASKS)    fetchTasks()
    if (sidebarTab === SIDEBAR_TABS.PROJECTS) fetchProjects()
  }, [sidebarTab])

  // ── Task creation detection from SSE tool_calls ──────────────────────────
  // Watches the current messages for completed `schedule_task` tool results.
  // When found, links the task → the assistant message that triggered it
  // so the chat UI can show a "Task Scheduled ✅" badge on the correct message.
  //
  // IMPORTANT: Only NEW messages from the SSE stream should trigger addTask()
  // and toast notifications. Historical messages loaded from the API should
  // only populate the tasksByMessage badge map (no addTask, no toast).
  // This prevents "default" tasks from being re-injected from old chat history.
  const processedTaskToolsRef = useRef(new Set()) // Tracks already-processed tool_use_ids

  // We use `messages` already destructured from useChatContext() above.
  const prevMessagesLenRef = useRef(0)
  // Tracks whether the session's messages have been fully loaded from the API.
  // ALL messages present before the user sends a new prompt are "historical".
  // Only messages that arrive AFTER this flag is set (via SSE stream) should
  // trigger addTask() + toast. This prevents old chat history from creating
  // phantom tasks in the sidebar.
  const sessionStabilizedRef = useRef(false)
  const stabilizeTimerRef = useRef(null)

  // ── Reset historical message tracking when session changes ──
  // When switching sessions, the message list resets. We mark the session
  // as NOT stabilized — all messages arriving in the first ~2 seconds are
  // treated as historical (cache restore + API fetch both land in this window).
  useEffect(() => {
    sessionStabilizedRef.current = false
    prevMessagesLenRef.current = 0
    // Don't clear processedTaskToolsRef — tool_use_ids are globally unique

    // Clear any pending stabilize timer from the previous session
    if (stabilizeTimerRef.current) {
      clearTimeout(stabilizeTimerRef.current)
      stabilizeTimerRef.current = null
    }

    // After a short delay (enough for cache restore + API fetch to land),
    // mark the session as stabilized. Any messages arriving AFTER this
    // point are genuinely new (from the SSE stream).
    if (activeSessionId) {
      stabilizeTimerRef.current = setTimeout(() => {
        sessionStabilizedRef.current = true
        // Snapshot all current message IDs as historical
        console.log('[ChatPage] Session stabilized — future schedule_task results will trigger addTask')
      }, 3000) // 3 seconds covers cache restore + fetchMessages round-trip
    }

    return () => {
      if (stabilizeTimerRef.current) {
        clearTimeout(stabilizeTimerRef.current)
        stabilizeTimerRef.current = null
      }
    }
  }, [activeSessionId])

  useEffect(() => {
    // Only run when message count changes (new messages arrived)
    const currentMsgs = Array.isArray(messages) ? messages : []
    if (currentMsgs.length === prevMessagesLenRef.current) return

    prevMessagesLenRef.current = currentMsgs.length

    currentMsgs.forEach(msg => {
      if (msg.role !== 'assistant' || !msg.tool_calls?.length) return

      msg.tool_calls.forEach(tc => {
        if (tc.tool !== 'schedule_task') return
        if (tc.status !== 'done') return

        const toolKey = tc.tool_use_id || `${msg.message_id}_schedule_task`
        if (processedTaskToolsRef.current.has(toolKey)) return
        processedTaskToolsRef.current.add(toolKey)

        const result = tc.result
        if (!result) return

        // Extract task data from tool result (support multiple shapes)
        const taskData = result.task || result.data || result
        const taskId = taskData?.task_id || taskData?.id
        if (!taskId) return

        const msgId = String(msg.message_id)

        // Always populate the badge map (shows "Task Scheduled ✅" on message)
        setTasksByMessage(prev => ({
          ...prev,
          [msgId]: taskData,
        }))

        // Only trigger addTask + toast for GENUINELY NEW messages from SSE stream.
        // Before the session is stabilized (first ~3s), ALL messages are treated
        // as historical — they came from cache restore or API fetch, not from
        // a live SSE stream. This prevents old schedule_task results from
        // creating phantom tasks in the task list.
        if (sessionStabilizedRef.current) {
          console.log('[ChatPage] Detected NEW schedule_task result — task:', taskId, '| msgId:', msgId)

          // Add task to the tasks list immediately (no re-fetch needed)
          addTask(taskData)

          // Show toast notification about the new task
          toast(
            `Task "${taskData.description || taskId}" has been scheduled ✅`,
            {
              title: 'Task Created',
              type: 'success',
              duration: 6000,
              action: {
                label: 'View Tasks',
                onClick: () => {
                  setSidebarTab(SIDEBAR_TABS.TASKS)
                  setMobileSidebarOpen(false)
                },
              },
            }
          )

          // Refresh task list from API after a short delay.
          // Force=true to bypass throttle since we know a new task was just created.
          setTimeout(() => fetchTasks(true), 3000)
        } else {
          console.log('[ChatPage] Skipping pre-stabilization schedule_task result — task:', taskId, '| msgId:', msgId)
        }
      })
    })
  }, [messages, addTask, fetchTasks, toast])

  // ── Handler: open Tasks panel from chat badge ─────────────────────────────
  const handleViewTasks = useCallback(() => {
    setSidebarTab(SIDEBAR_TABS.TASKS)
    setMobileSidebarOpen(false)
    // If sidebar is collapsed, expand it
    setSidebarCollapsed(false)
  }, [])

  const handleNewChat = useCallback(() => {
    userHasSelectedRef.current = true
    setActiveSessionId(null)
    setSidebarTab(SIDEBAR_TABS.CHATS)
    setMobileSidebarOpen(false)
  }, [])

  const handleSelectSession = useCallback((sessionId) => {
    userHasSelectedRef.current = true
    setActiveSessionId(sessionId)
    markSessionAsRead(sessionId)
    setMobileSidebarOpen(false)
  }, [markSessionAsRead])

  const handleDeleteSession = useCallback(async (sessionId) => {
    try {
      cleanupSession(sessionId)
    } catch (err) {
      console.warn('[ChatPage] cleanupSession error (non-fatal):', err.message)
    }
    fetchedSessionsRef.current.delete(sessionId)
    await deleteSession(sessionId)
    if (String(activeSessionId) === String(sessionId)) {
      const remaining = sessions.filter(s => String(s.session_id) !== String(sessionId))
      if (remaining.length > 0) {
        setActiveSessionId(remaining[0].session_id)
      } else {
        setActiveSessionId(null)
      }
    }
  }, [activeSessionId, sessions, deleteSession, cleanupSession])

  const handleSendMessage = useCallback((content, images = []) => {
    if (!activeSessionId) {
      // ── Guard: prevent duplicate session creation on rapid double-submit
      //    (e.g. user taps Enter twice, or React StrictMode double-invoke)
      if (isCreatingSessionRef.current) {
        console.log('[ChatPage] Session creation already in progress — ignoring duplicate send')
        return
      }

      isCreatingSessionRef.current = true

      createSession()
        .then((session) => {
          const sid = session.session_id
          fetchedSessionsRef.current.add(sid)
          userHasSelectedRef.current = true

          // ✅ FIX 1: Populate skipFetchForNewSessionRef BEFORE calling
          //    setActiveSessionId so the useEffect (which is synchronous
          //    relative to the ref write) always sees the skip flag set.
          //    This prevents fetchMessages from firing for a brand-new session
          //    that has no history to fetch.
          skipFetchForNewSessionRef.current.add(sid)

          // ✅ FIX 2: Call setActiveSessionId THEN sendMessage directly —
          //    NO setTimeout wrapper.
          //
          //    The original code wrapped sendMessage in setTimeout(..., 100)
          //    to "wait for the session to be active". But this caused a race:
          //      - setActiveSessionId triggers the activeSessionId useEffect
          //      - the effect calls fetchMessages (for new empty session)
          //      - 100ms later sendMessage fires a second POST
          //    Both requests arrive at the backend nearly simultaneously.
          //
          //    The fix: sendMessage fires directly after setActiveSessionId.
          //    useChat.sendMessage's own isSendingRef guard (now set atomically
          //    at entry) ensures no duplicate can slip through.
          //    setActiveSession (in useChat) uses the session ID directly —
          //    no async state is needed before sendMessage can run safely.
          setActiveSessionId(sid)
          sendMessage(sid, content, (title) => {
            updateSessionTitle(sid, title)
          }, images)
        })
        .catch((err) => {
          console.error('[ChatPage] Failed to create session:', err)
          // Show a user-facing toast so the user knows the message was NOT sent
          toast.error(
            'Failed to start a new conversation. Please try again.',
            { duration: 5000 }
          )
        })
        .finally(() => {
          isCreatingSessionRef.current = false
        })
      return
    }

    fetchedSessionsRef.current.add(activeSessionId)
    touchSession(activeSessionId)

    sendMessage(activeSessionId, content, (title) => {
      updateSessionTitle(activeSessionId, title)
    }, images)
  }, [activeSessionId, sendMessage, createSession, updateSessionTitle, touchSession])

  const handleCancelStream = useCallback(() => {
    if (activeSessionId) {
      cancelStream(activeSessionId)
    }
  }, [activeSessionId, cancelStream])

  const handleLogout = useCallback(async () => {
    // Clean up empty sessions before logout
    try {
      await deleteEmptySessions()
      console.log('[ChatPage] Empty sessions cleaned up before logout')
    } catch (err) {
      console.warn('[ChatPage] Failed to clean up empty sessions:', err.message)
    }

    // Clear sessionStorage on logout so stale session ID doesn't persist
    try { sessionStorage.removeItem(SESSION_STORAGE_KEY) } catch (_) {}

    logout()
    navigate('/login', { replace: true })
  }, [logout, navigate, deleteEmptySessions])

  const activeSession = sessions.find(s => String(s.session_id) === String(activeSessionId))
  const [mockMode, setMockMode] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMockMode(isMockMode()), 800)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="chat-page">
      {mobileSidebarOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        sidebarTab={sidebarTab}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        tasks={tasks}
        tasksLoading={tasksLoading}
        tasksError={tasksError}
        projects={projects}
        user={user}
        sessionsLoading={sessionsLoading}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onTabChange={setSidebarTab}
        onToggleCollapse={() => setSidebarCollapsed(v => !v)}
        onLogout={handleLogout}
        onCancelTask={cancelTask}
        onDownloadTask={downloadTaskFile}
        onDownloadProject={downloadProject}
        onRefreshTasks={fetchTasks}
        onRefreshProjects={fetchProjects}
        isSessionStreaming={isSessionStreaming}
        unreadSessionIds={unreadSessionIds}
        onMarkSessionRead={markSessionAsRead}
      />

      <main className={`chat-main ${sidebarCollapsed ? 'chat-main-expanded' : ''}`}>
        {mockMode && <MockModeBanner />}

        <div className="mobile-topbar">
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <span className="mobile-title">
            {activeSession?.title || 'Zenith'}
          </span>
          <div style={{ width: 36 }} />
        </div>

        <ChatArea
          messages={messages}
          isStreaming={isStreaming}
          error={chatError}
          session={activeSession}
          agentEvents={agentEvents}
          artifacts={artifacts}
          onSendMessage={handleSendMessage}
          onCancelStream={handleCancelStream}
          onClearError={() => setChatError(null)}
          user={user}
          tasksByMessage={tasksByMessage}
          onViewTasks={handleViewTasks}
        />
      </main>

      {/* Toast notifications portal */}
      <ToastPortal />
    </div>
  )
}
