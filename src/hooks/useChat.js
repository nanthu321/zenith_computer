import { useState, useCallback, useRef, useEffect } from 'react'
import { apiFetch, streamChat } from '../utils/api.js'
import { saveToolCalls, enrichMessagesFromDB, deleteSessionToolCalls, evictOldRecords } from '../utils/toolCallsDB.js'
import { getArtifactsCache, setArtifactsCache, clearArtifactsCache } from '../utils/artifactsCache.js'
import { isStreamWorkerReady, recoverStream as recoverStreamFromSW, subscribeToStream, clearStreamStateSW } from '../utils/streamWorkerManager.js'

/**
 * Normalize any possible backend response shape into a flat messages array.
 * Handles: plain array, { messages: [] }, { data: [] }, paginated { content: [] },
 * single message object, and nested wrappers.
 */
function normalizeMessageList(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'object') {
    // Try common wrapper keys in priority order
    for (const key of ['messages', 'data', 'content', 'items', 'results', 'records']) {
      if (Array.isArray(raw[key])) return raw[key]
    }
    // Single message object with role + content → wrap in array
    if (raw.role && (raw.content !== undefined)) return [raw]
  }
  return []
}

/**
 * Deduplicate a flat messages array.
 * Removes exact message_id duplicates AND content+role+timestamp-proximity duplicates
 * (catches cases where the same message exists with both a temp_ ID and a real backend ID).
 */
function deduplicateMessages(msgs) {
  if (!msgs || msgs.length === 0) return []

  const seen = new Map() // message_id → message
  const result = []

  for (const msg of msgs) {
    const mid = String(msg.message_id ?? '')

    // Skip exact ID duplicates
    if (seen.has(mid)) continue

    // Check for content+role+time proximity duplicates
    // (same role, same content, within 5 seconds of each other)
    let isDupe = false
    for (const existing of result) {
      if (existing.role === msg.role &&
          existing.content === msg.content &&
          existing.content !== '' &&  // Don't dedup empty messages
          (Math.abs(new Date(existing.created_at).getTime() - new Date(msg.created_at).getTime()) < 5000 || existing._recovered || msg._recovered)) {
        isDupe = true
        // Prefer the message with a real (non-temp) ID
        if (mid && !mid.startsWith('temp_') && String(existing.message_id).startsWith('temp_')) {
          // Replace the temp version with the real one
          const idx = result.indexOf(existing)
          result[idx] = msg
          seen.delete(String(existing.message_id))
          seen.set(mid, msg)
        }
        // Prefer non-recovered message over recovered one
        if (!msg._recovered && existing._recovered) {
          const idx = result.indexOf(existing)
          result[idx] = msg
          seen.delete(String(existing.message_id))
          seen.set(mid, msg)
        }
        break
      }
    }

    if (!isDupe) {
      seen.set(mid, msg)
      result.push(msg)
    }
  }

  return result
}

/**
 * Merge API-fetched messages with in-memory cached messages.
 * This ensures that:
 *  - User messages that weren't persisted by the backend still appear (from cache)
 *  - Backend messages take priority for assistant responses
 *  - No duplicate messages (de-duplicated by message_id AND by content+role+time proximity)
 *
 * IMPORTANT: When merging, we preserve tool_calls and generation_time from cached
 * messages if the API response doesn't include them. This ensures SSE-accumulated
 * data survives even if the backend doesn't persist it.
 *
 * CRITICAL FIX: We also protect freshly-streamed content from being overwritten by
 * the API response. After streaming completes, the in-memory cache has the FULL
 * content accumulated from all token events. The backend may return a truncated or
 * stale version. We detect this by comparing content lengths and preserving whichever
 * is longer (the stream-accumulated version wins over shorter API-returned content).
 */
function mergeMessages(apiMessages, cachedMessages) {
  if (!cachedMessages || cachedMessages.length === 0) return deduplicateMessages(apiMessages)
  if (!apiMessages || apiMessages.length === 0) return deduplicateMessages(cachedMessages)

  // Build a set of known API message IDs for quick lookup
  const apiIds = new Set(apiMessages.map(m => String(m.message_id)))

  // Build a cache lookup map for enriching API messages with SSE data.
  // Index by BOTH the real ID and any temp ID that was mapped to the real ID.
  const cacheById = new Map()
  const cacheTempById = new Map()  // temp_assistant_ ID → cached msg
  for (const m of cachedMessages) {
    cacheById.set(String(m.message_id), m)
    // Track temp IDs so we can match against real backend IDs
    if (m._tempId) {
      cacheTempById.set(String(m._tempId), m)
    }
  }

  // Enrich API messages: if a cached version has tool_calls, generation_time,
  // or LONGER content that the API version lacks/truncates, preserve from cache.
  const enrichedApiMessages = apiMessages.map(apiMsg => {
    const cached = cacheById.get(String(apiMsg.message_id))
      || cacheTempById.get(String(apiMsg.message_id))
    if (!cached) return apiMsg

    const enriched = { ...apiMsg }

    // ── CRITICAL: Preserve LONGER content from cache ──
    // After streaming, cache has fullContent (all token events accumulated).
    // The API may return a shorter/truncated version if the backend stored
    // the message before all tokens arrived, or if this is a re-fetched
    // historical message from a previous session.
    //
    // Rule: if cached content is longer than API content, cache wins.
    // This protects against fetchMessages() overwriting freshly-streamed content.
    const cachedLen = (cached.content || '').length
    const apiLen    = (apiMsg.content || '').length
    if (cachedLen > apiLen && !cached.isStreaming) {
      enriched.content = cached.content
      console.log('[useChat] mergeMessages: preserved longer cached content',
        `(cache=${cachedLen} > api=${apiLen}) for msg`, apiMsg.message_id)
    }

    // Preserve tool_calls from cache if API doesn't have them
    if ((!apiMsg.tool_calls || apiMsg.tool_calls.length === 0) &&
        cached.tool_calls && cached.tool_calls.length > 0) {
      enriched.tool_calls = cached.tool_calls
    }

    // Preserve generation_time from cache if API doesn't have it
    if (!apiMsg.generation_time && cached.generation_time) {
      enriched.generation_time = cached.generation_time
    }

    // Preserve streaming_started_at from cache
    if (!apiMsg.streaming_started_at && cached.streaming_started_at) {
      enriched.streaming_started_at = cached.streaming_started_at
    }

    return enriched
  })

  // Find cached messages that are NOT in the API response.
  // These are typically:
  //   a) User messages with temp_ IDs that the backend didn't store
  //   b) Freshly-streamed assistant messages whose temp_ ID hasn't been
  //      matched to a real backend ID yet (e.g. backend returned a different ID)
  const missingFromApi = cachedMessages.filter(m => {
    const mid = String(m.message_id ?? '')
    // Already in API response — skip
    if (apiIds.has(mid)) return false
    // If it's a temp user message, it's likely not in the API response — include it
    if (mid.startsWith('temp_user_') && m.role === 'user') return true
    // If it's a freshly-streamed assistant message that's still streaming — include it
    // (backend won't have it yet; we don't want to lose it during the fetch)
    if (mid.startsWith('temp_assistant_') && m.role === 'assistant' && m.isStreaming) return true
    // If it's a recovered message (from SW/localStorage after page refresh) — include it
    // unless the API already has a message with matching content
    if (m._recovered && m.role === 'assistant' && m.content) {
      // Check if any API message has the same content (the backend version)
      const hasMatchingContent = apiMessages.some(api =>
        api.role === 'assistant' && api.content === m.content
      )
      if (!hasMatchingContent) return true
    }
    // If it's a non-temp message not in API, API is the source of truth — skip
    return false
  })

  if (missingFromApi.length === 0) return deduplicateMessages(enrichedApiMessages)

  // Merge: interleave cached user messages at the correct positions
  // Strategy: for each missing user message, find where it should go based on created_at
  const merged = [...enrichedApiMessages]
  for (const userMsg of missingFromApi) {
    const userTime = new Date(userMsg.created_at).getTime()
    // Find the position where this user message should be inserted
    // It should come right before the first API message that has a later timestamp
    let insertIdx = merged.length
    for (let i = 0; i < merged.length; i++) {
      const msgTime = new Date(merged[i].created_at).getTime()
      if (msgTime > userTime) {
        insertIdx = i
        break
      }
    }
    merged.splice(insertIdx, 0, userMsg)
  }

  const dedupedResult = deduplicateMessages(merged)

  console.log('[useChat] mergeMessages: API had', apiMessages.length,
    ', cache had', cachedMessages.length,
    ', merged', missingFromApi.length, 'user msgs → deduped total', dedupedResult.length)
  return dedupedResult
}

