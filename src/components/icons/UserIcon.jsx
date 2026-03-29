import React from 'react'

/**
 * Zenith User Icon — Clean modern avatar silhouette
 * Smooth rounded head + shoulders with subtle style
 */
export default function UserIcon({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Head */}
      <circle
        cx="16"
        cy="11"
        r="5.5"
        fill="white"
        opacity="0.9"
      />

      {/* Body / Shoulders — smooth arc */}
      <path
        d="M5 28.5C5 22.15 9.92 17 16 17C22.08 17 27 22.15 27 28.5"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />

      {/* Subtle inner shoulder fill for depth */}
      <path
        d="M7.5 28C7.5 23.03 11.3 19 16 19C20.7 19 24.5 23.03 24.5 28"
        fill="white"
        opacity="0.15"
      />
    </svg>
  )
}
