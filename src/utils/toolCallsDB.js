/**
 * toolCallsDB — Persistent IndexedDB storage for tool_calls per message
 *
 * WHY INDEXEDDB AND NOT JUST LOCALSTORAGE?
 * ─────────────────────────────────────────
 * localStorage has a ~5MB limit and can be cleared by the browser in
 * low-storage conditions. IndexedDB is much larger (hundreds of MB),
 * persists across tab closes, page refreshes, and browser restarts,
 * and is the right tool for structured data that must survive sessions.
 *
 * MATCHING STRATEGY (avoids ID-mismatch problem):
 * ────────────────────────────────────────────────
 * We store tool_calls indexed by MULTIPLE keys so at least one always
 * hits on refresh:
 *
 *   1. sessionId + realMessageId  (if backend returns message_id in done event)
 *   2. sessionId + tempAssistantId (always available — our temp_ ID)
 *   3. sessionId + contentHash    (first 200 chars of response text, normalized)
 *   4. sessionId + positionIndex  (nth assistant message in the session — most stable)
 *
 * On restore we try keys 1→2→3→4 in order, taking the first hit.
 *
 * DB SCHEMA:
 *   Database:  ZenithToolCallsDB  (version 1)
 *   Store:     tool_calls
 *   IndexKeys: [sessionId_msgId, sessionId_tempId, sessionId_contentHash, sessionId_posIdx]
 *   Each record: { id (auto), sessionId, msgId, tempId, contentHash, positionIndex,
 *                  toolCalls: [...], generationTime, storedAt }
 */

const DB_NAME    = 'ZenithToolCallsDB'
const DB_VERSION = 1
const STORE_NAME = 'tool_calls'

let _db = null  // singleton DB connection

/** Open (or reuse) the IndexedDB connection */
function openDB() {
  if (_db) return Promise.resolve(_db)

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = (e) => {
      const db = e.target.result

      // Drop old store if schema changed
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME)
      }

      const store = db.createObjectStore(STORE_NAME, {
        keyPath: 'id',
        autoIncrement: true,
      })

      // Individual lookup indexes
      store.createIndex('by_session_msgId',    ['sessionId', 'msgId'],       { unique: false })
      store.createIndex('by_session_tempId',   ['sessionId', 'tempId'],      { unique: false })
      store.createIndex('by_session_hash',     ['sessionId', 'contentHash'], { unique: false })
      store.createIndex('by_session_posIdx',   ['sessionId', 'positionIndex'], { unique: false })
      // For listing all records of a session (cleanup)
      store.createIndex('by_sessionId',        'sessionId',                  { unique: false })
    }

    req.onsuccess = (e) => {
      _db = e.target.result
      resolve(_db)
    }

    req.onerror = (e) => {
      console.warn('[toolCallsDB] Failed to open IndexedDB:', e.target.error)
      reject(e.target.error)
    }
  })
}

/** Promisify an IDBRequest */
function idbReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

/**
 * Normalize text for content-hash matching.
 * Strips punctuation differences, collapses whitespace, lowercases.
 * Returns first 200 chars — enough to uniquely identify a message.
 */
function makeContentHash(text) {
  if (!text) return ''
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .substring(0, 200)
}

// ─────────────────────────────────────────────────────────────────────────────
//  WRITE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save tool_calls for a message.
 *
 * @param {string} sessionId      - The chat session ID
 * @param {object} params
 * @param {string} params.msgId          - Real backend message_id (from onDone data)
 * @param {string} params.tempId         - Temp assistant ID used during streaming
 * @param {string} params.contentText    - The full response text (for content hash)
 * @param {number} params.positionIndex  - 0-based index among assistant messages in session
 * @param {Array}  params.toolCalls      - The accumulated tool_calls array
 * @param {string} params.generationTime - e.g. "3.2"
 */
export async function saveToolCalls(sessionId, {
  msgId,
  tempId,
  contentText,
  positionIndex,
  toolCalls,
  generationTime,
}) {
  if (!sessionId || !toolCalls || toolCalls.length === 0) return

  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    const contentHash = makeContentHash(contentText)

    const record = {
      sessionId:     String(sessionId),
      msgId:         msgId    ? String(msgId)   : '',
      tempId:        tempId   ? String(tempId)  : '',
      contentHash,
      positionIndex: typeof positionIndex === 'number' ? positionIndex : -1,
      toolCalls:     JSON.parse(JSON.stringify(toolCalls)), // deep clone
      generationTime: generationTime || '',
      storedAt:      Date.now(),
    }

    await idbReq(store.add(record))
    console.log('[toolCallsDB] Saved tool_calls for session', sessionId,
      '| msgId:', msgId, '| tempId:', tempId,
      '| posIdx:', positionIndex,
      '| tools:', toolCalls.map(tc => tc.tool).join(', '))

  } catch (err) {
    console.warn('[toolCallsDB] saveToolCalls failed:', err)
    // Fallback: persist to localStorage as safety net
    _lsFallbackWrite(sessionId, { msgId, tempId, contentText, positionIndex, toolCalls, generationTime })
  }
}

