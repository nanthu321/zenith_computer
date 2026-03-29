/**
 * streamWorkerManager.js — Bridge between React app and the stream Service Worker
 *
 * Manages:
 *   1. Service Worker registration and lifecycle
 *   2. Sending START_STREAM / RECOVER_STREAM / CANCEL_STREAM messages to SW
 *   3. Listening for SW_SSE_EVENT / SW_STREAM_RECOVERY messages from SW
 *   4. Providing a clean API for useChat.js to use
 *
 * The SW handles the actual SSE fetch() connection. This means:
 *   - Page refresh: SW keeps reading the stream, page recovers on reload
 *   - Tab close + reopen: SW may still be alive (browser-dependent, ~30s window)
 *   - Navigation away and back: SW stream continues, page recovers
 */

let _swRegistration = null
let _swReady = false
let _swReadyPromise = null
let _messageListeners = new Map()  // sessionId → Set<callback>
let _recoveryListeners = new Map() // sessionId → callback (one-shot)

// ── Register the Service Worker ──
export async function registerStreamWorker() {
  if (_swRegistration) return _swRegistration

  if (!('serviceWorker' in navigator)) {
    console.warn('[streamWorkerManager] Service Workers not supported in this browser')
    return null
  }

  try {
    _swRegistration = await navigator.serviceWorker.register('/stream-worker.js', {
      scope: '/',
    })

    console.log('[streamWorkerManager] Service Worker registered:', _swRegistration.scope)

    // Wait for the SW to become active
    _swReadyPromise = new Promise((resolve) => {
      if (_swRegistration.active) {
        _swReady = true
        resolve()
        return
      }

      const sw = _swRegistration.installing || _swRegistration.waiting
      if (sw) {
        sw.addEventListener('statechange', () => {
          if (sw.state === 'activated') {
            _swReady = true
            resolve()
          }
        })
      }

      // Fallback: use navigator.serviceWorker.ready
      navigator.serviceWorker.ready.then(() => {
        _swReady = true
        resolve()
      })
    })

    // Listen for messages from the SW
    navigator.serviceWorker.addEventListener('message', handleSWMessage)

    await _swReadyPromise
    return _swRegistration

  } catch (err) {
    console.warn('[streamWorkerManager] Failed to register Service Worker:', err.message)
    return null
  }
}

// ── Check if SW is available and ready ──
export function isStreamWorkerReady() {
  return _swReady && _swRegistration?.active != null
}

// ── Wait for SW to be ready ──
export async function waitForStreamWorker() {
  if (_swReady) return true
  if (_swReadyPromise) {
    await _swReadyPromise
    return true
  }
  return false
}

// ── Handle incoming messages from SW ──
function handleSWMessage(event) {
  const { type, sessionId } = event.data

  switch (type) {
    case 'SW_SSE_EVENT': {
      // Forward SSE event to registered listeners for this session
      const listeners = _messageListeners.get(sessionId)
      if (listeners) {
        for (const cb of listeners) {
          try {
            cb(event.data.event)
          } catch (err) {
            console.error('[streamWorkerManager] Listener error:', err)
          }
        }
      }
      break
    }

    case 'SW_STREAM_RECOVERY': {
      // One-shot recovery response
      const cb = _recoveryListeners.get(sessionId)
      if (cb) {
        _recoveryListeners.delete(sessionId)
        cb(event.data)
      }
      break
    }

    case 'SW_STREAM_ERROR': {
      const listeners = _messageListeners.get(sessionId)
      if (listeners) {
        for (const cb of listeners) {
          try {
            cb({ type: 'error', data: { error: event.data.error } })
          } catch (err) {
            console.error('[streamWorkerManager] Error listener error:', err)
          }
        }
      }
      break
    }

    case 'SW_STREAM_ENDED': {
      // Clean up listeners for this session
      // (Don't auto-remove — let useChat decide when to unsubscribe)
      console.log('[streamWorkerManager] Stream ended notification for', sessionId)
      break
    }

    case 'SW_STREAM_ALREADY_ACTIVE': {
      console.log('[streamWorkerManager] Stream already active for', sessionId)
      break
    }

    case 'PONG': {
      console.log('[streamWorkerManager] SW PONG received')
      break
    }
  }
}

