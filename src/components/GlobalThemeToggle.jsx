/**
 * GlobalThemeToggle — Floating theme toggle visible on ALL pages.
 *
 * Renders a fixed-position Sun/Moon toggle button in the top-right corner.
 * Automatically hides itself on pages that already have a theme toggle
 * embedded in their layout (e.g., ChatPage sidebar, LandingPage navbar).
 *
 * This ensures theme switching is ALWAYS accessible — especially on pages
 * like /tasks and /workspace that previously lacked the toggle.
 *
 * Uses the shared ThemeContext for global state + localStorage persistence.
 */
import React from 'react'
import { useLocation } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme.js'
import { SunIcon, MoonIcon } from './icons/ThemeIcons.jsx'
import './GlobalThemeToggle.css'

/**
 * Pages that already have a well-integrated theme toggle in their layout.
 * On these pages, the global floating toggle hides to avoid visual clutter.
 *
 *  /       → LandingPage has ThemeToggle in its navbar
 *  /chat   → ChatPage Sidebar has ThemeToggle in footer
 *  /login  → LoginPage has ThemeToggle in auth card
 *  /register → RegisterPage has ThemeToggle in auth card
 */
const PAGES_WITH_EMBEDDED_TOGGLE = ['/', '/chat', '/login', '/register', '/workspace']

export default function GlobalThemeToggle() {
  const { isDark, setTheme, THEMES } = useTheme()
  const location = useLocation()

  // Check if current page already has an embedded theme toggle
  const currentPath = location.pathname
  const hasEmbeddedToggle = PAGES_WITH_EMBEDDED_TOGGLE.some((path) => {
    if (path === '/') return currentPath === '/'
    return currentPath === path || currentPath.startsWith(path + '/')
  })

  // Don't render on pages that already have a toggle in their layout
  if (hasEmbeddedToggle) return null

  const tooltipText = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'

  const handleToggle = () => {
    setTheme(isDark ? THEMES.LIGHT : THEMES.DARK)
  }

  return (
    <button
      className={`global-theme-toggle ${isDark ? 'global-theme-toggle--dark' : 'global-theme-toggle--light'}`}
      onClick={handleToggle}
      title={tooltipText}
      aria-label={tooltipText}
      type="button"
    >
      <span className="global-theme-toggle__icon-wrap">
        <SunIcon size={18} className="global-theme-toggle__icon global-theme-toggle__icon--sun" />
        <MoonIcon size={18} className="global-theme-toggle__icon global-theme-toggle__icon--moon" />
      </span>
    </button>
  )
}
