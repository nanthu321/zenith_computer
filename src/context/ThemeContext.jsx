/**
 * Zenith — Theme Context
 * Manages dark / light / system theme with dedicated server-backed
 * `/api/auth/theme` endpoint and smooth CSS variable transitions.
 *
 * Persistence strategy:
 *   1. localStorage ('zenith_theme') — synchronous, survives refresh,
 *      works even when the user is not logged in.
 *   2. Dedicated theme API (GET/PUT /api/auth/theme) — async,
 *      syncs across devices.
 *
 * On page load the theme is read from localStorage first (instant,
 * no flash), then reconciled with the server once the API responds.
 *
 * "system" means follow the OS preference; the resolved (applied)
 * theme is always either "dark" or "light" in the DOM.
 */
import React, { createContext, useState, useEffect, useCallback, useRef, useContext } from 'react'
import { apiFetch } from '../utils/api.js'
import { AuthContext } from './AuthContext.jsx'

export const ThemeContext = createContext(null)

const LOCAL_STORAGE_KEY = 'zenith_theme'
const THEMES = { DARK: 'dark', LIGHT: 'light', SYSTEM: 'system' }
const ALLOWED = new Set([THEMES.DARK, THEMES.LIGHT, THEMES.SYSTEM])

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

/** Read theme preference from localStorage (synchronous) */
function readLocalTheme() {
  try {
    const val = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (ALLOWED.has(val)) return val
  } catch (_) { /* localStorage may be unavailable */ }
  return null
}

/** Write theme preference to localStorage */
function writeLocalTheme(pref) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, pref)
  } catch (_) { /* ignore */ }
}

/** Determine initial preference on first render */
function getInitialPreference() {
  const local = readLocalTheme()
  if (local) return local
  // No saved preference — default to system
  return THEMES.SYSTEM
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

/** GET /api/auth/theme → returns preference string or null */
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

/** PUT /api/auth/theme — fire-and-forget */
function saveServerTheme(pref) {
  console.log(`[ThemeContext] 📡 PUT /api/auth/theme — { theme: "${pref}" }`)
  apiFetch('/api/auth/theme', {
    method: 'PUT',
    body: JSON.stringify({ theme: pref }),
  }).then(() => {
    console.log(`[ThemeContext] ✅ Theme persisted to server: "${pref}"`)
  }).catch((err) => {
    console.error(`[ThemeContext] ❌ Failed to persist theme: ${err.message}`)
  })
}

/* ── provider ──────────────────────────────────────────── */

export function ThemeProvider({ children }) {
  // Access auth state — only fetch server theme when user is logged in
  const auth = useContext(AuthContext)

  // preference = what the user chose (dark | light | system)
  const [preference, setPreferenceState] = useState(() => {
    const pref = getInitialPreference()
    applyTheme(resolveTheme(pref))
    return pref
  })

  // resolved = what is actually applied to the DOM (dark | light)
  const [resolved, setResolved] = useState(() => resolveTheme(preference))

  // Track whether we've reconciled with the server
  const reconciledRef = useRef(false)

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

    // Persist locally (always — works even when not logged in)
    writeLocalTheme(newPref)
    console.log(`[ThemeContext] 💾 Saved to localStorage: "${newPref}"`)

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

  // On mount (or when user logs in): reconcile with server
  // Only fetch from server when user is authenticated to avoid 401 errors
  useEffect(() => {
    if (!auth?.token) {
      // Not logged in — reset reconciled flag so we fetch when user logs in
      reconciledRef.current = false
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
        writeLocalTheme(serverPref)
      }
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
      THEMES,
    }}>
      {children}
    </ThemeContext.Provider>
  )
}
