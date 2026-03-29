 import { API_BASE_URL } from './constants.js'
import { mockHandlers, mockStreamChat } from './mockData.js'
import { getCookie, clearAllZenithCookies } from './cookieUtils.js'
import { getPreference } from './preferences.js'
import {
  isStreamWorkerReady,
  startStreamViaSW,
  cancelStreamViaSW,
} from './streamWorkerManager.js'

// ─────────────────────────────────────────────────
//  Mock Mode Detection
// ─────────────────────────────────────────────────
let _mockActive = import.meta.env.VITE_MOCK_MODE === 'true'

/** Returns true when sample data is being used instead of the real backend */
export function isMockMode() {
  return _mockActive
}

// ─────────────────────────────────────────────────
//  Logout flag to prevent multiple logout attempts
// ─────────────────────────────────────────────────
let _isLoggingOut = false

// Store a navigate function and auth-clearing callback from React to avoid hard page refreshes
let _routerNavigate = null
let _clearAuthState = null

/**
 * Register React Router's navigate function and an auth-clearing callback
 * so that 401 redirects use client-side routing instead of a full page refresh.
 */
export function setRouterNavigate(navigateFn) {
  _routerNavigate = navigateFn
}

export function setAuthClearCallback(clearFn) {
  _clearAuthState = clearFn
}

function handleUnauthorized() {
  if (_isLoggingOut) return
  _isLoggingOut = true

  // Clear ALL zenith_ cookies
  clearAllZenithCookies()

  // Also purge any zenith_ keys from localStorage
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('zenith_')) keys.push(k)
    }
    keys.forEach(k => localStorage.removeItem(k))
  } catch (_) { /* ignore */ }

  // Clear React auth state so ProtectedRoute knows the user is logged out
  if (_clearAuthState) {
    try { _clearAuthState() } catch (_) { /* ignore */ }
  }

  // Small delay to ensure state cleanup, then navigate WITHOUT full page refresh
  // FIX: Always reset _isLoggingOut after navigation (previously it was only reset
  // inside the router branch, leaving it permanently true when falling back to
  // window.location.href — which would block any subsequent logout attempt).
  setTimeout(() => {
    _isLoggingOut = false
    if (_routerNavigate) {
      try {
        _routerNavigate('/login', { replace: true })
      } catch (_) {
        // Fallback if React Router navigate fails
        window.location.href = '/login'
      }
    } else {
      window.location.href = '/login'
    }
  }, 100)
}

// ─────────────────────────────────────────────────────────────────
//  Base URL — empty in dev (Vite proxy forwards /api/* to backend)
//  In production set VITE_API_BASE_URL to the real backend origin.
// ─────────────────────────────────────────────────────────────────
const BASE = (API_BASE_URL || '').replace(/\/$/, '')

// ─────────────────────────────────────────────────
//  Common request headers
//  Note: ngrok-skip-browser-warning is injected by
//  the Vite proxy (vite.config.js), NOT here.
// ─────────────────────────────────────────────────
function buildHeaders(extra = {}) {
  const token = getCookie('zenith_token')
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...extra,
  }
  // Include X-User-Id header required by the backend
  try {
    const storedUser = getCookie('zenith_user')
    if (storedUser) {
      const parsed = JSON.parse(storedUser)
      if (parsed.user_id) headers['X-User-Id'] = String(parsed.user_id)
      else if (parsed.id) headers['X-User-Id'] = String(parsed.id)
    }
  } catch (_) { /* ignore parse errors */ }

  // Fallback: extract user_id from JWT payload if header still missing
  if (!headers['X-User-Id'] && token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const uid = payload.user_id || payload.sub || payload.id
      if (uid) headers['X-User-Id'] = String(uid)
    } catch (_) { /* ignore decode errors */ }
  }
  return headers
}

