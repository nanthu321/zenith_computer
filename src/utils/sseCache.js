/**
 * sseCache — DEPRECATED / REMOVED
 *
 * This module previously persisted tool_calls and generation_time to
 * localStorage as a secondary cache alongside the primary toolCallsDB store.
 *
 * REMOVED because:
 *   1. toolCallsDB.js already handles persistence via localStorage with
 *      multi-key matching (msgId, tempId, contentHash, positionIndex).
 *   2. Having TWO caching layers with different matching heuristics added
 *      complexity without meaningful reliability gains.
 *   3. The backend API should be the source of truth — once it returns
 *      tool_calls in GET /api/messages/:sessionId, even the localStorage
 *      cache can be removed.
 *
 * All exports are now no-ops to avoid breaking existing imports during
 * the transition. They can be fully removed once all call sites are cleaned.
 */

/** @deprecated No-op — SSE cache has been removed. */
export function getSSECache(_sessionId) { return {} }

/** @deprecated No-op — SSE cache has been removed. */
export function setSSECacheEntry(_sessionId, _messageId, _data) {}

/** @deprecated No-op — SSE cache has been removed. */
export function enrichMessagesWithSSECache(_sessionId, messages) { return messages }

/** @deprecated No-op — SSE cache has been removed. */
export function clearSSECache(_sessionId) {}