// ── Send a message to the active Service Worker ──
function postToSW(message) {
  const sw = _swRegistration?.active || navigator.serviceWorker?.controller
  if (!sw) {
    console.warn('[streamWorkerManager] No active Service Worker to send message to')
    return false
  }
  sw.postMessage(message)
  return true
}

/**
 * Start a stream via the Service Worker.
 *
 * @param {string} sessionId
 * @param {object} requestInfo - { url, headers, body, assistantMsgId }
 * @param {function} onEvent - callback for each SSE event: (event) => void
 *                             event shape: { type: 'token'|'tool_start'|..., data: {...} }
 * @returns {function} unsubscribe function
 */
export function startStreamViaSW(sessionId, requestInfo, onEvent) {
  // Register listener
  if (!_messageListeners.has(sessionId)) {
    _messageListeners.set(sessionId, new Set())
  }
  _messageListeners.get(sessionId).add(onEvent)

  // Send start command to SW
  postToSW({
    type: 'START_STREAM',
    sessionId,
    requestInfo,
  })

  // Return unsubscribe function
  return () => {
    const listeners = _messageListeners.get(sessionId)
    if (listeners) {
      listeners.delete(onEvent)
      if (listeners.size === 0) {
        _messageListeners.delete(sessionId)
      }
    }
  }
}

/**
 * Subscribe to live events for a session (for recovery after page reload).
 * Used when the SW is already streaming and the page needs to catch up.
 *
 * @param {string} sessionId
 * @param {function} onEvent
 * @returns {function} unsubscribe
 */
export function subscribeToStream(sessionId, onEvent) {
  if (!_messageListeners.has(sessionId)) {
    _messageListeners.set(sessionId, new Set())
  }
  _messageListeners.get(sessionId).add(onEvent)

  return () => {
    const listeners = _messageListeners.get(sessionId)
    if (listeners) {
      listeners.delete(onEvent)
      if (listeners.size === 0) {
        _messageListeners.delete(sessionId)
      }
    }
  }
}

/**
 * Recover stream state from the Service Worker.
 * Call this on page load to check if there's an active/completed stream.
 *
 * @param {string} sessionId
 * @returns {Promise<{ state, isActive }>} - state is null if no stream found
 */
export function recoverStream(sessionId) {
  return new Promise((resolve) => {
    // Set a timeout in case SW doesn't respond
    const timeout = setTimeout(() => {
      _recoveryListeners.delete(sessionId)
      resolve({ state: null, isActive: false })
    }, 3000)

    _recoveryListeners.set(sessionId, (data) => {
      clearTimeout(timeout)
      resolve({
        state: data.state,
        isActive: data.isActive,
      })
    })

    const sent = postToSW({
      type: 'RECOVER_STREAM',
      sessionId,
    })

    if (!sent) {
      clearTimeout(timeout)
      _recoveryListeners.delete(sessionId)
      resolve({ state: null, isActive: false })
    }
  })
}

/**
 * Cancel an active stream via the Service Worker.
 */
export function cancelStreamViaSW(sessionId) {
  postToSW({ type: 'CANCEL_STREAM', sessionId })
  _messageListeners.delete(sessionId)
}

/**
 * Clear persisted stream state (call after successful recovery/processing).
 */
export function clearStreamStateSW(sessionId) {
  postToSW({ type: 'CLEAR_STREAM_STATE', sessionId })
  _messageListeners.delete(sessionId)
}

/**
 * Unregister all listeners for a session.
 */
export function unsubscribeAll(sessionId) {
  _messageListeners.delete(sessionId)
  _recoveryListeners.delete(sessionId)
}
