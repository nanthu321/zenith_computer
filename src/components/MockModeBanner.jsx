import React, { useState } from 'react'
import './MockModeBanner.css'

/**
 * Shows a dismissible banner when the app is running in mock/demo mode.
 * Appears at the top of the chat page.
 */
export default function MockModeBanner() {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <div className="mock-banner" role="status">
      <span className="mock-banner-dot" />
      <span className="mock-banner-text">
        <strong>Demo Mode</strong> — Backend not connected. Using sample data to preview the app.
        <span className="mock-banner-hint"> Connect the backend at port 8080 to use live AI.</span>
      </span>
      <button
        className="mock-banner-dismiss"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
