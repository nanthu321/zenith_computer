import { useState, useCallback } from "react";
import TaskList             from "./TaskList";
import TaskDetail           from "./TaskDetail";
import TaskToastContainer   from "./TaskToast";
import useTaskNotifications from "../../hooks/useTaskNotifications";
import { tasksApi }         from "../../api/tasks";

let _toastId = 0;
function nextToastId() { return ++_toastId; }

export default function TaskManager() {
  const [selected,      setSelected]      = useState(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [toasts,        setToasts]        = useState([]);
  // Map of task_id → { run_number, status } for live row highlights
  const [liveUpdates,   setLiveUpdates]   = useState({});

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={s.container}>

      {/* ── Left: task list ── */}
      <div style={s.left}>
        <div style={s.panelHeader}>
          Scheduled Tasks
          <button onClick={bumpRefresh} title="Refresh" style={s.refreshBtn}>↻</button>
        </div>
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
          onCancelled={bumpRefresh}
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
};
