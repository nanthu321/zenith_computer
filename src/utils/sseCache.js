/**
 * SSE Cache — Persists tool_calls and generation_time to localStorage
 *
 * Problem:  The backend API (GET /api/messages/:sessionId) returns message
 *           text but does NOT include SSE-accumulated data like tool_calls
 *           and generation_time. On page refresh the in-memory cache is
 *           gone, so these details disappear.
 *
 * Solution: After streaming completes (onDone), we persist the SSE metadata
 *           into localStorage keyed by session ID.  When messages are
 *           re-fetched from the API, we enrich them with this cached data.
 *
 * Matching strategy (robust — handles ID mismatches):
 *   1. Exact message_id match (best case)
 *   2. Content-prefix match: if the API message content starts with the
 *      same text as what we cached, it's the same message even if the
 *      IDs differ (e.g. temp_ vs real backend ID)
 *   3. Positional match: for assistant messages without content match,
 *      try matching by chronological order within the session
 *
 * Storage format (per session):
 *   Key:   zenith_sse_{sessionId}
 *   Value: JSON map of entryKey → { tool_calls, generation_time, content_prefix, role, created_at, _ts }
 *
 * Cleanup:
 *   - Old sessions are evicted when total count exceeds MAX_SESSIONS.
 *   - Data for a specific session is cleared when that session is deleted.
 */

const PREFIX = 'zenith_sse_'
const MAX_SESSIONS = 50
const CONTENT_PREFIX_LEN = 150 // chars of message content to store for matching

