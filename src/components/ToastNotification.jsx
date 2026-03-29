import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import './ToastNotification.css'

/* ── SVG Icons ── */
const Icons = {
  check: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  info: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  warn: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    </svg>
  ),
  error: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  close: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  chat: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
}

/* ── Single Toast Item ── */
function ToastItem({ toast, onDismiss, onAction }) {
  const [exiting, setExiting] = useState(false)
  const timerRef = useRef(null)

  const dismiss = useCallback(() => {
    setExiting(true)
    setTimeout(() => onDismiss(toast.id), 300)
  }, [toast.id, onDismiss])

  useEffect(() => {
    if (toast.duration !== Infinity) {
      timerRef.current = setTimeout(dismiss, toast.duration || 5000)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [toast.duration, dismiss])

  const icon = toast.icon || Icons[toast.type] || Icons.info
  const typeClass = `toast-${toast.type || 'info'}`

  return (
    <div className={`toast-item ${typeClass} ${exiting ? 'toast-exit' : 'toast-enter'}`}>
      <div className="toast-icon">{icon}</div>
      <div className="toast-body">
        {toast.title && <div className="toast-title">{toast.title}</div>}
        <div className="toast-message">{toast.message}</div>
      </div>
      {toast.action && (
        <button
          className="toast-action-btn"
          onClick={() => {
            toast.action.onClick?.()
            dismiss()
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button className="toast-close" onClick={dismiss} aria-label="Dismiss">
        {Icons.close}
      </button>
    </div>
  )
}

/* ── Toast Container (Portal) ── */
function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null

  return createPortal(
    <div className="toast-container" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body
  )
}

/* ── Hook: useToast ── */
let _toastIdCounter = 0

export function useToast() {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((options) => {
    const id = ++_toastIdCounter
    const toast = { id, ...options }
    setToasts((prev) => [...prev, toast])
    return id
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((message, options = {}) => {
    return addToast({ message, type: 'info', duration: 5000, ...options })
  }, [addToast])

  toast.success = (message, options = {}) =>
    addToast({ message, type: 'success', duration: 4000, ...options })

  toast.error = (message, options = {}) =>
    addToast({ message, type: 'error', duration: 6000, ...options })

  toast.warn = (message, options = {}) =>
    addToast({ message, type: 'warn', duration: 5000, ...options })

  toast.chat = (message, options = {}) =>
    addToast({ message, type: 'success', icon: Icons.chat, duration: 6000, ...options })

  const ToastPortal = useCallback(() => (
    <ToastContainer toasts={toasts} onDismiss={dismissToast} />
  ), [toasts, dismissToast])

  return { toast, ToastPortal, dismissToast }
}

export default ToastContainer