// ─────────────────────────────────────────────────────────────────────────────
//  INCREMENTAL TOOL_CALLS PERSISTENCE
//
//  Problem:  Tool calls were only persisted in onDone. If the user refreshes
//            the page DURING streaming (before onDone fires), all accumulated
//            tool_calls are lost — including create_project results.
//
//  Solution: Persist tool_calls incrementally to localStorage on EVERY
//            onToolResult event. This is a lightweight, synchronous write
//            that ensures partial progress survives page refresh.
//
//  Storage key: zenith_streaming_{sessionId}
//  Format: { assistantMsgId, toolCalls: {...}, fullContent, streamingStartedAt, updatedAt }
//
//  Lifecycle:
//    - Created on first onToolResult (or onToolStart for safety)
//    - Updated on every onToolResult and periodically on onToken
//    - Deleted in onDone (after final persistence to localStorage + cache)
//    - Read by fetchMessages on page load to recover partial streaming data
// ─────────────────────────────────────────────────────────────────────────────

const STREAMING_STATE_PREFIX = 'zenith_streaming_'

/**
 * Save in-progress streaming state to localStorage (synchronous, fast).
 * Called on every onToolResult so partial tool_calls survive page refresh.
 */
function saveStreamingState(sessionId, state) {
  if (!sessionId) return
  try {
    const key = STREAMING_STATE_PREFIX + sessionId
    localStorage.setItem(key, JSON.stringify({
      ...state,
      _updatedAt: Date.now(),
    }))
  } catch (e) {
    console.warn('[useChat] Failed to save streaming state:', e.message)
  }
}

/**
 * Load in-progress streaming state from localStorage.
 * Returns null if no state exists or if it's too old (> 10 minutes).
 */
function loadStreamingState(sessionId) {
  if (!sessionId) return null
  try {
    const key = STREAMING_STATE_PREFIX + sessionId
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const state = JSON.parse(raw)
    // Discard stale state (older than 10 minutes — stream is surely dead)
    if (state._updatedAt && (Date.now() - state._updatedAt) > 10 * 60 * 1000) {
      localStorage.removeItem(key)
      return null
    }
    return state
  } catch {
    return null
  }
}

/**
 * Clear streaming state after onDone (no longer needed — final data is in localStorage cache).
 */
function clearStreamingState(sessionId) {
  if (!sessionId) return
  try {
    localStorage.removeItem(STREAMING_STATE_PREFIX + sessionId)
  } catch { /* ignore */ }
}


// ─────────────────────────────────────────────────────────────────────────────
//  USER MESSAGE PERSISTENCE
//
//  Problem:  The backend GET /api/messages/:sessionId does NOT return user
//            messages. They only exist in the in-memory cache (messagesCacheRef),
//            which is lost on page refresh. After refresh, only assistant
//            messages (from the API) are displayed — the user's sent messages
//            disappear.
//
//  Solution: Persist user messages to localStorage when they are created in
//            sendMessage(). On page load / fetchMessages(), load them back
//            and merge with the API response so the full conversation is shown.
//
//  Storage key: zenith_user_msgs_{sessionId}
//  Format: Array of { message_id, role, content, images?, created_at }
//
//  Lifecycle:
//    - Created when sendMessage() fires (optimistic user message)
//    - Updated in onDone when backend returns user_message_id (real ID replaces temp)
//    - Read by fetchMessages() on page load to merge with API messages
//    - Deleted when session is deleted (cleanupSession)
//    - Evicted if older than 30 days
// ─────────────────────────────────────────────────────────────────────────────

const USER_MSGS_PREFIX = 'zenith_user_msgs_'
const USER_MSGS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/**
 * Save a user message to localStorage for a given session.
 * Appends to existing messages for that session.
 */
function persistUserMessage(sessionId, userMsg) {
  if (!sessionId || !userMsg) return
  try {
    const key = USER_MSGS_PREFIX + sessionId
    const existing = JSON.parse(localStorage.getItem(key) || '[]')
    // Avoid duplicates by message_id
    if (existing.some(m => m.message_id === userMsg.message_id)) return
    existing.push({
      message_id: userMsg.message_id,
      role: userMsg.role,
      content: userMsg.content,
      images: userMsg.images || undefined,
      created_at: userMsg.created_at,
      _persisted_at: Date.now(),
    })
    localStorage.setItem(key, JSON.stringify(existing))
  } catch (e) {
    console.warn('[useChat] Failed to persist user message:', e.message)
  }
}

/**
 * Update a persisted user message's ID (replace temp ID with real backend ID).
 */
function updatePersistedUserMessageId(sessionId, tempId, realId) {
  if (!sessionId || !tempId || !realId) return
  try {
    const key = USER_MSGS_PREFIX + sessionId
    const existing = JSON.parse(localStorage.getItem(key) || '[]')
    let changed = false
    for (let i = 0; i < existing.length; i++) {
      if (existing[i].message_id === tempId) {
        existing[i].message_id = realId
        changed = true
        break
      }
    }
    if (changed) {
      localStorage.setItem(key, JSON.stringify(existing))
    }
  } catch (e) {
    console.warn('[useChat] Failed to update persisted user message ID:', e.message)
  }
}

/**
 * Load persisted user messages for a session from localStorage.
 * Returns an array of user message objects, or empty array.
 */
function loadPersistedUserMessages(sessionId) {
  if (!sessionId) return []
  try {
    const key = USER_MSGS_PREFIX + sessionId
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const msgs = JSON.parse(raw)
    // Discard stale entries
    const cutoff = Date.now() - USER_MSGS_MAX_AGE_MS
    const valid = msgs.filter(m => (m._persisted_at || 0) > cutoff)
    if (valid.length !== msgs.length) {
      localStorage.setItem(key, JSON.stringify(valid))
    }
    return valid
  } catch {
    return []
  }
}

/**
 * Delete persisted user messages for a session (called on session delete).
 */
function clearPersistedUserMessages(sessionId) {
  if (!sessionId) return
  try {
    localStorage.removeItem(USER_MSGS_PREFIX + sessionId)
  } catch { /* ignore */ }
}

/**
 * Evict old persisted user message entries (>30 days) across all sessions.
 * Called periodically to prevent localStorage bloat.
 */
function evictOldUserMessages() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(USER_MSGS_PREFIX)) keys.push(k)
    }
    const cutoff = Date.now() - USER_MSGS_MAX_AGE_MS
    for (const key of keys) {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const msgs = JSON.parse(raw)
      const valid = msgs.filter(m => (m._persisted_at || 0) > cutoff)
      if (valid.length === 0) {
        localStorage.removeItem(key)
      } else if (valid.length !== msgs.length) {
        localStorage.setItem(key, JSON.stringify(valid))
      }
    }
  } catch { /* ignore */ }
}