/** localStorage fallback when IndexedDB is unavailable */
function _lsFallbackWrite(sessionId, data) {
  try {
    const key = `zenith_tc_${sessionId}`
    const existing = JSON.parse(localStorage.getItem(key) || '[]')
    existing.push({
      msgId: data.msgId || '',
      tempId: data.tempId || '',
      contentHash: makeContentHash(data.contentText),
      positionIndex: data.positionIndex ?? -1,
      toolCalls: data.toolCalls,
      generationTime: data.generationTime || '',
      storedAt: Date.now(),
    })
    localStorage.setItem(key, JSON.stringify(existing))
  } catch (_) { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
//  READ — load all tool_calls records for a session
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load all tool_calls records for a session from IndexedDB.
 * Returns an array of records sorted by positionIndex (ascending).
 */
export async function loadSessionToolCalls(sessionId) {
  if (!sessionId) return []

  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const idx = store.index('by_sessionId')

    const records = await idbReq(idx.getAll(String(sessionId)))

    // Sort by positionIndex (ascending), then by storedAt for ties
    records.sort((a, b) => {
      if (a.positionIndex !== b.positionIndex) return a.positionIndex - b.positionIndex
      return a.storedAt - b.storedAt
    })

    console.log('[toolCallsDB] Loaded', records.length, 'tool_call records for session', sessionId)
    return records

  } catch (err) {
    console.warn('[toolCallsDB] loadSessionToolCalls failed, trying localStorage fallback:', err)
    return _lsFallbackRead(sessionId)
  }
}

/** localStorage fallback for read */
function _lsFallbackRead(sessionId) {
  try {
    const key = `zenith_tc_${sessionId}`
    const data = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ENRICH — main export: match API messages with stored tool_calls
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enrich an array of API messages with persisted tool_calls from IndexedDB.
 *
 * Matching passes (in order of reliability):
 *   1. Exact real message_id match     (sessionId + msgId)
 *   2. Exact temp ID match             (sessionId + tempId)
 *   3. Content-hash match              (sessionId + first 200 chars normalized)
 *   4. Position-index match            (nth assistant message ↔ nth record)
 *
 * @param {string} sessionId
 * @param {Array}  messages  - Flat array of message objects from the API
 * @returns {Array} Same array with tool_calls injected where matched
 */
export async function enrichMessagesFromDB(sessionId, messages) {
  if (!sessionId || !messages || messages.length === 0) return messages

  const records = await loadSessionToolCalls(sessionId)
  if (records.length === 0) {
    console.log('[toolCallsDB] No stored records for session', sessionId, '— nothing to enrich')
    return messages
  }

  console.log('[toolCallsDB] Enriching', messages.length, 'API messages with',
    records.length, 'stored records for session', sessionId)

  // Build fast lookup maps
  const byMsgId    = new Map()  // realMsgId  → record
  const byTempId   = new Map()  // tempId     → record
  const byHash     = new Map()  // contentHash → record

  for (const rec of records) {
    if (rec.msgId)    byMsgId.set(rec.msgId,  rec)
    if (rec.tempId)   byTempId.set(rec.tempId, rec)
    if (rec.contentHash) byHash.set(rec.contentHash, rec)
  }

  const usedRecordIds = new Set()  // avoid double-matching

  // Helper: apply a matched record to an API message
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

  // ── Pass 1 + 2 + 3: ID and content-hash matching ──
  const enriched = messages.map(msg => {
    if (msg.role !== 'assistant') return msg

    const msgId = String(msg.message_id ?? '')
    const msgHash = makeContentHash(msg.content || '')

    // Pass 1: Exact real backend message_id
    const r1 = byMsgId.get(msgId)
    if (r1 && !usedRecordIds.has(r1.id)) {
      usedRecordIds.add(r1.id)
      console.log('[toolCallsDB] Pass 1 (msgId) match for', msgId,
        '| tools:', r1.toolCalls.map(tc => tc.tool).join(', '))
      return applyRecord(msg, r1)
    }

    // Pass 2: Temp ID match (backend msg_id == temp_assistant_xxx)
    const r2 = byTempId.get(msgId)
    if (r2 && !usedRecordIds.has(r2.id)) {
      usedRecordIds.add(r2.id)
      console.log('[toolCallsDB] Pass 2 (tempId) match for', msgId,
        '| tools:', r2.toolCalls.map(tc => tc.tool).join(', '))
      return applyRecord(msg, r2)
    }

    // Pass 3: Content-hash match
    if (msgHash.length > 15) {
      const r3 = byHash.get(msgHash)
      if (r3 && !usedRecordIds.has(r3.id)) {
        usedRecordIds.add(r3.id)
        console.log('[toolCallsDB] Pass 3 (contentHash) match for', msgId,
          '| tools:', r3.toolCalls.map(tc => tc.tool).join(', '))
        return applyRecord(msg, r3)
      }

      // Pass 3b: Partial content-hash match (startsWith — handles truncation)
      for (const [hash, rec] of byHash) {
        if (usedRecordIds.has(rec.id)) continue
        if (hash.length > 15 && msgHash.length > 15) {
          const minLen = Math.min(hash.length, msgHash.length, 80)
          if (hash.substring(0, minLen) === msgHash.substring(0, minLen)) {
            usedRecordIds.add(rec.id)
            console.log('[toolCallsDB] Pass 3b (partial hash) match for', msgId,
              '| tools:', rec.toolCalls.map(tc => tc.tool).join(', '))
            return applyRecord(msg, rec)
          }
        }
      }
    }

    return msg
  })

  // ── Pass 4: Position-index match ──
  // Count assistant message positions in the API response
  // and match against stored records by positionIndex
  const unusedRecords = records
    .filter(r => !usedRecordIds.has(r.id) && r.toolCalls && r.toolCalls.length > 0)
    .sort((a, b) => a.positionIndex - b.positionIndex)

  if (unusedRecords.length === 0) {
    console.log('[toolCallsDB] All records matched via ID/hash. Enrichment complete.')
    return enriched
  }

  let assistantIdx = 0
  const finalResult = enriched.map(msg => {
    if (msg.role !== 'assistant') return msg

    const currentIdx = assistantIdx++

    // Only apply if this message doesn't already have tool_calls
    if (msg.tool_calls && msg.tool_calls.length > 0) return msg

    // Find a record with matching positionIndex
    const matchedRec = unusedRecords.find(r =>
      !usedRecordIds.has(r.id) && r.positionIndex === currentIdx
    )

    if (matchedRec) {
      usedRecordIds.add(matchedRec.id)
      console.log('[toolCallsDB] Pass 4 (positionIndex', currentIdx, ') match for msg',
        msg.message_id, '| tools:', matchedRec.toolCalls.map(tc => tc.tool).join(', '))
      return applyRecord(msg, matchedRec)
    }

    return msg
  })

  // Log summary
  const enrichedCount = finalResult.filter((m, i) =>
    m.role === 'assistant' &&
    m.tool_calls && m.tool_calls.length > 0 &&
    !(messages[i]?.tool_calls?.length > 0)
  ).length
  console.log('[toolCallsDB] Enrichment complete:', enrichedCount, 'messages enriched with tool_calls')

  return finalResult
}

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE — clean up when a session is deleted
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delete all stored tool_call records for a session.
 * Call this when the user deletes a chat session.
 */
export async function deleteSessionToolCalls(sessionId) {
  if (!sessionId) return

  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const idx = store.index('by_sessionId')

    // Get all record IDs for this session
    const records = await idbReq(idx.getAll(String(sessionId)))
    for (const rec of records) {
      store.delete(rec.id)
    }

    console.log('[toolCallsDB] Deleted', records.length, 'records for session', sessionId)
  } catch (err) {
    console.warn('[toolCallsDB] deleteSessionToolCalls failed:', err)
  }

  // Also clean up localStorage fallback
  try {
    localStorage.removeItem(`zenith_tc_${sessionId}`)
  } catch (_) { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
//  EVICTION — keep DB from growing unbounded
// ─────────────────────────────────────────────────────────────────────────────

const MAX_RECORDS = 2000  // hard cap across all sessions

/**
 * Evict oldest records if total count exceeds MAX_RECORDS.
 * Called after each write.
 */
export async function evictOldRecords() {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    const allRecords = await idbReq(store.getAll())
    if (allRecords.length <= MAX_RECORDS) return

    // Sort by storedAt ascending (oldest first)
    allRecords.sort((a, b) => a.storedAt - b.storedAt)
    const toDelete = allRecords.slice(0, allRecords.length - MAX_RECORDS)

    const tx2 = db.transaction(STORE_NAME, 'readwrite')
    const store2 = tx2.objectStore(STORE_NAME)
    for (const rec of toDelete) {
      store2.delete(rec.id)
    }
    console.log('[toolCallsDB] Evicted', toDelete.length, 'old records')
  } catch (_) { /* ignore */ }
}
