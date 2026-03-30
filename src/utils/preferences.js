// ─────────────────────────────────────────────────────────────
//  Preferences API — Server-backed user preferences
//
//  Replaces localStorage for user preferences. Uses:
//    GET  /api/auth/preferences  — fetch merged preferences
//    PUT  /api/auth/preferences  — deep-merge update preferences
//
//  Maintains an in-memory cache so reads are synchronous and fast.
//  Writes are fire-and-forget (async PUT to server, update cache immediately).
// ─────────────────────────────────────────────────────────────

import { apiFetch } from './api.js'

// ── In-memory cache (survives for the tab lifetime) ──
let _cache = {}
let _loaded = false
let _loadPromise = null

/**
 * Load preferences from the server.
 * Returns the full preferences object.
 * Deduplicates concurrent calls.
 */
export async function loadPreferences() {
  if (_loadPromise) return _loadPromise

  _loadPromise = (async () => {
    try {
      const data = await apiFetch('/api/auth/preferences')
      _cache = data || {}
      _loaded = true
      console.log('[preferences] Loaded from server:', Object.keys(_cache))
      return _cache
    } catch (err) {
      console.warn('[preferences] Failed to load:', err.message)
      _loaded = true
      return _cache
    } finally {
      _loadPromise = null
    }
  })()

  return _loadPromise
}

/**
 * Get a preference value synchronously from cache.
 * Returns defaultValue if not found or not loaded yet.
 */
export function getPreference(key, defaultValue = null) {
  if (!_loaded) return defaultValue
  const val = _cache[key]
  return val !== undefined ? val : defaultValue
}

/**
 * Set a preference value.
 * Updates the in-memory cache immediately (synchronous) and
 * persists to the server asynchronously (fire-and-forget).
 * Includes a single retry on transient server errors.
 */
export function setPreference(key, value) {
  _cache[key] = value
  _loaded = true

  // Fire-and-forget PUT to server
  const payload = { [key]: value }
  console.log(`[preferences] 🔼 Saving preference to backend — key: "${key}", value:`, value)

  apiFetch('/api/auth/preferences', {
    method: 'PUT',
    body: JSON.stringify(payload),
  }).then(() => {
    console.log(`[preferences] ✅ Preference saved successfully — key: "${key}"`)
  }).catch(err => {
    const msg = err.message || ''
    const isTransient = /^(502|503|5\d\d\s*-|Cannot reach|network)/i.test(msg)
    if (isTransient) {
      // Retry once after a short delay for transient failures (cold-start, etc.)
      console.warn(`[preferences] ⚠️ Transient error saving "${key}", retrying in 2s:`, msg)
      setTimeout(() => {
        apiFetch('/api/auth/preferences', {
          method: 'PUT',
          body: JSON.stringify(payload),
        }).then(() => {
          console.log(`[preferences] ✅ Retry succeeded for "${key}"`)
        }).catch(retryErr => {
          console.error(`[preferences] ❌ Retry also failed for "${key}":`, retryErr.message)
        })
      }, 2000)
    } else {
      console.error(`[preferences] ❌ Failed to save preference — key: "${key}":`, msg)
    }
  })
}

/**
 * Set a preference value and wait for server confirmation.
 * Unlike setPreference (fire-and-forget), this returns a Promise
 * that resolves on success and rejects on failure.
 * Use this when you need to confirm the preference was persisted
 * (e.g., after a "Save" button click).
 *
 * Includes a single retry on transient failures (502/503/network)
 * since the backend (Render free tier) may be cold-starting.
 */
export async function savePreferenceAsync(key, value) {
  _cache[key] = value
  _loaded = true

  const payload = { [key]: value }

  console.log(`[preferences] 🔼 savePreferenceAsync — key: "${key}"`)
  console.log(`[preferences] 📦 Request payload:`, JSON.stringify(payload, null, 2))
  console.log(`[preferences] 📦 Payload size: ${JSON.stringify(payload).length} bytes`)

  try {
    await apiFetch('/api/auth/preferences', {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
    console.log(`[preferences] ✅ Backend confirmed save — key: "${key}" → PUT /api/auth/preferences SUCCESS`)
  } catch (firstErr) {
    // Retry once on transient/server errors (502, 503, network)
    const msg = firstErr.message || ''
    const isTransient = /^(502|503|5\d\d\s*-|Cannot reach|network)/i.test(msg)
    if (isTransient) {
      console.warn('[preferences] Transient error on save, retrying in 2s:', msg)
      await new Promise(r => setTimeout(r, 2000))
      await apiFetch('/api/auth/preferences', {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
    } else {
      throw firstErr
    }
  }
}


/**
 * Remove a preference value.
 * Sets it to null in cache and on the server.
 */
export function removePreference(key) {
  delete _cache[key]

  apiFetch('/api/auth/preferences', {
    method: 'PUT',
    body: JSON.stringify({ [key]: null }),
  }).catch(err => {
    console.warn('[preferences] Failed to remove', key, ':', err.message)
  })
}

/**
 * Set multiple preferences at once.
 * More efficient than calling setPreference multiple times.
 */
export function setPreferences(obj) {
  Object.assign(_cache, obj)
  _loaded = true

  apiFetch('/api/auth/preferences', {
    method: 'PUT',
    body: JSON.stringify(obj),
  }).catch(err => {
    console.warn('[preferences] Failed to batch save:', err.message)
  })
}

/**
 * Remove multiple preferences at once.
 */
export function removePreferences(keys) {
  const nulled = {}
  for (const key of keys) {
    delete _cache[key]
    nulled[key] = null
  }

  apiFetch('/api/auth/preferences', {
    method: 'PUT',
    body: JSON.stringify(nulled),
  }).catch(err => {
    console.warn('[preferences] Failed to batch remove:', err.message)
  })
}

/**
 * Clear the in-memory cache (e.g., on logout).
 */
export function clearPreferencesCache() {
  _cache = {}
  _loaded = false
  _loadPromise = null
}

/**
 * Check if preferences have been loaded from the server.
 */
export function isPreferencesLoaded() {
  return _loaded
}
