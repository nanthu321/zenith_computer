import { useState, useEffect } from "react";

/**
 * TaskToast
 *
 * Shows a stack of timed notifications at the bottom-right of the screen.
 * Toasts auto-dismiss after `duration` ms.
 *
 * Props:
 *   toasts: [{ id, type, title, message, action? }]
 *   onDismiss: (id) => void
 */

const TYPE_STYLES = {
  success:   { border: "#10b981", icon: "✓", bg: "rgba(16,185,129,0.1)"  },
  error:     { border: "#ef4444", icon: "✕", bg: "rgba(239,68,68,0.1)"   },
  completed: { border: "#6366f1", icon: "★", bg: "rgba(99,102,241,0.1)"  },
  running:   { border: "#f59e0b", icon: "↻", bg: "rgba(245,158,11,0.1)"  },
};

function Toast({ toast, onDismiss }) {
  const [visible, setVisible] = useState(false);
  const style = TYPE_STYLES[toast.type] || TYPE_STYLES.success;

  useEffect(() => {
    // Slide in
    const showTimer = setTimeout(() => setVisible(true), 20);
    // Auto dismiss
    const hideTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 300);
    }, toast.duration || 5000);

    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "12px 14px",
        borderRadius: 10,
        background: style.bg,
        border: `1px solid ${style.border}40`,
        borderLeft: `3px solid ${style.border}`,
        maxWidth: 340,
        boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
        transform: visible ? "translateX(0)" : "translateX(120%)",
        opacity: visible ? 1 : 0,
        transition: "transform 0.3s ease, opacity 0.3s ease",
        pointerEvents: "all",
      }}>

      {/* Icon */}
      <span style={{
        fontSize: 14, fontWeight: 700,
        color: style.border, flexShrink: 0, marginTop: 1,
      }}>
        {style.icon}
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
          {toast.title}
        </div>
        {toast.message && (
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)",
                        lineHeight: 1.4 }}>
            {toast.message}
          </div>
        )}
        {toast.action && (
          <button
            onClick={toast.action.onClick}
            style={{
              marginTop: 6, fontSize: 12, fontWeight: 500,
              color: style.border, background: "none",
              border: "none", cursor: "pointer", padding: 0,
              textDecoration: "underline",
            }}>
            {toast.action.label}
          </button>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={() => onDismiss(toast.id)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 16, color: "var(--color-text-secondary)",
          padding: 0, lineHeight: 1, flexShrink: 0,
        }}>
        ×
      </button>
    </div>
  );
}

export default function TaskToastContainer({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      right: 24,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      zIndex: 9999,
      pointerEvents: "none",
    }}>
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
