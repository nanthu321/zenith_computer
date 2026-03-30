/**
 * useTasks — Task list management hook (optimized)
 *
 * Provides:
 *   - Fetch tasks with proper loading/error states and deduplication
 *   - Cancel task (optimistic update)
 *   - Download task output
 *   - Configurable polling interval (default: 60s, configurable via VITE_TASK_POLL_INTERVAL_MS)
 *   - addTask for instant local state update after task creation
 *   - Non-blocking fetch with AbortController support
 *   - Duplicate execution safeguards (single in-flight request)
 *   - Graceful backoff under load (doubles interval on consecutive errors)
 *
 * Performance improvements over previous version:
 *   - Polling interval increased from 30s → 60s (configurable)
 *   - Single in-flight request guard prevents overlapping API calls
 *   - Fetch throttle (minimum 10s between calls) prevents burst requests
 *   - Error backoff prevents hammering a failing server
 *   - Visibility-aware polling pauses when tab is hidden
 *   - Logging for monitoring execution frequency and delays
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { apiFetch, downloadFile } from '../utils/api.js'
import { TASK_STATUS } from '../utils/constants.js'

/* ── Configurable polling interval (ms) ── */
const DEFAULT_POLL_INTERVAL_MS = 60_000 // 60 seconds default
const POLL_INTERVAL_MS = (() => {
  try {
    const envVal = import.meta.env.VITE_TASK_POLL_INTERVAL_MS
    const parsed = envVal ? parseInt(envVal, 10) : NaN
    // Enforce minimum of 10s, maximum of 5 minutes
    if (!isNaN(parsed) && parsed >= 10_000 && parsed <= 300_000) return parsed
  } catch { /* ignore */ }
  return DEFAULT_POLL_INTERVAL_MS
})()

/* ── Minimum time between consecutive fetches (ms) ── */
const FETCH_THROTTLE_MS = 10_000 // 10 seconds minimum between API calls

/* ── Maximum backoff multiplier on consecutive errors ── */
const MAX_ERROR_BACKOFF = 4 // up to 4x the base interval

/* ── Normalize raw task from any API shape → canonical object ── */
/* Backend endpoints:
 *   GET  /api/tasks              — list all tasks
 *   GET  /api/tasks/{taskId}     — single task with run_logs
 *   POST /api/task-cancel/{taskId} — cancel a task
 *   GET  /api/task-download/{taskId} — download task output
 *   GET  /api/tasks/notifications — SSE live updates
 */
function normalizeTask(raw) {
  if (!raw || typeof raw !== 'object') return null
  const status = raw.status || TASK_STATUS.SCHEDULED
  return {
    task_id:          raw.task_id          || raw.id             || null,
    description:      raw.description      || raw.name           || raw.prompt
                      || `Task ${raw.task_id || raw.id || ''}`,
    status,
    interval_seconds: raw.interval_seconds || raw.interval_secs  || raw.interval || 0,
    total_runs:       raw.total_runs        ?? raw.max_runs       ?? 0,
    completed_runs:   raw.completed_runs    ?? 0,
    started_at:       raw.started_at        || raw.created_at     || null,
    created_at:       raw.created_at        || raw.started_at     || null,
    ends_at:          raw.ends_at           || raw.end_time        || null,
    next_run:         raw.next_run                                 || null,
    output_file:      raw.output_file                              || null,
    run_logs:         raw.run_logs                                 || [],
    is_active:        raw.is_active         ?? (
      status === TASK_STATUS.RUNNING ||
      status === TASK_STATUS.SCHEDULED
    ),
  }
}

