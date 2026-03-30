/**
 * ExplorerPage — Standalone full-screen file explorer page
 *
 * Rendered at /workspace. Completely separate from ChatPage —
 * no chat sidebar, no session state. Just the VS Code–style
 * WorkspaceExplorer with a "Back to Chat" button injected
 * into the activity bar area.
 */
import React from 'react'
import { useNavigate } from 'react-router-dom'
import WorkspaceExplorer from '../components/explorer/WorkspaceExplorer.jsx'
import useStreamStore from '../store/streamStore.js'
import './ExplorerPage.css'
import zenithLogo from '../assets/zenith.png'

export default function ExplorerPage() {
  const navigate = useNavigate()
  const isStreaming = useStreamStore((s) => s.isStreaming)

  return (
    <div className="explorer-page">
      {/* Logo / Home button */}
      <button
        className="explorer-page-back-btn"
        onClick={() => navigate('/')}
        title="Go to home page"
      >
        <img src={zenithLogo} alt="Zenith Logo" className="nav-brand-logo" />
      </button>

      {/* Inline streaming indicator — subtle bar at the top */}
      {isStreaming && (
        <div className="explorer-streaming-bar">
          <span className="explorer-streaming-dot" />
          <span className="explorer-streaming-text">AI is generating a response…</span>
          <button
            className="explorer-streaming-link"
            onClick={() => navigate('/chat')}
          >
            View in Chat →
          </button>
        </div>
      )}

      {/* Workspace explorer */}
      <WorkspaceExplorer />
    </div>
  )
}
