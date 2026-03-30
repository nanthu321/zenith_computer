import { useState, useCallback } from "react";
import TaskList             from "./TaskList";
import TaskDetail           from "./TaskDetail";
import TaskToastContainer   from "./TaskToast";
import useTaskNotifications from "../../hooks/useTaskNotifications";
import { tasksApi }         from "../../api/tasks";

/**
 * TaskManager — Full task management UI with list, detail, and live updates.
 *
 * Backend API endpoints used:
 *   GET  /api/tasks                    — List all tasks (via TaskList → tasksApi.listTasks)
 *   GET  /api/tasks/{taskId}           — Task detail + run_logs (via TaskDetail → tasksApi.getTask)
 *   POST /api/task-cancel/{taskId}     — Cancel task (via TaskDetail → tasksApi.cancelTask)
 *   GET  /api/task-download/{taskId}   — Download output (via tasksApi.downloadOutput)
 *   GET  /api/tasks/notifications      — SSE live updates (via useTaskNotifications)
 *
 * Note: Task creation is done via the AI agent's schedule_task tool, not a direct API call.
 */

let _toastId = 0;
function nextToastId() { return ++_toastId; }

export default function TaskManager() {
  const [selected,      setSelected]      = useState(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [toasts,        setToasts]        = useState([]);
  // Map of task_id → { run_number, status } for live row highlights
  const [liveUpdates,   setLiveUpdates]   = useState({});
  // Add task info panel state
  const [showAddForm,   setShowAddForm]   = useState(false);

  function addToast(toast) {
    setToasts((prev) => [...prev, { id: nextToastId(), ...toast }]);
  }

  function dismissToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function bumpRefresh() {
    setRefreshSignal((n) => n + 1);
  }

  // ── SSE callbacks ─────────────────────────────────────────────────────────

  const handleRunUpdate = useCallback((event) => {
    const { task_id, run_number, total_runs, status, next_run } = event;

    // Update live badge on the task row
    setLiveUpdates((prev) => ({
      ...prev,
      [task_id]: { run_number, total_runs, status, next_run },
    }));

    // Refresh task list so completed_runs counter updates
    bumpRefresh();

    // If this task is currently selected, refresh detail panel too
    setSelected((sel) => {
      if (sel?.task_id === task_id) {
        return { ...sel, _refresh: Date.now() };
      }
      return sel;
    });

    // Toast notification
    if (status === "failed") {
      addToast({
        type:    "error",
        title:   "Task run failed",
        message: `Run ${run_number}/${total_runs} failed`,
        duration: 7000,
      });
    } else {
      addToast({
        type:    "running",
        title:   "Task run completed",
        message: `Run ${run_number} of ${total_runs} succeeded`,
        duration: 4000,
      });
    }
  }, []);

  const handleCompleted = useCallback((event) => {
    const { task_id, total_runs_completed, has_output } = event;

    // Remove live badge
    setLiveUpdates((prev) => {
      const next = { ...prev };
      delete next[task_id];
      return next;
    });

    bumpRefresh();

    // Toast with optional download action
    addToast({
      type:     "completed",
      title:    "Task completed! 🎉",
      message:  `All ${total_runs_completed} runs finished.`,
      duration: has_output ? 10000 : 5000,
      action:   has_output ? {
        label:   "Download output",
        onClick: () => tasksApi.downloadOutput(task_id, "output"),
      } : undefined,
    });
  }, []);

  useTaskNotifications({
    onRunUpdate: handleRunUpdate,
    onCompleted: handleCompleted,
  });

  // ── Cancel Task Handler (from detail panel) ──────────────────────────────

  const handleCancelFromDetail = useCallback(async () => {
    bumpRefresh();
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={s.container}>

      {/* ── Left: task list ── */}
      <div style={s.left}>
        <div style={s.panelHeader}>
          Scheduled Tasks
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              onClick={() => setShowAddForm(v => !v)}
              title="Add new task"
              style={s.addBtn}
            >
              +
            </button>
            <button onClick={bumpRefresh} title="Refresh" style={s.refreshBtn}>↻</button>
          </div>
        </div>

        {/* ── Add Task Info Panel (inline) ── */}
        {showAddForm && (
          <div style={s.addForm}>
            <div style={s.addFormTitle}>Schedule a New Task</div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              Tasks are created through the AI agent. Go to the chat and ask something like:
            </div>
            <div style={{
              fontSize: 13, fontStyle: "italic",
              color: "var(--color-text-primary)",
              background: "var(--color-background-primary)",
              padding: "8px 12px", borderRadius: 6,
              border: "1px solid var(--color-border-tertiary)",
            }}>
              "Check gold prices every 3 hours"<br />
              "Search tech news every morning"<br />
              "Monitor website uptime every 30 minutes"
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
              <button
                onClick={() => setShowAddForm(false)}
                style={s.addFormCancelBtn}
              >
                Close
              </button>
            </div>
          </div>
        )}

        <div style={{ overflow: "auto", flex: 1 }}>
          <TaskList
            selectedTaskId={selected?.task_id}
            onSelect={setSelected}
            refreshSignal={refreshSignal}
            liveUpdates={liveUpdates}
          />
        </div>
      </div>

      {/* ── Right: task detail ── */}
      <div style={s.right}>
        <TaskDetail
          task={selected}
          onCancelled={handleCancelFromDetail}
        />
      </div>

      <TaskToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

const s = {
  container: {
    display: "flex", height: "100%", overflow: "hidden",
    background: "var(--color-background-primary)",
  },
  left: {
    width: 300, flexShrink: 0,
    borderRight: "1px solid var(--color-border-tertiary)",
    display: "flex", flexDirection: "column", overflow: "hidden",
  },
  right: {
    flex: 1, overflow: "auto", minWidth: 0,
  },
  panelHeader: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    fontSize: 12, fontWeight: 500,
    textTransform: "uppercase", letterSpacing: "0.06em",
    color: "var(--color-text-secondary)",
    borderBottom: "1px solid var(--color-border-tertiary)",
    flexShrink: 0,
  },
  refreshBtn: {
    background: "none", border: "none",
    cursor: "pointer", fontSize: 16,
    color: "var(--color-text-secondary)",
    lineHeight: 1, padding: "0 2px",
  },
  addBtn: {
    background: "none", border: "1px solid var(--color-border-tertiary)",
    cursor: "pointer", fontSize: 14, fontWeight: 600,
    color: "var(--color-text-secondary)",
    borderRadius: 4, width: 22, height: 22,
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.15s",
  },
  /* ── Add Task Info Panel Styles ── */
  addForm: {
    padding: "12px 14px",
    borderBottom: "1px solid var(--color-border-tertiary)",
    background: "var(--color-background-secondary)",
    display: "flex", flexDirection: "column", gap: 8,
    flexShrink: 0,
  },
  addFormTitle: {
    fontSize: 12, fontWeight: 600,
    textTransform: "uppercase", letterSpacing: "0.05em",
    color: "var(--color-text-secondary)",
    marginBottom: 2,
  },
  addFormCancelBtn: {
    padding: "6px 12px", borderRadius: 6, fontSize: 12,
    fontWeight: 500, cursor: "pointer",
    background: "transparent",
    color: "var(--color-text-secondary)",
    border: "1px solid var(--color-border-tertiary)",
  },
};