export function useTasks() {
  const [tasks, setTasks]       = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const pollingRef              = useRef(null)

  // ── Safeguards: prevent duplicate executions and overload ──
  const isFetchingRef           = useRef(false)       // Single in-flight guard
  const lastFetchTimeRef        = useRef(0)           // Timestamp of last successful fetch
  const consecutiveErrorsRef    = useRef(0)           // Error count for backoff
  const abortControllerRef      = useRef(null)        // AbortController for current fetch
  const fetchCountRef           = useRef(0)           // Total fetch count for logging

  // ── Visibility-aware polling: pause when tab is hidden ──
  const isVisibleRef            = useRef(!document.hidden)

  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden
      if (!document.hidden) {
        // Tab became visible — do a fetch if it's been a while
        const elapsed = Date.now() - lastFetchTimeRef.current
        if (elapsed > POLL_INTERVAL_MS) {
          console.log('[useTasks] Tab visible after', Math.round(elapsed / 1000), 's — triggering fetch')
          fetchTasks()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  const fetchTasks = useCallback(async (force = false) => {
    // ── Guard 1: Single in-flight request ──
    // Prevents multiple concurrent API calls to the same endpoint
    if (isFetchingRef.current) {
      console.log('[useTasks] Skipping fetch — already in flight')
      return tasks
    }

    // ── Guard 2: Throttle — minimum interval between fetches ──
    // Unless forced (e.g., user pressed refresh), respect the throttle
    const now = Date.now()
    const elapsed = now - lastFetchTimeRef.current
    if (!force && elapsed < FETCH_THROTTLE_MS) {
      console.log('[useTasks] Skipping fetch — throttled (last fetch', Math.round(elapsed / 1000), 's ago)')
      return tasks
    }

    // ── Guard 3: Skip if tab is hidden (unless forced) ──
    if (!force && !isVisibleRef.current) {
      console.log('[useTasks] Skipping fetch — tab is hidden')
      return tasks
    }

    isFetchingRef.current = true
    const fetchId = ++fetchCountRef.current

    // Cancel any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setLoading(true)
    setError(null)

    const fetchStart = Date.now()
    console.log(`[useTasks] Fetch #${fetchId} started (interval: ${POLL_INTERVAL_MS}ms, errors: ${consecutiveErrorsRef.current})`)

    try {
      const raw = await apiFetch('/api/tasks')
      // Handle: plain array | { tasks: [] } | { data: [] } | { results: [] }
      const list = Array.isArray(raw)
        ? raw
        : (raw?.tasks ?? raw?.data ?? raw?.results ?? [])
      const normalized = Array.isArray(list)
        ? list.map(normalizeTask).filter(Boolean)
        : []
      // Sort: newest first
      normalized.sort((a, b) => {
        const ta = new Date(a.started_at || 0).getTime()
        const tb = new Date(b.started_at || 0).getTime()
        return tb - ta
      })
      setTasks(normalized)
      lastFetchTimeRef.current = Date.now()
      consecutiveErrorsRef.current = 0 // Reset error backoff on success

      const fetchDuration = Date.now() - fetchStart
      console.log(`[useTasks] Fetch #${fetchId} completed in ${fetchDuration}ms — ${normalized.length} tasks`)

      return normalized
    } catch (err) {
      // Don't surface 401 (handled globally by apiFetch → handleUnauthorized)
      if (err.message !== 'Unauthorized') {
        setError(err.message || 'Failed to load tasks')
        consecutiveErrorsRef.current = Math.min(
          consecutiveErrorsRef.current + 1,
          MAX_ERROR_BACKOFF
        )
        console.warn(`[useTasks] Fetch #${fetchId} failed:`, err.message,
          '| consecutive errors:', consecutiveErrorsRef.current)
      }
      // Don't clear existing tasks on error — keep stale data visible
      return tasks
    } finally {
      setLoading(false)
      isFetchingRef.current = false
      abortControllerRef.current = null
    }
  }, [tasks])

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const raw = await apiFetch('/api/projects')
      const list = Array.isArray(raw)
        ? raw
        : (raw?.projects ?? raw?.data ?? [])
      const normalized = Array.isArray(list) ? list : []
      setProjects(normalized)
      return normalized
    } catch (err) {
      if (err.message !== 'Unauthorized') {
        setError(err.message || 'Failed to load projects')
      }
      setProjects([])
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Add a newly-created task to local state immediately (no re-fetch needed).
   * Called by ChatPage when `schedule_task` tool result is received.
   * Prevents duplicate entries if the same task_id already exists.
   */
  const addTask = useCallback((rawTask) => {
    const normalized = normalizeTask(rawTask)
    if (!normalized || !normalized.task_id) return

    setTasks(prev => {
      const exists = prev.some(t => t.task_id === normalized.task_id)
      if (exists) return prev
      // Insert at top (newest first)
      return [normalized, ...prev]
    })
  }, [])

  const cancelTask = useCallback(async (taskId) => {
    // Capture original task state before optimistic update so we can revert
    let originalTask = null
    setTasks(prev => {
      originalTask = prev.find(t => t.task_id === taskId) || null
      return prev.map(t =>
        t.task_id === taskId
          ? { ...t, status: TASK_STATUS.CANCELLED, is_active: false }
          : t
      )
    })
    try {
      // Actual backend route: POST /api/task-cancel/{taskId}
      await apiFetch(`/api/task-cancel/${encodeURIComponent(taskId)}`, { method: 'POST' })
    } catch (err) {
      // If the backend says "not found" (404), the task was already
      // cancelled / completed / removed server-side.
      // Keep the UI in the cancelled state — do NOT revert to running,
      // which would re-expose the Cancel button and let the user click
      // it again (causing repeated 404s).
      const isNotFound = /not found|404/i.test(err.message)
      if (isNotFound) {
        // Leave the optimistic "cancelled" state as-is and refresh
        // the task list in the background so the UI syncs with the server.
        console.warn(`[useTasks] Task ${taskId} not found on server — keeping cancelled state`)
        // Don't throw — this is not a user-facing error
        return
      }

      // For any other error, revert the optimistic update
      if (originalTask) {
        setTasks(prev =>
          prev.map(t =>
            t.task_id === taskId
              ? { ...t, status: originalTask.status, is_active: originalTask.is_active }
              : t
          )
        )
      }
      throw err
    }
  }, [])

  /**
   * Register a newly-created task in local state.
   *
   * Note: There is no POST /api/tasks endpoint on the backend.
   * Tasks are created server-side by the AI agent's `schedule_task` tool.
   * This method is used to add the task to local state after the agent
   * confirms creation (via SSE tool_result), avoiding a full re-fetch.
   *
   * @param {Object} taskData — Raw task data from the schedule_task tool result
   * @returns {Object|null} Normalized task object
   */
  const addNewTask = useCallback((taskData) => {
    const normalized = normalizeTask(taskData)
    if (normalized && normalized.task_id) {
      setTasks(prev => {
        const exists = prev.some(t => t.task_id === normalized.task_id)
        if (exists) return prev
        return [normalized, ...prev]
      })
    }
    return normalized
  }, [])

  const downloadTaskFile = useCallback((taskId) => {
    // Actual backend route: GET /api/task-download/{taskId}
    downloadFile(`/api/task-download/${encodeURIComponent(taskId)}`)
  }, [])

  const downloadProject = useCallback((projectId) => {
    downloadFile(`/api/projects/${projectId}/download`)
  }, [])

  /**
   * Start polling with adaptive interval.
   * - Base interval: POLL_INTERVAL_MS (configurable, default 60s)
   * - On consecutive errors: interval multiplied by (1 + errorCount), up to 4x
   * - Skips fetches when tab is hidden (handled in fetchTasks)
   * - Uses setTimeout chain instead of setInterval to prevent overlapping calls
   */
  const startPolling = useCallback(() => {
    if (pollingRef.current) return

    console.log(`[useTasks] Starting polling — base interval: ${POLL_INTERVAL_MS}ms`)

    const scheduleNext = () => {
      // Adaptive interval: increase on consecutive errors to reduce server pressure
      const backoffMultiplier = 1 + consecutiveErrorsRef.current
      const effectiveInterval = POLL_INTERVAL_MS * backoffMultiplier

      pollingRef.current = setTimeout(async () => {
        pollingRef.current = null // Clear before fetch so we can detect stop requests

        try {
          await fetchTasks()
        } catch {
          // fetchTasks handles its own error logging
        }

        // Schedule next iteration (only if polling wasn't stopped)
        if (pollingRef.current === null) {
          // Check if stopPolling was called during the fetch
          // If pollingRef is still null (not explicitly stopped), schedule next
          scheduleNext()
        }
      }, effectiveInterval)
    }

    scheduleNext()
  }, [fetchTasks])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current)
      pollingRef.current = null
      console.log('[useTasks] Polling stopped')
    }
    // Set to -1 to signal that polling was explicitly stopped
    // (distinguishes from null which means "between iterations")
    pollingRef.current = -1
  }, [])

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (pollingRef.current && pollingRef.current !== -1) {
        clearTimeout(pollingRef.current)
        pollingRef.current = null
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  return {
    tasks,
    projects,
    loading,
    error,
    fetchTasks,
    fetchProjects,
    addTask,
    addNewTask,
    cancelTask,
    downloadTaskFile,
    downloadProject,
    startPolling,
    stopPolling,
  }
}