// ── Read the SSE cache for a session ──
export function getSSECache(sessionId) {
  if (!sessionId) return {}
  try {
    const raw = localStorage.getItem(PREFIX + sessionId)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

// ── Write/update SSE data for a single message in a session ──
// `data` should include: { tool_calls, generation_time, content_prefix, role, created_at }
export function setSSECacheEntry(sessionId, messageId, data) {
  if (!sessionId || !messageId) return
  try {
    const cache = getSSECache(sessionId)
    cache[String(messageId)] = {
      ...data,
      _ts: Date.now(), // timestamp for LRU eviction
    }
    localStorage.setItem(PREFIX + sessionId, JSON.stringify(cache))
    evictOldSessions()
  } catch (e) {
    console.warn('[sseCache] Failed to write:', e.message)
  }
}

/**
 * Enrich an array of API messages with cached SSE data.
 *
 * Uses a multi-pass matching strategy:
 *   Pass 1: Exact message_id match
 *   Pass 2: Content-prefix match (for assistant messages where IDs differ)
 *   Pass 3: Fuzzy content-prefix match (startsWith / includes for partial matches)
 *   Pass 4: Chronological order match (last resort for assistant msgs)
 *   Pass 5: Sequential position match (nth assistant msg ↔ nth cache entry)
 */
export function enrichMessagesWithSSECache(sessionId, messages) {
  if (!sessionId || !messages || messages.length === 0) return messages

  const cache = getSSECache(sessionId)
  const cacheEntries = Object.entries(cache)
  if (cacheEntries.length === 0) {
    console.log('[sseCache] No cache entries found for session', sessionId)
    return messages
  }

  console.log('[sseCache] Enriching', messages.length, 'messages with', cacheEntries.length,
    'cache entries for session', sessionId)

  // Build lookup structures
  const byId = new Map()           // message_id → cached data
  const byContentPrefix = new Map() // content_prefix → { key, entry } (for assistant msgs)

  for (const [key, entry] of cacheEntries) {
    byId.set(key, entry)
    if (entry.content_prefix && entry.role === 'assistant') {
      byContentPrefix.set(entry.content_prefix, { key, entry })
    }
  }

  // Track which cache entries have been consumed (to avoid double-matching)
  const usedCacheKeys = new Set()

  const enriched = messages.map(msg => {
    if (msg.role !== 'assistant') return msg

    const msgId = String(msg.message_id ?? '')

    // ── Pass 1: Exact ID match ──
    let cached = byId.get(msgId)
    if (cached && !usedCacheKeys.has(msgId)) {
      usedCacheKeys.add(msgId)
      console.log('[sseCache] Pass 1 (exact ID) match: API msg', msgId)
      return applyCache(msg, cached)
    }

    // ── Pass 2: Exact Content-prefix match ──
    if (msg.content) {
      const apiPrefix = msg.content.substring(0, CONTENT_PREFIX_LEN).trim()
      if (apiPrefix.length > 20) {
        for (const [prefix, { key, entry }] of byContentPrefix) {
          if (!usedCacheKeys.has(key) && apiPrefix === prefix) {
            usedCacheKeys.add(key)
            console.log('[sseCache] Pass 2 (exact prefix) match: API msg', msgId, '↔ cached', key)
            return applyCache(msg, entry)
          }
        }
      }

      // ── Pass 3: Fuzzy content-prefix match (startsWith / normalized) ──
      if (apiPrefix.length > 10) {
        // Normalize: collapse whitespace and lowercase for fuzzy comparison
        const normalizeStr = (s) => s.replace(/\s+/g, ' ').toLowerCase().trim()
        const apiNorm = normalizeStr(apiPrefix)

        for (const [prefix, { key, entry }] of byContentPrefix) {
          if (usedCacheKeys.has(key)) continue
          const cacheNorm = normalizeStr(prefix)

          // Check if one starts with the other (handles truncation differences)
          if (apiNorm.startsWith(cacheNorm.substring(0, 50)) ||
              cacheNorm.startsWith(apiNorm.substring(0, 50))) {
            usedCacheKeys.add(key)
            console.log('[sseCache] Pass 3 (fuzzy prefix) match: API msg', msgId, '↔ cached', key)
            return applyCache(msg, entry)
          }
        }
      }
    }

    return msg
  })

  // ── Pass 4: Chronological/positional match ──
  // For any remaining unmatched assistant messages that have no tool_calls,
  // try to match with remaining unused cache entries by timestamp proximity
  const unusedEntries = cacheEntries
    .filter(([key]) => !usedCacheKeys.has(key))
    .map(([key, entry]) => ({ key, entry }))

  let result = enriched
  if (unusedEntries.length > 0) {
    result = enriched.map(msg => {
      if (msg.role !== 'assistant') return msg
      if (msg.tool_calls && msg.tool_calls.length > 0) return msg // already enriched

      const msgTime = msg.created_at ? new Date(msg.created_at).getTime() : 0
      if (!msgTime) return msg

      // Find the closest unused cache entry by timestamp (within 5 minutes)
      let bestMatch = null
      let bestDiff = Infinity

      for (const { key, entry } of unusedEntries) {
        if (usedCacheKeys.has(key)) continue
        const entryTime = entry.created_at ? new Date(entry.created_at).getTime() : (entry._ts || 0)
        const diff = Math.abs(msgTime - entryTime)
        if (diff < 300000 && diff < bestDiff) { // within 5 minutes (was 60s — too strict)
          bestDiff = diff
          bestMatch = { key, entry }
        }
      }

      if (bestMatch) {
        usedCacheKeys.add(bestMatch.key)
        console.log('[sseCache] Pass 4 (timestamp) match: API msg', msg.message_id, '↔ cached', bestMatch.key, '(diff:', bestDiff, 'ms)')
        return applyCache(msg, bestMatch.entry)
      }

      return msg
    })
  }

  // ── Pass 5: Sequential position match ──
  // If we STILL have unmatched cache entries with tool_calls and unmatched assistant
  // messages without tool_calls, match them by position (nth unmatched ↔ nth unused)
  const stillUnusedEntries = cacheEntries
    .filter(([key]) => !usedCacheKeys.has(key))
    .filter(([, entry]) => entry.tool_calls && entry.tool_calls.length > 0)
    .map(([key, entry]) => ({ key, entry }))

  if (stillUnusedEntries.length > 0) {
    let usedIdx = 0
    result = result.map(msg => {
      if (msg.role !== 'assistant') return msg
      if (msg.tool_calls && msg.tool_calls.length > 0) return msg // already enriched
      if (usedIdx >= stillUnusedEntries.length) return msg

      const { key, entry } = stillUnusedEntries[usedIdx]
      usedCacheKeys.add(key)
      usedIdx++
      console.log('[sseCache] Pass 5 (sequential) match: API msg', msg.message_id, '↔ cached', key)
      return applyCache(msg, entry)
    })
  }

  // Log final stats
  const enrichedCount = result.filter((m, i) =>
    m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0 &&
    !(messages[i]?.tool_calls && messages[i]?.tool_calls?.length > 0)
  ).length
  console.log('[sseCache] Enrichment complete:', enrichedCount, 'messages enriched with tool_calls')

  return result
}

// ── Apply cached SSE data onto an API message ──
function applyCache(msg, cached) {
  const enriched = { ...msg }

  // Preserve tool_calls from cache if API message doesn't have them
  if ((!msg.tool_calls || msg.tool_calls.length === 0) &&
      cached.tool_calls && cached.tool_calls.length > 0) {
    enriched.tool_calls = cached.tool_calls
    console.log('[sseCache] Applied', cached.tool_calls.length, 'tool_calls to msg', msg.message_id,
      '| tools:', cached.tool_calls.map(tc => tc.tool).join(', '))
  }

  // Preserve generation_time from cache
  if (!msg.generation_time && cached.generation_time) {
    enriched.generation_time = cached.generation_time
  }

  return enriched
}

// ── Remove SSE cache for a deleted session ──
export function clearSSECache(sessionId) {
  if (!sessionId) return
  try {
    localStorage.removeItem(PREFIX + sessionId)
  } catch { /* ignore */ }
}

// ── Evict oldest sessions if we exceed the limit ──
function evictOldSessions() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIX)) {
        keys.push(k)
      }
    }
    if (keys.length <= MAX_SESSIONS) return

    // Find the oldest by checking _ts of entries
    const sessions = keys.map(k => {
      try {
        const data = JSON.parse(localStorage.getItem(k) || '{}')
        const timestamps = Object.values(data).map(v => v?._ts || 0)
        const latestTs = timestamps.length > 0 ? Math.max(...timestamps) : 0
        return { key: k, ts: latestTs }
      } catch {
        return { key: k, ts: 0 }
      }
    })

    sessions.sort((a, b) => a.ts - b.ts)
    const toRemove = sessions.slice(0, sessions.length - MAX_SESSIONS)
    toRemove.forEach(s => localStorage.removeItem(s.key))
  } catch { /* ignore */ }
}
