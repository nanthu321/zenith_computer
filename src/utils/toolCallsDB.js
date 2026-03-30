/**
 * toolCallsDB — localStorage persistence for tool_calls per assistant message.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS (backend limitation):
 *
 *   The backend API (GET /api/messages/:sessionId) returns message text but
 *   does NOT include `tool_calls` or `generation_time`. These are only
 *   available during SSE streaming. Without client-side persistence, tool call
 *   cards (web_search, create_project, execute_code, etc.) disappear on
 *   page refresh.
 *
 *   TODO: Once the backend persists and returns tool_calls in the messages
 *   API, this entire module can be removed. The backend should be the single
 *   source of truth.
 *
 * STORAGE: localStorage
 *   - Single key: 'zenith_tool_calls'
 *   - Value: JSON array of record objects
 *   - Each record: { id, sessionId, msgId, tempId, contentHash,
 *                     positionIndex, toolCalls, generationTime, storedAt }
 *
 * MATCHING STRATEGY:
 *   Records are matched by multiple keys so at least one matches on refresh:
 *     1. sessionId + realMessageId   (from backend onDone event)
 *     2. sessionId + tempAssistantId (our temp_ ID during streaming)
 *     3. sessionId + contentHash     (first 200 chars normalized)
 *     4. sessionId + positionIndex   (nth assistant message — most stable)
 *
 * CLEANUP / EVICTION:
 *   - Per-session deletion when user deletes a chat session.
 *   - Global eviction when total records exceed MAX_RECORDS (500).
 *   - Records older than MAX_AGE_MS (7 days) are pruned on eviction.
 *   - Tool call payloads are compacted (only essential fields stored)
 *     to stay within localStorage's ~5 MB limit.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const LS_KEY      = 'zenith_tool_calls'
const MAX_RECORDS = 500
const MAX_AGE_MS  = 7 * 24 * 60 * 60 * 1000 // 7 days

let _nextId = 0 // auto-increment counter (per page load — actual IDs are stored in records)

// ─────────────────────────────────────────────────────────────────────────────
//  INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read all records from localStorage.
 * Returns [] on any parse error or if the key doesn't exist.
 */
function _readAll() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Write all records to localStorage.
 * Silently drops the write if it exceeds quota.
 */
function _writeAll(records) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(records))
  } catch (e) {
    // Quota exceeded — evict aggressively and retry once
    console.warn('[toolCallsDB] localStorage write failed, evicting and retrying:', e.message)
    try {
      const pruned = _evictAggressively(records)
      localStorage.setItem(LS_KEY, JSON.stringify(pruned))
    } catch {
      console.warn('[toolCallsDB] localStorage write failed even after eviction — giving up')
    }
  }
}

/**
 * Aggressive eviction: keep only the most recent MAX_RECORDS / 2 records.
 */
function _evictAggressively(records) {
  const sorted = [...records].sort((a, b) => b.storedAt - a.storedAt)
  return sorted.slice(0, Math.floor(MAX_RECORDS / 2))
}

/**
 * Get the next auto-increment ID.
 * On first call, scans existing records to find the max ID.
 */
function _getNextId(records) {
  if (_nextId === 0 && records.length > 0) {
    _nextId = Math.max(...records.map(r => r.id || 0)) + 1
  }
  return _nextId++
}

function makeContentHash(text) {
  if (!text) return ''
  return text.replace(/\s+/g, ' ').trim().toLowerCase().substring(0, 200)
}

/**
 * Compact a tool_calls array to reduce storage size.
 * Keeps essential display fields, trims large result payloads.
 */
