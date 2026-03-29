/**
 * artifactsCache — Persists artifact data (HTML/SVG previews) to localStorage
 *
 * Problem:
 *   Artifacts (rendered HTML/SVG preview cards) are generated during SSE
 *   streaming via `onArtifact` events and kept only in the in-memory
 *   `artifactsCacheRef` inside useChat. On page refresh or when a new
 *   prompt is sent the cache is wiped and the preview disappears.
 *
 * Solution:
 *   After each artifact arrives (or streaming completes) we persist the
 *   session's full artifacts array to localStorage. On restore (setActiveSession
 *   or fetchMessages) we reload from localStorage if the in-memory cache is empty.
 *
 * Storage format (per session):
 *   Key:   zenith_artifacts_{sessionId}
 *   Value: JSON array of artifact objects  [ { id, type, title, content }, … ]
 *
 * Limits:
 *   - Artifact content can be large (entire HTML pages). We cap per-session
 *     storage at MAX_CONTENT_BYTES and evict oldest sessions beyond MAX_SESSIONS.
 */

const PREFIX = 'zenith_artifacts_'
const MAX_SESSIONS = 30          // keep artifacts for up to 30 sessions
const MAX_CONTENT_BYTES = 500_000 // 500 KB per session (safety cap for localStorage)

// ── Read artifacts for a session ──
export function getArtifactsCache(sessionId) {
  if (!sessionId) return []
  try {
    const raw = localStorage.getItem(PREFIX + sessionId)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// ── Write artifacts for a session ──
export function setArtifactsCache(sessionId, artifacts) {
  if (!sessionId || !Array.isArray(artifacts) || artifacts.length === 0) return
  try {
    // Strip internal _streamId marker before persisting
    const toStore = artifacts.map(({ _streamId, ...rest }) => rest)
    const serialized = JSON.stringify(toStore)
    // Skip if too large (prevent localStorage quota errors)
    if (serialized.length > MAX_CONTENT_BYTES) {
      console.warn('[artifactsCache] Skipping — artifacts too large for session', sessionId,
        `(${serialized.length} bytes > ${MAX_CONTENT_BYTES})`)
      return
    }
    localStorage.setItem(PREFIX + sessionId, serialized)
    evictOldSessions()
  } catch (e) {
    console.warn('[artifactsCache] Failed to write:', e.message)
  }
}

// ── Remove artifacts for a deleted session ──
export function clearArtifactsCache(sessionId) {
  if (!sessionId) return
  try {
    localStorage.removeItem(PREFIX + sessionId)
  } catch { /* ignore */ }
}

// ── Evict oldest sessions if we exceed MAX_SESSIONS ──
function evictOldSessions() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIX)) keys.push(k)
    }
    if (keys.length <= MAX_SESSIONS) return

    // Evict by removing random extra keys (no timestamp on session level)
    const toRemove = keys.slice(0, keys.length - MAX_SESSIONS)
    toRemove.forEach(k => localStorage.removeItem(k))
  } catch { /* ignore */ }
}
