/**
 * ThemeIcons — External Lucide-style SVG icon components for theme toggles.
 *
 * Source: Lucide Icons (https://lucide.dev) — ISC License
 * These are standalone React wrappers around the official Lucide SVG paths,
 * extracted so the project doesn't need the full lucide-react dependency.
 *
 * Each icon accepts:
 *   size      — icon dimensions in px (default: 16)
 *   className — additional CSS class
 *   style     — inline style object
 *   ...props  — forwarded to the <svg> element (e.g. aria-hidden)
 */

import React from 'react'

const defaultProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

/**
 * ☀ Sun icon — represents Light theme
 * Lucide: "sun" — https://lucide.dev/icons/sun
 */
export function SunIcon({ size = 16, className = '', style, ...props }) {
  return (
    <svg
      {...defaultProps}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={style}
      {...props}
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  )
}

/**
 * 🌙 Moon icon — represents Dark theme
 * Lucide: "moon" — https://lucide.dev/icons/moon
 */
export function MoonIcon({ size = 16, className = '', style, ...props }) {
  return (
    <svg
      {...defaultProps}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={style}
      {...props}
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  )
}

/**
 * 🖥 Monitor icon — represents System theme
 * Lucide: "monitor" — https://lucide.dev/icons/monitor
 */
export function MonitorIcon({ size = 16, className = '', style, ...props }) {
  return (
    <svg
      {...defaultProps}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={style}
      {...props}
    >
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  )
}