export function useChat() {
  const [messages, setMessages]         = useState([])
  const [isStreaming, setIsStreaming]    = useState(false)
  const [error, setError]               = useState(null)
  const [agentEvents, setAgentEvents]   = useState([])
  const [artifacts, setArtifacts]       = useState([])

  // ── Per-session caches (in-memory, fast) ──
  const messagesCacheRef                = useRef({})    // sessionId -> messages[]
  const agentEventsCacheRef             = useRef({})    // sessionId -> agentEvents[]
  const artifactsCacheRef               = useRef({})    // sessionId -> artifacts[]
  const streamingSessionsRef            = useRef(new Set())
  const abortControllersRef             = useRef({})    // sessionId -> controller
  const isSendingRef                    = useRef(new Set())
  const activeSessionRef                = useRef(null)

  // Track in-flight fetchMessages calls to avoid duplicate API calls
  const fetchInFlightRef                = useRef({})    // sessionId -> Promise

  // Track sessions that just finished streaming — skip re-fetching their messages
  // immediately after onDone to protect freshly-streamed content from being
  // overwritten by a potentially stale/truncated API response.
  // Key: sessionId, Value: timestamp (ms) when streaming completed
  const recentlyStreamedRef             = useRef({})    // sessionId -> completedAt (ms)
  const RECENTLY_STREAMED_TTL_MS        = 8000          // 8 seconds protection window

  // ── FIX: Track active streaming state in refs for beforeunload flush ──
  // Each entry: { sessionId, assistantMsgId, fullContent, activeToolCalls, streamingStartedAt }
  const activeStreamingStateRef         = useRef({})    // sessionId -> streaming state

  // Live refs to current React state (synchronous reads, no stale closures)
  const messagesRef     = useRef([])
  const agentEventsRef  = useRef([])
  const artifactsRef    = useRef([])

  // Wrapper setters that keep refs in sync with React state
  const _setMessages = useCallback((val) => {
    setMessages(prev => {
      const next = typeof val === 'function' ? val(prev) : val
      messagesRef.current = next
      return next
    })
  }, [])

  const _setAgentEvents = useCallback((val) => {
    setAgentEvents(prev => {
      const next = typeof val === 'function' ? val(prev) : val
      agentEventsRef.current = next
      return next
    })
  }, [])

  const _setArtifacts = useCallback((val) => {
    setArtifacts(prev => {
      const next = typeof val === 'function' ? val(prev) : val
      artifactsRef.current = next
      return next
    })
  }, [])

  // Project status callbacks — registered by ChatPage to update ProjectStatusContext
  const onProjectStatusChangeRef = useRef(null)

  const setOnProjectStatusChange = useCallback((callback) => {
    onProjectStatusChangeRef.current = callback
  }, [])

  // Background completion callbacks — registered by ChatPage
  const onBackgroundCompleteRef = useRef(null)

  const setOnBackgroundComplete = useCallback((callback) => {
    onBackgroundCompleteRef.current = callback
  }, [])

  // 409 Conflict callback — registered by ChatPage to auto-queue on conflict
  const onConflictQueueRef = useRef(null)

  const setOnConflictQueue = useCallback((callback) => {
    onConflictQueueRef.current = callback
  }, [])

  // ── FIX: beforeunload handler to flush streaming state on page refresh ──
  // This ensures that if the user refreshes while a project is being created,
  // the accumulated tool_calls are persisted to localStorage before the page unloads.
  useEffect(() => {
    const handleBeforeUnload = () => {
      const activeStates = activeStreamingStateRef.current
      for (const [sessionId, state] of Object.entries(activeStates)) {
        if (!state) continue
        const toolCallsArr = Object.values(state.activeToolCalls || {})
        if (toolCallsArr.length === 0 && !state.fullContent) continue

        console.log('[useChat] beforeunload: flushing streaming state for session', sessionId,
          '| tool_calls:', toolCallsArr.length, '| content:', (state.fullContent || '').length, 'chars')

        // Save to localStorage (synchronous — safe in beforeunload)
        saveStreamingState(sessionId, {
          assistantMsgId: state.assistantMsgId,
          toolCalls: toolCallsArr,
          fullContent: state.fullContent || '',
          streamingStartedAt: state.streamingStartedAt,
          sessionId,
        })
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // ── Helper: Save current active session's React state into cache ──
  const _saveCurrentToCache = useCallback(() => {
    const sid = activeSessionRef.current
    if (sid) {
      messagesCacheRef.current[sid]    = messagesRef.current
      agentEventsCacheRef.current[sid] = agentEventsRef.current
      artifactsCacheRef.current[sid]   = artifactsRef.current
    }
  }, [])

  // ── Helper: update cache and optionally React state ──
  //
  // CRITICAL: This function is called by streaming callbacks (onToken, onToolStart,
  // onToolResult, etc.) which run in closures anchored to the ChatContext — they
  // continue firing even when ChatPage is unmounted (e.g. user navigated to
  // /workspace). The cache is ALWAYS updated. React state is updated ONLY if the
  // session is currently the active session visible in the UI.
  //
  // When the user navigates back to /chat, setActiveSession syncs React state
  // from the cache, so all tokens accumulated while away are instantly visible.
  const updateMessagesForSession = useCallback((sessionId, updater) => {
    const currentCached = messagesCacheRef.current[sessionId] || []
    const newMessages = typeof updater === 'function' ? updater(currentCached) : updater

    // Deduplicate to prevent triple/duplicate message rendering
    const deduped = deduplicateMessages(newMessages)
    messagesCacheRef.current[sessionId] = deduped

    if (activeSessionRef.current === sessionId) {
      _setMessages(deduped)
    }
  }, [_setMessages])

  const updateAgentEventsForSession = useCallback((sessionId, updater) => {
    const currentCached = agentEventsCacheRef.current[sessionId] || []
    const newEvents = typeof updater === 'function' ? updater(currentCached) : updater
    agentEventsCacheRef.current[sessionId] = newEvents

    if (activeSessionRef.current === sessionId) {
      _setAgentEvents(newEvents)
    }
  }, [_setAgentEvents])

  const updateArtifactsForSession = useCallback((sessionId, updater) => {
    const currentCached = artifactsCacheRef.current[sessionId] || []
    const newArtifacts = typeof updater === 'function' ? updater(currentCached) : updater
    artifactsCacheRef.current[sessionId] = newArtifacts

    // Persist to localStorage so artifacts survive page refresh
    if (newArtifacts.length > 0) {
      setArtifactsCache(sessionId, newArtifacts)
    }

    if (activeSessionRef.current === sessionId) {
      _setArtifacts(newArtifacts)
    }
  }, [_setArtifacts])

  // ── Called by ChatPage whenever activeSessionId changes ──
  // Restores from in-memory cache first,
  // then the subsequent fetchMessages call in ChatPage fills in fresh API data.
  const setActiveSession = useCallback((sessionId) => {
    const prevSessionId = activeSessionRef.current

    // Helper: resolve best available messages for a session from memory cache
    const _resolveMessages = (sid) => {
      let msgs = messagesCacheRef.current[sid]
      if (msgs && msgs.length > 0) return { msgs, source: 'memory' }
      return { msgs: [], source: 'none' }
    }

    // Helper: resolve artifacts — memory cache first, then localStorage fallback
    const _resolveArtifacts = (sid) => {
      const memArts = artifactsCacheRef.current[sid]
      if (memArts && memArts.length > 0) return memArts
      // Fallback: restore from localStorage (survives page refresh)
      const persisted = getArtifactsCache(sid)
      if (persisted.length > 0) {
        artifactsCacheRef.current[sid] = persisted
        console.log('[useChat] setActiveSession: restored', persisted.length, 'artifacts from localStorage for', sid)
      }
      return persisted
    }

    // Same session — just ensure React state matches cache (StrictMode safety)
    if (prevSessionId === sessionId) {
      if (sessionId) {
        const { msgs, source } = _resolveMessages(sessionId)
        if (msgs.length > 0) {
          _setMessages(msgs)
        }
        _setAgentEvents(agentEventsCacheRef.current[sessionId] || [])
        _setArtifacts(_resolveArtifacts(sessionId))
        setIsStreaming(streamingSessionsRef.current.has(sessionId))
        console.log('[useChat] setActiveSession (same):', sessionId,
          '| msgs:', msgs.length, 'from', source)
      }
      return
    }

    // STEP 1: Save outgoing session state
    if (prevSessionId) {
      _saveCurrentToCache()
    }

    // STEP 2: Activate new session
    activeSessionRef.current = sessionId
    setIsStreaming(streamingSessionsRef.current.has(sessionId))

    // STEP 3: Restore cached data (memory → localStorage → empty)
    const { msgs, source } = _resolveMessages(sessionId)
    const events    = agentEventsCacheRef.current[sessionId] || []
    const arts      = _resolveArtifacts(sessionId)

    // Deduplicate messages on restore to prevent rendering duplicates
    const dedupedMsgs = deduplicateMessages(msgs)
    messagesCacheRef.current[sessionId] = dedupedMsgs

    _setMessages(dedupedMsgs)
    _setAgentEvents(events)
    _setArtifacts(arts)
    setError(null)

    console.log('[useChat] setActiveSession:', prevSessionId, '→', sessionId,
      '| msgs:', msgs.length, 'from', source,
      '| artifacts:', arts.length)
  }, [_saveCurrentToCache, _setMessages, _setAgentEvents, _setArtifacts])

  // ── Fetch messages from API (for loading history) ──
  //
  // KEY DESIGN:
  //  1. Deduplicates in-flight requests per session (avoids double-fetch race)
  //  2. Uses normalizeMessageList() to handle ANY backend response shape
  //  3. Merges API results with in-memory cache to recover user messages
  //     that the backend may not persist
  //  4. Never wipes good cached data on API error
  //  5. Always syncs React state if session is still active when response arrives
  //  6. FIX: Recovers partial streaming state from localStorage (tool_calls
  //     accumulated before a page refresh mid-stream)
  //
  const fetchMessages = useCallback(async (sessionId) => {
    if (!sessionId) return []

    // ── Guard: Never fetch during active streaming ──
    // If this session is currently streaming, the in-memory cache is the
    // live, authoritative source. Fetching from the API would return stale
    // data and could cause the streaming content to be replaced mid-stream.
    // ChatPage also has this guard, but we add it here for belt-and-suspenders
    // safety (e.g. direct calls from components other than ChatPage).
    if (streamingSessionsRef.current.has(sessionId)) {
      const cachedMsgs = messagesCacheRef.current[sessionId] || []
      console.log('[useChat] fetchMessages: skipping — session', sessionId, 'is currently streaming',
        '| cache has', cachedMsgs.length, 'messages')
      if (activeSessionRef.current === sessionId && cachedMsgs.length > 0) {
        _setMessages(cachedMsgs)
      }
      return cachedMsgs
    }

    // ── FIX: Skip API fetch for sessions that JUST finished streaming ──
    // After onDone fires, the in-memory cache has the complete, authoritative
    // content for the session (fullContent accumulated from all token events).
    // Calling fetchMessages immediately after would overwrite this with whatever
    // the backend has stored — which may be:
    //   a) Truncated (backend stored before all tokens arrived)
    //   b) From a previous conversation turn (backend reuses message IDs)
    //   c) Missing tool_calls (backend doesn't always persist SSE metadata)
    //
    // We protect the freshly-streamed content by skipping the API call for
    // RECENTLY_STREAMED_TTL_MS milliseconds after streaming completes.
    // After the TTL, we allow re-fetch so history loads correctly on revisit.
    const recentStreamTime = recentlyStreamedRef.current[sessionId]
    if (recentStreamTime) {
      const age = Date.now() - recentStreamTime
      if (age < RECENTLY_STREAMED_TTL_MS) {
        const cachedMsgs = messagesCacheRef.current[sessionId] || []
        console.log('[useChat] fetchMessages: skipping API fetch for recently-streamed session',
          sessionId, `(${age}ms ago, TTL=${RECENTLY_STREAMED_TTL_MS}ms)`,
          '| cache has', cachedMsgs.length, 'messages')
        // Still sync React state from cache to ensure UI is up-to-date
        if (activeSessionRef.current === sessionId && cachedMsgs.length > 0) {
          _setMessages(cachedMsgs)
        }
        return cachedMsgs
      } else {
        // TTL expired — clear the protection and allow normal fetch
        delete recentlyStreamedRef.current[sessionId]
      }
    }

    // Deduplicate: if a fetch is already in flight for this session, return that promise
    if (fetchInFlightRef.current[sessionId]) {
      console.log('[useChat] fetchMessages: reusing in-flight promise for', sessionId)
      return fetchInFlightRef.current[sessionId]
    }

    const fetchPromise = (async () => {
      try {
        console.log('[useChat] fetchMessages: calling GET /api/messages/' + sessionId)
        const rawData = await apiFetch(`/api/messages/${sessionId}`)

        // ── Deep-log the raw response so we can diagnose backend format issues ──
        console.log('[useChat] fetchMessages raw response for', sessionId, ':',
          JSON.stringify(rawData)?.substring(0, 500))

        // ── Normalize: handle { messages: [] }, { data: [] }, plain [], etc. ──
        const normalized = normalizeMessageList(rawData)
        console.log('[useChat] fetchMessages normalized:', normalized.length, 'messages for session', sessionId)

        // ── FIX: Merge persisted user messages from localStorage ──
        // The backend does NOT return user messages in GET /api/messages/:sessionId.
        // We persist user messages to localStorage in sendMessage() and merge them
        // back here so the full conversation is shown after page refresh.
        const persistedUserMsgs = loadPersistedUserMessages(sessionId)
        if (persistedUserMsgs.length > 0) {
          const apiMsgIds = new Set(normalized.map(m => String(m.message_id)))
          // Also check by content+role to avoid duplicates if backend DOES return some user messages
          const apiUserContents = new Set(
            normalized.filter(m => m.role === 'user').map(m => m.content)
          )
          for (const um of persistedUserMsgs) {
            // Skip if already in API response (by ID or by content match)
            if (apiMsgIds.has(String(um.message_id))) continue
            if (apiUserContents.has(um.content)) continue
            // Insert at correct chronological position
            const umTime = new Date(um.created_at).getTime()
            let insertIdx = normalized.length
            for (let i = 0; i < normalized.length; i++) {
              const mTime = new Date(normalized[i].created_at).getTime()
              if (mTime > umTime) { insertIdx = i; break }
            }
            normalized.splice(insertIdx, 0, um)
          }
          console.log('[useChat] fetchMessages: merged', persistedUserMsgs.length,
            'persisted user messages for session', sessionId,
            '| total messages now:', normalized.length)
        }

        // ── Enrich API messages with persisted tool_calls ──
        // The backend GET /api/messages/:sessionId does NOT return tool_calls
        // or generation_time. We persist these in localStorage during streaming
        // and re-attach them here on page load.
        //
        // Two enrichment layers:
        //   1. localStorage (primary) — survives tab close, matched by
        //      msgId + tempId + contentHash + positionIndex
        //   2. Streaming state recovery — partial tool_calls saved
        //      incrementally during streaming, survives mid-stream refresh

        // Layer 1: localStorage enrichment
        let enriched = await enrichMessagesFromDB(sessionId, normalized)

        // Layer 2: Recover partial streaming state from localStorage
        // (for mid-stream page refresh — tool_calls accumulated before onDone)
        const streamingState = loadStreamingState(sessionId)
        if (streamingState?.toolCalls?.length > 0) {
          const lastAssistantIdx = enriched.map((m, i) => ({ m, i }))
            .filter(({ m }) => m.role === 'assistant')
            .pop()

          if (lastAssistantIdx && !lastAssistantIdx.m.tool_calls?.length) {
            enriched = enriched.map((m, i) => {
              if (i !== lastAssistantIdx.i) return m
              return {
                ...m,
                tool_calls: streamingState.toolCalls,
                generation_time: streamingState.streamingStartedAt
                  ? ((Date.now() - streamingState.streamingStartedAt) / 1000).toFixed(1)
                  : undefined,
                content: (streamingState.fullContent || '').length > (m.content || '').length
                  ? streamingState.fullContent
                  : m.content,
              }
            })
          }

          // Promote recovered data to localStorage tool_calls store, then clear streaming state
          const positionIndex = enriched.filter(m => m.role === 'assistant').length - 1
          saveToolCalls(sessionId, {
            msgId:          '',
            tempId:         streamingState.assistantMsgId || '',
            contentText:    streamingState.fullContent || '',
            positionIndex:  positionIndex >= 0 ? positionIndex : 0,
            toolCalls:      streamingState.toolCalls,
            generationTime: streamingState.streamingStartedAt
              ? ((Date.now() - streamingState.streamingStartedAt) / 1000).toFixed(1)
              : '',
          }).then(() => clearStreamingState(sessionId)).catch(() => {})
        }

        // ── Load in-memory cache for merging ──
        const cachedMessages = messagesCacheRef.current[sessionId] || []

        // ── Merge: combine API messages with cached user messages ──
        // The backend may not persist user messages (only assistant responses).
        // Our in-memory cache has the user messages. Merge them together.
        // ALSO: mergeMessages now enriches API messages with tool_calls and
        // generation_time from cache if the API didn't return them.
        const finalMessages = mergeMessages(enriched, cachedMessages)

        // If session is currently streaming, preserve in-progress temp messages
        if (streamingSessionsRef.current.has(sessionId)) {
          const liveCached = messagesCacheRef.current[sessionId] || []
          const tempMsgs = liveCached.filter(m =>
            m.isStreaming || String(m.message_id ?? '').startsWith('temp_assistant_')
          )
          if (tempMsgs.length > 0) {
            console.log('[useChat] fetchMessages: merging', finalMessages.length, 'msgs with', tempMsgs.length, 'streaming temp msgs')
            const withTemp = [...finalMessages, ...tempMsgs]
            messagesCacheRef.current[sessionId] = withTemp
            if (activeSessionRef.current === sessionId) {
              _setMessages(withTemp)
            }
            return withTemp
          }
        }

        // If API returned empty and we have cached data — keep cache
        if (finalMessages.length === 0 && cachedMessages.length > 0) {
          console.log('[useChat] fetchMessages: API empty, keeping', cachedMessages.length, 'cached messages')
          messagesCacheRef.current[sessionId] = cachedMessages
          if (activeSessionRef.current === sessionId) {
            _setMessages(cachedMessages)
          }
          return cachedMessages
        }

        // ── Store final merged & deduplicated result ──
        const dedupedFinal = deduplicateMessages(finalMessages)
        messagesCacheRef.current[sessionId] = dedupedFinal

        if (activeSessionRef.current === sessionId) {
          _setMessages(dedupedFinal)

          // ── Restore artifacts from localStorage if in-memory cache is empty ──
          // This handles page refresh: in-memory cache is gone but localStorage persists.
          const memArts = artifactsCacheRef.current[sessionId]
          if (!memArts || memArts.length === 0) {
            const persistedArts = getArtifactsCache(sessionId)
            if (persistedArts.length > 0) {
              artifactsCacheRef.current[sessionId] = persistedArts
              _setArtifacts(persistedArts)
              console.log('[useChat] fetchMessages: restored', persistedArts.length,
                'artifacts from localStorage for session', sessionId)
            }
          }
        }

        return dedupedFinal
      } catch (err) {
        // On error: clear recently-streamed protection so next manual fetch can proceed
        if (recentlyStreamedRef.current[sessionId]) {
          delete recentlyStreamedRef.current[sessionId]
        }
        console.error('[useChat] fetchMessages error for session', sessionId, ':', err.message)

        // ── On error: fall back to in-memory cache — never show empty if we have data ──
        const existingCache = messagesCacheRef.current[sessionId]
        const fallback = (existingCache && existingCache.length > 0)
          ? existingCache
          : []

        if (fallback.length > 0) {
          console.log('[useChat] fetchMessages: using', fallback.length, 'cached messages after error')
          messagesCacheRef.current[sessionId] = fallback
          if (activeSessionRef.current === sessionId) {
            _setMessages(fallback)
          }
          return fallback
        }

        // Also clear the fetch cache so a retry can proceed
        messagesCacheRef.current[sessionId] = []
        return []
      } finally {
        delete fetchInFlightRef.current[sessionId]
      }
    })()

    fetchInFlightRef.current[sessionId] = fetchPromise
    return fetchPromise
  }, [_setMessages, _setArtifacts])

  // ── Send message ──
  const sendMessage = useCallback((sessionId, content, onSessionTitleUpdate, images = []) => {
    // ── GUARD: Set isSendingRef FIRST — synchronously, before any async work.
    //
    //    This is the primary fix for "request sent twice":
    //    The original code checked the guard but only called isSendingRef.add()
    //    AFTER the validation block — leaving a race window where two concurrent
    //    calls (e.g. React StrictMode double-invoke, rapid double-submit, or the
    //    setTimeout race in handleSendMessage) could both pass the guard check
    //    before either had written to isSendingRef.
    //
    //    By adding to isSendingRef as the very first operation we close this
    //    window completely: the second call always sees the guard set.
    // ──
    if (streamingSessionsRef.current.has(sessionId) || isSendingRef.current.has(sessionId)) {
      console.log('[useChat] Message send prevented for session', sessionId, '- already streaming or sending')
      return
    }

    // ✅ FIX: Mark as sending IMMEDIATELY — synchronous, before any async work
    isSendingRef.current.add(sessionId)

    if (!content.trim() && images.length === 0) {
      // Content validation AFTER guard is set — still release the guard on bail-out
      isSendingRef.current.delete(sessionId)
      console.log('[useChat] Message send bailed out (empty content) for session', sessionId)
      return
    }

    updateAgentEventsForSession(sessionId, [])
    // NOTE: We intentionally do NOT clear artifacts here on new message send.
    // Existing artifacts (HTML/SVG previews) remain visible until the new
    // response generates replacement artifacts via onArtifact events.
    // This prevents the preview from disappearing when the user sends a new prompt.
    if (activeSessionRef.current === sessionId) {
      setError(null)
    }

    const streamingStartedAt = Date.now()

    const userMsg = {
      message_id: `temp_user_${Date.now()}`,
      role: 'user',
      content,
      images: images.length > 0 ? images : undefined,
      created_at: new Date().toISOString(),
    }

    const assistantMsgId = `temp_assistant_${Date.now()}`
    const assistantMsg = {
      message_id: assistantMsgId,
      role: 'assistant',
      content: '',
      tool_calls: [],
      isStreaming: true,
      streaming_started_at: streamingStartedAt,
      created_at: new Date().toISOString(),
    }

    updateMessagesForSession(sessionId, prev => [...prev, userMsg, assistantMsg])

    // ── FIX: Persist user message to localStorage so it survives page refresh ──
    // The backend does NOT return user messages in GET /api/messages/:sessionId,
    // so without this, the user's sent messages disappear after refresh.
    persistUserMessage(sessionId, userMsg)

    streamingSessionsRef.current.add(sessionId)
    if (activeSessionRef.current === sessionId) {
      setIsStreaming(true)
    }

    let fullContent = ''
    let activeToolCalls = {}

    // ── FIX: Register active streaming state in ref for beforeunload access ──
    activeStreamingStateRef.current[sessionId] = {
      assistantMsgId,
      fullContent: '',
      activeToolCalls: {},
      streamingStartedAt,
    }

    // Keep track of user message ID to update it when backend returns real IDs
    const userMsgTempId = userMsg.message_id

    // ── FIX: Helper to incrementally persist tool_calls to localStorage ──
    // Called on every onToolResult so partial progress survives page refresh.
    // Incrementally persist tool_calls to localStorage on every onToolResult.
    // This is lightweight (synchronous) and ensures partial progress survives
    // mid-stream page refresh. Data is promoted to localStorage tool_calls store in onDone.
    const _persistToolCallsIncremental = () => {
      const toolCallsArr = Object.values(activeToolCalls)
      if (toolCallsArr.length === 0) return

      // Update the ref so beforeunload can access latest state
      activeStreamingStateRef.current[sessionId] = {
        assistantMsgId,
        fullContent,
        activeToolCalls: { ...activeToolCalls },
        streamingStartedAt,
      }

      // Persist to localStorage (synchronous, fast)
      saveStreamingState(sessionId, {
        assistantMsgId,
        toolCalls: toolCallsArr,
        fullContent,
        streamingStartedAt,
        sessionId,
      })
    }

    const controller = streamChat(sessionId, content, {
      images,
      onToken: (tokenContent) => {
        fullContent += tokenContent

        // Update the ref for beforeunload access
        if (activeStreamingStateRef.current[sessionId]) {
          activeStreamingStateRef.current[sessionId].fullContent = fullContent
        }

        updateMessagesForSession(sessionId, prev =>
          prev.map(m =>
            m.message_id === assistantMsgId
              ? { ...m, content: fullContent }
              : m
          )
        )
      },

      onToolStart: (data) => {
        // Use tool_use_id if available, otherwise fall back to tool name + timestamp
        const toolKey = data.tool_use_id || `${data.tool}_${Date.now()}`
        activeToolCalls[toolKey] = {
          tool_use_id: toolKey,
          tool: data.tool,
          input: data.input || {},
          status: 'running',
        }
        console.log('[useChat] tool_start:', data.tool, '| id:', toolKey)
        updateMessagesForSession(sessionId, prev =>
          prev.map(m =>
            m.message_id === assistantMsgId
              ? { ...m, tool_calls: Object.values(activeToolCalls) }
              : m
          )
        )

        // ── Project status: emit 'creating' when create_project tool starts ──
        if (data.tool === 'create_project') {
          const projectName = data.input?.name || data.input?.project_name || null
          if (projectName && onProjectStatusChangeRef.current) {
            onProjectStatusChangeRef.current(projectName, 'creating', {
              messageId: assistantMsgId,
              sessionId,
            })
          }
        }
        // ── Project status: emit 'generating' when file tools start (create_file, update_file) ──
        if (data.tool === 'create_file' || data.tool === 'update_file') {
          const projectName = data.input?.project || data.input?.name || null
          if (projectName && onProjectStatusChangeRef.current) {
            onProjectStatusChangeRef.current(projectName, 'generating', {
              messageId: assistantMsgId,
              sessionId,
            })
          }
        }

        // ── FIX: Persist on tool_start too (so we at least know a tool was invoked) ──
        _persistToolCallsIncremental()
      },

      onToolResult: (data) => {
        // Match by tool_use_id first, then fall back to tool name if id missing
        const toolKey = data.tool_use_id && activeToolCalls[data.tool_use_id]
          ? data.tool_use_id
          : Object.keys(activeToolCalls).find(k =>
              activeToolCalls[k].tool === data.tool && activeToolCalls[k].status === 'running'
            )

        if (toolKey && activeToolCalls[toolKey]) {
          activeToolCalls[toolKey] = {
            ...activeToolCalls[toolKey],
            result: data.result || {},
            status: 'done',
          }
          console.log('[useChat] tool_result:', data.tool, '| id:', toolKey,
            '| has_stdout:', !!(data.result?.stdout),
            '| has_content:', !!(data.result?.content))
          updateMessagesForSession(sessionId, prev =>
            prev.map(m =>
              m.message_id === assistantMsgId
                ? { ...m, tool_calls: Object.values(activeToolCalls) }
                : m
            )
          )

          // ── Project status: emit 'generating' after create_project completes ──
          if (data.tool === 'create_project' && onProjectStatusChangeRef.current) {
            const projectName = data.result?.project_name || data.result?.name
              || activeToolCalls[toolKey]?.input?.name || null
            if (projectName) {
              const filesCreated = data.result?.files_created?.length || 0
              onProjectStatusChangeRef.current(projectName, 'generating', {
                messageId: assistantMsgId,
                sessionId,
                filesCreated,
              })
            }
          }

          // ── FIX: Persist tool_calls incrementally on EVERY onToolResult ──
          // This is the KEY FIX: if the user refreshes mid-stream, completed
          // tool results (including create_project) will survive because they
          // were saved to localStorage after each tool_result event.
          _persistToolCallsIncremental()

        } else {
          // tool_result arrived without a matching tool_start — create a synthetic entry
          console.warn('[useChat] tool_result without matching tool_start for tool:', data.tool,
            '| creating synthetic entry')
          const syntheticKey = data.tool_use_id || `${data.tool}_result_${Date.now()}`
          activeToolCalls[syntheticKey] = {
            tool_use_id: syntheticKey,
            tool: data.tool,
            input: {},
            result: data.result || {},
            status: 'done',
          }
          updateMessagesForSession(sessionId, prev =>
            prev.map(m =>
              m.message_id === assistantMsgId
                ? { ...m, tool_calls: Object.values(activeToolCalls) }
                : m
            )
          )

          // ── FIX: Persist synthetic tool_result too ──
          _persistToolCallsIncremental()
        }
      },

      onThinking: (data) => {
        updateAgentEventsForSession(sessionId, prev => {
          const idx = prev.findIndex(ev => ev.type === 'thinking')
          if (idx !== -1) {
            const updated = [...prev]
            updated[idx] = { type: 'thinking', ...data }
            return updated
          }
          return [...prev, { type: 'thinking', ...data }]
        })
      },

      onStatus: (data) => {
        updateAgentEventsForSession(sessionId, prev => {
          if (data.status === 'done') {
            const idx = [...prev]
              .reverse()
              .findIndex(ev => ev.type === 'status' && ev.tool === data.tool && ev.status === 'active')
            if (idx !== -1) {
              const realIdx = prev.length - 1 - idx
              const updated = [...prev]
              updated[realIdx] = { type: 'status', ...data }
              return updated
            }
          }
          return [...prev, { type: 'status', ...data }]
        })
      },

      onIteration: (data) => {
        updateAgentEventsForSession(sessionId, prev => {
          const idx = prev.findIndex(ev => ev.type === 'iteration')
          if (idx !== -1) {
            const updated = [...prev]
            updated[idx] = { type: 'iteration', ...data }
            return updated
          }
          return [...prev, { type: 'iteration', ...data }]
        })
      },

      onArtifact: (data) => {
        updateArtifactsForSession(sessionId, prev => {
          // Check if this is the first artifact for this streaming response
          // (identified by whether any artifact in prev is from this stream).
          // We clear previous session artifacts on the FIRST new artifact arrival
          // so old previews are replaced by the new response's artifacts.
          const isFromThisStream = prev.some(a => a._streamId === assistantMsgId)
          const base = isFromThisStream ? prev : []

          const idx = base.findIndex(a => a.id === data.id)
          if (idx !== -1) {
            const updated = [...base]
            updated[idx] = { ...data, _streamId: assistantMsgId }
            return updated
          }
          return [...base, { ...data, _streamId: assistantMsgId }]
        })
      },

      onDone: (data) => {
        const isActiveNow = activeSessionRef.current === sessionId
        const wasAborted  = data?.aborted === true

        // Calculate generation time in seconds
        const generationTime = ((Date.now() - streamingStartedAt) / 1000).toFixed(1)

        // Capture final tool_calls snapshot for persistence
        const finalToolCalls = Object.values(activeToolCalls)

        console.log('[useChat] onDone: session', sessionId,
          '| content length:', fullContent.length,
          '| tool_calls:', finalToolCalls.length,
          '| message_id:', data?.message_id)

        updateMessagesForSession(sessionId, prev =>
          prev.map(m => {
            // Update assistant message — replace temp ID with real backend ID,
            // finalize content (use fullContent as source of truth to ensure
            // all accumulated tokens are preserved), mark streaming as done.
            if (m.message_id === assistantMsgId) {
              return {
                ...m,
                ...(data?.message_id ? { message_id: data.message_id } : {}),
                // Always use fullContent as the authoritative final content.
                // This ensures content from tokens that arrived before/after
                // tool calls is fully preserved.
                content: fullContent || m.content || '',
                isStreaming: false,
                // ── FIX: store the original temp ID so mergeMessages() can
                // match this message against the API-returned version even after
                // the message_id is replaced with the real backend ID.
                // Without this, fetchMessages() would see a cache miss for the
                // freshly-streamed content and use the API's (possibly truncated)
                // version instead.
                _tempId: assistantMsgId,
                // Persist accumulated tool_calls into the final message
                tool_calls: finalToolCalls.length > 0 ? finalToolCalls : (m.tool_calls || []),
                // Store generation time for display
                generation_time: generationTime,
                streaming_started_at: streamingStartedAt,
              }
            }
            // Update user message — if backend returns user_message_id, use it.
            // This ensures user messages get real IDs for backend persistence.
            if (m.message_id === userMsgTempId && data?.user_message_id) {
              // ── FIX: Also update the persisted user message ID in localStorage ──
              updatePersistedUserMessageId(sessionId, userMsgTempId, data.user_message_id)
              return {
                ...m,
                message_id: data.user_message_id,
              }
            }
            return m
          })
        )

        // ── Persist tool_calls to localStorage so they survive page refresh ──
        if (finalToolCalls.length > 0) {
          // Calculate position index (how many assistant messages came before this one)
          const currentMessages = messagesCacheRef.current[sessionId] || []
          const assistantMsgsBefore = currentMessages.filter(
            m => m.role === 'assistant' && m.message_id !== assistantMsgId
          ).length

          saveToolCalls(sessionId, {
            msgId:          data?.message_id ? String(data.message_id) : '',
            tempId:         assistantMsgId,
            contentText:    fullContent || '',
            positionIndex:  assistantMsgsBefore,
            toolCalls:      finalToolCalls,
            generationTime: generationTime,
          }).then(() => { evictOldRecords(); evictOldUserMessages() }).catch(() => {})
        }

        // Clean up streaming state — final data is now in localStorage tool_calls store
        clearStreamingState(sessionId)
        delete activeStreamingStateRef.current[sessionId]

        // ── Project status: mark all active projects as 'completed' on stream done ──
        if (!wasAborted && onProjectStatusChangeRef.current) {
          const allToolCalls = Object.values(activeToolCalls)
          const projectTools = allToolCalls.filter(tc => tc.tool === 'create_project' && tc.status === 'done')
          for (const pt of projectTools) {
            const projectName = pt.result?.project_name || pt.result?.name || pt.input?.name
            if (projectName) {
              const filesCreated = pt.result?.files_created?.length || 0
              onProjectStatusChangeRef.current(projectName, 'completed', {
                messageId: data?.message_id || assistantMsgId,
                sessionId,
                filesCreated,
              })
            }
          }
        }

        if (!wasAborted && data?.session_title) {
          onSessionTitleUpdate?.(data.session_title)
        }

        streamingSessionsRef.current.delete(sessionId)
        isSendingRef.current.delete(sessionId)
        delete abortControllersRef.current[sessionId]

        // ── FIX: Record this session as "recently streamed" ──
        // This prevents fetchMessages() from overwriting the freshly-accumulated
        // fullContent with a potentially stale/truncated API response.
        // The protection window is RECENTLY_STREAMED_TTL_MS (8 seconds).
        if (!wasAborted) {
          recentlyStreamedRef.current[sessionId] = Date.now()
          console.log('[useChat] onDone: marked session', sessionId,
            'as recently-streamed (protection window:', RECENTLY_STREAMED_TTL_MS, 'ms)')
        }

        if (!isActiveNow && !wasAborted && onBackgroundCompleteRef.current) {
          onBackgroundCompleteRef.current(sessionId, data?.session_title || 'A conversation')
        }

        // ── ALWAYS set isStreaming to false when a stream completes ──
        // Previously this was gated behind isActiveNow, which caused a bug:
        // if the user navigated away (New Chat / different session / /workspace)
        // during streaming, isActiveNow would be false, setIsStreaming(false)
        // would NOT be called, and the context's isStreaming would stay true.
        // This caused the ChatInput on ANY page to show "Generating response..."
        // even though no stream was running for the current view.
        //
        // FIX: Always reset isStreaming. If the user comes back to the completed
        // session, setActiveSession re-syncs isStreaming from streamingSessionsRef
        // (which has already had this session removed above).
        setIsStreaming(false)

        if (isActiveNow) {
          if (!wasAborted) {
            setTimeout(() => {
              updateAgentEventsForSession(sessionId, [])
            }, 1500)
          } else {
            updateAgentEventsForSession(sessionId, [])
          }
        }
      },

      onError: (errMsg) => {
        const isActiveNow = activeSessionRef.current === sessionId

        // ── 409 Conflict: another prompt is already running ──
        // Remove the optimistic temp messages and auto-queue the message instead.
        const is409 = typeof errMsg === 'string' && (
          errMsg.includes('409') || errMsg.includes('CONFLICT') || errMsg.includes('already running')
        )
        if (is409 && onConflictQueueRef.current) {
          console.log('[useChat] 409 Conflict detected for session', sessionId,
            '— removing temp messages and auto-queuing:', content.substring(0, 60))

          // Remove the optimistic user + assistant temp messages
          updateMessagesForSession(sessionId, prev =>
            prev.filter(m =>
              m.message_id !== userMsgTempId && m.message_id !== assistantMsgId
            )
          )

          // ── FIX: Also remove the persisted user message from localStorage ──
          try {
            const umKey = USER_MSGS_PREFIX + sessionId
            const umList = JSON.parse(localStorage.getItem(umKey) || '[]')
            const filtered = umList.filter(m => m.message_id !== userMsgTempId)
            if (filtered.length !== umList.length) {
              localStorage.setItem(umKey, JSON.stringify(filtered))
            }
          } catch { /* ignore */ }

          // Clean up streaming state
          delete activeStreamingStateRef.current[sessionId]
          streamingSessionsRef.current.delete(sessionId)
          isSendingRef.current.delete(sessionId)
          delete abortControllersRef.current[sessionId]

          // Always reset isStreaming (see onDone fix comment for rationale)
          setIsStreaming(false)

          // Auto-queue the message via the registered callback
          onConflictQueueRef.current(sessionId, content)
          return
        }

        // Calculate generation time even on error
        const generationTime = ((Date.now() - streamingStartedAt) / 1000).toFixed(1)
        const finalToolCalls = Object.values(activeToolCalls)

        console.warn('[useChat] onError: session', sessionId, '| error:', errMsg,
          '| content so far:', fullContent.length, 'chars',
          '| tool_calls:', finalToolCalls.length)

        // ── FIX: Persist tool_calls on error too (partial progress is still valuable) ──
        if (finalToolCalls.length > 0) {
          _persistToolCallsIncremental()
        }

        updateMessagesForSession(sessionId, prev =>
          prev.map(m =>
            m.message_id === assistantMsgId
              ? {
                  ...m,
                  // Preserve any content that was accumulated before the error
                  content: fullContent || m.content || '',
                  isStreaming: false,
                  isError: true,
                  tool_calls: finalToolCalls.length > 0 ? finalToolCalls : (m.tool_calls || []),
                  generation_time: generationTime,
                }
              : m
          )
        )

        if (isActiveNow) {
          setError(errMsg || 'Streaming failed. Please try again.')
        }

        // Always reset isStreaming (see onDone fix comment for rationale)
        setIsStreaming(false)

        // ── FIX: Clean up streaming state ref on error ──
        delete activeStreamingStateRef.current[sessionId]

        streamingSessionsRef.current.delete(sessionId)
        isSendingRef.current.delete(sessionId)
        delete abortControllersRef.current[sessionId]
      },
    })

    abortControllersRef.current[sessionId] = controller
  }, [updateMessagesForSession, updateAgentEventsForSession, updateArtifactsForSession])

  const cancelStream = useCallback((sessionId) => {
    const targetSession = sessionId || activeSessionRef.current
    if (targetSession && abortControllersRef.current[targetSession]) {
      abortControllersRef.current[targetSession].abort()
      delete abortControllersRef.current[targetSession]
      streamingSessionsRef.current.delete(targetSession)
      isSendingRef.current.delete(targetSession)

      // ── FIX: Clean up streaming state ref on cancel ──
      delete activeStreamingStateRef.current[targetSession]

      updateMessagesForSession(targetSession, prev =>
        prev.map(m =>
          m.isStreaming
            ? { ...m, isStreaming: false }
            : m
        )
      )
    }

    if (!targetSession || targetSession === activeSessionRef.current) {
      setIsStreaming(false)
      _setAgentEvents([])
    }
  }, [updateMessagesForSession, _setAgentEvents])

  const clearMessages = useCallback((sessionId) => {
    if (sessionId) {
      messagesCacheRef.current[sessionId] = []
      agentEventsCacheRef.current[sessionId] = []
      artifactsCacheRef.current[sessionId] = []
      if (activeSessionRef.current === sessionId) {
        _setMessages([])
        _setAgentEvents([])
        _setArtifacts([])
        setError(null)
      }
    } else {
      const active = activeSessionRef.current
      if (active) {
        messagesCacheRef.current[active] = []
        agentEventsCacheRef.current[active] = []
        artifactsCacheRef.current[active] = []
      }
      _setMessages([])
      _setAgentEvents([])
      _setArtifacts([])
      setError(null)
    }
  }, [_setMessages, _setAgentEvents, _setArtifacts])

  const isSessionStreaming = useCallback((sessionId) => {
    return streamingSessionsRef.current.has(sessionId)
  }, [])

  const cleanupSession = useCallback((sessionId) => {
    delete messagesCacheRef.current[sessionId]
    delete agentEventsCacheRef.current[sessionId]
    delete artifactsCacheRef.current[sessionId]
    delete fetchInFlightRef.current[sessionId]
    delete recentlyStreamedRef.current[sessionId]
    delete activeStreamingStateRef.current[sessionId]
    clearStreamingState(sessionId)
    clearArtifactsCache(sessionId)
    deleteSessionToolCalls(sessionId)
    // clearPersistedUserMessages is synchronous — no .catch() needed
    try {
      clearPersistedUserMessages(sessionId)
    } catch (_) { /* ignore */ }
    if (abortControllersRef.current[sessionId]) {
      abortControllersRef.current[sessionId].abort()
      delete abortControllersRef.current[sessionId]
    }
    streamingSessionsRef.current.delete(sessionId)
    isSendingRef.current.delete(sessionId)
  }, [])


  // ── Recover stream state after page refresh ──
  // Checks the Service Worker (primary) and localStorage (fallback) for
  // any in-progress or completed stream data that was lost due to a page refresh.
  // If found, reconstructs the assistant message so the response appears in the
  // UI without needing to wait for the fetchMessages API response.
  //
  // Returns: { recovered: boolean, isActive: boolean }
  //   recovered: true if stream state was found and applied
  //   isActive:  true if the SW stream is STILL running (we subscribed to live events)
  const recoverStreamState = useCallback(async (sessionId) => {
    if (!sessionId) return { recovered: false, isActive: false }

    // Don't recover if we already have messages for this session (not a fresh page load)
    const existingMsgs = messagesCacheRef.current[sessionId] || []
    if (existingMsgs.length > 0) {
      console.log('[useChat] recoverStreamState: session', sessionId,
        'already has', existingMsgs.length, 'messages \u2014 skipping recovery')
      return { recovered: false, isActive: false }
    }

    console.log('[useChat] recoverStreamState: attempting recovery for session', sessionId)

    // \u2500\u2500 PATH 1: Service Worker recovery (primary) \u2500\u2500
    if (isStreamWorkerReady()) {
      try {
        const { state: swState, isActive } = await recoverStreamFromSW(sessionId)

        if (swState && (swState.fullContent || (swState.toolCalls && swState.toolCalls.length > 0))) {
          console.log('[useChat] recoverStreamState: SW recovery succeeded for session', sessionId,
            '| content:', (swState.fullContent || '').length, 'chars',
            '| tool_calls:', (swState.toolCalls || []).length,
            '| isActive:', isActive,
            '| done:', swState.done)

          const toolCallsArr = Array.isArray(swState.toolCalls)
            ? swState.toolCalls
            : Object.values(swState.toolCalls || {})

          // Build the recovered assistant message
          const recoveredAssistantMsg = {
            message_id: swState.doneData?.message_id || swState.assistantMsgId || `recovered_assistant_${Date.now()}`,
            role: 'assistant',
            content: swState.fullContent || '',
            tool_calls: toolCallsArr,
            isStreaming: isActive && !swState.done,
            streaming_started_at: swState.startedAt,
            generation_time: swState.startedAt
              ? ((Date.now() - swState.startedAt) / 1000).toFixed(1)
              : undefined,
            created_at: new Date(swState.startedAt || Date.now()).toISOString(),
            _recovered: true,
          }

          // Inject the recovered assistant message into the session cache.
          // fetchMessages (called after this) will merge it with API data properly.
          updateMessagesForSession(sessionId, prev => {
            if (prev.some(m => m.content === recoveredAssistantMsg.content && m.role === 'assistant')) {
              return prev
            }
            return [...prev, recoveredAssistantMsg]
          })

          // If stream is still active in the SW, subscribe to live events
          if (isActive && !swState.done) {
            console.log('[useChat] recoverStreamState: subscribing to active SW stream for', sessionId)

            streamingSessionsRef.current.add(sessionId)
            if (activeSessionRef.current === sessionId) {
              setIsStreaming(true)
            }

            let fullContent = swState.fullContent || ''
            let activeToolCalls = {}
            for (const tc of toolCallsArr) {
              activeToolCalls[tc.tool_use_id || `${tc.tool}_${Date.now()}`] = tc
            }

            const assistantMsgId = recoveredAssistantMsg.message_id
            const streamingStartedAt = swState.startedAt || Date.now()

            const unsubscribe = subscribeToStream(sessionId, (event) => {
              const { type, data } = event

              switch (type) {
                case 'token':
                  fullContent += (data.content || '')
                  updateMessagesForSession(sessionId, prev =>
                    prev.map(m =>
                      m.message_id === assistantMsgId
                        ? { ...m, content: fullContent }
                        : m
                    )
                  )
                  break

                case 'tool_start': {
                  const toolKey = data.tool_use_id || `${data.tool}_${Date.now()}`
                  activeToolCalls[toolKey] = {
                    tool_use_id: toolKey,
                    tool: data.tool,
                    input: data.input || {},
                    status: 'running',
                  }
                  updateMessagesForSession(sessionId, prev =>
                    prev.map(m =>
                      m.message_id === assistantMsgId
                        ? { ...m, tool_calls: Object.values(activeToolCalls) }
                        : m
                    )
                  )
                  break
                }

                case 'tool_result': {
                  const toolKey = data.tool_use_id && activeToolCalls[data.tool_use_id]
                    ? data.tool_use_id
                    : Object.keys(activeToolCalls).find(k =>
                        activeToolCalls[k].tool === data.tool && activeToolCalls[k].status === 'running'
                      )
                  if (toolKey && activeToolCalls[toolKey]) {
                    activeToolCalls[toolKey] = {
                      ...activeToolCalls[toolKey],
                      result: data.result || {},
                      status: 'done',
                    }
                  }
                  updateMessagesForSession(sessionId, prev =>
                    prev.map(m =>
                      m.message_id === assistantMsgId
                        ? { ...m, tool_calls: Object.values(activeToolCalls) }
                        : m
                    )
                  )
                  break
                }

                case 'done': {
                  const generationTime = ((Date.now() - streamingStartedAt) / 1000).toFixed(1)
                  const finalToolCalls = Object.values(activeToolCalls)

                  updateMessagesForSession(sessionId, prev =>
                    prev.map(m =>
                      m.message_id === assistantMsgId
                        ? {
                            ...m,
                            ...(data?.message_id ? { message_id: data.message_id } : {}),
                            content: fullContent || m.content || '',
                            isStreaming: false,
                            tool_calls: finalToolCalls.length > 0 ? finalToolCalls : (m.tool_calls || []),
                            generation_time: generationTime,
                          }
                        : m
                    )
                  )

                  // Persist tool_calls for future page refreshes
                  if (finalToolCalls.length > 0) {
                    const currentMessages = messagesCacheRef.current[sessionId] || []
                    const assistantMsgsBefore = currentMessages.filter(
                      m => m.role === 'assistant' && m.message_id !== assistantMsgId
                    ).length

                    saveToolCalls(sessionId, {
                      msgId:          data?.message_id ? String(data.message_id) : '',
                      tempId:         assistantMsgId,
                      contentText:    fullContent || '',
                      positionIndex:  assistantMsgsBefore,
                      toolCalls:      finalToolCalls,
                      generationTime,
                    }).then(() => evictOldRecords()).catch(() => {})
                  }

                  recentlyStreamedRef.current[sessionId] = Date.now()
                  streamingSessionsRef.current.delete(sessionId)
                  if (activeSessionRef.current === sessionId) {
                    setIsStreaming(false)
                  }

                  clearStreamStateSW(sessionId)
                  clearStreamingState(sessionId)
                  unsubscribe()

                  console.log('[useChat] recoverStreamState: SW stream completed for', sessionId,
                    '| content:', fullContent.length, 'chars | tools:', Object.keys(activeToolCalls).length)
                  break
                }

                case 'error':
                  updateMessagesForSession(sessionId, prev =>
                    prev.map(m =>
                      m.message_id === assistantMsgId
                        ? { ...m, content: fullContent || m.content || '', isStreaming: false, isError: true }
                        : m
                    )
                  )
                  streamingSessionsRef.current.delete(sessionId)
                  if (activeSessionRef.current === sessionId) {
                    setIsStreaming(false)
                    setError(data.error || 'Stream error after recovery')
                  }
                  unsubscribe()
                  break
              }
            })
          } else {
            // Stream already completed in SW \u2014 persist and clean up
            if (toolCallsArr.length > 0) {
              saveToolCalls(sessionId, {
                msgId:         swState.doneData?.message_id ? String(swState.doneData.message_id) : '',
                tempId:        swState.assistantMsgId || '',
                contentText:   swState.fullContent || '',
                positionIndex: 0,
                toolCalls:     toolCallsArr,
                generationTime: recoveredAssistantMsg.generation_time || '',
              }).then(() => evictOldRecords()).catch(() => {})
            }

            recentlyStreamedRef.current[sessionId] = Date.now()
            clearStreamStateSW(sessionId)
          }

          return { recovered: true, isActive: isActive && !swState.done }
        }
      } catch (err) {
        console.warn('[useChat] recoverStreamState: SW recovery failed:', err.message)
      }
    }

    // \u2500\u2500 PATH 2: localStorage streaming state recovery (fallback) \u2500\u2500
    const streamingState = loadStreamingState(sessionId)
    if (streamingState && (streamingState.fullContent || (streamingState.toolCalls && streamingState.toolCalls.length > 0))) {
      console.log('[useChat] recoverStreamState: localStorage recovery for session', sessionId,
        '| content:', (streamingState.fullContent || '').length, 'chars',
        '| tool_calls:', (streamingState.toolCalls || []).length)

      const toolCallsArr = streamingState.toolCalls || []
      const recoveredAssistantMsg = {
        message_id: streamingState.assistantMsgId || `recovered_assistant_${Date.now()}`,
        role: 'assistant',
        content: streamingState.fullContent || '',
        tool_calls: toolCallsArr,
        isStreaming: false,
        generation_time: streamingState.streamingStartedAt
          ? ((Date.now() - streamingState.streamingStartedAt) / 1000).toFixed(1)
          : undefined,
        created_at: new Date(streamingState.streamingStartedAt || Date.now()).toISOString(),
        _recovered: true,
      }

      updateMessagesForSession(sessionId, prev => {
        if (prev.some(m => m.content === recoveredAssistantMsg.content && m.role === 'assistant')) {
          return prev
        }
        return [...prev, recoveredAssistantMsg]
      })

      // Persist to localStorage tool_calls store, then clear streaming state
      if (toolCallsArr.length > 0) {
        saveToolCalls(sessionId, {
          msgId:         '',
          tempId:        streamingState.assistantMsgId || '',
          contentText:   streamingState.fullContent || '',
          positionIndex: 0,
          toolCalls:     toolCallsArr,
          generationTime: recoveredAssistantMsg.generation_time || '',
        }).then(() => {
          clearStreamingState(sessionId)
        }).catch(() => {})
      } else {
        clearStreamingState(sessionId)
      }

      return { recovered: true, isActive: false }
    }

    console.log('[useChat] recoverStreamState: no recovery data found for session', sessionId)
    return { recovered: false, isActive: false }
  }, [updateMessagesForSession])


  return {
    messages,
    isStreaming,
    error,
    agentEvents,
    artifacts,
    fetchMessages,
    sendMessage,
    cancelStream,
    clearMessages,
    setError,
    setActiveSession,
    isSessionStreaming,
    setOnBackgroundComplete,
    setOnProjectStatusChange,
    setOnConflictQueue,
    cleanupSession,
    recoverStreamState,
  }
}
