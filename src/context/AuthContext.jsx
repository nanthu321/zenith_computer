import React, { createContext, useState, useEffect, useCallback } from 'react'
import { apiFetch, setAuthClearCallback } from '../utils/api.js'
import { getPreference, setPreference, loadPreferences, clearPreferencesCache } from '../utils/preferences.js'
import { getCookie, setCookie, clearAllZenithCookies } from '../utils/cookieUtils.js'

export const AuthContext = createContext(null)

/* ─── Preference keys for login/logout timestamps ─── */
const LOGIN_TIMESTAMP_KEY  = 'zenith_login_timestamp'
const LOGOUT_TIMESTAMP_KEY = 'zenith_logout_timestamp'

/* ─── Migration: move auth data from localStorage → cookies, then purge ───
 *  Previous implementations stored token, user, messages, sessions, and preferences
 *  in localStorage.  Auth credentials are now in cookies, everything else uses
 *  the server API.
 *
 *  IMPORTANT: We must copy zenith_token and zenith_user into cookies BEFORE
 *  deleting them from localStorage, otherwise the user gets logged out on
 *  the first load after the migration.
 */
function migrateLocalStorageToCookies() {
  try {
    // Step 1: If cookies don't have the token yet, check localStorage
    if (!getCookie('zenith_token')) {
      const lsToken = localStorage.getItem('zenith_token')
      if (lsToken) {
        console.log('[AuthContext] Migrating zenith_token from localStorage to cookie')
        setCookie('zenith_token', lsToken)
      }
    }

    if (!getCookie('zenith_user')) {
      const lsUser = localStorage.getItem('zenith_user')
      if (lsUser) {
        console.log('[AuthContext] Migrating zenith_user from localStorage to cookie')
        setCookie('zenith_user', lsUser)
      }
    }

    // Step 2: Now purge ALL zenith_ keys from localStorage
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('zenith_')) keysToRemove.push(key)
    }
    if (keysToRemove.length > 0) {
      console.log('[AuthContext] Purging', keysToRemove.length, 'stale localStorage keys:', keysToRemove)
      keysToRemove.forEach(key => localStorage.removeItem(key))
    }
  } catch (_) { /* ignore in case localStorage is blocked */ }
}

/** Returns the ISO timestamp of the most recent successful login (or null). */
export function getLoginTimestamp() {
  return getPreference(LOGIN_TIMESTAMP_KEY, null)
}

/** Returns the ISO timestamp of the most recent logout (or null). */
export function getLogoutTimestamp() {
  return getPreference(LOGOUT_TIMESTAMP_KEY, null)
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [token, setToken]     = useState(() => {
    // Run migration synchronously BEFORE the first getCookie read
    migrateLocalStorageToCookies()
    return getCookie('zenith_token')
  })
  const [loading, setLoading] = useState(true)

  // ── Register auth-clear callback so handleUnauthorized() in api.js
  //    can clear React state without causing a hard page refresh ──
  useEffect(() => {
    setAuthClearCallback(() => {
      setToken(null)
      setUser(null)
      clearPreferencesCache()
    })
    return () => setAuthClearCallback(null)
  }, [])

  // ── Validate token on mount ──
  useEffect(() => {
    const savedToken = getCookie('zenith_token')
    if (!savedToken) {
      setLoading(false)
      return
    }
    // Load preferences and validate token in parallel
    Promise.all([
      apiFetch('/api/auth/me'),
      loadPreferences(),
    ])
      .then(([userData]) => {
        setUser(userData)
        setToken(savedToken)
        // ── Persist user data to cookie so workspace API (and other
        //    modules that read zenith_user) always have the X-User-Id available,
        //    even after a page refresh where only the token survived. ──
        if (userData && (userData.user_id || userData.id)) {
          setCookie('zenith_user', JSON.stringify({
            user_id: userData.user_id || userData.id,
            username: userData.username,
            email: userData.email,
          }))
        }
      })
      .catch((err) => {
        // FIX: Only clear session on genuine auth failures (401 Unauthorized).
        // Previously, ANY error (network timeout, 500, CORS) cleared the token,
        // causing unexpected logouts when the backend was temporarily unavailable
        // while the user was actively chatting.
        //
        // The apiFetch wrapper throws 'Unauthorized' specifically for 401.
        // For all other errors (network errors, 5xx), we preserve the session
        // so the user stays logged in and can retry when the backend recovers.
        const isAuthError = err && (
          err.message === 'Unauthorized' ||
          err.message?.includes('401') ||
          err.status === 401
        )
        if (isAuthError) {
          clearAllZenithCookies()
          clearPreferencesCache()
          setUser(null)
          setToken(null)
        } else {
          // Non-auth error on /api/auth/me (network, 5xx, etc.):
          // Keep the token in state so the user remains "logged in".
          // The API will retry on the next request. This prevents accidental
          // logout when the backend is restarting or temporarily unreachable.
          console.warn('[AuthContext] /api/auth/me failed with non-auth error:', err?.message,
            '— preserving session to avoid unexpected logout')
          setToken(savedToken)
          // Set a minimal user object from the cookie if available,
          // so protected routes don't redirect to login
          try {
            const storedUser = getCookie('zenith_user')
            if (storedUser) {
              const parsed = JSON.parse(storedUser)
              setUser(parsed)
            }
          } catch (_) { /* ignore parse errors */ }
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email, password) => {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setCookie('zenith_token', data.token)
    setCookie('zenith_user', JSON.stringify({ user_id: data.user_id, username: data.username, email: data.email }))
    // ── Load preferences from server after login ──
    await loadPreferences()
    // ── Record login timestamp so session filters can use it ──
    setPreference(LOGIN_TIMESTAMP_KEY, new Date().toISOString())
    setToken(data.token)
    setUser({ user_id: data.user_id, username: data.username, email: data.email })
    return data
  }, [])

  const register = useCallback(async (username, email, password) => {
    const data = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    })
    setCookie('zenith_token', data.token)
    setCookie('zenith_user', JSON.stringify({ user_id: data.user_id, username: data.username, email: data.email }))
    // ── Load preferences from server after registration ──
    await loadPreferences()
    // ── Record login timestamp for new registrations too ──
    setPreference(LOGIN_TIMESTAMP_KEY, new Date().toISOString())
    setToken(data.token)
    setUser({ user_id: data.user_id, username: data.username, email: data.email })
    return data
  }, [])

  const logout = useCallback(() => {
    // ── Record logout timestamp before clearing credentials ──
    setPreference(LOGOUT_TIMESTAMP_KEY, new Date().toISOString())

    // ── Clear ALL zenith_ cookies ──
    clearAllZenithCookies()

    // ── Also purge any zenith_ keys from localStorage (belt-and-suspenders) ──
    try {
      const keysToRemove = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('zenith_')) keysToRemove.push(key)
      }
      keysToRemove.forEach(key => localStorage.removeItem(key))
    } catch (_) { /* ignore */ }

    clearPreferencesCache()
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
