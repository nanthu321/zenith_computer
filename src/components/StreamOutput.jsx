import React, { useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import useStreamStore from '../store/streamStore.js'
import './StreamOutput.css'

/**
 * StreamOutput — Global floating stream indicator that displays live
 * streaming progress when the user navigates away from the chat page.
 *
 * KEY BEHAVIOR:
 *  - Only visible when streaming is active AND user is NOT on /chat
 *  - Shows a compact floating pill with streaming status, content preview,
 *    and a "View" button to navigate back to the chat
 *  - Can be collapsed/expanded by clicking
 *  - The stream itself lives in the Zustand store, NOT in this component
 *    — StreamOutput is purely a reader, it never affects the stream lifecycle
 *
 * This component is mounted in App.jsx (above Routes) so it persists
 * across all page transitions.
 */
export default function StreamOutput() {
  const navigate = useNavigate()
  const location = useLocation()

  // Granular subscriptions — only re-render when these specific values change
  const isStreaming = useStreamStore((s) => s.isStreaming)
  const messages   = useStreamStore((s) => s.messages)
  const error      = useStreamStore((s) => s.error)

  const [collapsed, setCollapsed] = useState(false)

  const isOnChatPage = location.pathname === '/chat'

  // Find the latest streaming assistant message for the preview
  const streamingMessage = messages
    .filter((m) => m.role === 'assistant')
    .reverse()
    .find((m) => m.isStreaming || m.content)

  const contentPreview = streamingMessage?.content
    ? streamingMessage.content.length > 120
      ? streamingMessage.content.slice(-120) + '…'
      : streamingMessage.content
    : ''

  const activeToolCalls = streamingMessage?.tool_calls?.filter(
    (tc) => tc.status === 'running'
  ) || []

  const handleNavigateToChat = useCallback(() => {
    navigate('/chat')
  }, [navigate])

  // Don't show if:
  //  - Not streaming (and no error to show)
  //  - Already on the chat page (ChatArea handles the display there)
  if (!isStreaming || isOnChatPage) return null

  // Error state while streaming on another page
  if (error) {
    return (
      <div className="stream-output stream-output--error">
        <div className="stream-output-header">
          <span className="stream-output-icon">⚠️</span>
          <span className="stream-output-title">Stream Error</span>
          <button
            className="stream-output-view-btn"
            onClick={handleNavigateToChat}
          >
            View
          </button>
        </div>
        <p className="stream-output-error-text">{error}</p>
      </div>
    )
  }

  return (
    <div
      className={`stream-output ${collapsed ? 'stream-output--collapsed' : ''}`}
      onClick={() => collapsed && setCollapsed(false)}
      role="status"
      aria-live="polite"
      aria-label="AI response streaming in background"
    >
      {/* Header bar — always visible */}
      <div className="stream-output-header">
        <div className="stream-output-status">
          <span className="stream-output-pulse" />
          <span className="stream-output-title">
            {activeToolCalls.length > 0
              ? `Running ${activeToolCalls[0].tool.replace(/_/g, ' ')}…`
              : 'Generating response…'}
          </span>
        </div>

        <div className="stream-output-actions">
          <button
            className="stream-output-view-btn"
            onClick={(e) => {
              e.stopPropagation()
              handleNavigateToChat()
            }}
            title="Go to chat"
          >
            View
          </button>
          <button
            className="stream-output-toggle-btn"
            onClick={(e) => {
              e.stopPropagation()
              setCollapsed((v) => !v)
            }}
            title={collapsed ? 'Expand' : 'Collapse'}
            aria-label={collapsed ? 'Expand stream preview' : 'Collapse stream preview'}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              style={{
                transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
              }}
            >
              <path
                d="M3 9l4-4 4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Content preview — hidden when collapsed */}
      {!collapsed && contentPreview && (
        <div className="stream-output-preview">
          <p className="stream-output-text">
            {contentPreview}
            <span className="stream-output-cursor">▍</span>
          </p>
        </div>
      )}

      {/* Tool call badges */}
      {!collapsed && activeToolCalls.length > 0 && (
        <div className="stream-output-tools">
          {activeToolCalls.map((tc) => (
            <span key={tc.tool_use_id} className="stream-output-tool-badge">
              ⚙️ {tc.tool.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
