import { useState, useEffect, useCallback } from "react";
import { tasksApi } from "../../api/tasks";

function formatDate(str) {
  if (!str) return "—";
  const d = new Date(str);
  return isNaN(d) ? str : d.toLocaleString();
}

function formatInterval(secs) {
  if (!secs) return "—";
  if (secs < 60)   return `${secs} seconds`;
  if (secs < 3600) return `${Math.round(secs / 60)} minutes`;
  return `${(secs / 3600).toFixed(1)} hours`;
}

const STATUS_COLOR = {
  success:   "#10b981",
  failed:    "#ef4444",
  scheduled: "#6366f1",
  running:   "#f59e0b",
};

// ── Run log row ───────────────────────────────────────────────────────────────

function RunLogRow({ log }) {
  const [expanded, setExpanded] = useState(false);
  const color = STATUS_COLOR[log.status] || "#6b7280";
  return (
    <div style={{
      borderBottom: "1px solid var(--color-border-tertiary)",
      padding: "8px 0",
    }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 12,
                 cursor: log.error_message ? "pointer" : "default" }}
        onClick={() => log.error_message && setExpanded((e) => !e)}>
        <span style={{
          width: 20, height: 20, borderRadius: "50%",
          background: color + "22", color, fontSize: 11,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 600, flexShrink: 0,
        }}>
          {log.run_number}
        </span>
        <span style={{ fontSize: 12, fontWeight: 500, color,
                       textTransform: "capitalize" }}>
          {log.status}
        </span>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)",
                       marginLeft: "auto" }}>
          {formatDate(log.executed_at)}
        </span>
        {log.error_message && (
          <span style={{ fontSize: 11, opacity: 0.5 }}>
            {expanded ? "▲" : "▼"}
          </span>
        )}
      </div>
      {expanded && log.error_message && (
        <div style={{
          marginTop: 6, marginLeft: 32, fontSize: 12,
          color: "#ef4444", fontFamily: "var(--font-mono, monospace)",
          background: "rgba(239,68,68,0.06)", padding: "6px 10px",
          borderRadius: 6,
        }}>
          {log.error_message}
        </div>
      )}
    </div>
  );
}

// ── TaskDetail ────────────────────────────────────────────────────────────────

export default function TaskDetail({ task: taskSummary, onCancelled }) {
  const [task,     setTask]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    if (!taskSummary) return;
    try {
      const raw = await tasksApi.getTask(taskSummary.task_id);
      // Handle both { success, data } and direct object shapes
      const data = raw?.data || raw;
      setTask(data);
    } catch (e) {
      console.error('[TaskDetail] Failed to load task:', e.message);
    } finally {
      setLoading(false);
    }
  }, [taskSummary?.task_id]);

  // Re-fetch when task selection changes OR when _refresh is bumped by SSE events
  useEffect(() => {
    setLoading(true);
    load();
  }, [load, taskSummary?._refresh]);

  // Poll every 15s when task is active
  useEffect(() => {
    if (!task?.is_active) return;
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [task?.is_active, load]);

  async function handleCancel() {
    setCancelling(true);
    try {
      await tasksApi.cancelTask(task.task_id);
      setConfirmCancel(false);
      onCancelled?.();
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setCancelling(false);
    }
  }

  if (!taskSummary)
    return <div style={s.empty}>Select a task to see details.</div>;
  if (loading)
    return <div style={s.empty}>Loading…</div>;
  if (!task)
    return <div style={s.empty}>Task not found.</div>;

  const canCancel = task.is_active || task.status === "scheduled";
  const hasOutput = task.output_file;
  const runLogs   = task.run_logs || [];

  return (
    <div style={s.container}>

      {/* ── Header ── */}
      <div style={s.header}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 2,
                        overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap" }}>
            {task.description || task.task_id}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
            ID: {task.task_id}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center",
                      flexShrink: 0 }}>
          {hasOutput && (
            <button
              onClick={() => tasksApi.downloadOutput(
                task.task_id,
                task.output_file?.split("/").pop()
              )}
              style={btn("#10b981")}>⬇ Download output</button>
          )}

          {canCancel && (
            confirmCancel ? (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={handleCancel} disabled={cancelling}
                  style={btn("#ef4444")}>{cancelling ? "Cancelling…" : "Confirm cancel"}</button>
                <button onClick={() => setConfirmCancel(false)}
                  style={btn("#6b7280")}>Keep</button>
              </div>
            ) : (
              <button onClick={() => setConfirmCancel(true)}
                style={btn("#6b7280")}>Cancel task</button>
            )
          )}
        </div>
      </div>

      {/* ── Stats grid ── */}
      <div style={s.statsGrid}>
        <StatCard label="Status"    value={task.status}     color={STATUS_COLOR[task.status]} />
        <StatCard label="Interval"  value={formatInterval(task.interval_secs)} />
        <StatCard label="Runs done" value={`${task.completed_runs || 0} / ${task.total_runs || "∞"}`} />
        <StatCard label="Ends at"   value={formatDate(task.ends_at)} />
        {task.is_active && task.next_run && (
          <StatCard label="Next run" value={formatDate(task.next_run)} color="#6366f1" />
        )}
        <StatCard label="Created"   value={formatDate(task.created_at)} />
      </div>

      {/* ── Run logs ── */}
      <div style={s.section}>
        <div style={s.sectionTitle}>
          Run history
          <span style={{ fontWeight: 400, color: "var(--color-text-secondary)",
                         marginLeft: 8 }}>
            ({runLogs.length} runs)
          </span>
        </div>

        {runLogs.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)",
                        padding: "12px 0" }}>
            No runs yet — task is waiting for its first execution.
          </div>
        ) : (
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {runLogs.map((log) => (
              <RunLogRow key={log.run_number} log={log} />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 8,
      border: "1px solid var(--color-border-tertiary)",
      background: "var(--color-background-secondary)",
    }}>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)",
                    marginBottom: 3, textTransform: "uppercase",
                    letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 500,
                    color: color || "var(--color-text-primary)",
                    textTransform: "capitalize" }}>
        {value || "—"}
      </div>
    </div>
  );
}

function btn(color) {
  return {
    padding: "6px 12px", borderRadius: 6, fontSize: 13,
    fontWeight: 500, cursor: "pointer",
    background: color + "15",
    color, border: `1px solid ${color}40`,
    transition: "opacity 0.2s",
  };
}

const s = {
  container: { display: "flex", flexDirection: "column",
               height: "100%", overflow: "auto" },
  empty: { padding: 24, fontSize: 13,
           color: "var(--color-text-secondary)",
           textAlign: "center", marginTop: 60 },
  header: {
    display: "flex", alignItems: "flex-start",
    justifyContent: "space-between", gap: 16,
    padding: "16px 20px",
    borderBottom: "1px solid var(--color-border-tertiary)",
    flexShrink: 0,
  },
  statsGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 10, padding: "16px 20px",
    borderBottom: "1px solid var(--color-border-tertiary)",
  },
  section: { padding: "16px 20px" },
  sectionTitle: {
    fontSize: 13, fontWeight: 500, marginBottom: 10,
  },
};
