import React from 'react'
import './LoadingSpinner.css'

export default function LoadingSpinner({ size = 'md', label, inline = false }) {
  return (
    <div className={`spinner-wrapper ${inline ? 'spinner-inline' : ''}`} role="status">
      <div className={`spinner spinner-${size}`} aria-hidden="true" />
      {label && <span className="spinner-label">{label}</span>}
      <span className="sr-only">{label || 'Loading...'}</span>
    </div>
  )
}
