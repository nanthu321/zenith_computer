/**
 * Zenith — Theme Context
 * Manages dark / light / system theme with dedicated server-backed
 * `/api/auth/theme` endpoint and smooth CSS variable transitions.
 *
 * Persistence strategy:
 *   Server-only — theme preference is stored in the backend database
 *   via GET/PUT /api/auth/theme. No localStorage is used.
 *
 * On page load the theme defaults to "dark" until the server responds
 * with the user's saved preference (avoids flash for most users).
 *
 * "system" means follow the OS preference; the resolved (applied)
 * theme is always either "dark" or "light" in the DOM.
 */
import React, { createContext, useState, useEffect, useCallback, useRef, useContext } from 'react'
import { apiFetch } from '../utils/api.js'
import { AuthContext } from './AuthContext.jsx'

export const ThemeContext = createContext(null)

const THEMES = { DARK: 'dark', LIGHT: 'light', SYSTEM: 'system' }
const ALLOWED = new Set([THEMES.DARK, THEMES.LIGHT, THEMES.SYSTEM])

/** Default preference used before the server responds */
const DEFAULT_PREFERENCE = THEMES.DARK

/* ── helpers ───────────────────────────────────────────── */

/** Resolve the OS preferred color scheme → 'dark' | 'light' */
function getOSTheme() {
  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return THEMES.LIGHT
  return THEMES.DARK
}

/** Given a preference (dark | light | system), return the concrete CSS theme */
function resolveTheme(pref) {
  if (pref === THEMES.SYSTEM) return getOSTheme()
  if (pref === THEMES.DARK || pref === THEMES.LIGHT) return pref
  return THEMES.DARK
}

/** Apply the resolved theme to the DOM */
function applyTheme(resolved) {
  document.documentElement.setAttribute('data-theme', resolved)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.content = resolved === THEMES.DARK ? '#0a0a0f' : '#f8f8fc'
  }
}

/* ── server API helpers ────────────────────────────────── */

/**
 * GET /api/auth/theme
 * Returns the authenticated user's theme preference string, or null on failure.
 *
 * Success (200): { success: true, data: { theme: "dark" } }
 * Error  (404):  User not found
 * Error  (500):  Internal server error
 */
async function fetchServerTheme() {
  try {
    const data = await apiFetch('/api/auth/theme')
    const t = data?.theme
    if (ALLOWED.has(t)) return t
  } catch (err) {
    console.warn('[ThemeContext] Failed to fetch theme from server:', err.message)
  }
  return null
}

/**
 * PUT /api/auth/theme
 * Persists the user's theme preference to the database.
 *
 * Request:  { theme: "dark" | "light" | "system" }
 * Success (200): { success: true, data: { message: "Theme updated", theme: "dark" } }
 * Error  (400):  Missing/invalid theme field
 * Error  (404):  User not found
 * Error  (500):  Failed to update theme
 *
 * Returns a promise that resolves to the saved theme or null on failure.
 */
async function saveServerTheme(pref) {
  console.log(`[ThemeContext] 📡 PUT /api/auth/theme — { theme: "${pref}" }`)
  try {
    const data = await apiFetch('/api/auth/theme', {
      method: 'PUT',
      body: JSON.stringify({ theme: pref }),
    })
    console.log(`[ThemeContext] ✅ Theme persisted to server: "${pref}"`)
    return data?.theme || pref
  } catch (err) {
    console.error(`[ThemeContext] ❌ Failed to persist theme: ${err.message}`)
    return null
  }
}

/* ── provider ──────────────────────────────────────────── */

export function ThemeProvider({ children }) {
  // Access auth state — only fetch/save server theme when user is logged in
  const auth = useContext(AuthContext)

  // preference = what the user chose (dark | light | system)
  // Defaults to DARK until server responds
  const [preference, setPreferenceState] = useState(() => {
    applyTheme(resolveTheme(DEFAULT_PREFERENCE))
    return DEFAULT_PREFERENCE
  })

  // resolved = what is actually applied to the DOM (dark | light)
  const [resolved, setResolved] = useState(() => resolveTheme(DEFAULT_PREFERENCE))

  // Track whether we've fetched the theme from the server
  const reconciledRef = useRef(false)

  // Track if initial server fetch is in progress (prevents flash)
  const [serverLoaded, setServerLoaded] = useState(false)

  const isDark  = resolved === THEMES.DARK
  const isLight = resolved === THEMES.LIGHT

  /** Change the user's theme preference */
  const setTheme = useCallback((newPref) => {
    if (!ALLOWED.has(newPref)) return
    console.log(`[ThemeContext] 🎨 Theme preference change: "${preference}" → "${newPref}"`)

    setPreferenceState(newPref)
    const newResolved = resolveTheme(newPref)
    setResolved(newResolved)
    applyTheme(newResolved)

    // Persist to server only when user is authenticated
    if (auth?.token) {
      saveServerTheme(newPref)
    }
  }, [preference, auth?.token])

  /** Quick toggle: dark ↔ light */
  const toggleTheme = useCallback(() => {
    const next = isDark ? THEMES.LIGHT : THEMES.DARK
    setTheme(next)
  }, [isDark, setTheme])

  // On mount (or when user logs in): fetch theme from server
  // Only fetch when user is authenticated to avoid 401 errors
  useEffect(() => {
    if (!auth?.token) {
      // Not logged in — reset reconciled flag so we fetch when user logs in
      reconciledRef.current = false
      setServerLoaded(false)
      return
    }
    if (reconciledRef.current) return
    reconciledRef.current = true

    fetchServerTheme().then((serverPref) => {
      if (serverPref) {
        console.log(`[ThemeContext] 🌐 Server theme: "${serverPref}"`)
        setPreferenceState(serverPref)
        const r = resolveTheme(serverPref)
        setResolved(r)
        applyTheme(r)
      }
      setServerLoaded(true)
    })
  }, [auth?.token])

  // Listen for OS-level theme changes (relevant when preference === 'system')
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return

    const handler = (e) => {
      // Only auto-switch when preference is "system"
      if (preference === THEMES.SYSTEM) {
        const osTheme = e.matches ? THEMES.DARK : THEMES.LIGHT
        setResolved(osTheme)
        applyTheme(osTheme)
      }
    }

    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [preference])

  return (
    <ThemeContext.Provider value={{
      theme: resolved,        // the concrete theme applied to DOM ('dark' | 'light')
      preference,             // the user's choice ('dark' | 'light' | 'system')
      isDark,
      isLight,
      toggleTheme,
      setTheme,
      serverLoaded,           // true once server theme has been fetched
      THEMES,
    }}>
      {children}
    </ThemeContext.Provider>
  )
}
