/**
 * stream-worker.js — Service Worker for persistent SSE streaming
 *
 * PURPOSE:
 *   When the user refreshes the page or closes/reopens the tab during an active
 *   SSE stream, the main page's fetch() connection is torn down. This Service Worker
 *   takes over the streaming connection so it continues independently of the page lifecycle.
 *
 * ARCHITECTURE:
 *   1. Main page calls SW via postMessage({ type: 'START_STREAM', ... })
 *   2. SW opens its OWN fetch() to the backend SSE endpoint
 *   3. SW reads the stream, accumulates tokens/tool_calls/events
 *   4. SW forwards each event to ALL connected clients via postMessage
 *   5. If the page dies (refresh/close), the SW keeps reading the stream
 *   6. When the page comes back, it sends 'RECOVER_STREAM' — SW replays accumulated state
 *   7. On 'done' event, SW persists final state to Cache API and cleans up
 *
 * STORAGE:
 *   Cache name: 'zenith-stream-state'
 *   Key: '/stream-state/{sessionId}'
 *   Value: JSON { fullContent, toolCalls, events, done, doneData, error, startedAt, updatedAt }
 */

const CACHE_NAME = 'zenith-stream-state'

// Active streams: sessionId → { reader, controller, state }
const activeStreams = new Map()

// ── Install & Activate: take control immediately ──
self.addEventListener('install', (event) => {
  console.log('[stream-worker] Installing...')
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  console.log('[stream-worker] Activating...')
  event.waitUntil(self.clients.claim())
})

// ── Broadcast a message to all connected clients ──
async function broadcastToClients(data) {
  const clients = await self.clients.matchAll({ type: 'window' })
  for (const client of clients) {
    client.postMessage(data)
  }
}

