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
  // Add task form state
  const [showAddForm,   setShowAddForm]   = useState(false);
  const [addingTask,    setAddingTask]    = useState(false);

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

  // ── Add Task Handler ──────────────────────────────────────────────────────

  const handleAddTask = useCallback(async (taskData) => {
    setAddingTask(true);
    try {
      const result = await tasksApi.addTask(taskData);
      setShowAddForm(false);
      bumpRefresh();
      addToast({
        type:     "success",
        title:    "Task scheduled! ⏰",
        message:  `"${taskData.description || 'New task'}" has been scheduled.`,
        duration: 5000,
      });
      return result;
    } catch (err) {
      addToast({
        type:     "error",
        title:    "Failed to add task",
        message:  err.message || "Could not schedule the task. Please try again.",
        duration: 7000,
      });
      throw err;
    } finally {
      setAddingTask(false);
    }
  }, []);

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

        {/* ── Add Task Form (inline) ── */}
        {showAddForm && (
          <AddTaskForm
            onSubmit={handleAddTask}
            onCancel={() => setShowAddForm(false)}
            isSubmitting={addingTask}
          />
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

/* ── Add Task Inline Form ─────────────────────────────────────────────────── */

function AddTaskForm({ onSubmit, onCancel, isSubmitting }) {
  const [description, setDescription] = useState("");
  const [intervalValue, setIntervalValue] = useState("1");
  const [intervalUnit, setIntervalUnit] = useState("hours");
  const [totalRuns, setTotalRuns] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState(null);

  const unitMultipliers = {
    seconds: 1,
    minutes: 60,
    hours: 3600,
    days: 86400,
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError("Please enter a task description");
      return;
    }

    const intervalNum = parseFloat(intervalValue);
    if (isNaN(intervalNum) || intervalNum <= 0) {
      setError("Please enter a valid interval");
      return;
    }

    const intervalSeconds = Math.round(intervalNum * unitMultipliers[intervalUnit]);

    const taskData = {
      description: description.trim(),
      interval_seconds: intervalSeconds,
      ...(totalRuns && parseInt(totalRuns) > 0 ? { total_runs: parseInt(totalRuns) } : {}),
      ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
    };

    try {
      await onSubmit(taskData);
      // Reset form on success
      setDescription("");
      setIntervalValue("1");
      setIntervalUnit("hours");
      setTotalRuns("");
      setPrompt("");
    } catch (err) {
      setError(err.message || "Failed to add task");
    }
  };

  return (
    <form onSubmit={handleSubmit} style={s.addForm}>
      <div style={s.addFormTitle}>Schedule New Task</div>

      {error && (
        <div style={s.addFormError}>{error}</div>
      )}

      <input
        type="text"
        placeholder="Task description *"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        style={s.addFormInput}
        autoFocus
        disabled={isSubmitting}
      />

      <textarea
        placeholder="Prompt / instructions for the AI agent (optional)"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        style={{ ...s.addFormInput, minHeight: 50, resize: "vertical", fontFamily: "inherit" }}
        rows={2}
        disabled={isSubmitting}
      />

      <div style={s.addFormRow}>
        <label style={s.addFormLabel}>Interval:</label>
        <input
          type="number"
          min="1"
          step="1"
          value={intervalValue}
          onChange={(e) => setIntervalValue(e.target.value)}
          style={{ ...s.addFormInput, width: 60, flex: "none" }}
          disabled={isSubmitting}
        />
        <select
          value={intervalUnit}
          onChange={(e) => setIntervalUnit(e.target.value)}
          style={s.addFormSelect}
          disabled={isSubmitting}
        >
          <option value="seconds">Seconds</option>
          <option value="minutes">Minutes</option>
          <option value="hours">Hours</option>
          <option value="days">Days</option>
        </select>
      </div>

      <div style={s.addFormRow}>
        <label style={s.addFormLabel}>Max runs:</label>
        <input
          type="number"
          min="0"
          step="1"
          placeholder="∞ (unlimited)"
          value={totalRuns}
          onChange={(e) => setTotalRuns(e.target.value)}
          style={{ ...s.addFormInput, flex: 1 }}
          disabled={isSubmitting}
        />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
        <button
          type="button"
          onClick={onCancel}
          style={s.addFormCancelBtn}
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          style={s.addFormSubmitBtn}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Scheduling…" : "⏰ Schedule Task"}
        </button>
      </div>
    </form>
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
  /* ── Add Task Form Styles ── */
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
  addFormError: {
    fontSize: 12, color: "#ef4444",
    background: "rgba(239,68,68,0.08)",
    padding: "6px 10px", borderRadius: 6,
  },
  addFormInput: {
    padding: "7px 10px", borderRadius: 6,
    border: "1px solid var(--color-border-tertiary)",
    background: "var(--color-background-primary)",
    color: "var(--color-text-primary)",
    fontSize: 13, outline: "none",
    width: "100%", boxSizing: "border-box",
  },
  addFormSelect: {
    padding: "7px 8px", borderRadius: 6,
    border: "1px solid var(--color-border-tertiary)",
    background: "var(--color-background-primary)",
    color: "var(--color-text-primary)",
    fontSize: 13, outline: "none", cursor: "pointer",
  },
  addFormRow: {
    display: "flex", alignItems: "center", gap: 8,
  },
  addFormLabel: {
    fontSize: 12, color: "var(--color-text-secondary)",
    flexShrink: 0, minWidth: 60,
  },
  addFormCancelBtn: {
    padding: "6px 12px", borderRadius: 6, fontSize: 12,
    fontWeight: 500, cursor: "pointer",
    background: "transparent",
    color: "var(--color-text-secondary)",
    border: "1px solid var(--color-border-tertiary)",
  },
  addFormSubmitBtn: {
    padding: "6px 14px", borderRadius: 6, fontSize: 12,
    fontWeight: 500, cursor: "pointer",
    background: "rgba(99,102,241,0.12)",
    color: "#6366f1",
    border: "1px solid rgba(99,102,241,0.3)",
  },
};
