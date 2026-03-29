import React from 'react'
import { useTheme } from '../hooks/useTheme.js'
import './ThemeToggle.css'

/* ── SVG icons ── */
const SunIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
)

const MoonIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
  </svg>
)

const SystemIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
    <line x1="8" y1="21" x2="16" y2="21"/>
    <line x1="12" y1="17" x2="12" y2="21"/>
  </svg>
)

/**
 * Theme selector — renders as a 3-segment pill (dark / system / light).
 *
 * Props:
 *   variant: 'pill' (3-way segmented, default) | 'toggle' (simple icon cycle)
 *   size: 'sm' | 'md'
 *   showLabel: show text label next to icon (toggle variant only)
 *   className: additional CSS class
 */
export default function ThemeToggle({
  variant = 'pill',
  size = 'sm',
  showLabel = false,
  className = '',
}) {
  const { preference, isDark, setTheme, toggleTheme, THEMES } = useTheme()

  /* ── Variant: Simple icon-cycle button (sidebar collapsed, etc.) ── */
  if (variant === 'toggle') {
    const label = preference === THEMES.SYSTEM
      ? 'System theme'
      : isDark ? 'Switch to light' : 'Switch to dark'

    return (
      <button
        className={`theme-toggle theme-toggle-${size} ${isDark ? 'theme-dark' : 'theme-light'} ${className}`}
        onClick={toggleTheme}
        title={label}
        aria-label={label}
        type="button"
      >
        <span className="theme-toggle-icon-wrap">
          {preference === THEMES.SYSTEM
            ? <SystemIcon size={size === 'sm' ? 14 : 16} />
            : isDark
              ? <MoonIcon size={size === 'sm' ? 14 : 16} />
              : <SunIcon size={size === 'sm' ? 14 : 16} />
          }
        </span>
        {showLabel && (
          <span className="theme-toggle-label">
            {preference === THEMES.SYSTEM ? 'System' : isDark ? 'Dark' : 'Light'}
          </span>
        )}
      </button>
    )
  }

  /* ── Variant: 3-segment pill selector (default) ── */
  const options = [
    { key: THEMES.DARK,   Icon: MoonIcon,   label: 'Dark'   },
    { key: THEMES.SYSTEM, Icon: SystemIcon,  label: 'System' },
    { key: THEMES.LIGHT,  Icon: SunIcon,     label: 'Light'  },
  ]

  return (
    <div
      className={`theme-pill theme-pill-${size} ${isDark ? 'theme-dark' : 'theme-light'} ${className}`}
      role="radiogroup"
      aria-label="Theme selector"
    >
      {options.map(({ key, Icon, label }) => (
        <button
          key={key}
          className={`theme-pill-option ${preference === key ? 'theme-pill-active' : ''}`}
          onClick={() => setTheme(key)}
          title={`${label} theme`}
          aria-label={`${label} theme`}
          aria-checked={preference === key}
          role="radio"
          type="button"
        >
          <Icon size={size === 'sm' ? 12 : 14} />
          <span className="theme-pill-label">{label}</span>
        </button>
      ))}
    </div>
  )
}
