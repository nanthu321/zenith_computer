/**
 * TasksContext
 *
 * Global context for task scheduling state.
 * Provides:
 *   - tasks list (fetched from /api/tasks)
 *   - loading / error states
 *   - task creation notification (per-message task badges)
 *   - methods: fetchTasks, addTaskFromResponse, clearTaskForMessage
 *
 * Usage:
 *   const { tasks, loading, error, tasksByMessage, fetchTasks, addTaskFromResponse } = useTasksContext()
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react'
import { apiFetch } from '../utils/api.js'
import { TASK_STATUS } from '../utils/constants.js'

const TasksContext = createContext(null)

export function TasksProvider({ children }) {
  const [tasks, setTasks]           = useState([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  // Map: messageId → task object (for chat-level task badge indicators)
  const [tasksByMessage, setTasksByMessage] = useState({})
  // Track last successful fetch timestamp to avoid rapid re-fetching
  const lastFetchRef = useRef(0)
  // ── Guard: prevent concurrent fetches ──
  const isFetchingRef = useRef(false)

  // ── Normalize a raw API task object → canonical shape ──────────────────
  const normalizeTask = (raw) => {
    if (!raw || typeof raw !== 'object') return null
    return {
      task_id:         raw.task_id        || raw.id             || null,
      description:     raw.description    || raw.name           || raw.prompt || `Task ${raw.task_id || ''}`,
      status:          raw.status         || TASK_STATUS.SCHEDULED,
      interval_seconds: raw.interval_seconds || raw.interval_secs || raw.interval || 0,
      total_runs:      raw.total_runs     ?? raw.max_runs        ?? 0,
      completed_runs:  raw.completed_runs ?? 0,
      started_at:      raw.started_at     || raw.created_at      || null,
      ends_at:         raw.ends_at        || raw.end_time         || null,
      next_run:        raw.next_run                               || null,
      output_file:     raw.output_file                            || null,
      is_active:       raw.is_active      ?? (
        raw.status === TASK_STATUS.RUNNING ||
        raw.status === TASK_STATUS.SCHEDULED
      ),
    }
  }

  // ── Fetch task list from backend ────────────────────────────────────────
  // Throttle increased from 5s → 15s to reduce server pressure and prevent
  // overlapping requests from multiple callers (ChatPage, TasksPanel, etc.)
  const fetchTasks = useCallback(async (force = false) => {
    // Guard: prevent concurrent API calls
    if (isFetchingRef.current) {
      console.log('[TasksContext] Skipping fetch — already in flight')
      return
    }

    // Throttle: skip if fetched within the last 15 seconds (unless forced)
    const now = Date.now()
    if (!force && now - lastFetchRef.current < 15_000) {
      console.log('[TasksContext] Skipping fetch — throttled (last fetch', Math.round((now - lastFetchRef.current) / 1000), 's ago)')
      return
    }

    isFetchingRef.current = true
    setLoading(true)
    setError(null)
    try {
      const raw = await apiFetch('/api/tasks')
      // Handle all possible API shapes: array, { tasks: [] }, { data: [] }
      const list = Array.isArray(raw)
        ? raw
        : (raw?.tasks ?? raw?.data ?? raw?.results ?? [])
      const normalized = Array.isArray(list)
        ? list.map(normalizeTask).filter(Boolean)
        : []
      // Sort: newest first (most recently created / started)
      normalized.sort((a, b) => {
        const ta = new Date(a.started_at || 0).getTime()
        const tb = new Date(b.started_at || 0).getTime()
        return tb - ta
      })
      setTasks(normalized)
      lastFetchRef.current = Date.now()
      return normalized
    } catch (err) {
      // 401: token expired — handled globally by apiFetch/handleUnauthorized
      const isAuthErr =
        err.message === 'Unauthorized' || err.message?.includes('401')
      if (!isAuthErr) {
        setError(err.message || 'Failed to load tasks')
      }
      return []
    } finally {
      setLoading(false)
      isFetchingRef.current = false
    }
  }, [])

  // ── Register a newly-created task from a chat response ──────────────────
  // Called by ChatPage when the SSE stream's tool_calls include `schedule_task`.
  // messageId: the assistant message that triggered the task creation.
  const addTaskFromResponse = useCallback((messageId, taskData) => {
    if (!taskData) return
    const normalized = normalizeTask(taskData)
    if (!normalized || !normalized.task_id) return

    // Add to task list (avoid duplicates)
    setTasks(prev => {
      const exists = prev.some(t => t.task_id === normalized.task_id)
      if (exists) return prev
      return [normalized, ...prev]
    })

    // Map this task to its originating message so chat UI can show the badge
    if (messageId) {
      setTasksByMessage(prev => ({
        ...prev,
        [String(messageId)]: normalized,
      }))
    }
  }, [])

  // ── Remove the task-message link (e.g. after user dismisses the badge) ──
  const clearTaskForMessage = useCallback((messageId) => {
    setTasksByMessage(prev => {
      const next = { ...prev }
      delete next[String(messageId)]
      return next
    })
  }, [])

  // ── Cancel a task ────────────────────────────────────────────────────────
  // Actual backend route: POST /api/task-cancel/{taskId}
  const cancelTask = useCallback(async (taskId) => {
    try {
      await apiFetch(`/api/task-cancel/${encodeURIComponent(taskId)}`, { method: 'POST' })
      setTasks(prev =>
        prev.map(t =>
          t.task_id === taskId ? { ...t, status: TASK_STATUS.CANCELLED, is_active: false } : t
        )
      )
    } catch (err) {
      throw err // let caller handle
    }
  }, [])

  // ── Add a new task via API ───────────────────────────────────────────────
  const addNewTask = useCallback(async (taskData) => {
    try {
      const result = await apiFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(taskData),
      })
      const normalized = normalizeTask(result)
      if (normalized && normalized.task_id) {
        setTasks(prev => {
          const exists = prev.some(t => t.task_id === normalized.task_id)
          if (exists) return prev
          return [normalized, ...prev]
        })
      }
      return normalized
    } catch (err) {
      throw err
    }
  }, [])

  // ── Update a task in state (from SSE task_run_update) ───────────────────
  const updateTaskStatus = useCallback((taskId, patch) => {
    setTasks(prev =>
      prev.map(t => t.task_id === taskId ? { ...t, ...patch } : t)
    )
  }, [])

  const value = {
    tasks,
    loading,
    error,
    tasksByMessage,
    fetchTasks,
    addTaskFromResponse,
    clearTaskForMessage,
    cancelTask,
    addNewTask,
    updateTaskStatus,
    setTasks,
  }

  return (
    <TasksContext.Provider value={value}>
      {children}
    </TasksContext.Provider>
  )
}

export function useTasksContext() {
  const ctx = useContext(TasksContext)
  if (!ctx) throw new Error('useTasksContext must be used inside TasksProvider')
  return ctx
}

export default TasksContext
