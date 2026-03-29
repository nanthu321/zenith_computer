import React from 'react'
import './NexusLogo.css'

/**
 * Zenith Logo — SVG-based network/nexus design
 * Represents: AI at the center connecting all tools/capabilities
 * The circular nodes = capabilities (code, web, tasks, files)
 * Connected back to core AI = Zenith
 */
export default function NexusLogo({ size = 36, animated = false, showText = false }) {
  const id = `nexus-grad-${size}`

  return (
    <div className={`nexus-logo-wrapper ${animated ? 'nexus-animated' : ''}`} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Zenith Logo"
      >
        <defs>
          <linearGradient id={`${id}-1`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#226DB4" />
            <stop offset="100%" stopColor="#5a9fd4" />
          </linearGradient>
          <linearGradient id={`${id}-2`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#0A9949" />
            <stop offset="100%" stopColor="#4dc67e" />
          </linearGradient>
          <filter id={`${id}-glow`}>
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* ── Outer ring ── */}
        <circle
          cx="20" cy="20" r="17"
          stroke={`url(#${id}-1)`}
          strokeWidth="1.5"
          fill="none"
          opacity="0.5"
          strokeDasharray="3 2"
        />

        {/* ── Connection lines from center to nodes ── */}
        <line x1="20" y1="20" x2="20" y2="6"  stroke={`url(#${id}-1)`} strokeWidth="1"   opacity="0.5" />
        <line x1="20" y1="20" x2="20" y2="34" stroke={`url(#${id}-1)`} strokeWidth="1"   opacity="0.5" />
        <line x1="20" y1="20" x2="6"  y2="20" stroke={`url(#${id}-1)`} strokeWidth="1"   opacity="0.5" />
        <line x1="20" y1="20" x2="34" y2="20" stroke={`url(#${id}-1)`} strokeWidth="1"   opacity="0.5" />
        <line x1="20" y1="20" x2="10" y2="10" stroke={`url(#${id}-2)`} strokeWidth="0.8" opacity="0.35" />
        <line x1="20" y1="20" x2="30" y2="10" stroke={`url(#${id}-2)`} strokeWidth="0.8" opacity="0.35" />
        <line x1="20" y1="20" x2="10" y2="30" stroke={`url(#${id}-2)`} strokeWidth="0.8" opacity="0.35" />
        <line x1="20" y1="20" x2="30" y2="30" stroke={`url(#${id}-2)`} strokeWidth="0.8" opacity="0.35" />

        {/* ── Outer nodes (capabilities) ── */}
        <circle cx="20" cy="6"  r="2.5" fill={`url(#${id}-1)`} opacity="0.8" />
        <circle cx="20" cy="34" r="2.5" fill={`url(#${id}-1)`} opacity="0.8" />
        <circle cx="6"  cy="20" r="2.5" fill={`url(#${id}-1)`} opacity="0.8" />
        <circle cx="34" cy="20" r="2.5" fill={`url(#${id}-1)`} opacity="0.8" />
        <circle cx="10" cy="10" r="1.8" fill={`url(#${id}-2)`} opacity="0.5" />
        <circle cx="30" cy="10" r="1.8" fill={`url(#${id}-2)`} opacity="0.5" />
        <circle cx="10" cy="30" r="1.8" fill={`url(#${id}-2)`} opacity="0.5" />
        <circle cx="30" cy="30" r="1.8" fill={`url(#${id}-2)`} opacity="0.5" />

        {/* ── Center core (AI brain) ── */}
        <circle
          cx="20" cy="20" r="6"
          fill={`url(#${id}-1)`}
          filter={`url(#${id}-glow)`}
        />

{/* ── Center symbol — "Z" stylized as zenith/neural ── */}        <path
          d="M17 23.5V16.5L20 20L23 16.5V23.5"
          stroke="white"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>

      {showText && (
        <span className="nexus-logo-text">Zenith</span>
      )}
    </div>
  )
}
