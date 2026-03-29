/**
 * tasks.js — Centralized Task API Layer
 *
 * All task-related API calls in one place.
 * Uses the centralized apiFetch() for auth, error handling, and mock support.
 *
 * Backend API Endpoints (actual servlet routes):
 *   1. GET    /api/tasks                    — List all tasks for authenticated user
 *   2. GET    /api/tasks/{taskId}           — Get single task with run_logs
 *   3. POST   /api/task-cancel/{taskId}     — Cancel a scheduled/running task
 *   4. GET    /api/task-download/{taskId}   — Download task output file
 *   5. GET    /api/tasks/notifications      — SSE stream for live task updates
 *   6. POST   /internal/task-update         — Internal webhook (not called from frontend)
 *
 * NOTE: The OpenAPI spec documents cancel as /api/tasks/{taskId}/cancel and
 *       download as /api/tasks/{taskId}/download, but the actual backend servlet
 *       mapping is /api/task-cancel/{taskId} and /api/task-download/{taskId}.
 *       This module uses the ACTUAL backend routes.
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
   * @param {string} taskId
   * @returns {Promise<Object>} { task_id, status: 'cancelled' }
   */
  cancelTask: (taskId) =>
    apiFetch(`/api/task-cancel/${encodeURIComponent(taskId)}`, { method: 'POST' }),

  /**
   * Schedule a new task (add task).
   * POST /api/tasks
   *
   * @param {Object} taskData — Task creation payload
   * @param {string} taskData.description — Human-readable task description
   * @param {number} taskData.interval_seconds — Interval between runs in seconds
   * @param {number} [taskData.total_runs] — Maximum number of runs (0 = unlimited)
   * @param {string} [taskData.ends_at] — ISO date string for task end time
   * @param {string} [taskData.prompt] — The prompt/instruction for the AI agent
   * @param {Array}  [taskData.steps] — Steps for the task executor
   * @returns {Promise<Object>} Created task object with task_id
   */
  addTask: (taskData) =>
    apiFetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(taskData),
    }),

  /**
   * Download the output file of a completed task.
   * GET /api/task-download/{taskId}
   *
   * Triggers a browser file download via the centralized downloadFile utility.
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