// ── Persist stream state to Cache API (survives SW restarts) ──
async function persistState(sessionId, state) {
  try {
    const cache = await caches.open(CACHE_NAME)
    const response = new Response(JSON.stringify({
      ...state,
      updatedAt: Date.now(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
    await cache.put(`/stream-state/${sessionId}`, response)
  } catch (e) {
    console.warn('[stream-worker] Failed to persist state:', e.message)
  }
}

// ── Load persisted state from Cache API ──
async function loadPersistedState(sessionId) {
  try {
    const cache = await caches.open(CACHE_NAME)
    const response = await cache.match(`/stream-state/${sessionId}`)
    if (!response) return null
    const state = await response.json()
    // Discard stale state (older than 15 minutes)
    if (state.updatedAt && (Date.now() - state.updatedAt) > 15 * 60 * 1000) {
      await cache.delete(`/stream-state/${sessionId}`)
      return null
    }
    return state
  } catch {
    return null
  }
}

// ── Clear persisted state ──
async function clearPersistedState(sessionId) {
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.delete(`/stream-state/${sessionId}`)
  } catch { /* ignore */ }
}

// ── SSE line parser (same logic as api.js but simplified) ──
function normalizeSSEBuffer(buf) {
  buf = buf.replace(/\}(event:)/g, '}\n$1')
  buf = buf.replace(
    /\b(token|tool_start|tool_result|thinking|status|iteration|artifact|done|error)(data:)/g,
    '$1\n$2'
  )
  buf = buf.replace(/\}(data:)/g, '}\n$1')
  return buf
}

// ── Start streaming in the Service Worker ──
async function startStream(sessionId, requestInfo) {
  const { url, headers, body } = requestInfo

  // If already streaming this session, ignore duplicate start
  if (activeStreams.has(sessionId)) {
    console.log('[stream-worker] Stream already active for session', sessionId)
    broadcastToClients({
      type: 'SW_STREAM_ALREADY_ACTIVE',
      sessionId,
    })
    return
  }

  const state = {
    fullContent: '',
    toolCalls: {},       // toolKey → toolCall object
    events: [],          // all SSE events (for replay)
    done: false,
    doneData: null,
    error: null,
    startedAt: Date.now(),
    assistantMsgId: requestInfo.assistantMsgId || null,
  }

  const abortController = new AbortController()

  activeStreams.set(sessionId, {
    controller: abortController,
    state,
  })

  // Persist initial state
  await persistState(sessionId, state)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      signal: abortController.signal,
    })

    if (!response.ok) {
      let errorMsg = `Server error: ${response.status}`
      try {
        const ct = response.headers.get('content-type') || ''
        if (ct.includes('application/json')) {
          const errData = await response.json()
          errorMsg = errData.error || errData.message || errorMsg
        }
      } catch { /* ignore */ }

      state.error = errorMsg
      state.done = true
      await persistState(sessionId, state)
      broadcastToClients({ type: 'SW_STREAM_ERROR', sessionId, error: errorMsg })
      activeStreams.delete(sessionId)
      return
    }

    // Check if response is JSON instead of SSE
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const jsonData = await response.json()
      if (jsonData.success === false) {
        state.error = jsonData.error || 'Unexpected response'
        state.done = true
        await persistState(sessionId, state)
        broadcastToClients({ type: 'SW_STREAM_ERROR', sessionId, error: state.error })
        activeStreams.delete(sessionId)
        return
      }
      if (jsonData.data?.content) {
        const event = { type: 'token', data: { content: jsonData.data.content } }
        state.events.push(event)
        state.fullContent += jsonData.data.content
        broadcastToClients({ type: 'SW_SSE_EVENT', sessionId, event })
      }
      const doneEvent = { type: 'done', data: jsonData.data || {} }
      state.events.push(doneEvent)
      state.done = true
      state.doneData = jsonData.data || {}
      await persistState(sessionId, state)
      broadcastToClients({ type: 'SW_SSE_EVENT', sessionId, event: doneEvent })
      activeStreams.delete(sessionId)
      return
    }

    // ── Read SSE stream ──
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let currentEvent = ''
    let pendingDataAccum = ''

    const dispatchSSE = (eventType, data) => {
      const event = { type: eventType, data }
      state.events.push(event)

      // Accumulate state
      switch (eventType) {
        case 'token':
          state.fullContent += (data.content || '')
          break
        case 'tool_start': {
          const toolKey = data.tool_use_id || `${data.tool}_${Date.now()}`
          state.toolCalls[toolKey] = {
            tool_use_id: toolKey,
            tool: data.tool,
            input: data.input || {},
            status: 'running',
          }
          break
        }
        case 'tool_result': {
          const toolKey = data.tool_use_id && state.toolCalls[data.tool_use_id]
            ? data.tool_use_id
            : Object.keys(state.toolCalls).find(k =>
                state.toolCalls[k].tool === data.tool && state.toolCalls[k].status === 'running'
              )
          if (toolKey && state.toolCalls[toolKey]) {
            state.toolCalls[toolKey] = {
              ...state.toolCalls[toolKey],
              result: data.result || {},
              status: 'done',
            }
          } else {
            const syntheticKey = data.tool_use_id || `${data.tool}_result_${Date.now()}`
            state.toolCalls[syntheticKey] = {
              tool_use_id: syntheticKey,
              tool: data.tool,
              input: {},
              result: data.result || {},
              status: 'done',
            }
          }
          break
        }
        case 'done':
          state.done = true
          state.doneData = data
          break
        case 'error':
          state.error = data.error || 'Stream error'
          state.done = true
          break
      }

      // Forward to all connected clients in real-time
      broadcastToClients({ type: 'SW_SSE_EVENT', sessionId, event })
    }

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
            pendingDataAccum = dataAccum
            return false
          }
        }
        return false
      }

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) {
          if (dataAccum && currentEvent) {
            try {
              const data = JSON.parse(dataAccum)
              dispatchSSE(currentEvent, data)
            } catch { /* ignore */ }
          }
          currentEvent = ''
          dataAccum = ''
          pendingDataAccum = ''
          continue
        }
        if (trimmed.startsWith('event:')) {
          tryDispatch()
          currentEvent = trimmed.slice(6).trim()
          dataAccum = ''
          pendingDataAccum = ''
        } else if (trimmed.startsWith('data:')) {
          const jsonStr = trimmed.slice(5).trim()
          dataAccum = dataAccum ? dataAccum + '\n' + jsonStr : jsonStr
          tryDispatch()
        }
      }

      pendingDataAccum = dataAccum
    }

    // Persist state periodically (every 10 events or every 5 seconds)
    let lastPersistTime = Date.now()
    let eventsSinceLastPersist = 0

    let streamDone = false
    while (!streamDone) {
      const { done, value } = await reader.read()
      if (done) { streamDone = true; break }

      buffer += decoder.decode(value, { stream: true })
      buffer = normalizeSSEBuffer(buffer)

      const lines = buffer.split('\n')
      buffer = lines.pop()

      processLinesWithAccum(lines)

      // Periodic persistence
      eventsSinceLastPersist++
      const now = Date.now()
      if (eventsSinceLastPersist >= 10 || (now - lastPersistTime) > 5000) {
        await persistState(sessionId, state)
        lastPersistTime = now
        eventsSinceLastPersist = 0
      }
    }

    // Flush remaining buffer
    if (buffer.trim()) {
      const remaining = normalizeSSEBuffer(buffer)
      const remainingLines = remaining.split('\n')
      remainingLines.push('')
      processLinesWithAccum(remainingLines)
    } else if (pendingDataAccum && currentEvent) {
      try {
        const data = JSON.parse(pendingDataAccum)
        dispatchSSE(currentEvent, data)
      } catch { /* ignore */ }
    }

    // If stream ended without a 'done' event, synthesize one
    if (!state.done) {
      state.done = true
      state.doneData = state.doneData || {}
      broadcastToClients({
        type: 'SW_SSE_EVENT',
        sessionId,
        event: { type: 'done', data: state.doneData },
      })
    }

    // Final persist
    await persistState(sessionId, state)

    console.log('[stream-worker] Stream completed for session', sessionId,
      '| content:', state.fullContent.length, 'chars',
      '| tool_calls:', Object.keys(state.toolCalls).length)

  } catch (err) {
    if (err.name === 'AbortError') {
      // User cancelled
      state.done = true
      state.doneData = { aborted: true }
      await persistState(sessionId, state)
      broadcastToClients({
        type: 'SW_SSE_EVENT',
        sessionId,
        event: { type: 'done', data: { aborted: true } },
      })
    } else {
      state.error = err.message
      state.done = true
      await persistState(sessionId, state)
      broadcastToClients({ type: 'SW_STREAM_ERROR', sessionId, error: err.message })
    }
  } finally {
    activeStreams.delete(sessionId)
    // Notify clients that SW is no longer managing this stream
    broadcastToClients({ type: 'SW_STREAM_ENDED', sessionId })
  }
}

