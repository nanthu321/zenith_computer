import { useState, useCallback, useRef, useEffect } from 'react'
import { queuePrompt, getQueueStatus } from '../utils/api.js'

/**
 * QUEUE STATUS VALUES (from backend):
 *   'queued'     — Waiting for earlier prompt(s) to finish
 *   'processing' — Currently being executed by the agent
 *   'completed'  — Finished successfully, responseContent available
 *   'failed'     — Execution failed, check errorMessage
 */

const POLL_INTERVAL_MS = 3000   // Poll every 3 seconds when queue has active items
const POLL_IDLE_MS     = 10000  // Poll every 10 seconds when queue is idle

// Track whether the backend supports the /queue endpoint.
// Once we get an "Invalid chat endpoint" error, stop retrying.
let _queueEndpointSupported = true

/**
 * Hook for managing chat queue — allows queuing follow-up prompts
 * while a current prompt is still streaming.
 *
 * Usage:
 *   const { queueItems, addToQueue, pollQueue, ... } = useChatQueue()
 */
export function useChatQueue() {
  // queueItems: { [sessionId]: QueueItem[] }
  const [queueItems, setQueueItems]     = useState({})
  const [isQueueing, setIsQueueing]     = useState(false)
  const [queueError, setQueueError]     = useState(null)

  const pollTimerRef   = useRef(null)
  const activeSessionRef = useRef(null)

  // ── Add a prompt to the queue ──
  const addToQueue = useCallback(async (sessionId, message) => {
    if (!sessionId || !message?.trim()) return null

    // If the backend doesn't support the /queue endpoint, fail fast
    // with a clear error so the caller can show a friendly message.
    if (!_queueEndpointSupported) {
      throw new Error('Invalid chat endpoint — queue not supported')
    }

    setIsQueueing(true)
    setQueueError(null)

    try {
      const item = await queuePrompt(sessionId, message)

      // Add to local state immediately
      setQueueItems(prev => {
        const existing = prev[sessionId] || []
        // Avoid duplicates (by id)
        if (existing.some(q => q.id === item.id)) return prev
        return {
          ...prev,
          [sessionId]: [...existing, item],
        }
      })

      // Start polling for this session
      startPolling(sessionId)

      return item
    } catch (err) {
      // NOTE: Do NOT set queueError here — the caller (ChatPage) will
      // catch the thrown error and display its own toast. Setting queueError
      // would trigger the queueError useEffect toast AS WELL, causing the
      // same error message to appear twice.
      const msg = (err.message || '').toLowerCase()
      if (msg.includes('invalid chat endpoint')) {
        _queueEndpointSupported = false
        console.info('[useChatQueue] Queue endpoint not supported by backend — disabling queue')
      } else {
        console.warn('[useChatQueue] addToQueue failed:', err.message)
      }
      throw err
    } finally {
      setIsQueueing(false)
    }
  }, [])

  // ── Poll queue status for a session ──
  const pollQueue = useCallback(async (sessionId) => {
    if (!sessionId) return []

    // If we already know the backend doesn't support /queue, skip silently
    if (!_queueEndpointSupported) return []

    try {
      const items = await getQueueStatus(sessionId)
      return items
    } catch (err) {
      const msg = (err.message || '').toLowerCase()
      // If the backend says the endpoint is invalid, remember this so we
      // don't keep hitting an unsupported endpoint on every poll cycle.
      if (msg.includes('invalid chat endpoint')) {
        _queueEndpointSupported = false
        console.info('[useChatQueue] Queue endpoint not supported by backend — disabling queue polling')
      } else {
        console.warn('[useChatQueue] pollQueue error:', err.message)
      }
      return []
    }
  }, [])

  // ── Start auto-polling for active items ──
  const startPolling = useCallback((sessionId) => {
    activeSessionRef.current = sessionId
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)

    const poll = async () => {
      const sid = activeSessionRef.current
      if (!sid) return

      const items = await pollQueue(sid)
      const hasActive = items.some(q => q.status === 'queued' || q.status === 'processing')

      // Adjust polling interval based on activity
      if (!hasActive && pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        // Switch to idle polling
        pollTimerRef.current = setInterval(poll, POLL_IDLE_MS)
      }
    }

    // Initial poll immediately
    poll()
    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS)
  }, [pollQueue])

  // ── Stop polling ──
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  // ── Get queue items for a specific session ──
  const getSessionQueue = useCallback((sessionId) => {
    return queueItems[sessionId] || []
  }, [queueItems])

  // ── Check if session has active queue items ──
  const hasActiveQueue = useCallback((sessionId) => {
    const items = queueItems[sessionId] || []
    return items.some(q => q.status === 'queued' || q.status === 'processing')
  }, [queueItems])

  // ── Get count of pending items ──
  const getPendingCount = useCallback((sessionId) => {
    const items = queueItems[sessionId] || []
    return items.filter(q => q.status === 'queued' || q.status === 'processing').length
  }, [queueItems])

  // ── Clear completed/failed items from view ──
  const clearCompleted = useCallback((sessionId) => {
    setQueueItems(prev => {
      const items = prev[sessionId] || []
      const active = items.filter(q => q.status === 'queued' || q.status === 'processing')
      return {
        ...prev,
        [sessionId]: active,
      }
    })
  }, [])

  // ── Clean up queue for a session (on delete, etc.) ──
  const cleanupQueue = useCallback((sessionId) => {
    setQueueItems(prev => {
      const next = { ...prev }
      delete next[sessionId]
      return next
    })
    if (activeSessionRef.current === sessionId) {
      stopPolling()
    }
  }, [stopPolling])

  // ── Change active session for polling ──
  const setActiveQueueSession = useCallback((sessionId) => {
    const prevSession = activeSessionRef.current

    if (prevSession === sessionId) return

    activeSessionRef.current = sessionId

    if (!sessionId) {
      stopPolling()
      return
    }

    // Check if this session has active items — if so, start polling
    const items = queueItems[sessionId] || []
    const hasActive = items.some(q => q.status === 'queued' || q.status === 'processing')
    if (hasActive) {
      startPolling(sessionId)
    } else {
      stopPolling()
      // Still do one fetch to get any items that might exist
      pollQueue(sessionId)
    }
  }, [queueItems, startPolling, stopPolling, pollQueue])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  return {
    queueItems,
    isQueueing,
    queueError,
    addToQueue,
    pollQueue,
    getSessionQueue,
    hasActiveQueue,
    getPendingCount,
    clearCompleted,
    cleanupQueue,
    setActiveQueueSession,
    startPolling,
    stopPolling,
    setQueueError,
  }
}
