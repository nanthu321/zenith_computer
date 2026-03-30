import { useContext } from 'react'
import { ThemeContext } from '../context/ThemeContext.jsx'

/**
 * Access the theme context.
 *
 * Returns:
 *   theme        — resolved CSS theme applied to DOM ('dark' | 'light')
 *   preference   — what the user chose ('dark' | 'light' | 'system')
 *   isDark       — true when resolved theme is dark
 *   isLight      — true when resolved theme is light
 *   toggleTheme  — cycle: dark ↔ light
 *   setTheme     — set a specific preference ('dark' | 'light' | 'system')
 *   serverLoaded — true once theme has been fetched from server
 *   THEMES       — enum { DARK, LIGHT, SYSTEM }
 */
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