function _compactToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) return toolCalls
  return toolCalls.map(tc => {
    const compacted = {
      tool_use_id: tc.tool_use_id,
      tool: tc.tool,
      status: tc.status,
    }
    // Keep input but cap its serialized size
    if (tc.input) {
      const inputStr = JSON.stringify(tc.input)
      compacted.input = inputStr.length > 2000
        ? JSON.parse(inputStr.substring(0, 2000) + '"}') // best-effort truncate
        : tc.input
    }
    // Keep result but cap its serialized size
    if (tc.result) {
      const resultStr = JSON.stringify(tc.result)
      if (resultStr.length > 3000) {
        // Keep only the most useful keys from result
        const trimmed = {}
        for (const key of ['project_name', 'name', 'status', 'success', 'error',
                           'files_created', 'language', 'exit_code']) {
          if (tc.result[key] !== undefined) trimmed[key] = tc.result[key]
        }
        // Truncate stdout/content if present
        if (tc.result.stdout) trimmed.stdout = tc.result.stdout.substring(0, 500)
        if (tc.result.content) trimmed.content = tc.result.content.substring(0, 500)
        compacted.result = trimmed
      } else {
        compacted.result = tc.result
      }
    }
    return compacted
  })
}

// ─────────────────────────────────────────────────────────────────────────────
//  WRITE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist tool_calls for a single assistant message.
 *
 * @param {string} sessionId
 * @param {object} params
 * @param {string} params.msgId          — Real backend message_id (from onDone)
 * @param {string} params.tempId         — Temp assistant ID used during streaming
 * @param {string} params.contentText    — Full response text (for content hash)
 * @param {number} params.positionIndex  — 0-based index among assistant messages
 * @param {Array}  params.toolCalls      — Accumulated tool_calls array
 * @param {string} params.generationTime — e.g. "3.2" (seconds)
 */
