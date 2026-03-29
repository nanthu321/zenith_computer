import React from 'react'
import { useTheme } from '../hooks/useTheme.js'
import { SunIcon, MoonIcon } from './icons/ThemeIcons.jsx'
import './ThemeToggle.css'

/**
 * ThemeToggle — Minimal icon-based theme switcher (Sun / Moon).
 *
 * Shows Sun when in light mode, Moon when in dark mode.
 * Clicking toggles between Light and Dark.
 * Theme persists via localStorage + server sync (handled by ThemeContext).
 *
 * Props:
 *   size      — icon size: 'sm' (default) | 'md' | 'lg'
 *   className — additional CSS class
 */
export default function ThemeToggle({ size = 'sm', className = '' }) {
  const { isDark, setTheme, THEMES } = useTheme()

  const iconSize = size === 'lg' ? 20 : size === 'md' ? 18 : 16
  const tooltipText = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'

  const handleToggle = () => {
    setTheme(isDark ? THEMES.LIGHT : THEMES.DARK)
  }

  return (
    <button
      className={`theme-toggle-btn theme-toggle-btn--${size} ${isDark ? 'theme-toggle-btn--dark' : 'theme-toggle-btn--light'} ${className}`}
      onClick={handleToggle}
      title={tooltipText}
      aria-label={tooltipText}
      type="button"
    >
      <span className="theme-toggle-btn__icon-wrap">
        {/* Sun icon — visible in light mode */}
        <SunIcon size={iconSize} className="theme-toggle-btn__icon theme-toggle-btn__icon--sun" />
        {/* Moon icon — visible in dark mode */}
        <MoonIcon size={iconSize} className="theme-toggle-btn__icon theme-toggle-btn__icon--moon" />
      </span>
    </button>
  )
}
