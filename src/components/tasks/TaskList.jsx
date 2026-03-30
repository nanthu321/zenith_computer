import { useState, useEffect, useCallback } from "react";
import { tasksApi } from "../../api/tasks";

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_STYLES = {
  scheduled:  { bg: "rgba(99,102,241,0.12)",  color: "#6366f1",  label: "Scheduled"  },
  running:    { bg: "rgba(245,158,11,0.12)",  color: "#f59e0b",  label: "Running"    },
  completed:  { bg: "rgba(16,185,129,0.12)",  color: "#10b981",  label: "Completed"  },
  cancelled:  { bg: "rgba(107,114,128,0.12)", color: "#6b7280",  label: "Cancelled"  },
  failed:     { bg: "rgba(239,68,68,0.12)",   color: "#ef4444",  label: "Failed"     },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.scheduled;
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 500,
      background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
}

function ActiveDot() {
  return (
    <span style={{
      display: "inline-block", width: 7, height: 7, borderRadius: "50%",
      background: "#10b981", marginRight: 6, flexShrink: 0,
      boxShadow: "0 0 0 2px rgba(16,185,129,0.3)",
      animation: "pulse 2s ease-in-out infinite",
    }} />
  );
}

function formatInterval(secs) {
  if (!secs) return "—";
  if (secs < 60)   return `Every ${secs}s`;
  if (secs < 3600) return `Every ${Math.round(secs / 60)}m`;
  return `Every ${Math.round(secs / 3600)}h`;
}

function formatDate(str) {
  if (!str) return "—";
  const d = new Date(str);
  return isNaN(d) ? str : d.toLocaleString();
}

// ── TaskList ──────────────────────────────────────────────────────────────────
// OPTIMIZATION: Removed independent 15s polling that was duplicating
// the parent's polling (useTasks already polls on a configurable interval).
// TaskList now fetches on mount + refreshSignal changes only.
// Real-time updates come via SSE (useTaskNotifications) — no polling needed.

export default function TaskList({ selectedTaskId, onSelect, refreshSignal, liveUpdates = {} }) {
  const [tasks,   setTasks]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    try {
      const raw = await tasksApi.listTasks();
      // Handle all possible API shapes: array, { tasks: [] }, { data: [] }
      const list = Array.isArray(raw) ? raw : (raw?.tasks ?? raw?.data ?? []);
      setTasks(Array.isArray(list) ? list : []);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and when parent signals a refresh (e.g., after SSE event)
  useEffect(() => { load(); }, [load, refreshSignal]);

  // NOTE: Independent polling removed — parent (useTasks) handles centralized
  // polling on a configurable interval. SSE (useTaskNotifications) provides
  // real-time updates for running tasks. This eliminates duplicate API calls
  // that were contributing to server overload and 502 errors.

  if (loading) return <div style={s.empty}>Loading tasks…</div>;
  if (error)   return <div style={s.empty}>Error: {error}</div>;
  if (tasks.length === 0)
    return (
      <div style={s.empty}>
        No scheduled tasks yet.<br />
        Ask the agent to "search gold prices every 3 hours" to create one.
      </div>
    );

  return (
    <div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
      {tasks.map((task) => {
        const live = liveUpdates[task.task_id];
        const isSelected = task.task_id === selectedTaskId;

        return (
          <div
            key={task.task_id}
            onClick={() => onSelect(task)}
            style={{
              ...s.row,
              background: isSelected
                ? "rgba(99,102,241,0.08)" : "transparent",
              borderLeft: isSelected
                ? "3px solid #6366f1" : "3px solid transparent",
            }}>

            {/* Active indicator + description */}
            <div style={s.rowTop}>
              <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
                {(task.is_active || live) && <ActiveDot />}
                <span style={s.desc} title={task.description}>
                  {task.description || task.task_id}
                </span>
              </div>
              <StatusBadge status={task.status} />
            </div>

            {/* Meta row */}
            <div style={s.rowMeta}>
              <span>{formatInterval(task.interval_seconds || task.interval_secs)}</span>
              {/* ── Live run progress badge ── */}
              {live && (
                <span style={{
                  padding: "1px 7px", borderRadius: 10, fontSize: 11,
                  background: live.status === "failed"
                    ? "rgba(239,68,68,0.15)"
                    : "rgba(245,158,11,0.15)",
                  color: live.status === "failed" ? "#ef4444" : "#f59e0b",
                  animation: "pulse 1.5s ease-in-out infinite",
                }}>
                  Run {live.run_number}/{live.total_runs}
                </span>
              )}
              {!live && task.next_run && task.is_active && (
                <span>Next: {formatDate(task.next_run)}</span>
              )}
              {!live && task.completed_runs > 0 && (
                <span>{task.completed_runs} runs</span>
              )}
            </div>

          </div>
        );
      })}
    </div>
  );
}

const s = {
  empty: {
    padding: 20, fontSize: 13,
    color: "var(--color-text-secondary)", lineHeight: 1.6,
  },
  row: {
    padding: "10px 14px",
    cursor: "pointer",
    borderRadius: 0,
    borderBottom: "1px solid var(--color-border-tertiary)",
    transition: "background 0.15s",
  },
  rowTop: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between", gap: 8, marginBottom: 4,
  },
  desc: {
    fontSize: 14, fontWeight: 500,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  rowMeta: {
    display: "flex", gap: 12, fontSize: 12,
    color: "var(--color-text-secondary)",
  },
};
