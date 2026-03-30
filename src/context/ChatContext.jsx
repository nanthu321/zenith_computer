import React, { createContext, useContext, useMemo } from 'react'
import useStreamStore from '../store/streamStore.js'

/**
 * ChatContext — bridges the Zustand streamStore to a React context API
 * for backward compatibility with existing components that call useChatContext().
 *
 * MIGRATION NOTE:
 * All streaming state and logic now lives in the Zustand store (streamStore.js).
 * This context simply subscribes to the store and forwards the same API shape
 * that the old useChat() hook provided. Components can gradually migrate to
 * importing useStreamStore directly for more granular subscriptions.
 *
 * Because Zustand state lives outside the React tree, streams survive route
 * navigation automatically — no wrapping provider is needed for persistence.
 * The ChatProvider is kept only as a thin compatibility bridge.
 */
const ChatContext = createContext(null)

export function ChatProvider({ children }) {
  // Subscribe to all reactive state from the Zustand store
  const messages      = useStreamStore((s) => s.messages)
  const isStreaming    = useStreamStore((s) => s.isStreaming)
  const error         = useStreamStore((s) => s.error)
  const agentEvents   = useStreamStore((s) => s.agentEvents)
  const artifacts     = useStreamStore((s) => s.artifacts)

  // Stable action references from Zustand (these never change)
  const fetchMessages            = useStreamStore((s) => s.fetchMessages)
  const sendMessage              = useStreamStore((s) => s.sendMessage)
  const cancelStream             = useStreamStore((s) => s.cancelStream)
  const clearMessages            = useStreamStore((s) => s.clearMessages)
  const setError                 = useStreamStore((s) => s.setError)
  const setActiveSession         = useStreamStore((s) => s.setActiveSession)
  const isSessionStreaming       = useStreamStore((s) => s.isSessionStreaming)
  const setOnBackgroundComplete  = useStreamStore((s) => s.setOnBackgroundComplete)
  const setOnProjectStatusChange = useStreamStore((s) => s.setOnProjectStatusChange)
  const setOnConflictQueue       = useStreamStore((s) => s.setOnConflictQueue)
  const cleanupSession           = useStreamStore((s) => s.cleanupSession)
  const recoverStreamState       = useStreamStore((s) => s.recoverStreamState)

  // Memoize the context value so it only changes when actual state changes
  const value = useMemo(() => ({
    messages,
    isStreaming,
    error,
    agentEvents,
    artifacts,
    fetchMessages,
    sendMessage,
    cancelStream,
    clearMessages,
    setError,
    setActiveSession,
    isSessionStreaming,
    setOnBackgroundComplete,
    setOnProjectStatusChange,
    setOnConflictQueue,
    cleanupSession,
    recoverStreamState,
  }), [
    messages,
    isStreaming,
    error,
    agentEvents,
    artifacts,
    fetchMessages,
    sendMessage,
    cancelStream,
    clearMessages,
    setError,
    setActiveSession,
    isSessionStreaming,
    setOnBackgroundComplete,
    setOnProjectStatusChange,
    setOnConflictQueue,
    cleanupSession,
    recoverStreamState,
  ])

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChatContext() {
  const ctx = useContext(ChatContext)
  if (!ctx) {
    throw new Error('useChatContext must be used within a ChatProvider')
  }
  return ctx
}
