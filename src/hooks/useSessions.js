import { useState, useCallback, useRef } from 'react'
import { apiFetch } from '../utils/api.js'
import { getLoginTimestamp } from '../context/AuthContext.jsx'

/**
 * Check if a session has any messages cached in memory.
 * Uses the in-memory cache ref passed from the hook.
 */
function sessionHasMessages(sessionId, messageCacheRef) {
  const cached = messageCacheRef.current[sessionId]
  return Array.isArray(cached) && cached.length > 0
}

/**
 * Determine if a session is "empty" — no messages ever sent.
 * A session is considered empty when ALL of these are true:
 *   1. It has no messages in memory cache
 *   2. Its title is still the default ("New conversation" or blank)
 *   3. It was NOT created in the current browser tab session
 *
 * Additionally, if the session was created BEFORE the current login
 * (i.e., created in a previous browser session and never got messages),
 * it should also be treated as empty and hidden.
 */
function isSessionEmpty(session, currentSessionCreatedIds, messageCacheRef) {
  const sid = session.session_id

  // Always keep sessions created in this browser tab (user may still be typing)
  if (currentSessionCreatedIds.has(String(sid))) return false

  // Keep sessions that have messages in memory cache
  if (sessionHasMessages(sid, messageCacheRef)) return false

  // Keep sessions with a non-default title (messages were exchanged at some point)
  const title = (session.title || '').trim().toLowerCase()
  if (title && title !== 'new conversation') return false

  // ── Check if this session was created before the current login ──
  // Sessions created before the last login with no messages are stale empty sessions
  // that the user left behind — they should be hidden on re-login.
  const loginTs = getLoginTimestamp()
  if (loginTs) {
    const sessionCreatedAt = session.created_at ? new Date(session.created_at).getTime() : 0
    const loginTime        = new Date(loginTs).getTime()
    if (sessionCreatedAt < loginTime) {
      // Session predates current login → it's a leftover empty session → hide it
      console.log('[useSessions] Hiding pre-login empty session:', sid,
        '| created:', session.created_at, '| login:', loginTs)
      return true
    }
  }

  // Session is empty with default title and not created this tab session → hide
  return true
}

export function useSessions() {
  // Start with empty state — sessions will be fetched from API
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  // Track session IDs created during this browser session (in-memory only).
  // These are exempt from "empty session" filtering so the user can still
  // type into a freshly created conversation.
  const currentSessionCreatedIds = useRef(new Set())

  // In-memory cache for message counts (used to check if sessions have messages)
  const messageCacheRef = useRef({})

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch('/api/sessions')
      // Backend may return { sessions: [...] } or plain array — normalize
      const list = Array.isArray(data) ? data : (data?.sessions ?? data?.data ?? [])
      const normalized = Array.isArray(list) ? list : []

      // ── Filter out empty conversations ──
      // Uses isSessionEmpty() which checks:
      //   • Not created in this browser tab
      //   • No messages in memory cache
      //   • Default title ("New conversation")
      //   • Created before the current login (post-logout stale sessions)
      const filtered = normalized.filter(session => {
        const empty = isSessionEmpty(session, currentSessionCreatedIds.current, messageCacheRef)
        if (empty) {
          console.log('[useSessions] Filtering out empty session:', session.session_id,
            'title:', session.title, 'created:', session.created_at)
        }
        return !empty
      })

      console.log('[useSessions] fetchSessions raw:', data,
        '→ normalized:', normalized.length, 'sessions',
        '→ after empty filter:', filtered.length, 'sessions')
      setSessions(filtered)
      return filtered
    } catch (err) {
      setError(err.message)
      setSessions([])
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  const createSession = useCallback(async (title = 'New conversation') => {
    const session = await apiFetch('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ title }),
    })

    // Guard: backend must return a valid session object with a session_id.
    // apiFetch can return null on 204 / empty-body responses — fail fast here
    // so callers get a clear error instead of a confusing TypeError downstream.
    if (!session || typeof session !== 'object') {
      throw new Error(
        'Server returned an empty response when creating a session. ' +
        'Expected a session object with a session_id.'
      )
    }
    if (session.session_id == null) {
      throw new Error(
        'Server response is missing session_id. Got: ' + JSON.stringify(session)
      )
    }

    // Track this session as created in the current browser session
    currentSessionCreatedIds.current.add(String(session.session_id))
    setSessions(prev => {
      const next = [session, ...prev]
      return next
    })
    return session
  }, [])

  const deleteSession = useCallback(async (sessionId) => {
    // Remove from current-session tracking
    currentSessionCreatedIds.current.delete(String(sessionId))
    // Optimistically remove from UI immediately
    setSessions(prev => {
      const next = prev.filter(s => s.session_id !== sessionId)
      return next
    })
    try {
      await apiFetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
    } catch (err) {
      console.error('[useSessions] deleteSession error:', err.message)
      try { await fetchSessions() } catch { /* ignore refetch failure */ }
    }
  }, [fetchSessions])

  /**
   * Delete all empty sessions (no messages) from the backend.
   * Called during logout to clean up conversations the user created
   * but never sent any messages in.
   */
  const deleteEmptySessions = useCallback(async () => {
    // Use the current sessions list from state
    let currentSessions = []
    setSessions(prev => { currentSessions = prev; return prev })
    
    const emptySessionIds = currentSessions.filter(session => {
      const sid = session.session_id
      // Check if this session has any messages in memory cache
      if (sessionHasMessages(sid, messageCacheRef)) return false
      // Check if the title is still the default (no messages were ever sent)
      const title = (session.title || '').trim().toLowerCase()
      if (title && title !== 'new conversation') return false
      // This is an empty session — mark for deletion
      return true
    }).map(s => s.session_id)

    if (emptySessionIds.length === 0) {
      console.log('[useSessions] deleteEmptySessions: no empty sessions to clean up')
      return
    }

    console.log('[useSessions] deleteEmptySessions: cleaning up', emptySessionIds.length, 'empty sessions:', emptySessionIds)

    // Delete each empty session from the backend (fire-and-forget, don't block logout)
    const deletePromises = emptySessionIds.map(sessionId =>
      apiFetch(`/api/sessions/${sessionId}`, { method: 'DELETE' }).catch(err => {
        console.warn('[useSessions] Failed to delete empty session', sessionId, ':', err.message)
      })
    )

    // Also remove them from local state immediately
    setSessions(prev => {
      const emptySet = new Set(emptySessionIds.map(String))
      const next = prev.filter(s => !emptySet.has(String(s.session_id)))
      return next
    })

    // Wait for all deletions (with a timeout so we don't block logout forever)
    try {
      await Promise.race([
        Promise.allSettled(deletePromises),
        new Promise(resolve => setTimeout(resolve, 3000)) // 3s timeout
      ])
    } catch {
      // Ignore errors — best-effort cleanup
    }
  }, [])

  const updateSessionTitle = useCallback((sessionId, title) => {
    setSessions(prev => {
      const next = prev.map(s => s.session_id === sessionId
        ? { ...s, title, updated_at: new Date().toISOString() }
        : s
      )
      return next
    })
  }, [])

  /** Bump updated_at to now — call this whenever a message is sent to a session */
  const touchSession = useCallback((sessionId) => {
    setSessions(prev => {
      const next = prev.map(s => s.session_id === sessionId
        ? { ...s, updated_at: new Date().toISOString() }
        : s
      )
      return next
    })
  }, [])

  return {
    sessions,
    loading,
    error,
    fetchSessions,
    createSession,
    deleteSession,
    deleteEmptySessions,
    updateSessionTitle,
    touchSession,
  }
}
