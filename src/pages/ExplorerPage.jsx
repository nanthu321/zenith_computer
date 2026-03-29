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
import './ExplorerPage.css'
import zenithLogo from '../assets/zenith.png'


export default function ExplorerPage() {
  const navigate = useNavigate()

  return (
    <div className="explorer-page">
      {/* Back to Chat — Logo button, fixed top-left */}
      <button
        className="explorer-page-back-btn"
        onClick={() => navigate('/')}
        title="Go to home page"
      >
        <img src={zenithLogo} alt="Zenith Logo" className="nav-brand-logo" />
      </button>

      {/* Full-screen VS Code–style explorer */}
      <WorkspaceExplorer />
    </div>
  )
}
