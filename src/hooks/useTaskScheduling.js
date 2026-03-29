/**
 * useTaskScheduling
 *
 * Hooks into the SSE stream's tool_calls to detect `schedule_task` results
 * and automatically:
 *   1. Extract the new task data from the tool result
 *   2. Register it via TasksContext.addTaskFromResponse (links task → message)
 *   3. Trigger a task list refresh so the Tasks panel shows the new task
 *
 * Usage (in ChatPage or useChat):
 *   const { processToolCallsForTasks } = useTaskScheduling()
 *   // Call processToolCallsForTasks(messageId, toolCalls) inside onDone handler
 */

import { useCallback } from 'react'
import { useTasksContext } from '../context/TasksContext.jsx'

export function useTaskScheduling() {
  const { addTaskFromResponse, fetchTasks } = useTasksContext()

  /**
   * processToolCallsForTasks
   *
   * Scans completed tool_calls for schedule_task results.
   * For each found task, registers it in TasksContext and refreshes the list.
   *
   * @param {string|number} messageId  - The assistant message_id that triggered the task
   * @param {Array}         toolCalls  - Completed tool calls from the SSE stream
   */
  const processToolCallsForTasks = useCallback((messageId, toolCalls) => {
    if (!messageId || !Array.isArray(toolCalls) || toolCalls.length === 0) return

    const scheduleCalls = toolCalls.filter(
      tc => tc.tool === 'schedule_task' && tc.status === 'done' && tc.result
    )

    if (scheduleCalls.length === 0) return

    scheduleCalls.forEach(tc => {
      const result = tc.result
      if (!result) return

      // Extract task data from various possible result shapes
      const taskData = result.task || result.data || result
      if (!taskData || typeof taskData !== 'object') return

      // Ensure we have at least a task_id to work with
      const taskId = taskData.task_id || taskData.id
      if (!taskId) return

      console.log('[useTaskScheduling] Detected new task from schedule_task result:',
        taskId, '| messageId:', messageId)

      // Register task in context (adds to list + links to message)
      addTaskFromResponse(messageId, taskData)
    })

    // Refresh task list from API to get full server state.
    // Use a longer delay to let the backend commit the task and avoid
    // overlapping with other fetch calls. Force=true bypasses throttle.
    setTimeout(() => {
      fetchTasks(true).catch(err => {
        console.warn('[useTaskScheduling] Failed to refresh task list:', err.message)
      })
    }, 3000)
  }, [addTaskFromResponse, fetchTasks])

  return { processToolCallsForTasks }
}

export default useTaskScheduling
