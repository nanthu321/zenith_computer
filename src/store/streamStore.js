/**
 * streamStore.js — Zustand-based global stream state store
 *
 * Lifts streaming logic out of React component tree into a global store
 * so that active SSE streams, accumulated messages, tool calls, and
 * artifacts survive route navigation (e.g. /chat → /workspace → /chat).
 *
 * KEY INSIGHT: The stream lives in the store, not in any component.
 * Components are just readers and triggers — they can mount and unmount
 * freely without affecting the active stream.
 *
 * This replaces the previous useChat() hook + ChatContext approach.
 * Benefits:
 *   - State survives navigation without needing a wrapping Context provider
 *   - Selector-based subscriptions prevent unnecessary re-renders
 *   - Accessible from outside React (utilities, service workers, etc.)
 *   - No stale closure issues (get() always returns latest state)
 */

import { create } from 'zustand'
import { apiFetch, streamChat } from '../utils/api.js'
import {
  saveToolCalls,
  enrichMessagesFromDB,
  deleteSessionToolCalls,
  evictOldRecords,
} from '../utils/toolCallsDB.js'
import {
  getArtifactsCache,
  setArtifactsCache,
  clearArtifactsCache,
} from '../utils/artifactsCache.js'
import {
  isStreamWorkerReady,
  recoverStream as recoverStreamFromSW,
  subscribeToStream,
  clearStreamStateSW,
} from '../utils/streamWorkerManager.js'


// ─────────────────────────────────────────────────────────────────────────────
//  HELPER UTILITIES (unchanged from useChat.js)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize any possible backend response shape into a flat messages array.
 */
function normalizeMessageList(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'object') {
    for (const key of ['messages', 'data', 'content', 'items', 'results', 'records']) {
      if (Array.isArray(raw[key])) return raw[key]
    }
    if (raw.role && (raw.content !== undefined)) return [raw]
  }
  return []
}

/**
 * Deduplicate a flat messages array.
 */
function deduplicateMessages(msgs) {
  if (!msgs || msgs.length === 0) return []
  const seen = new Map()
  const result = []

  for (const msg of msgs) {
    const mid = String(msg.message_id ?? '')
    if (seen.has(mid)) continue

    let isDupe = false
    for (const existing of result) {
      if (
        existing.role === msg.role &&
        existing.content === msg.content &&
        existing.content !== '' &&
        (Math.abs(
          new Date(existing.created_at).getTime() -
          new Date(msg.created_at).getTime()
        ) < 5000 ||
          existing._recovered ||
          msg._recovered)
      ) {
        isDupe = true
        if (mid && !mid.startsWith('temp_') && String(existing.message_id).startsWith('temp_')) {
          const idx = result.indexOf(existing)
          result[idx] = msg
          seen.delete(String(existing.message_id))
          seen.set(mid, msg)
        }
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
 */
function mergeMessages(apiMessages, cachedMessages) {
  if (!cachedMessages || cachedMessages.length === 0)
    return deduplicateMessages(apiMessages)
  if (!apiMessages || apiMessages.length === 0)
    return deduplicateMessages(cachedMessages)

  const apiIds = new Set(apiMessages.map((m) => String(m.message_id)))

  const cacheById = new Map()
  const cacheTempById = new Map()
  for (const m of cachedMessages) {
    cacheById.set(String(m.message_id), m)
    if (m._tempId) cacheTempById.set(String(m._tempId), m)
  }

  const enrichedApiMessages = apiMessages.map((apiMsg) => {
    const cached =
      cacheById.get(String(apiMsg.message_id)) ||
      cacheTempById.get(String(apiMsg.message_id))
    if (!cached) return apiMsg

    const enriched = { ...apiMsg }

    const cachedLen = (cached.content || '').length
    const apiLen = (apiMsg.content || '').length
    if (cachedLen > apiLen && !cached.isStreaming) {
      enriched.content = cached.content
    }

    if (
      (!apiMsg.tool_calls || apiMsg.tool_calls.length === 0) &&
      cached.tool_calls &&
      cached.tool_calls.length > 0
    ) {
      enriched.tool_calls = cached.tool_calls
    }

    if (!apiMsg.generation_time && cached.generation_time) {
      enriched.generation_time = cached.generation_time
    }

    if (!apiMsg.streaming_started_at && cached.streaming_started_at) {
      enriched.streaming_started_at = cached.streaming_started_at
    }

    return enriched
  })

  const missingFromApi = cachedMessages.filter((m) => {
    const mid = String(m.message_id ?? '')
    if (apiIds.has(mid)) return false
    if (mid.startsWith('temp_user_') && m.role === 'user') return true
    if (
      mid.startsWith('temp_assistant_') &&
      m.role === 'assistant' &&
      m.isStreaming
    )
      return true
    if (m._recovered && m.role === 'assistant' && m.content) {
      const hasMatchingContent = apiMessages.some(
        (api) => api.role === 'assistant' && api.content === m.content
      )
      if (!hasMatchingContent) return true
    }
    return false
  })

  if (missingFromApi.length === 0)
    return deduplicateMessages(enrichedApiMessages)

  const merged = [...enrichedApiMessages]
  for (const userMsg of missingFromApi) {
    const userTime = new Date(userMsg.created_at).getTime()
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

  return deduplicateMessages(merged)
}


// ─────────────────────────────────────────────────────────────────────────────
//  INCREMENTAL TOOL_CALLS PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────

const STREAMING_STATE_PREFIX = 'zenith_streaming_'

function saveStreamingState(sessionId, state) {
  if (!sessionId) return
  try {
    const key = STREAMING_STATE_PREFIX + sessionId
    localStorage.setItem(
      key,
      JSON.stringify({ ...state, _updatedAt: Date.now() })
    )
  } catch (e) {
    console.warn('[streamStore] Failed to save streaming state:', e.message)
  }
}

function loadStreamingState(sessionId) {
  if (!sessionId) return null
  try {
    const key = STREAMING_STATE_PREFIX + sessionId
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const state = JSON.parse(raw)
    if (state._updatedAt && Date.now() - state._updatedAt > 10 * 60 * 1000) {
      localStorage.removeItem(key)
      return null
    }
    return state
  } catch {
    return null
  }
}

function clearStreamingState(sessionId) {
  if (!sessionId) return
  try {
    localStorage.removeItem(STREAMING_STATE_PREFIX + sessionId)
  } catch {
    /* ignore */
  }
}


// ─────────────────────────────────────────────────────────────────────────────
//  USER MESSAGE PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────

const USER_MSGS_PREFIX = 'zenith_user_msgs_'
const USER_MSGS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function persistUserMessage(sessionId, userMsg) {
  if (!sessionId || !userMsg) return
  try {
    const key = USER_MSGS_PREFIX + sessionId
    const existing = JSON.parse(localStorage.getItem(key) || '[]')
    if (existing.some((m) => m.message_id === userMsg.message_id)) return
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
    console.warn('[streamStore] Failed to persist user message:', e.message)
  }
}

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
    console.warn(
      '[streamStore] Failed to update persisted user message ID:',
      e.message
    )
  }
}

function loadPersistedUserMessages(sessionId) {
  if (!sessionId) return []
  try {
    const key = USER_MSGS_PREFIX + sessionId
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const msgs = JSON.parse(raw)
    const cutoff = Date.now() - USER_MSGS_MAX_AGE_MS
    const valid = msgs.filter((m) => (m._persisted_at || 0) > cutoff)
    if (valid.length !== msgs.length) {
      localStorage.setItem(key, JSON.stringify(valid))
    }
    return valid
  } catch {
    return []
  }
}

function clearPersistedUserMessages(sessionId) {
  if (!sessionId) return
  try {
    localStorage.removeItem(USER_MSGS_PREFIX + sessionId)
  } catch {
    /* ignore */
  }
}

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
      const valid = msgs.filter((m) => (m._persisted_at || 0) > cutoff)
      if (valid.length === 0) {
        localStorage.removeItem(key)
      } else if (valid.length !== msgs.length) {
        localStorage.setItem(key, JSON.stringify(valid))
      }
    }
  } catch {
    /* ignore */
  }
}


