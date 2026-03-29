import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { getPreference, setPreference, isPreferencesLoaded } from '../utils/preferences.js'
import { AuthContext } from './AuthContext.jsx'

/**
 * ProjectStatusContext — Centralized real-time project status tracking.
 *
 * Status lifecycle per project:
 *   'creating'   → Project creation tool just started (create_project SSE event)
 *   'generating' → Files are being generated / written
 *   'completed'  → Generation finished (tool_result received with success)
 *   'viewed'     → User has clicked/viewed the project (indicator dismissed)
 *   null         → No active status (clean state)
 *
 * Each project entry:
 *   {
 *     status: 'creating' | 'generating' | 'completed' | 'viewed' | null,
 *     projectName: string,
 *     messageId: string | null,     // The chat message this project is associated with
 *     sessionId: string | null,     // The chat session this project belongs to
 *     updatedAt: number (Date.now()),
 *     filesCreated: number,
 *   }
 *
 * Persistence: 'completed' (unviewed) projects persist in preferences so the
 *   red dot survives page refresh. Active statuses (creating/generating) are
 *   ephemeral (lost on refresh, which is correct — those streams are gone).
 */

const PREF_KEY = 'zenith_project_statuses'

const ProjectStatusContext = createContext(null)

function loadPersistedStatuses() {
  try {
    const data = getPreference(PREF_KEY, {})
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      // Only keep 'completed' entries (creating/generating are ephemeral)
      const filtered = {}
      for (const [key, val] of Object.entries(data)) {
        if (val && val.status === 'completed') {
          filtered[key] = val
        }
      }
      return filtered
    }
    return {}
  } catch {
    return {}
  }
}

function persistStatuses(statuses) {
  // Only persist 'completed' entries
  const toSave = {}
  for (const [key, val] of Object.entries(statuses)) {
    if (val && val.status === 'completed') {
      toSave[key] = val
    }
  }
  setPreference(PREF_KEY, toSave)
}

export function ProjectStatusProvider({ children }) {
  // Access auth state — only persist to server when user is logged in
  const auth = useContext(AuthContext)

  // Map of projectName → status entry
  const [statuses, setStatuses] = useState(() => loadPersistedStatuses())
  const statusesRef = useRef(statuses)

  // Keep ref in sync
  useEffect(() => {
    statusesRef.current = statuses
  }, [statuses])

  // Persist completed statuses — only when user is authenticated
  // to avoid 401 errors from the preferences API
  useEffect(() => {
    if (!auth?.token) return
    if (!isPreferencesLoaded()) return
    persistStatuses(statuses)
  }, [statuses, auth?.token])

  /**
   * Set/update a project's status.
   */
  const setProjectStatus = useCallback((projectName, status, meta = {}) => {
    if (!projectName) return
    const key = projectName.toLowerCase()
    setStatuses(prev => ({
      ...prev,
      [key]: {
        status,
        projectName,
        messageId: meta.messageId || prev[key]?.messageId || null,
        sessionId: meta.sessionId || prev[key]?.sessionId || null,
        updatedAt: Date.now(),
        filesCreated: meta.filesCreated ?? prev[key]?.filesCreated ?? 0,
      },
    }))
  }, [])

  /**
   * Mark a project as viewed (dismiss indicator).
   */
  const markProjectViewed = useCallback((projectName) => {
    if (!projectName) return
    const key = projectName.toLowerCase()
    setStatuses(prev => {
      const entry = prev[key]
      if (!entry) return prev
      // Remove the entry entirely once viewed
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  /**
   * Get a project's current status entry.
   */
  const getProjectStatus = useCallback((projectName) => {
    if (!projectName) return null
    const key = projectName.toLowerCase()
    return statusesRef.current[key] || null
  }, [])

  /**
   * Get status for a specific chat message (by messageId).
   * Returns an array of project statuses associated with that message.
   */
  const getStatusesByMessage = useCallback((messageId) => {
    if (!messageId) return []
    return Object.values(statusesRef.current).filter(
      s => s.messageId === messageId
    )
  }, [])

  /**
   * Get statuses for a specific session.
   */
  const getStatusesBySession = useCallback((sessionId) => {
    if (!sessionId) return []
    return Object.values(statusesRef.current).filter(
      s => s.sessionId === sessionId
    )
  }, [])

  /**
   * Get count of unviewed completed projects.
   */
  const unviewedCount = Object.values(statuses).filter(
    s => s.status === 'completed'
  ).length

  /**
   * Check if any project is currently generating.
   */
  const hasActiveGeneration = Object.values(statuses).some(
    s => s.status === 'creating' || s.status === 'generating'
  )

  /**
   * Clear all statuses (e.g. on logout).
   */
  const clearAll = useCallback(() => {
    setStatuses({})
  }, [])

  return (
    <ProjectStatusContext.Provider value={{
      statuses,
      setProjectStatus,
      markProjectViewed,
      getProjectStatus,
      getStatusesByMessage,
      getStatusesBySession,
      unviewedCount,
      hasActiveGeneration,
      clearAll,
    }}>
      {children}
    </ProjectStatusContext.Provider>
  )
}

export function useProjectStatus() {
  const ctx = useContext(ProjectStatusContext)
  if (!ctx) {
    throw new Error('useProjectStatus must be used within a ProjectStatusProvider')
  }
  return ctx
}

export default ProjectStatusContext
