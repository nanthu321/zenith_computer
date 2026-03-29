import { useState, useCallback, useEffect } from 'react'
import { getPreference, setPreference } from '../utils/preferences.js'

/**
 * useNotifications — Notification state management with server-backed persistence.
 *
 * Each notification:
 *   { id, type, title, message, sessionId?, timestamp, read }
 *
 * Types: 'chat' | 'task' | 'system'
 *
 * Read state persists across sessions via server preferences API.
 */

const PREF_NOTIFICATIONS_KEY = 'zenith_notifications'
const PREF_READ_IDS_KEY = 'zenith_read_notification_ids'
const MAX_NOTIFICATIONS = 50

function loadNotifications() {
  try {
    const data = getPreference(PREF_NOTIFICATIONS_KEY, [])
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function loadReadIds() {
  try {
    const data = getPreference(PREF_READ_IDS_KEY, [])
    return Array.isArray(data) ? new Set(data) : new Set()
  } catch {
    return new Set()
  }
}

function saveNotifications(notifications) {
  setPreference(PREF_NOTIFICATIONS_KEY, notifications.slice(0, MAX_NOTIFICATIONS))
}

function saveReadIds(readIds) {
  setPreference(PREF_READ_IDS_KEY, [...readIds])
}

let _notifCounter = Date.now()

export function useNotifications() {
  const [notifications, setNotifications] = useState(() => loadNotifications())
  const [readIds, setReadIds] = useState(() => loadReadIds())
  const [panelOpen, setPanelOpen] = useState(false)

  // Persist whenever notifications change
  useEffect(() => {
    saveNotifications(notifications)
  }, [notifications])

  useEffect(() => {
    saveReadIds(readIds)
  }, [readIds])

  // ── Derived state ──
  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length

  // ── Add a new notification ──
  const addNotification = useCallback(({ type = 'system', title, message, sessionId = null }) => {
    const id = `notif_${++_notifCounter}`
    const notif = {
      id,
      type,
      title,
      message,
      sessionId,
      timestamp: new Date().toISOString(),
      read: false,
    }
    setNotifications(prev => [notif, ...prev].slice(0, MAX_NOTIFICATIONS))
    return id
  }, [])

  // ── Mark a single notification as read ──
  const markAsRead = useCallback((notifId) => {
    setReadIds(prev => {
      const next = new Set(prev)
      next.add(notifId)
      return next
    })
  }, [])

  // ── Mark ALL notifications as read ──
  const markAllAsRead = useCallback(() => {
    setReadIds(prev => {
      const next = new Set(prev)
      notifications.forEach(n => next.add(n.id))
      return next
    })
  }, [notifications])

  // ── Remove a single notification ──
  const removeNotification = useCallback((notifId) => {
    setNotifications(prev => prev.filter(n => n.id !== notifId))
  }, [])

  // ── Clear all notifications ──
  const clearAll = useCallback(() => {
    setNotifications([])
    setReadIds(new Set())
  }, [])

  // ── Check if a specific session has any unread notification ──
  const hasUnreadForSession = useCallback((sessionId) => {
    return notifications.some(n => n.sessionId === sessionId && !readIds.has(n.id))
  }, [notifications, readIds])

  // ── Mark all notifications for a specific session as read ──
  const markSessionAsRead = useCallback((sessionId) => {
    setReadIds(prev => {
      const next = new Set(prev)
      notifications
        .filter(n => n.sessionId === sessionId)
        .forEach(n => next.add(n.id))
      return next
    })
  }, [notifications])

  // ── Toggle panel ──
  const togglePanel = useCallback(() => {
    setPanelOpen(prev => !prev)
  }, [])

  const closePanel = useCallback(() => {
    setPanelOpen(false)
  }, [])

  return {
    notifications,
    unreadCount,
    panelOpen,
    addNotification,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
    hasUnreadForSession,
    markSessionAsRead,
    togglePanel,
    closePanel,
    readIds,
  }
}


/* ═══════════════════════════════════════════════════════════════
   useUnreadSessions — lightweight unread-session tracking
   Tracks which session IDs have unseen messages (Set<string>).
   Persisted via server preferences API.
   ═══════════════════════════════════════════════════════════════ */

const PREF_UNREAD_SESSIONS_KEY = 'zenith_unread_sessions'

function loadUnreadSessions() {
  try {
    const data = getPreference(PREF_UNREAD_SESSIONS_KEY, [])
    return Array.isArray(data) ? new Set(data) : new Set()
  } catch {
    return new Set()
  }
}

function saveUnreadSessions(ids) {
  setPreference(PREF_UNREAD_SESSIONS_KEY, [...ids])
}

export function useUnreadSessions() {
  const [unreadSessionIds, setUnreadSessionIds] = useState(() => loadUnreadSessions())

  // Persist whenever the set changes
  useEffect(() => {
    saveUnreadSessions(unreadSessionIds)
  }, [unreadSessionIds])

  /** Mark a single session as having unread content */
  const addUnreadSession = useCallback((sessionId) => {
    setUnreadSessionIds(prev => {
      if (prev.has(sessionId)) return prev
      const next = new Set(prev)
      next.add(sessionId)
      return next
    })
  }, [])

  /** Mark a session as read (remove from unread set) */
  const markSessionAsRead = useCallback((sessionId) => {
    setUnreadSessionIds(prev => {
      if (!prev.has(sessionId)) return prev
      const next = new Set(prev)
      next.delete(sessionId)
      return next
    })
  }, [])

  /** Mark all sessions as read */
  const markAllSessionsRead = useCallback(() => {
    setUnreadSessionIds(new Set())
  }, [])

  return {
    unreadSessionIds,
    addUnreadSession,
    markSessionAsRead,
    markAllSessionsRead,
  }
}