export async function saveToolCalls(sessionId, {
  msgId, tempId, contentText, positionIndex, toolCalls, generationTime,
}) {
  if (!sessionId || !toolCalls || toolCalls.length === 0) return

  try {
    const records = _readAll()
    const newRecord = {
      id:             _getNextId(records),
      sessionId:      String(sessionId),
      msgId:          msgId  ? String(msgId)  : '',
      tempId:         tempId ? String(tempId) : '',
      contentHash:    makeContentHash(contentText),
      positionIndex:  typeof positionIndex === 'number' ? positionIndex : -1,
      toolCalls:      _compactToolCalls(JSON.parse(JSON.stringify(toolCalls))),
      generationTime: generationTime || '',
      storedAt:       Date.now(),
    }
    records.push(newRecord)
    _writeAll(records)
  } catch (err) {
    console.warn('[toolCallsDB] saveToolCalls failed:', err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  READ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load all tool_calls records for a session, sorted by positionIndex.
 */
export async function loadSessionToolCalls(sessionId) {
  if (!sessionId) return []

  try {
    const records = _readAll()
      .filter(r => r.sessionId === String(sessionId))

    records.sort((a, b) =>
      a.positionIndex !== b.positionIndex
        ? a.positionIndex - b.positionIndex
        : a.storedAt - b.storedAt
    )
    return records
  } catch (err) {
    console.warn('[toolCallsDB] loadSessionToolCalls failed:', err)
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ENRICH — match API messages with stored tool_calls
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enrich API messages with persisted tool_calls from localStorage.
 *
 * Matching passes (in order of reliability):
 *   1. Exact real message_id
 *   2. Exact temp ID
 *   3. Content-hash (exact, then partial prefix)
 *   4. Position-index (nth assistant message ↔ nth record)
 *
 * @param {string} sessionId
 * @param {Array}  messages — Flat array of message objects from the API
 * @returns {Promise<Array>} Same array with tool_calls/generation_time injected
 */
export async function enrichMessagesFromDB(sessionId, messages) {
  if (!sessionId || !messages || messages.length === 0) return messages

  const records = await loadSessionToolCalls(sessionId)
  if (records.length === 0) return messages

  // Build lookup maps
  const byMsgId  = new Map()
  const byTempId = new Map()
  const byHash   = new Map()

  for (const rec of records) {
    if (rec.msgId)       byMsgId.set(rec.msgId, rec)
    if (rec.tempId)      byTempId.set(rec.tempId, rec)
    if (rec.contentHash) byHash.set(rec.contentHash, rec)
  }

  const usedIds = new Set()

  const applyRecord = (msg, rec) => {
    const enriched = { ...msg }
    if ((!msg.tool_calls || msg.tool_calls.length === 0) &&
        rec.toolCalls && rec.toolCalls.length > 0) {
      enriched.tool_calls = rec.toolCalls
    }
    if (!msg.generation_time && rec.generationTime) {
      enriched.generation_time = rec.generationTime
    }
    return enriched
  }

  // ── Passes 1-3: ID and content-hash matching ──
  const enriched = messages.map(msg => {
    if (msg.role !== 'assistant') return msg

    const msgId   = String(msg.message_id ?? '')
    const msgHash = makeContentHash(msg.content || '')

    // Pass 1: real message_id
    const r1 = byMsgId.get(msgId)
    if (r1 && !usedIds.has(r1.id)) { usedIds.add(r1.id); return applyRecord(msg, r1) }

    // Pass 2: temp ID
    const r2 = byTempId.get(msgId)
    if (r2 && !usedIds.has(r2.id)) { usedIds.add(r2.id); return applyRecord(msg, r2) }

    // Pass 3: content-hash (exact)
    if (msgHash.length > 15) {
      const r3 = byHash.get(msgHash)
      if (r3 && !usedIds.has(r3.id)) { usedIds.add(r3.id); return applyRecord(msg, r3) }

      // Pass 3b: partial prefix match
      for (const [hash, rec] of byHash) {
        if (usedIds.has(rec.id)) continue
        if (hash.length > 15) {
          const minLen = Math.min(hash.length, msgHash.length, 80)
          if (hash.substring(0, minLen) === msgHash.substring(0, minLen)) {
            usedIds.add(rec.id)
            return applyRecord(msg, rec)
          }
        }
      }
    }

    return msg
  })

  // ── Pass 4: position-index matching ──
  const unusedRecords = records
    .filter(r => !usedIds.has(r.id) && r.toolCalls?.length > 0)
    .sort((a, b) => a.positionIndex - b.positionIndex)

  if (unusedRecords.length === 0) return enriched

  let assistantIdx = 0
  return enriched.map(msg => {
    if (msg.role !== 'assistant') return msg
    const currentIdx = assistantIdx++
    if (msg.tool_calls?.length > 0) return msg

    const matched = unusedRecords.find(r => !usedIds.has(r.id) && r.positionIndex === currentIdx)
    if (matched) { usedIds.add(matched.id); return applyRecord(msg, matched) }
    return msg
  })
}

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE — clean up when a session is deleted
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delete all stored tool_call records for a session.
 */
export async function deleteSessionToolCalls(sessionId) {
  if (!sessionId) return

  try {
    const records = _readAll()
    const filtered = records.filter(r => r.sessionId !== String(sessionId))
    _writeAll(filtered)
  } catch (err) {
    console.warn('[toolCallsDB] deleteSessionToolCalls failed:', err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  EVICTION — keep storage from growing unbounded
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evict records that exceed MAX_RECORDS or are older than MAX_AGE_MS.
 * Called after each write in onDone.
 */
export async function evictOldRecords() {
  try {
    let records = _readAll()
    const now = Date.now()

    // Prune expired records (older than MAX_AGE_MS)
    const beforeCount = records.length
    records = records.filter(r => (now - r.storedAt) <= MAX_AGE_MS)

    // If still over cap, sort oldest-first and keep only MAX_RECORDS
    if (records.length > MAX_RECORDS) {
      records.sort((a, b) => a.storedAt - b.storedAt)
      records = records.slice(records.length - MAX_RECORDS)
    }

    // Only write back if we actually removed something
    if (records.length < beforeCount) {
      _writeAll(records)
    }
  } catch (_) { /* ignore */ }
}