// ── Message handler ──
self.addEventListener('message', (event) => {
  const { type, sessionId } = event.data

  switch (type) {
    case 'START_STREAM':
      // Main page asks SW to manage the stream
      startStream(sessionId, event.data.requestInfo)
      break

    case 'RECOVER_STREAM':
      // Page came back after refresh — check if we have active/completed stream data
      (async () => {
        // Check active in-memory stream first
        const active = activeStreams.get(sessionId)
        if (active) {
          console.log('[stream-worker] RECOVER: Active stream found for', sessionId,
            '| events:', active.state.events.length,
            '| done:', active.state.done)
          event.source.postMessage({
            type: 'SW_STREAM_RECOVERY',
            sessionId,
            state: {
              ...active.state,
              toolCalls: Object.values(active.state.toolCalls),
            },
            isActive: true,
          })
          return
        }

        // Check Cache API for completed/persisted stream
        const persisted = await loadPersistedState(sessionId)
        if (persisted) {
          console.log('[stream-worker] RECOVER: Persisted state found for', sessionId,
            '| done:', persisted.done,
            '| content:', (persisted.fullContent || '').length)
          event.source.postMessage({
            type: 'SW_STREAM_RECOVERY',
            sessionId,
            state: {
              ...persisted,
              toolCalls: Array.isArray(persisted.toolCalls)
                ? persisted.toolCalls
                : Object.values(persisted.toolCalls || {}),
            },
            isActive: false,
          })
          // Clean up after recovery
          await clearPersistedState(sessionId)
          return
        }

        // No stream data found
        event.source.postMessage({
          type: 'SW_STREAM_RECOVERY',
          sessionId,
          state: null,
          isActive: false,
        })
      })()
      break

    case 'CANCEL_STREAM':
      // User wants to stop the stream
      {
        const stream = activeStreams.get(sessionId)
        if (stream) {
          stream.controller.abort()
          console.log('[stream-worker] Cancelled stream for session', sessionId)
        }
      }
      break

    case 'CLEAR_STREAM_STATE':
      // Clean up after page has fully processed the stream
      clearPersistedState(sessionId)
      activeStreams.delete(sessionId)
      break

    case 'PING':
      // Health check
      event.source.postMessage({ type: 'PONG', timestamp: Date.now() })
      break
  }
})
