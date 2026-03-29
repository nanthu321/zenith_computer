/**
 * ExplorerThemeToggle — Compact icon-based theme toggle for explorer sidebars/headers
 *
 * A minimal sun/moon icon button that fits naturally alongside
 * other explorer action buttons (New File, Refresh, Collapse, etc.).
 *
 * Icon behavior (matches current theme state):
 *   ☀️ Sun  → shown when current theme is Light
 *   🌙 Moon → shown when current theme is Dark
 *
 * Props:
 *   size       — icon size in px (default: 16)
 *   btnClass   — CSS class override for the button wrapper
 *   className  — additional CSS class
 */
import { useTheme } from '../../hooks/useTheme.js'
import { SunIcon, MoonIcon } from '../icons/ThemeIcons.jsx'
import './ExplorerThemeToggle.css'

export default function ExplorerThemeToggle({ size = 16, btnClass = '', className = '' }) {
  const { isDark, setTheme, THEMES } = useTheme()

  const handleToggle = (e) => {
    e.stopPropagation()
    setTheme(isDark ? THEMES.LIGHT : THEMES.DARK)
  }

  return (
    <button
      className={`explorer-theme-toggle ${isDark ? 'ett-dark' : 'ett-light'} ${btnClass} ${className}`}
      onClick={handleToggle}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      type="button"
    >
      {/* Sun icon — visible in Light mode (represents current state) */}
      <SunIcon size={size} className="ett-icon ett-icon-sun" />

      {/* Moon icon — visible in Dark mode (represents current state) */}
      <MoonIcon size={size} className="ett-icon ett-icon-moon" />
    </button>
  )
}