// ─────────────────────────────────────────────────
//  Route → mock handler matcher
// ─────────────────────────────────────────────────
function matchMock(method, path, body) {
  const key = `${method} ${path}`

  if (mockHandlers[key]) return mockHandlers[key](body)

  const delSession = path.match(/^\/api\/sessions\/(\d+)$/)
  if (method === 'DELETE' && delSession) return mockHandlers['DELETE /api/sessions'](delSession[1])

  const getMsg = path.match(/^\/api\/sessions\/(\d+)\/messages$/)
  if (method === 'GET' && getMsg) return mockHandlers['GET /api/sessions/messages'](getMsg[1])

  // Task cancel — actual backend route: POST /api/task-cancel/{taskId}
  const cancelTask = path.match(/^\/api\/task-cancel\/(.+)$/)
  if (method === 'POST' && cancelTask) return mockHandlers['POST /api/task-cancel'](cancelTask[1])

  // Legacy cancel route (kept for backward compatibility)
  const cancelTaskLegacy = path.match(/^\/api\/tasks\/(.+)\/cancel$/)
  if (method === 'POST' && cancelTaskLegacy) return mockHandlers['POST /api/task-cancel'](cancelTaskLegacy[1])

  // Task detail — GET /api/tasks/{taskId}
  const getTaskDetail = path.match(/^\/api\/tasks\/([^/]+)$/)
  if (method === 'GET' && getTaskDetail) {
    // Return a matching task from mock data, or null
    const taskId = getTaskDetail[1]
    const handler = mockHandlers['GET /api/tasks']
    if (handler) {
      return handler().then(tasks => {
        const arr = Array.isArray(tasks) ? tasks : (tasks?.tasks || [])
        const task = arr.find(t => t.task_id === taskId)
        return task || null
      })
    }
    return null
  }

  // Chat queue — POST /api/chat/{sessionId}/queue  (add to queue)
  const postQueue = path.match(/^\/api\/chat\/(\d+)\/queue$/)
  if (method === 'POST' && postQueue) {
    return mockHandlers['POST /api/chat/queue'](postQueue[1], body)
  }

  // Chat queue — GET /api/chat/{sessionId}/queue  (get status)
  const getQueue = path.match(/^\/api\/chat\/(\d+)\/queue$/)
  if (method === 'GET' && getQueue) {
    return mockHandlers['GET /api/chat/queue'](getQueue[1])
  }

  return null
}

// ─────────────────────────────────────────────────────────────────
//  apiFetch — central fetch wrapper
//  In dev: /api/…  (Vite proxy forwards to backend)
//  In prod: https://backend-computer.onrender.com/api/…
// ─────────────────────────────────────────────────────────────────
export async function apiFetch(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()

  // ── Mock path ──
  if (_mockActive) {
    let body = null
    if (options.body) {
      try { body = JSON.parse(options.body) } catch { body = options.body }
    }
    const result = await matchMock(method, path, body)
    if (result !== null && result !== undefined) return result
    return []
  }

  // ── Real backend path ──
  const fullURL = `${BASE}${path}`
  console.log(`[API] ${method} ${fullURL}`)

  let response
  try {
    response = await fetch(fullURL, {
      ...options,
      headers: buildHeaders(options.headers),
    })
  } catch (networkErr) {
    console.error(`[API] Network error for ${method} ${fullURL}:`, networkErr)
    throw new Error(
      'Cannot reach the server. Please check that the Vite dev server is running (npm run dev).'
    )
  }

  // 401 → clear token and redirect
  if (response.status === 401) {
    handleUnauthorized()
    throw new Error('Unauthorized')
  }

  if (options.stream) {
    return response
  }

  // Handle 204 No Content (common for DELETE operations)
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return null
  }

  // Guard against non-JSON responses (e.g. HTML error pages)
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await response.text()
    // Empty body on successful DELETE — treat as success
    if (response.ok && !text.trim()) return null
    console.error(`[API] Expected JSON but got ${contentType}:`, text.substring(0, 300))
    // Try to extract a meaningful error from the response body
    let errorMsg = `${response.status} - ${response.statusText || 'Unknown Error'}`
    try {
      const titleMatch = text.match(/<title>([^<]+)<\/title>/i)
      if (titleMatch) {
        const titleText = titleMatch[1].trim()
        // If title is just the status code, use statusText for a descriptive message
        if (titleText === String(response.status)) {
          errorMsg = `${response.status} - ${response.statusText || 'Server Error'}`
        } else {
          errorMsg = `${response.status} - ${titleText}`
        }
      } else if (text.trim()) {
        errorMsg = `${response.status} - ${text.trim().substring(0, 200)}`
      }
    } catch (_) { /* ignore parsing errors */ }
    throw new Error(errorMsg)
  }

  let data
  try {
    data = await response.json()
  } catch {
    // If JSON parsing fails on a successful response, treat as OK
    if (response.ok) return null
    throw new Error('Invalid server response')
  }

  if (!data.success) {
    throw new Error(data.error || `${response.status} - ${response.statusText || 'Request Failed'}`)
  }

  return data.data
}

