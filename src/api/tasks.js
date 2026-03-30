/**
 * tasks.js — Centralized Task API Layer
 *
 * All task-related API calls in one place.
 * Uses the centralized apiFetch() for auth, error handling, and mock support.
 *
 * Backend API Endpoints (actual servlet routes):
 *   1. GET    /api/tasks                    — List all tasks for authenticated user
 *      Implemented in TasksServlet.java
 *   2. GET    /api/tasks/{taskId}           — Get single task with merged live status + run_logs
 *      Implemented in TasksServlet.java
 *   3. POST   /api/task-cancel/{taskId}     — Cancel a task (updates DB → 'cancelled', best-effort executor cancel)
 *      Implemented in TaskCancelServlet.java
 *   4. GET    /api/task-download/{taskId}   — Download task output file (Flask agent → executor fallback)
 *      Implemented in TaskDownloadServlet.java
 *   5. GET    /api/tasks/notifications      — SSE stream for live task updates (proxies Flask agent events)
 *      Implemented in TaskNotificationsServlet.java
 *   6. POST   /internal/task-update         — Internal webhook (AI Agent / Task Executor only, NOT called from frontend)
 *      Pushes task_run_update and task_completed events. Implemented in TaskUpdateWebhookServlet.java
 *
 * ⚠️  OpenAPI spec mismatch:
 *   The OpenAPI spec documents cancel/download as:
 *     /api/tasks/{taskId}/cancel   and   /api/tasks/{taskId}/download
 *   But the actual implemented routes are:
 *     /api/task-cancel/{taskId}    and   /api/task-download/{taskId}
 *   This is due to servlet path mapping constraints in the Java backend.
 *
 * Note: Task creation happens server-side via the AI agent's `schedule_task` tool.
 * There is no direct POST /api/tasks endpoint for creating tasks from the frontend.
 */

import { apiFetch, downloadFile } from '../utils/api.js'

export const tasksApi = {
  /**
   * List all scheduled tasks for the authenticated user.
   * GET /api/tasks
   * @returns {Promise<Array>} Array of task objects
   */
  listTasks: () => apiFetch('/api/tasks'),

  /**
   * Get a single task by ID, including merged live status and run_logs.
   * GET /api/tasks/{taskId}
   * @param {string} taskId
   * @returns {Promise<Object>} Full task detail object
   */
  getTask: (taskId) => apiFetch(`/api/tasks/${encodeURIComponent(taskId)}`),

  /**
   * Cancel a scheduled or running task.
   * POST /api/task-cancel/{taskId}
   *
   * Updates DB status to 'cancelled' and sends a best-effort cancel
   * to the task executor.
   *
   * ⚠️  Note: The OpenAPI spec documents this as /api/tasks/{taskId}/cancel
   *     but the actual servlet route is /api/task-cancel/{taskId}.
   *
   * @param {string} taskId
   * @returns {Promise<Object>} { task_id, status: 'cancelled' }
   */
  cancelTask: (taskId) =>
    apiFetch(`/api/task-cancel/${encodeURIComponent(taskId)}`, { method: 'POST' }),

  /**
   * Download the output file of a completed task.
   * GET /api/task-download/{taskId}
   *
   * First tries the Flask agent, then falls back to the task executor.
   * Triggers a browser file download via the centralized downloadFile utility.
   *
   * ⚠️  Note: The OpenAPI spec documents this as /api/tasks/{taskId}/download
   *     but the actual servlet route is /api/task-download/{taskId}.
   *
   * @param {string} taskId
   * @param {string} [filename] — Optional filename hint (not used by backend)
   */
  downloadOutput: (taskId, filename) => {
    downloadFile(`/api/task-download/${encodeURIComponent(taskId)}`)
  },

  /**
   * Get the SSE notifications URL for live task updates.
   * Used by useTaskNotifications hook to open an EventSource.
   * GET /api/tasks/notifications?token=...
   *
   * @param {string} token — JWT auth token
   * @returns {string} Full SSE URL
   */
  getNotificationsUrl: (token) =>
    `/api/tasks/notifications?token=${encodeURIComponent(token || '')}`,
}