// ─────────────────────────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const RECENTLY_STREAMED_TTL_MS = 8000


// ─────────────────────────────────────────────────────────────────────────────
//  ZUSTAND STORE
// ─────────────────────────────────────────────────────────────────────────────

const useStreamStore = create((set, get) => ({
  // ── React-visible state ──
  messages: [],
  isStreaming: false,
  error: null,
  agentEvents: [],
  artifacts: [],

  // ── Internal caches (not part of React state — accessed via get()) ──
  // These are stored in the Zustand store object but components should
  // NOT subscribe to them directly (they change too frequently).
  // Access via get()._internal.*
  _internal: {
    messagesCache: {},        // sessionId → messages[]
    agentEventsCache: {},     // sessionId → agentEvents[]
    artifactsCache: {},       // sessionId → artifacts[]
    streamingSessions: new Set(),
    abortControllers: {},     // sessionId → AbortController
    isSending: new Set(),
    activeSession: null,
    fetchInFlight: {},        // sessionId → Promise
    recentlyStreamed: {},     // sessionId → timestamp
    activeStreamingState: {}, // sessionId → { assistantMsgId, fullContent, activeToolCalls, streamingStartedAt }
  },

  // ── Callbacks (registered by consuming components) ──
  _callbacks: {
    onProjectStatusChange: null,
    onBackgroundComplete: null,
    onConflictQueue: null,
  },

  // ── Callback registrators ──
  setOnProjectStatusChange: (cb) => {
    get()._callbacks.onProjectStatusChange = cb
  },

  setOnBackgroundComplete: (cb) => {
    get()._callbacks.onBackgroundComplete = cb
  },

  setOnConflictQueue: (cb) => {
    get()._callbacks.onConflictQueue = cb
  },

  // ── Helper: update messages for a specific session ──
  // Always updates the cache. Only updates React state if session is active.
  _updateMessagesForSession: (sessionId, updater) => {
    const { _internal } = get()
    const currentCached = _internal.messagesCache[sessionId] || []
    const newMessages =
      typeof updater === 'function' ? updater(currentCached) : updater
    const deduped = deduplicateMessages(newMessages)
    _internal.messagesCache[sessionId] = deduped

    if (_internal.activeSession === sessionId) {
      set({ messages: deduped })
    }
  },

  _updateAgentEventsForSession: (sessionId, updater) => {
    const { _internal } = get()
    const currentCached = _internal.agentEventsCache[sessionId] || []
    const newEvents =
      typeof updater === 'function' ? updater(currentCached) : updater
    _internal.agentEventsCache[sessionId] = newEvents

    if (_internal.activeSession === sessionId) {
      set({ agentEvents: newEvents })
    }
  },

  _updateArtifactsForSession: (sessionId, updater) => {
    const { _internal } = get()
    const currentCached = _internal.artifactsCache[sessionId] || []
    const newArtifacts =
      typeof updater === 'function' ? updater(currentCached) : updater
    _internal.artifactsCache[sessionId] = newArtifacts

    if (newArtifacts.length > 0) {
      setArtifactsCache(sessionId, newArtifacts)
    }

    if (_internal.activeSession === sessionId) {
      set({ artifacts: newArtifacts })
    }
  },

  // ── Set active session (called by ChatPage on session change) ──
  setActiveSession: (sessionId) => {
    const state = get()
    const { _internal } = state
    const prevSessionId = _internal.activeSession

    // Helper: resolve best available messages
    const _resolveMessages = (sid) => {
      const msgs = _internal.messagesCache[sid]
      if (msgs && msgs.length > 0) return { msgs, source: 'memory' }
      return { msgs: [], source: 'none' }
    }

    // Helper: resolve artifacts — memory cache first, then localStorage
    const _resolveArtifacts = (sid) => {
      const memArts = _internal.artifactsCache[sid]
      if (memArts && memArts.length > 0) return memArts
      const persisted = getArtifactsCache(sid)
      if (persisted.length > 0) {
        _internal.artifactsCache[sid] = persisted
        console.log(
          '[streamStore] setActiveSession: restored',
          persisted.length,
          'artifacts from localStorage for',
          sid
        )
      }
      return persisted
    }

    // Same session — ensure React state matches cache
    if (prevSessionId === sessionId) {
      if (sessionId) {
        const { msgs } = _resolveMessages(sessionId)
        const events = _internal.agentEventsCache[sessionId] || []
        const arts = _resolveArtifacts(sessionId)
        set({
          messages: msgs.length > 0 ? msgs : state.messages,
          agentEvents: events,
          artifacts: arts,
          isStreaming: _internal.streamingSessions.has(sessionId),
        })
      }
      return
    }

    // Save outgoing session state to cache
    if (prevSessionId) {
      _internal.messagesCache[prevSessionId] = state.messages
      _internal.agentEventsCache[prevSessionId] = state.agentEvents
      _internal.artifactsCache[prevSessionId] = state.artifacts
    }

    // Activate new session
    _internal.activeSession = sessionId
    const { msgs } = _resolveMessages(sessionId)
    const events = _internal.agentEventsCache[sessionId] || []
    const arts = _resolveArtifacts(sessionId)
    const dedupedMsgs = deduplicateMessages(msgs)
    _internal.messagesCache[sessionId] = dedupedMsgs

    set({
      messages: dedupedMsgs,
      agentEvents: events,
      artifacts: arts,
      isStreaming: _internal.streamingSessions.has(sessionId),
      error: null,
    })

    console.log(
      '[streamStore] setActiveSession:',
      prevSessionId,
      '→',
      sessionId,
      '| msgs:',
      msgs.length,
      '| artifacts:',
      arts.length
    )
  },

  // ── Fetch messages from API ──
  fetchMessages: async (sessionId) => {
    if (!sessionId) return []

    const { _internal } = get()
    const {
      streamingSessions,
      messagesCache,
      recentlyStreamed,
      fetchInFlight,
      activeSession,
      artifactsCache,
    } = _internal

    // Guard: never fetch during active streaming
    if (streamingSessions.has(sessionId)) {
      const cachedMsgs = messagesCache[sessionId] || []
      console.log(
        '[streamStore] fetchMessages: skipping — session',
        sessionId,
        'is currently streaming | cache has',
        cachedMsgs.length,
        'messages'
      )
      if (activeSession === sessionId && cachedMsgs.length > 0) {
        set({ messages: cachedMsgs })
      }
      return cachedMsgs
    }

    // Guard: skip for recently-streamed sessions
    const recentStreamTime = recentlyStreamed[sessionId]
    if (recentStreamTime) {
      const age = Date.now() - recentStreamTime
      if (age < RECENTLY_STREAMED_TTL_MS) {
        const cachedMsgs = messagesCache[sessionId] || []
        console.log(
          '[streamStore] fetchMessages: skipping API fetch for recently-streamed session',
          sessionId,
          `(${age}ms ago)`
        )
        if (activeSession === sessionId && cachedMsgs.length > 0) {
          set({ messages: cachedMsgs })
        }
        return cachedMsgs
      } else {
        delete recentlyStreamed[sessionId]
      }
    }

    // Deduplicate in-flight requests
    if (fetchInFlight[sessionId]) {
      return fetchInFlight[sessionId]
    }

    const fetchPromise = (async () => {
      try {
        console.log(
          '[streamStore] fetchMessages: calling GET /api/messages/' + sessionId
        )
        const rawData = await apiFetch(`/api/messages/${sessionId}`)

        const normalized = normalizeMessageList(rawData)

        // Merge persisted user messages
        const persistedUserMsgs = loadPersistedUserMessages(sessionId)
        if (persistedUserMsgs.length > 0) {
          const apiMsgIds = new Set(
            normalized.map((m) => String(m.message_id))
          )
          const apiUserContents = new Set(
            normalized.filter((m) => m.role === 'user').map((m) => m.content)
          )
          for (const um of persistedUserMsgs) {
            if (apiMsgIds.has(String(um.message_id))) continue
            if (apiUserContents.has(um.content)) continue
            const umTime = new Date(um.created_at).getTime()
            let insertIdx = normalized.length
            for (let i = 0; i < normalized.length; i++) {
              const mTime = new Date(normalized[i].created_at).getTime()
              if (mTime > umTime) {
                insertIdx = i
                break
              }
            }
            normalized.splice(insertIdx, 0, um)
          }
        }

        // Enrich with persisted tool_calls
        let enriched = await enrichMessagesFromDB(sessionId, normalized)

        // Recover partial streaming state
        const streamingState = loadStreamingState(sessionId)
        if (streamingState?.toolCalls?.length > 0) {
          const lastAssistantIdx = enriched
            .map((m, i) => ({ m, i }))
            .filter(({ m }) => m.role === 'assistant')
            .pop()

          if (lastAssistantIdx && !lastAssistantIdx.m.tool_calls?.length) {
            enriched = enriched.map((m, i) => {
              if (i !== lastAssistantIdx.i) return m
              return {
                ...m,
                tool_calls: streamingState.toolCalls,
                generation_time: streamingState.streamingStartedAt
                  ? (
                      (Date.now() - streamingState.streamingStartedAt) /
                      1000
                    ).toFixed(1)
                  : undefined,
                content:
                  (streamingState.fullContent || '').length >
                  (m.content || '').length
                    ? streamingState.fullContent
                    : m.content,
              }
            })
          }

          const positionIndex =
            enriched.filter((m) => m.role === 'assistant').length - 1
          saveToolCalls(sessionId, {
            msgId: '',
            tempId: streamingState.assistantMsgId || '',
            contentText: streamingState.fullContent || '',
            positionIndex: positionIndex >= 0 ? positionIndex : 0,
            toolCalls: streamingState.toolCalls,
            generationTime: streamingState.streamingStartedAt
              ? (
                  (Date.now() - streamingState.streamingStartedAt) /
                  1000
                ).toFixed(1)
              : '',
          })
            .then(() => clearStreamingState(sessionId))
            .catch(() => {})
        }

        // Merge with in-memory cache
        const cachedMessages = messagesCache[sessionId] || []
        const finalMessages = mergeMessages(enriched, cachedMessages)

        // If session is streaming, preserve temp messages
        if (streamingSessions.has(sessionId)) {
          const liveCached = messagesCache[sessionId] || []
          const tempMsgs = liveCached.filter(
            (m) =>
              m.isStreaming ||
              String(m.message_id ?? '').startsWith('temp_assistant_')
          )
          if (tempMsgs.length > 0) {
            const withTemp = [...finalMessages, ...tempMsgs]
            messagesCache[sessionId] = withTemp
            if (activeSession === sessionId) {
              set({ messages: withTemp })
            }
            return withTemp
          }
        }

        // If API empty and cache has data, keep cache
        if (finalMessages.length === 0 && cachedMessages.length > 0) {
          messagesCache[sessionId] = cachedMessages
          if (activeSession === sessionId) {
            set({ messages: cachedMessages })
          }
          return cachedMessages
        }

        const dedupedFinal = deduplicateMessages(finalMessages)
        messagesCache[sessionId] = dedupedFinal

        if (activeSession === sessionId) {
          set({ messages: dedupedFinal })

          // Restore artifacts from localStorage if in-memory cache is empty
          const memArts = artifactsCache[sessionId]
          if (!memArts || memArts.length === 0) {
            const persistedArts = getArtifactsCache(sessionId)
            if (persistedArts.length > 0) {
              artifactsCache[sessionId] = persistedArts
              set({ artifacts: persistedArts })
            }
          }
        }

        return dedupedFinal
      } catch (err) {
        if (recentlyStreamed[sessionId]) {
          delete recentlyStreamed[sessionId]
        }
        console.error(
          '[streamStore] fetchMessages error for session',
          sessionId,
          ':',
          err.message
        )

        const existingCache = messagesCache[sessionId]
        const fallback =
          existingCache && existingCache.length > 0 ? existingCache : []

        if (fallback.length > 0) {
          messagesCache[sessionId] = fallback
          if (activeSession === sessionId) {
            set({ messages: fallback })
          }
          return fallback
        }

        messagesCache[sessionId] = []
        return []
      } finally {
        delete fetchInFlight[sessionId]
      }
    })()

    fetchInFlight[sessionId] = fetchPromise
    return fetchPromise
  },

  // ── Send message ──
  sendMessage: (sessionId, content, onSessionTitleUpdate, images = []) => {
    const state = get()
    const { _internal, _callbacks } = state
    const {
      streamingSessions,
      isSending,
      messagesCache,
      activeStreamingState,
      abortControllers,
    } = _internal

    if (streamingSessions.has(sessionId) || isSending.has(sessionId)) {
      console.log(
        '[streamStore] Message send prevented for session',
        sessionId,
        '- already streaming or sending'
      )
      return
    }

    isSending.add(sessionId)

    if (!content.trim() && images.length === 0) {
      isSending.delete(sessionId)
      return
    }

    // Clear agent events for this session
    get()._updateAgentEventsForSession(sessionId, [])

    if (_internal.activeSession === sessionId) {
      set({ error: null })
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

    get()._updateMessagesForSession(sessionId, (prev) => [
      ...prev,
      userMsg,
      assistantMsg,
    ])

    persistUserMessage(sessionId, userMsg)

    streamingSessions.add(sessionId)
    if (_internal.activeSession === sessionId) {
      set({ isStreaming: true })
    }

    let fullContent = ''
    let activeToolCalls = {}

    activeStreamingState[sessionId] = {
      assistantMsgId,
      fullContent: '',
      activeToolCalls: {},
      streamingStartedAt,
    }

    const userMsgTempId = userMsg.message_id

    const _persistToolCallsIncremental = () => {
      const toolCallsArr = Object.values(activeToolCalls)
      if (toolCallsArr.length === 0) return

      activeStreamingState[sessionId] = {
        assistantMsgId,
        fullContent,
        activeToolCalls: { ...activeToolCalls },
        streamingStartedAt,
      }

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

        if (activeStreamingState[sessionId]) {
          activeStreamingState[sessionId].fullContent = fullContent
        }

        get()._updateMessagesForSession(sessionId, (prev) =>
          prev.map((m) =>
            m.message_id === assistantMsgId
              ? { ...m, content: fullContent }
              : m
          )
        )
      },

      onToolStart: (data) => {
        const toolKey =
          data.tool_use_id || `${data.tool}_${Date.now()}`
        activeToolCalls[toolKey] = {
          tool_use_id: toolKey,
          tool: data.tool,
          input: data.input || {},
          status: 'running',
        }

        get()._updateMessagesForSession(sessionId, (prev) =>
          prev.map((m) =>
            m.message_id === assistantMsgId
              ? { ...m, tool_calls: Object.values(activeToolCalls) }
              : m
          )
        )

        // Project status: emit 'creating' when create_project tool starts
        if (data.tool === 'create_project') {
          const projectName =
            data.input?.name || data.input?.project_name || null
          if (projectName && _callbacks.onProjectStatusChange) {
            _callbacks.onProjectStatusChange(projectName, 'creating', {
              messageId: assistantMsgId,
              sessionId,
            })
          }
        }
        if (data.tool === 'create_file' || data.tool === 'update_file') {
          const projectName =
            data.input?.project || data.input?.name || null
          if (projectName && _callbacks.onProjectStatusChange) {
            _callbacks.onProjectStatusChange(projectName, 'generating', {
              messageId: assistantMsgId,
              sessionId,
            })
          }
        }

        _persistToolCallsIncremental()
      },

      onToolResult: (data) => {
        const toolKey =
          data.tool_use_id && activeToolCalls[data.tool_use_id]
            ? data.tool_use_id
            : Object.keys(activeToolCalls).find(
                (k) =>
                  activeToolCalls[k].tool === data.tool &&
                  activeToolCalls[k].status === 'running'
              )

        if (toolKey && activeToolCalls[toolKey]) {
          activeToolCalls[toolKey] = {
            ...activeToolCalls[toolKey],
            result: data.result || {},
            status: 'done',
          }

          get()._updateMessagesForSession(sessionId, (prev) =>
            prev.map((m) =>
              m.message_id === assistantMsgId
                ? { ...m, tool_calls: Object.values(activeToolCalls) }
                : m
            )
          )

          if (
            data.tool === 'create_project' &&
            _callbacks.onProjectStatusChange
          ) {
            const projectName =
              data.result?.project_name ||
              data.result?.name ||
              activeToolCalls[toolKey]?.input?.name ||
              null
            if (projectName) {
              const filesCreated =
                data.result?.files_created?.length || 0
              _callbacks.onProjectStatusChange(
                projectName,
                'generating',
                {
                  messageId: assistantMsgId,
                  sessionId,
                  filesCreated,
                }
              )
            }
          }

          _persistToolCallsIncremental()
        } else {
          const syntheticKey =
            data.tool_use_id || `${data.tool}_result_${Date.now()}`
          activeToolCalls[syntheticKey] = {
            tool_use_id: syntheticKey,
            tool: data.tool,
            input: {},
            result: data.result || {},
            status: 'done',
          }

          get()._updateMessagesForSession(sessionId, (prev) =>
            prev.map((m) =>
              m.message_id === assistantMsgId
                ? { ...m, tool_calls: Object.values(activeToolCalls) }
                : m
            )
          )

          _persistToolCallsIncremental()
        }
      },

      onThinking: (data) => {
        get()._updateAgentEventsForSession(sessionId, (prev) => {
          const idx = prev.findIndex((ev) => ev.type === 'thinking')
          if (idx !== -1) {
            const updated = [...prev]
            updated[idx] = { type: 'thinking', ...data }
            return updated
          }
          return [...prev, { type: 'thinking', ...data }]
        })
      },

      onStatus: (data) => {
        get()._updateAgentEventsForSession(sessionId, (prev) => {
          if (data.status === 'done') {
            const idx = [...prev]
              .reverse()
              .findIndex(
                (ev) =>
                  ev.type === 'status' &&
                  ev.tool === data.tool &&
                  ev.status === 'active'
              )
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
        get()._updateAgentEventsForSession(sessionId, (prev) => {
          const idx = prev.findIndex((ev) => ev.type === 'iteration')
          if (idx !== -1) {
            const updated = [...prev]
            updated[idx] = { type: 'iteration', ...data }
            return updated
          }
          return [...prev, { type: 'iteration', ...data }]
        })
      },

      onArtifact: (data) => {
        get()._updateArtifactsForSession(sessionId, (prev) => {
          const isFromThisStream = prev.some(
            (a) => a._streamId === assistantMsgId
          )
          const base = isFromThisStream ? prev : []

          const idx = base.findIndex((a) => a.id === data.id)
          if (idx !== -1) {
            const updated = [...base]
            updated[idx] = { ...data, _streamId: assistantMsgId }
            return updated
          }
          return [...base, { ...data, _streamId: assistantMsgId }]
        })
      },

      onDone: (data) => {
        const currentState = get()
        const { _internal: int, _callbacks: cbs } = currentState
        const isActiveNow = int.activeSession === sessionId
        const wasAborted = data?.aborted === true

        const generationTime = (
          (Date.now() - streamingStartedAt) /
          1000
        ).toFixed(1)
        const finalToolCalls = Object.values(activeToolCalls)

        console.log(
          '[streamStore] onDone: session',
          sessionId,
          '| content length:',
          fullContent.length,
          '| tool_calls:',
          finalToolCalls.length,
          '| message_id:',
          data?.message_id
        )

        get()._updateMessagesForSession(sessionId, (prev) =>
          prev.map((m) => {
            if (m.message_id === assistantMsgId) {
              return {
                ...m,
                ...(data?.message_id
                  ? { message_id: data.message_id }
                  : {}),
                content: fullContent || m.content || '',
                isStreaming: false,
                _tempId: assistantMsgId,
                tool_calls:
                  finalToolCalls.length > 0
                    ? finalToolCalls
                    : m.tool_calls || [],
                generation_time: generationTime,
                streaming_started_at: streamingStartedAt,
              }
            }
            if (
              m.message_id === userMsgTempId &&
              data?.user_message_id
            ) {
              updatePersistedUserMessageId(
                sessionId,
                userMsgTempId,
                data.user_message_id
              )
              return { ...m, message_id: data.user_message_id }
            }
            return m
          })
        )

        // Persist tool_calls
        if (finalToolCalls.length > 0) {
          const currentMessages = int.messagesCache[sessionId] || []
          const assistantMsgsBefore = currentMessages.filter(
            (m) =>
              m.role === 'assistant' &&
              m.message_id !== assistantMsgId
          ).length

          saveToolCalls(sessionId, {
            msgId: data?.message_id ? String(data.message_id) : '',
            tempId: assistantMsgId,
            contentText: fullContent || '',
            positionIndex: assistantMsgsBefore,
            toolCalls: finalToolCalls,
            generationTime,
          })
            .then(() => {
              evictOldRecords()
              evictOldUserMessages()
            })
            .catch(() => {})
        }

        clearStreamingState(sessionId)
        delete activeStreamingState[sessionId]

        // Project status: mark completed
        if (!wasAborted && cbs.onProjectStatusChange) {
          const allToolCalls = Object.values(activeToolCalls)
          const projectTools = allToolCalls.filter(
            (tc) =>
              tc.tool === 'create_project' && tc.status === 'done'
          )
          for (const pt of projectTools) {
            const projectName =
              pt.result?.project_name ||
              pt.result?.name ||
              pt.input?.name
            if (projectName) {
              const filesCreated =
                pt.result?.files_created?.length || 0
              cbs.onProjectStatusChange(projectName, 'completed', {
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

        streamingSessions.delete(sessionId)
        isSending.delete(sessionId)
        delete abortControllers[sessionId]

        if (!wasAborted) {
          _internal.recentlyStreamed[sessionId] = Date.now()
        }

        if (
          !isActiveNow &&
          !wasAborted &&
          cbs.onBackgroundComplete
        ) {
          cbs.onBackgroundComplete(
            sessionId,
            data?.session_title || 'A conversation'
          )
        }

        // Always set isStreaming to false
        set({ isStreaming: false })

        if (isActiveNow) {
          if (!wasAborted) {
            setTimeout(() => {
              get()._updateAgentEventsForSession(sessionId, [])
            }, 1500)
          } else {
            get()._updateAgentEventsForSession(sessionId, [])
          }
        }
      },

      onError: (errMsg) => {
        const currentState = get()
        const { _internal: int, _callbacks: cbs } = currentState
        const isActiveNow = int.activeSession === sessionId

        // 409 Conflict handling
        const is409 =
          typeof errMsg === 'string' &&
          (errMsg.includes('409') ||
            errMsg.includes('CONFLICT') ||
            errMsg.includes('already running'))
        if (is409 && cbs.onConflictQueue) {
          console.log(
            '[streamStore] 409 Conflict detected for session',
            sessionId
          )

          get()._updateMessagesForSession(sessionId, (prev) =>
            prev.filter(
              (m) =>
                m.message_id !== userMsgTempId &&
                m.message_id !== assistantMsgId
            )
          )

          // Remove persisted user message
          try {
            const umKey = USER_MSGS_PREFIX + sessionId
            const umList = JSON.parse(
              localStorage.getItem(umKey) || '[]'
            )
            const filtered = umList.filter(
              (m) => m.message_id !== userMsgTempId
            )
            if (filtered.length !== umList.length) {
              localStorage.setItem(umKey, JSON.stringify(filtered))
            }
          } catch {
            /* ignore */
          }

          delete activeStreamingState[sessionId]
          streamingSessions.delete(sessionId)
          isSending.delete(sessionId)
          delete abortControllers[sessionId]
          set({ isStreaming: false })

          cbs.onConflictQueue(sessionId, content)
          return
        }

        const generationTime = (
          (Date.now() - streamingStartedAt) /
          1000
        ).toFixed(1)
        const finalToolCalls = Object.values(activeToolCalls)

        console.warn(
          '[streamStore] onError: session',
          sessionId,
          '| error:',
          errMsg,
          '| content so far:',
          fullContent.length,
          'chars'
        )

        if (finalToolCalls.length > 0) {
          _persistToolCallsIncremental()
        }

        get()._updateMessagesForSession(sessionId, (prev) =>
          prev.map((m) =>
            m.message_id === assistantMsgId
              ? {
                  ...m,
                  content: fullContent || m.content || '',
                  isStreaming: false,
                  isError: true,
                  tool_calls:
                    finalToolCalls.length > 0
                      ? finalToolCalls
                      : m.tool_calls || [],
                  generation_time: generationTime,
                }
              : m
          )
        )

        if (isActiveNow) {
          set({
            error: errMsg || 'Streaming failed. Please try again.',
          })
        }

        set({ isStreaming: false })

        delete activeStreamingState[sessionId]
        streamingSessions.delete(sessionId)
        isSending.delete(sessionId)
        delete abortControllers[sessionId]
      },
    })

    abortControllers[sessionId] = controller
  },

  // ── Cancel stream ──
  cancelStream: (sessionId) => {
    const { _internal } = get()
    const targetSession = sessionId || _internal.activeSession

    if (targetSession && _internal.abortControllers[targetSession]) {
      _internal.abortControllers[targetSession].abort()
      delete _internal.abortControllers[targetSession]
      _internal.streamingSessions.delete(targetSession)
      _internal.isSending.delete(targetSession)
      delete _internal.activeStreamingState[targetSession]

      get()._updateMessagesForSession(targetSession, (prev) =>
        prev.map((m) =>
          m.isStreaming ? { ...m, isStreaming: false } : m
        )
      )
    }

    if (!targetSession || targetSession === _internal.activeSession) {
      set({ isStreaming: false, agentEvents: [] })
    }
  },

  // ── Clear messages ──
  clearMessages: (sessionId) => {
    const { _internal } = get()
    if (sessionId) {
      _internal.messagesCache[sessionId] = []
      _internal.agentEventsCache[sessionId] = []
      _internal.artifactsCache[sessionId] = []
      if (_internal.activeSession === sessionId) {
        set({ messages: [], agentEvents: [], artifacts: [], error: null })
      }
    } else {
      const active = _internal.activeSession
      if (active) {
        _internal.messagesCache[active] = []
        _internal.agentEventsCache[active] = []
        _internal.artifactsCache[active] = []
      }
      set({ messages: [], agentEvents: [], artifacts: [], error: null })
    }
  },

  // ── Check if session is streaming ──
  isSessionStreaming: (sessionId) => {
    return get()._internal.streamingSessions.has(sessionId)
  },

  // ── Cleanup session data ──
  cleanupSession: (sessionId) => {
    const { _internal } = get()
    delete _internal.messagesCache[sessionId]
    delete _internal.agentEventsCache[sessionId]
    delete _internal.artifactsCache[sessionId]
    delete _internal.fetchInFlight[sessionId]
    delete _internal.recentlyStreamed[sessionId]
    delete _internal.activeStreamingState[sessionId]
    clearStreamingState(sessionId)
    clearArtifactsCache(sessionId)
    deleteSessionToolCalls(sessionId)
    try {
      clearPersistedUserMessages(sessionId)
    } catch (_) {
      /* ignore */
    }
    if (_internal.abortControllers[sessionId]) {
      _internal.abortControllers[sessionId].abort()
      delete _internal.abortControllers[sessionId]
    }
    _internal.streamingSessions.delete(sessionId)
    _internal.isSending.delete(sessionId)
  },

  // ── Recover stream state after page refresh ──
  recoverStreamState: async (sessionId) => {
    if (!sessionId) return { recovered: false, isActive: false }

    const { _internal } = get()
    const existingMsgs = _internal.messagesCache[sessionId] || []
    if (existingMsgs.length > 0) {
      return { recovered: false, isActive: false }
    }

    console.log(
      '[streamStore] recoverStreamState: attempting recovery for session',
      sessionId
    )

    // PATH 1: Service Worker recovery
    if (isStreamWorkerReady()) {
      try {
        const { state: swState, isActive } =
          await recoverStreamFromSW(sessionId)

        if (
          swState &&
          (swState.fullContent ||
            (swState.toolCalls && swState.toolCalls.length > 0))
        ) {
          console.log(
            '[streamStore] recoverStreamState: SW recovery succeeded for session',
            sessionId,
            '| content:',
            (swState.fullContent || '').length,
            'chars | isActive:',
            isActive
          )

          const toolCallsArr = Array.isArray(swState.toolCalls)
            ? swState.toolCalls
            : Object.values(swState.toolCalls || {})

          const recoveredAssistantMsg = {
            message_id:
              swState.doneData?.message_id ||
              swState.assistantMsgId ||
              `recovered_assistant_${Date.now()}`,
            role: 'assistant',
            content: swState.fullContent || '',
            tool_calls: toolCallsArr,
            isStreaming: isActive && !swState.done,
            streaming_started_at: swState.startedAt,
            generation_time: swState.startedAt
              ? ((Date.now() - swState.startedAt) / 1000).toFixed(1)
              : undefined,
            created_at: new Date(
              swState.startedAt || Date.now()
            ).toISOString(),
            _recovered: true,
          }

          get()._updateMessagesForSession(sessionId, (prev) => {
            if (
              prev.some(
                (m) =>
                  m.content === recoveredAssistantMsg.content &&
                  m.role === 'assistant'
              )
            ) {
              return prev
            }
            return [...prev, recoveredAssistantMsg]
          })

          // If stream is still active, subscribe to live events
          if (isActive && !swState.done) {
            _internal.streamingSessions.add(sessionId)
            if (_internal.activeSession === sessionId) {
              set({ isStreaming: true })
            }

            let fullContent = swState.fullContent || ''
            let activeToolCalls = {}
            for (const tc of toolCallsArr) {
              activeToolCalls[
                tc.tool_use_id || `${tc.tool}_${Date.now()}`
              ] = tc
            }

            const assistantMsgId = recoveredAssistantMsg.message_id
            const streamingStartedAt = swState.startedAt || Date.now()

            const unsubscribe = subscribeToStream(
              sessionId,
              (event) => {
                const { type, data } = event

                switch (type) {
                  case 'token':
                    fullContent += data.content || ''
                    get()._updateMessagesForSession(
                      sessionId,
                      (prev) =>
                        prev.map((m) =>
                          m.message_id === assistantMsgId
                            ? { ...m, content: fullContent }
                            : m
                        )
                    )
                    break

                  case 'tool_start': {
                    const toolKey =
                      data.tool_use_id ||
                      `${data.tool}_${Date.now()}`
                    activeToolCalls[toolKey] = {
                      tool_use_id: toolKey,
                      tool: data.tool,
                      input: data.input || {},
                      status: 'running',
                    }
                    get()._updateMessagesForSession(
                      sessionId,
                      (prev) =>
                        prev.map((m) =>
                          m.message_id === assistantMsgId
                            ? {
                                ...m,
                                tool_calls:
                                  Object.values(activeToolCalls),
                              }
                            : m
                        )
                    )
                    break
                  }

                  case 'tool_result': {
                    const toolKey =
                      data.tool_use_id &&
                      activeToolCalls[data.tool_use_id]
                        ? data.tool_use_id
                        : Object.keys(activeToolCalls).find(
                            (k) =>
                              activeToolCalls[k].tool ===
                                data.tool &&
                              activeToolCalls[k].status ===
                                'running'
                          )
                    if (toolKey && activeToolCalls[toolKey]) {
                      activeToolCalls[toolKey] = {
                        ...activeToolCalls[toolKey],
                        result: data.result || {},
                        status: 'done',
                      }
                    }
                    get()._updateMessagesForSession(
                      sessionId,
                      (prev) =>
                        prev.map((m) =>
                          m.message_id === assistantMsgId
                            ? {
                                ...m,
                                tool_calls:
                                  Object.values(activeToolCalls),
                              }
                            : m
                        )
                    )
                    break
                  }

                  case 'done': {
                    const generationTime = (
                      (Date.now() - streamingStartedAt) /
                      1000
                    ).toFixed(1)
                    const finalToolCalls =
                      Object.values(activeToolCalls)

                    get()._updateMessagesForSession(
                      sessionId,
                      (prev) =>
                        prev.map((m) =>
                          m.message_id === assistantMsgId
                            ? {
                                ...m,
                                ...(data?.message_id
                                  ? { message_id: data.message_id }
                                  : {}),
                                content:
                                  fullContent || m.content || '',
                                isStreaming: false,
                                tool_calls:
                                  finalToolCalls.length > 0
                                    ? finalToolCalls
                                    : m.tool_calls || [],
                                generation_time: generationTime,
                              }
                            : m
                        )
                    )

                    if (finalToolCalls.length > 0) {
                      const currentMessages =
                        _internal.messagesCache[sessionId] || []
                      const assistantMsgsBefore =
                        currentMessages.filter(
                          (m) =>
                            m.role === 'assistant' &&
                            m.message_id !== assistantMsgId
                        ).length

                      saveToolCalls(sessionId, {
                        msgId: data?.message_id
                          ? String(data.message_id)
                          : '',
                        tempId: assistantMsgId,
                        contentText: fullContent || '',
                        positionIndex: assistantMsgsBefore,
                        toolCalls: finalToolCalls,
                        generationTime,
                      })
                        .then(() => evictOldRecords())
                        .catch(() => {})
                    }

                    _internal.recentlyStreamed[sessionId] =
                      Date.now()
                    _internal.streamingSessions.delete(sessionId)
                    if (
                      _internal.activeSession === sessionId
                    ) {
                      set({ isStreaming: false })
                    }

                    clearStreamStateSW(sessionId)
                    clearStreamingState(sessionId)
                    unsubscribe()
                    break
                  }

                  case 'error':
                    get()._updateMessagesForSession(
                      sessionId,
                      (prev) =>
                        prev.map((m) =>
                          m.message_id === assistantMsgId
                            ? {
                                ...m,
                                content:
                                  fullContent || m.content || '',
                                isStreaming: false,
                                isError: true,
                              }
                            : m
                        )
                    )
                    _internal.streamingSessions.delete(sessionId)
                    if (
                      _internal.activeSession === sessionId
                    ) {
                      set({
                        isStreaming: false,
                        error:
                          data.error ||
                          'Stream error after recovery',
                      })
                    }
                    unsubscribe()
                    break
                }
              }
            )
          } else {
            // Stream already completed — persist and clean up
            if (toolCallsArr.length > 0) {
              saveToolCalls(sessionId, {
                msgId: swState.doneData?.message_id
                  ? String(swState.doneData.message_id)
                  : '',
                tempId: swState.assistantMsgId || '',
                contentText: swState.fullContent || '',
                positionIndex: 0,
                toolCalls: toolCallsArr,
                generationTime:
                  recoveredAssistantMsg.generation_time || '',
              })
                .then(() => evictOldRecords())
                .catch(() => {})
            }

            _internal.recentlyStreamed[sessionId] = Date.now()
            clearStreamStateSW(sessionId)
          }

          return { recovered: true, isActive: isActive && !swState.done }
        }
      } catch (err) {
        console.warn(
          '[streamStore] recoverStreamState: SW recovery failed:',
          err.message
        )
      }
    }

    // PATH 2: localStorage streaming state recovery
    const streamingState = loadStreamingState(sessionId)
    if (
      streamingState &&
      (streamingState.fullContent ||
        (streamingState.toolCalls &&
          streamingState.toolCalls.length > 0))
    ) {
      console.log(
        '[streamStore] recoverStreamState: localStorage recovery for session',
        sessionId
      )

      const toolCallsArr = streamingState.toolCalls || []
      const recoveredAssistantMsg = {
        message_id:
          streamingState.assistantMsgId ||
          `recovered_assistant_${Date.now()}`,
        role: 'assistant',
        content: streamingState.fullContent || '',
        tool_calls: toolCallsArr,
        isStreaming: false,
        generation_time: streamingState.streamingStartedAt
          ? (
              (Date.now() - streamingState.streamingStartedAt) /
              1000
            ).toFixed(1)
          : undefined,
        created_at: new Date(
          streamingState.streamingStartedAt || Date.now()
        ).toISOString(),
        _recovered: true,
      }

      get()._updateMessagesForSession(sessionId, (prev) => {
        if (
          prev.some(
            (m) =>
              m.content === recoveredAssistantMsg.content &&
              m.role === 'assistant'
          )
        ) {
          return prev
        }
        return [...prev, recoveredAssistantMsg]
      })

      if (toolCallsArr.length > 0) {
        saveToolCalls(sessionId, {
          msgId: '',
          tempId: streamingState.assistantMsgId || '',
          contentText: streamingState.fullContent || '',
          positionIndex: 0,
          toolCalls: toolCallsArr,
          generationTime:
            recoveredAssistantMsg.generation_time || '',
        })
          .then(() => clearStreamingState(sessionId))
          .catch(() => {})
      } else {
        clearStreamingState(sessionId)
      }

      return { recovered: true, isActive: false }
    }

    console.log(
      '[streamStore] recoverStreamState: no recovery data found for session',
      sessionId
    )
    return { recovered: false, isActive: false }
  },

  // ── Set error ──
  setError: (err) => set({ error: err }),
}))


// ─────────────────────────────────────────────────────────────────────────────
//  BEFOREUNLOAD HANDLER
//
//  Register once at module level — flushes active streaming state to
//  localStorage on page refresh so tool_calls survive.
// ─────────────────────────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const { _internal } = useStreamStore.getState()
    const activeStates = _internal.activeStreamingState
    for (const [sessionId, state] of Object.entries(activeStates)) {
      if (!state) continue
      const toolCallsArr = Object.values(state.activeToolCalls || {})
      if (toolCallsArr.length === 0 && !state.fullContent) continue

      console.log(
        '[streamStore] beforeunload: flushing streaming state for session',
        sessionId,
        '| tool_calls:',
        toolCallsArr.length,
        '| content:',
        (state.fullContent || '').length,
        'chars'
      )

      saveStreamingState(sessionId, {
        assistantMsgId: state.assistantMsgId,
        toolCalls: toolCallsArr,
        fullContent: state.fullContent || '',
        streamingStartedAt: state.streamingStartedAt,
        sessionId,
      })
    }
  })
}


export default useStreamStore