// ─────────────────────────────────────────────────────────────────
//  streamChat — SSE stream via POST
//
//  STRATEGY (page-refresh-safe streaming):
//    1. If Service Worker is ready → delegate the fetch() to the SW.
//       The SW keeps the connection alive even if the page refreshes/closes.
//       Events are forwarded from SW → page via postMessage.
//    2. If SW is NOT available → fall back to direct fetch() in the page
//       (original behavior — stream dies on page refresh).
//
//  The returned AbortController works in both modes.
// ─────────────────────────────────────────────────────────────────
export function streamChat(sessionId, message, callbacks) {
  if (_mockActive) {
    return mockStreamChat(sessionId, message, callbacks)
  }

  const {
    images, onToken, onToolStart, onToolResult, onDone, onError,
    onThinking, onStatus, onIteration, onArtifact,
  } = callbacks
  const controller = new AbortController()
  const fullURL = `${BASE}/api/chat/${sessionId}/send`
  console.log(`[API] STREAM POST ${fullURL}`)

  // Build request body with optional images
  const body = { message }
  if (images && images.length > 0) {
    body.images = images.map(img => ({
      name: img.name,
      type: img.type,
      data: img.data,
    }))
  }

  // Attach user custom instructions (personalization) if set
  const customInstructions = getPreference('zenith_custom_instructions', '')
  if (customInstructions && customInstructions.trim()) {
    body.custom_instructions = customInstructions.trim()
  }

  const headers = buildHeaders({
    'Accept': 'text/event-stream',
    'Cache-Control': 'no-cache',
  })

  // ── Dispatch a parsed SSE event to the appropriate callback ──
  const dispatchSSE = (eventType, data) => {
    switch (eventType) {
      case 'token':
        onToken?.(data.content)
        break
      case 'tool_start':
        onToolStart?.(data)
        break
      case 'tool_result':
        onToolResult?.(data)
        break
      case 'thinking':
        onThinking?.(data)
        break
      case 'status':
        onStatus?.(data)
        break
      case 'iteration':
        onIteration?.(data)
        break
      case 'artifact':
        onArtifact?.(data)
        break
      case 'done':
        onDone?.(data)
        break
      case 'error':
        onError?.(data.error)
        break
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  PATH 1: Service Worker available → delegate stream to SW
  // ─────────────────────────────────────────────────────────────
  if (isStreamWorkerReady()) {
    console.log('[API] Using Service Worker for persistent streaming (session:', sessionId, ')')

    // Store the session ID being streamed so recovery knows which session to check
    try {
      localStorage.setItem('zenith_sw_streaming_session', sessionId)
    } catch (_) { /* ignore */ }

    const unsubscribe = startStreamViaSW(
      sessionId,
      {
        url: fullURL,
        headers,
        body,
        assistantMsgId: callbacks.assistantMsgId || null,
      },
      // onEvent callback — receives { type, data } from SW
      (event) => {
        dispatchSSE(event.type, event.data)

        // On 'done' or 'error', clean up
        if (event.type === 'done' || event.type === 'error') {
          unsubscribe()
          try {
            localStorage.removeItem('zenith_sw_streaming_session')
          } catch (_) { /* ignore */ }
        }
      }
    )

    // Wire up abort: when controller.abort() is called, cancel in SW too
    controller.signal.addEventListener('abort', () => {
      cancelStreamViaSW(sessionId)
      unsubscribe()
      try {
        localStorage.removeItem('zenith_sw_streaming_session')
      } catch (_) { /* ignore */ }
      // Fire onDone with aborted flag so useChat cleans up state
      onDone?.({ message_id: null, session_title: null, aborted: true })
    })

    return controller
  }

  // ─────────────────────────────────────────────────────────────
  //  PATH 2: No Service Worker → direct fetch (original behavior)
  // ─────────────────────────────────────────────────────────────
  console.log('[API] Service Worker not available — using direct fetch for streaming')

  fetch(fullURL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (response.status === 401) {
        handleUnauthorized()
        throw new Error('Unauthorized')
      }

      if (!response.ok) {

        let errorMsg = `Server error: ${response.status}`
        let errorCode = response.status
        try {
          const contentType = response.headers.get('content-type') || ''
          if (contentType.includes('application/json')) {
            const errData = await response.json()
            errorMsg = errData.error || errData.message || errorMsg
          } else {
            const text = await response.text()
            console.error(`[streamChat] Non-JSON error response:`, text.substring(0, 300))
          }
        } catch {

        }

        // 409 Conflict — another prompt is already running for this session.
        // Signal the caller so the frontend can redirect the message to /queue.
        if (errorCode === 409) {
          const conflictErr = new Error(errorMsg)
          conflictErr.status = 409
          conflictErr.code = 'CONFLICT_ALREADY_RUNNING'
          throw conflictErr
        }

        throw new Error(errorMsg)
      }

      const contentType = response.headers.get('content-type') || ''

      // ── Guard: if backend returned JSON instead of SSE stream, parse it ──
      if (contentType.includes('application/json')) {
        const jsonData = await response.json()
        console.warn('[streamChat] Expected SSE stream but got JSON:', jsonData)
        if (jsonData.success === false) {
          throw new Error(jsonData.error || 'Unexpected response from server')
        }
        // If it's somehow a successful JSON, treat content as a single token
        if (jsonData.data?.content) {
          onToken?.(jsonData.data.content)
        }
        onDone?.(jsonData.data || {})
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      // ── Normalize concatenated SSE fields into proper newline-delimited lines.
      const normalizeSSEBuffer = (buf) => {
        buf = buf.replace(/\}(event:)/g, '}\n$1')
        buf = buf.replace(
          /\b(token|tool_start|tool_result|thinking|status|iteration|artifact|done|error)(data:)/g,
          '$1\n$2'
        )
        buf = buf.replace(/\}(data:)/g, '}\n$1')
        return buf
      }

      // Persistent cross-chunk state
      let currentEvent = ''
      let pendingDataAccum = ''

      // Enhanced processLines that handles cross-chunk JSON accumulation
      const processLinesWithAccum = (lines) => {
        let dataAccum = pendingDataAccum

        const tryDispatch = () => {
          if (dataAccum && currentEvent) {
            try {
              const data = JSON.parse(dataAccum)
              dispatchSSE(currentEvent, data)
              currentEvent = ''
              dataAccum = ''
              pendingDataAccum = ''
              return true
            } catch {
              // Incomplete JSON — keep buffering
              pendingDataAccum = dataAccum
              return false
            }
          }
          return false
        }

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) {
            // SSE boundary — flush any pending data
            if (dataAccum && currentEvent) {
              try {
                const data = JSON.parse(dataAccum)
                dispatchSSE(currentEvent, data)
              } catch {
                console.debug('[streamChat] JSON parse failed at SSE boundary:',
                  dataAccum.substring(0, 100))
              }
            }
            currentEvent = ''
            dataAccum = ''
            pendingDataAccum = ''
            continue
          }
          if (trimmed.startsWith('event:')) {
            // New event: flush pending data from the previous event
            tryDispatch()
            currentEvent = trimmed.slice(6).trim()
            dataAccum = ''
            pendingDataAccum = ''
          } else if (trimmed.startsWith('data:')) {
            const jsonStr = trimmed.slice(5).trim()
            dataAccum = dataAccum ? dataAccum + '\n' + jsonStr : jsonStr
            // Try to dispatch immediately (optimistic parse)
            tryDispatch()
          }
        }

        // Persist any remaining accumulated data for the next chunk
        pendingDataAccum = dataAccum
      }

      let streamDone = false
      while (!streamDone) {
        const { done, value } = await reader.read()
        if (done) { streamDone = true; break }

        buffer += decoder.decode(value, { stream: true })

        // ── Normalize concatenated SSE fields ──
        buffer = normalizeSSEBuffer(buffer)

        const lines = buffer.split('\n')
        // Keep the last (potentially incomplete) line in the buffer
        buffer = lines.pop()

        processLinesWithAccum(lines)
      }

      // ── Flush remaining buffer after stream ends ──
      if (buffer.trim()) {
        const remaining = normalizeSSEBuffer(buffer)
        const remainingLines = remaining.split('\n')
        // Add a trailing empty line to trigger final SSE boundary flush
        remainingLines.push('')
        processLinesWithAccum(remainingLines)
      } else if (pendingDataAccum && currentEvent) {
        // Flush any cross-chunk accumulated data that wasn't dispatched
        try {
          const data = JSON.parse(pendingDataAccum)
          dispatchSSE(currentEvent, data)
        } catch {
          console.debug('[streamChat] Final flush JSON parse failed:', pendingDataAccum.substring(0, 100))
        }
      }
    })
    .catch((err) => {
      if (err.name === 'AbortError') {
        // User stopped generation — finalize the message gracefully
        // without showing an error. Pass empty data so onDone cleans up state.
        onDone?.({ message_id: null, session_title: null, aborted: true })
      } else {
        onError?.(err.message)
      }
    })

  return controller
}

