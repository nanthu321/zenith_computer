import { useState } from "react";

// ── Color per tool category ───────────────────────────────────────────────
const TOOL_COLORS = {
  web_search:         "#6366f1",
  web_fetch:          "#6366f1",
  execute_code:       "#f59e0b",
  execute_command:    "#f59e0b",
  run_tests:          "#f59e0b",
  install_package:    "#f59e0b",
  create_file:        "#10b981",
  read_file:          "#10b981",
  update_file:        "#10b981",
  delete_file:        "#ef4444",
  list_files:         "#10b981",
  create_project:     "#10b981",
  download_project:   "#10b981",
  browser_launch:     "#3b82f6",
  browser_navigate:   "#3b82f6",
  browser_click:      "#3b82f6",
  browser_type:       "#3b82f6",
  browser_screenshot: "#3b82f6",
  browser_wait_for:   "#3b82f6",
  browser_get_text:   "#3b82f6",
  browser_execute_js: "#3b82f6",
  memory_store:       "#8b5cf6",
  memory_retrieve:    "#8b5cf6",
  memory_list:        "#8b5cf6",
  memory_delete:      "#8b5cf6",
  schedule_task:      "#ec4899",
  list_tasks:         "#ec4899",
  cancel_task:        "#ec4899",
  extract_data:       "#14b8a6",
  write_excel:        "#14b8a6",
  parse_csv:          "#14b8a6",
};

// ── Spinner ───────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <span
      className="agent-spinner"
      style={{
        display: "inline-block",
        width: 12,
        height: 12,
        border: "2px solid currentColor",
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "agent-spin 0.7s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

// ── ThinkingCard ──────────────────────────────────────────────────────────
function ThinkingCard({ event }) {
  const done = event.status === "done";
  return (
    <div
      className={`agent-thinking-card ${done ? "agent-thinking-done" : "agent-thinking-active"}`}
    >
      {done ? (
        <span className="agent-check">✓</span>
      ) : (
        <Spinner />
      )}
      <span>{event.label}</span>
    </div>
  );
}

// ── StatusCard ────────────────────────────────────────────────────────────
function StatusCard({ event }) {
  const [expanded, setExpanded] = useState(false);
  const color = TOOL_COLORS[event.tool] || "#64748b";
  const done = event.status === "done";

  return (
    <div
      className={`agent-status-card ${done ? "agent-status-done" : "agent-status-active"}`}
      onClick={() => done && setExpanded((e) => !e)}
      style={{
        "--tool-color": color,
        "--tool-color-bg": color + "12",
        "--tool-color-border": color + "40",
      }}
    >
      {/* Left: spinner or checkmark */}
      {done ? (
        <span className="agent-check">✓</span>
      ) : (
        <Spinner />
      )}

      {/* Icon */}
      {event.icon && <span className="agent-status-icon">{event.icon}</span>}

      {/* Label */}
      <span className="agent-status-label">{event.label}</span>

      {/* Args preview */}
      {event.args_preview && (
        <span
          className={`agent-status-args ${expanded ? "agent-status-args-expanded" : ""}`}
        >
          {event.args_preview}
        </span>
      )}

      {/* Expand toggle */}
      {done && event.args_preview && (
        <span className="agent-status-toggle">
          {expanded ? "▲" : "▼"}
        </span>
      )}
    </div>
  );
}

// ── IterationBar ──────────────────────────────────────────────────────────
function IterationBar({ event }) {
  const pct = Math.round((event.current / event.max) * 100);
  return (
    <div className="agent-iteration-bar">
      <span>
        Step {event.current} of {event.max}
      </span>
      <div className="agent-iteration-track">
        <div
          className="agent-iteration-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── AgentEvents (main export) ─────────────────────────────────────────────
export default function AgentEvents({ events }) {
  if (!events || events.length === 0) return null;

  return (
    <div className="agent-events-container">
      {events.map((ev, i) => {
        if (ev.type === "thinking")
          return <ThinkingCard key={i} event={ev} />;
        if (ev.type === "status")
          return <StatusCard key={`${ev.tool}-${i}`} event={ev} />;
        if (ev.type === "iteration")
          return <IterationBar key={i} event={ev} />;
        return null;
      })}
    </div>
  );
}