// ─────────────────────────────────────────────────────────────────
//  Chat Queue API
//  Allows queuing follow-up prompts while a prompt is still running.
// ─────────────────────────────────────────────────────────────────

/**
 * Add a prompt to the chat queue for a session.
 * POST /api/chat/{sessionId}/queue
 *
 * @param {string|number} sessionId
 * @param {string} message
 * @returns {Promise<Object>} The queued item with id, queuePosition, status, etc.
 */
export async function queuePrompt(sessionId, message) {
  return apiFetch(`/api/chat/${sessionId}/queue`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

/**
 * Get the current queue status for a session.
 * GET /api/chat/{sessionId}/queue
 *
 * @param {string|number} sessionId
 * @returns {Promise<Array>} Array of queue items with status, position, etc.
 */
export async function getQueueStatus(sessionId) {
  const data = await apiFetch(`/api/chat/${sessionId}/queue`)
  return Array.isArray(data) ? data : (data?.items ?? data?.queue ?? [])
}

// ─────────────────────────────────────────────────────────────────
//  downloadFile — browser file download
//  Proxied via Vite in dev; absolute URL in production
// ─────────────────────────────────────────────────────────────────
export function downloadFile(path) {
  if (_mockActive) {
    alert('File download is not available in demo mode. Connect the backend to enable downloads.')
    return
  }
  const token = getCookie('zenith_token')
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}token=${token}`
  const a = document.createElement('a')
  a.href = url
  a.download = ''
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
