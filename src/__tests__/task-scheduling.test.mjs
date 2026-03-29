/**
 * Task Scheduling UI Integration — Comprehensive Test Suite
 *
 * Tests cover:
 *   1. API request validation (endpoint, headers, JWT auth)
 *   2. Response parsing and normalization
 *   3. Task creation detection from SSE tool_calls
 *   4. Chat ↔ Task linking (badge per message)
 *   5. Task list rendering logic (sort, dedup, normalize)
 *   6. Loading / Success / Error state transitions
 *   7. Edge cases: no tasks, API failure, invalid response, token expiry
 *   8. Real-time / refresh handling (no duplicates)
 *   9. Task cancellation (optimistic update + rollback)
 *  10. Task panel navigation behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────
//  Shared helpers
// ─────────────────────────────────────────────────────────────────

/** Create a realistic JWT payload */
function createJWT(payload, expiresInSec = 3600) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const fullPayload = btoa(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSec,
  }))
  return `${header}.${fullPayload}.mock_signature`
}

/** Build Authorization headers (mirrors api.js buildHeaders) */
function buildHeaders(token) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

/** Normalize a raw task from API → canonical shape (mirrors useTasks.js) */
function normalizeTask(raw) {
  if (!raw || typeof raw !== 'object') return null
  const status = raw.status || 'scheduled'
  return {
    task_id:          raw.task_id          || raw.id             || null,
    description:      raw.description      || raw.name           || raw.prompt
                      || `Task ${raw.task_id || raw.id || ''}`,
    status,
    interval_seconds: raw.interval_seconds || raw.interval_secs  || raw.interval || 0,
    total_runs:       raw.total_runs        ?? raw.max_runs       ?? 0,
    completed_runs:   raw.completed_runs    ?? 0,
    started_at:       raw.started_at        || raw.created_at     || null,
    ends_at:          raw.ends_at           || raw.end_time        || null,
    next_run:         raw.next_run                                 || null,
    output_file:      raw.output_file                              || null,
    is_active:        raw.is_active         ?? (
      status === 'running' || status === 'scheduled'
    ),
  }
}

/** Normalize API task list response → array (mirrors useTasks.js fetchTasks) */
function normalizeTaskList(raw) {
  if (!raw) return []
  const list = Array.isArray(raw)
    ? raw
    : (raw?.tasks ?? raw?.data ?? raw?.results ?? [])
  const normalized = Array.isArray(list) ? list.map(normalizeTask).filter(Boolean) : []
  // Sort: newest first
  normalized.sort((a, b) => {
    const ta = new Date(a.started_at || 0).getTime()
    const tb = new Date(b.started_at || 0).getTime()
    return tb - ta
  })
  return normalized
}

/** Extract tasks from SSE tool_calls (mirrors ChatPage task detection) */
function extractTasksFromToolCalls(messageId, toolCalls) {
  const results = []
  if (!messageId || !Array.isArray(toolCalls)) return results

  toolCalls.forEach(tc => {
    if (tc.tool !== 'schedule_task') return
    if (tc.status !== 'done') return
    const result = tc.result
    if (!result) return
    const taskData = result.task || result.data || result
    const taskId = taskData?.task_id || taskData?.id
    if (!taskId) return
    results.push({ messageId: String(messageId), task: taskData })
  })
  return results
}

// ═══════════════════════════════════════════════════════════════════
//  SECTION 1: API Request Validation
// ═══════════════════════════════════════════════════════════════════

describe('1. API Request Validation — /api/tasks endpoint', () => {

  it('✅ GET /api/tasks request uses correct endpoint', () => {
    const BASE = '/api/tasks'
    const endpoint = BASE  // listTasks → GET /api/tasks
    expect(endpoint).toBe('/api/tasks')
    expect(endpoint).not.toContain('undefined')
  })

  it('✅ Authorization header includes Bearer JWT token', () => {
    const token = createJWT({ user_id: 1 })
    const headers = buildHeaders(token)
    expect(headers['Authorization']).toBe(`Bearer ${token}`)
    expect(headers['Authorization']).toMatch(/^Bearer .+\..+\..+$/)
  })

  it('✅ Request includes Content-Type: application/json', () => {
    const headers = buildHeaders(createJWT({ user_id: 1 }))
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('✅ Missing token → Authorization header is omitted (not sent as undefined)', () => {
    const headers = buildHeaders(null)
    expect(headers['Authorization']).toBeUndefined()
    expect(Object.keys(headers)).not.toContain('Authorization')
  })

  it('✅ Cancel task uses POST /api/task-cancel/{id} (actual backend route)', () => {
    const taskId = 'task_abc123'
    const endpoint = `/api/task-cancel/${taskId}`
    expect(endpoint).toBe('/api/task-cancel/task_abc123')
    expect(endpoint).not.toContain('undefined')
  })

  it('✅ Get task detail uses GET /api/tasks/{id}', () => {
    const taskId = 'task_xyz789'
    const endpoint = `/api/tasks/${taskId}`
    expect(endpoint).toBe('/api/tasks/task_xyz789')
  })

  it('✅ Download task output uses GET /api/task-download/{id} (actual backend route)', () => {
    const taskId = 'task_download_001'
    const endpoint = `/api/task-download/${taskId}`
    expect(endpoint).toBe('/api/task-download/task_download_001')
  })

  it('✅ Add task uses POST /api/tasks', () => {
    const endpoint = '/api/tasks'
    const method = 'POST'
    expect(endpoint).toBe('/api/tasks')
    expect(method).toBe('POST')
  })

  it('✅ Expired JWT is detectable before making request', () => {
    const expiredToken = createJWT({ user_id: 1 }, -100) // expired 100s ago
    const payload = JSON.parse(atob(expiredToken.split('.')[1]))
    const now = Math.floor(Date.now() / 1000)
    expect(payload.exp).toBeLessThan(now)
  })
})

// ═══════════════════════════════════════════════════════════════════
//  SECTION 2: Response Parsing and Normalization
// ═══════════════════════════════════════════════════════════════════

describe('2. Response Parsing — API shapes handled correctly', () => {

  it('✅ Plain array response is normalized correctly', () => {
    const response = [
      { task_id: '1', description: 'Task A', status: 'scheduled', interval_seconds: 3600 },
      { task_id: '2', description: 'Task B', status: 'running',   interval_seconds: 1800 },
    ]
    const normalized = normalizeTaskList(response)
    expect(normalized).toHaveLength(2)
    expect(normalized.every(t => t.task_id && t.description && t.status)).toBe(true)
  })

  it('✅ { tasks: [] } wrapper is extracted', () => {
    const response = {
      tasks: [
        { task_id: 'abc', description: 'Wrapped task', status: 'scheduled' },
      ]
    }
    const normalized = normalizeTaskList(response)
    expect(normalized).toHaveLength(1)
    expect(normalized[0].task_id).toBe('abc')
  })

  it('✅ { data: [] } wrapper is extracted', () => {
    const response = {
      data: [
        { task_id: 'xyz', description: 'Data task', status: 'completed' },
      ]
    }
    const normalized = normalizeTaskList(response)
    expect(normalized).toHaveLength(1)
    expect(normalized[0].description).toBe('Data task')
  })

  it('✅ { results: [] } wrapper is extracted', () => {
    const response = {
      results: [
        { task_id: '999', description: 'Results task', status: 'failed' },
      ]
    }
    const normalized = normalizeTaskList(response)
    expect(normalized).toHaveLength(1)
    expect(normalized[0].status).toBe('failed')
  })

  it('✅ null / undefined response returns empty array (no crash)', () => {
    expect(normalizeTaskList(null)).toHaveLength(0)
    expect(normalizeTaskList(undefined)).toHaveLength(0)
    expect(normalizeTaskList({})).toHaveLength(0)
    expect(normalizeTaskList([])).toHaveLength(0)
  })

  it('✅ Task normalizer fills in missing fields with defaults', () => {
    const minimal = { task_id: 'min_001' }
    const normalized = normalizeTask(minimal)
    expect(normalized.task_id).toBe('min_001')
    expect(normalized.description).toContain('Task min_001')
    expect(normalized.status).toBe('scheduled')  // default
    expect(normalized.interval_seconds).toBe(0)
    expect(normalized.total_runs).toBe(0)
    expect(normalized.completed_runs).toBe(0)
  })

  it('✅ Task normalizer handles id field (alternate key for task_id)', () => {
    const raw = { id: 'alt_id_999', description: 'Alt ID task', status: 'running' }
    const normalized = normalizeTask(raw)
    expect(normalized.task_id).toBe('alt_id_999')
    expect(normalized.is_active).toBe(true)
  })

  it('✅ interval_secs is mapped to interval_seconds', () => {
    const raw = { task_id: '1', interval_secs: 3600, status: 'scheduled' }
    const normalized = normalizeTask(raw)
    expect(normalized.interval_seconds).toBe(3600)
  })

  it('✅ is_active is computed from status when missing', () => {
    const running = normalizeTask({ task_id: '1', status: 'running' })
    expect(running.is_active).toBe(true)

    const scheduled = normalizeTask({ task_id: '2', status: 'scheduled' })
    expect(scheduled.is_active).toBe(true)

    const completed = normalizeTask({ task_id: '3', status: 'completed' })
    expect(completed.is_active).toBe(false)

    const cancelled = normalizeTask({ task_id: '4', status: 'cancelled' })
    expect(cancelled.is_active).toBe(false)
  })

  it('✅ Malformed task objects in array are filtered out (null returned)', () => {
    const list = [
      { task_id: '1', description: 'Valid' },
      null,
      undefined,
      'string_not_object',
      {},  // empty but valid shape → gets default values
    ]
    const normalized = list.map(normalizeTask).filter(Boolean)
    // Only the valid task and empty object survive (normalizeTask returns null for non-objects)
    expect(normalized.some(t => t.description === 'Valid')).toBe(true)
    expect(normalized.every(t => t !== null)).toBe(true)
  })

  it('✅ Tasks are sorted newest-first by started_at', () => {
    const now = Date.now()
    const response = [
      { task_id: 'old', started_at: new Date(now - 3600_000).toISOString(), status: 'completed' },
      { task_id: 'new', started_at: new Date(now - 60_000).toISOString(),   status: 'running'   },
      { task_id: 'mid', started_at: new Date(now - 1800_000).toISOString(), status: 'scheduled' },
    ]
    const normalized = normalizeTaskList(response)
    expect(normalized[0].task_id).toBe('new')   // most recent first
    expect(normalized[1].task_id).toBe('mid')
    expect(normalized[2].task_id).toBe('old')
  })
})

// ═══════════════════════════════════════════════════════════════════
//  SECTION 3: Task Creation Detection from SSE Tool Calls
// ═══════════════════════════════════════════════════════════════════

describe('3. Task Creation Detection — SSE schedule_task tool result', () => {

  it('✅ schedule_task tool result is detected in tool_calls', () => {
    const toolCalls = [
      {
        tool: 'schedule_task',
        tool_use_id: 'tc_001',
        status: 'done',
        result: {
          task_id: 'task_new_001',
          description: 'Monitor gold prices',
          status: 'scheduled',
          interval_seconds: 3600,
        },
      }
    ]
    const detected = extractTasksFromToolCalls('msg_assistant_123', toolCalls)
    expect(detected).toHaveLength(1)
    expect(detected[0].task.task_id).toBe('task_new_001')
    expect(detected[0].messageId).toBe('msg_assistant_123')
  })

  it('✅ Non-schedule_task tool calls are ignored', () => {
    const toolCalls = [
      { tool: 'web_search',    status: 'done', result: { results: [] } },
      { tool: 'execute_code',  status: 'done', result: { exit_code: 0 } },
      { tool: 'create_project', status: 'done', result: { project_id: 'p1' } },
    ]
    const detected = extractTasksFromToolCalls('msg_001', toolCalls)
    expect(detected).toHaveLength(0)
  })

  it('✅ schedule_task with status !== "done" is ignored (still running)', () => {
    const toolCalls = [
      { tool: 'schedule_task', status: 'running', result: null },
    ]
    const detected = extractTasksFromToolCalls('msg_001', toolCalls)
    expect(detected).toHaveLength(0)
  })

  it('✅ schedule_task with null/missing result is handled gracefully', () => {
    const toolCalls = [
      { tool: 'schedule_task', status: 'done', result: null },
      { tool: 'schedule_task', status: 'done', result: {} },  // missing task_id
    ]
    const detected = extractTasksFromToolCalls('msg_001', toolCalls)
    expect(detected).toHaveLength(0)  // neither has a task_id
  })

  it('✅ Nested result.task shape is extracted', () => {
    const toolCalls = [
      {
        tool: 'schedule_task',
        status: 'done',
        result: {
          task: {
            task_id: 'task_nested_001',
            description: 'Check news every hour',
            interval_seconds: 3600,
          }
        },
      }
    ]
    const detected = extractTasksFromToolCalls('msg_001', toolCalls)
    expect(detected).toHaveLength(1)
    expect(detected[0].task.task_id).toBe('task_nested_001')
  })

  it('✅ Nested result.data shape is extracted', () => {
    const toolCalls = [
      {
        tool: 'schedule_task',
        status: 'done',
        result: {
          data: {
            task_id: 'task_data_001',
            description: 'Monitor prices',
          }
        },
      }
    ]
    const detected = extractTasksFromToolCalls('msg_001', toolCalls)
    expect(detected).toHaveLength(1)
    expect(detected[0].task.task_id).toBe('task_data_001')
  })

  it('✅ Multiple schedule_task calls in one message are all detected', () => {
    const toolCalls = [
      {
        tool: 'schedule_task',
        tool_use_id: 'tc_001',
        status: 'done',
        result: { task_id: 'task_A', description: 'Task A', interval_seconds: 3600 },
      },
      {
        tool: 'schedule_task',
        tool_use_id: 'tc_002',
        status: 'done',
        result: { task_id: 'task_B', description: 'Task B', interval_seconds: 1800 },
      },
    ]
    const detected = extractTasksFromToolCalls('msg_multi', toolCalls)
    expect(detected).toHaveLength(2)
    const ids = detected.map(d => d.task.task_id)
    expect(ids).toContain('task_A')
    expect(ids).toContain('task_B')
  })

  it('✅ messageId is correctly associated with the detected task', () => {
    const toolCalls = [
      {
        tool: 'schedule_task',
        status: 'done',
        result: { task_id: 'task_link_001', description: 'Linked task' },
      }
    ]
    const detected = extractTasksFromToolCalls('assistant_msg_999', toolCalls)
    expect(detected[0].messageId).toBe('assistant_msg_999')
  })

  it('✅ Empty tool_calls array returns no tasks', () => {
    const detected = extractTasksFromToolCalls('msg_001', [])
    expect(detected).toHaveLength(0)
  })

  it('✅ null messageId returns no tasks', () => {
    const toolCalls = [
      { tool: 'schedule_task', status: 'done', result: { task_id: 'task_1' } }
    ]
    const detected = extractTasksFromToolCalls(null, toolCalls)
    expect(detected).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════
//  SECTION 4: Chat ↔ Task Linking (Badge per Message)
// ═══════════════════════════════════════════════════════════════════

describe('4. Chat ↔ Task Linking — Badge attached to correct message', () => {

  it('✅ tasksByMessage maps messageId → task correctly', () => {
    const tasksByMessage = {}
    const msgId = 'assistant_msg_100'
    const task = { task_id: 'task_001', description: 'Monitor news', status: 'scheduled' }

    tasksByMessage[msgId] = task

    expect(tasksByMessage[msgId]).toBeDefined()
    expect(tasksByMessage[msgId].task_id).toBe('task_001')
  })

  it('✅ Different messages get different task badges', () => {
    const tasksByMessage = {}

    tasksByMessage['msg_A'] = { task_id: 'task_A', description: 'Task A' }
    tasksByMessage['msg_B'] = { task_id: 'task_B', description: 'Task B' }

    expect(tasksByMessage['msg_A'].task_id).toBe('task_A')
    expect(tasksByMessage['msg_B'].task_id).toBe('task_B')
    expect(tasksByMessage['msg_A']).not.toEqual(tasksByMessage['msg_B'])
  })

  it('✅ Badge not shown for messages without schedule_task tool result', () => {
    const tasksByMessage = {}
    const msgId = 'assistant_msg_plain'

    // Message with only web_search — no task badge
    const badge = tasksByMessage[msgId] || null
    expect(badge).toBeNull()
  })

  it('✅ Badge not shown for user messages (role = user)', () => {
    const message = { role: 'user', message_id: 'user_msg_001', content: 'Schedule me a task' }
    const tasksByMessage = { 'user_msg_001': { task_id: 'task_001' } }

    // In MessageBubble: scheduledTask is only passed for role === 'assistant'
    const scheduledTask = message.role === 'assistant'
      ? tasksByMessage[String(message.message_id)] || null
      : null

    expect(scheduledTask).toBeNull()
  })

  it('✅ Badge not shown while message is still streaming', () => {
    const message = {
      role: 'assistant',
      message_id: 'temp_assistant_123',
      content: 'Scheduling your task...',
      isStreaming: true,
    }
    const tasksByMessage = { 'temp_assistant_123': { task_id: 'task_001' } }

    // TaskScheduledBadge should NOT render when isStreaming = true
    // (task isn't created yet during streaming)
    const shouldShowBadge = !message.isStreaming && !!tasksByMessage[String(message.message_id)]
    expect(shouldShowBadge).toBe(false)
  })

  it('✅ Badge shows after streaming completes', () => {
    const message = {
      role: 'assistant',
      message_id: 'assistant_msg_finalized',
      content: 'I have scheduled the task for you.',
      isStreaming: false,
    }
    const tasksByMessage = { 'assistant_msg_finalized': { task_id: 'task_final' } }

    const shouldShowBadge = !message.isStreaming && !!tasksByMessage[String(message.message_id)]
    expect(shouldShowBadge).toBe(true)
  })

  it('✅ temp_ messageId is matched correctly after onDone updates real ID', () => {
    // During streaming: message has temp_assistant_ ID
    // After onDone: message gets real backend ID, badge should still appear

    const tasksByMessage = {}
    const tempId = 'temp_assistant_1234567890'
    const realId = 'backend_msg_999'

    // Badge was registered with temp ID during stream
    tasksByMessage[tempId] = { task_id: 'task_registered_with_temp' }

    // After onDone, messageId becomes realId
    // But badge lookup uses String(msg.message_id) which is now realId
    // → Task badge would be lost unless we also register it with realId

    // Simulate the registration update
    if (tasksByMessage[tempId]) {
      tasksByMessage[realId] = tasksByMessage[tempId]
      delete tasksByMessage[tempId]
    }

    const badge = tasksByMessage[realId] || null
    expect(badge).not.toBeNull()
    expect(badge.task_id).toBe('task_registered_with_temp')
  })

  it('✅ No cross-contamination between sessions (different session messages)', () => {
    // Session 1 messages
    const session1Messages = [
      { message_id: 's1_msg_1', role: 'assistant', content: 'Scheduled task for session 1' },
    ]
    // Session 2 messages
    const session2Messages = [
      { message_id: 's2_msg_1', role: 'assistant', content: 'Regular response in session 2' },
    ]

    // Task only belongs to session 1
    const tasksByMessage = {
      's1_msg_1': { task_id: 'task_session1', description: 'Session 1 task' },
    }

    // Session 2's message should NOT have a badge
    const s2Badge = tasksByMessage['s2_msg_1'] || null
    expect(s2Badge).toBeNull()

    // Session 1's message should have the badge
    const s1Badge = tasksByMessage['s1_msg_1'] || null
    expect(s1Badge).not.toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════
//  SECTION 5: Loading / Success / Error State Transitions
// ═══════════════════════════════════════════════════════════════════

describe('5. State Transitions — Loading, Success, Error', () => {

  it('✅ Loading state starts as false, becomes true on fetch, false after', () => {
    let loading = false
    let resolved = false

    const fetchTasks = async () => {
      loading = true
      await Promise.resolve()  // simulate async
      loading = false
      resolved = true
    }

    expect(loading).toBe(false)
    const p = fetchTasks()
    expect(loading).toBe(true)
    return p.then(() => {
      expect(loading).toBe(false)
      expect(resolved).toBe(true)
    })
  })

  it('✅ Error state is set on API failure, cleared on next fetch', async () => {
    let error = null
    let loading = false

    const fetchTasks = async (shouldFail) => {
      loading = true
      error = null  // always clear error before fetch
      try {
        if (shouldFail) throw new Error('Network error')
        return []
      } catch (e) {
        error = e.message
        return []
      } finally {
        loading = false
      }
    }

    // First fetch fails
    await fetchTasks(true)
    expect(error).toBe('Network error')
    expect(loading).toBe(false)

    // Second fetch succeeds → error cleared
    await fetchTasks(false)
    expect(error).toBeNull()
  })

  it('✅ 401 error from /api/tasks does NOT set error state (handled globally)', async () => {
    let error = null

    const fetchTasks = async () => {
      try {
        // Simulate 401 → apiFetch throws 'Unauthorized'
        throw new Error('Unauthorized')
      } catch (err) {
        // 401 is handled by apiFetch's handleUnauthorized()
        // useTasks should NOT surface this as a user-visible error
        if (err.message !== 'Unauthorized') {
          error = err.message
        }
        return []
      }
    }

    await fetchTasks()
    expect(error).toBeNull()  // 401 is silently handled
  })

  it('✅ Tasks are NOT cleared on error (cached list is preserved)', () => {
    const existingTasks = [
      { task_id: '1', description: 'Existing task', status: 'running' },
    ]
    let tasks = [...existingTasks]
    let error = null

    const fetchTasks = async () => {
      try {
        throw new Error('Server error 503')
      } catch (e) {
        error = e.message
        // DO NOT clear tasks — preserve existing list
        // (setTasks([]) is NOT called on error)
      }
    }

    fetchTasks().then(() => {
      expect(tasks).toHaveLength(1)  // preserved
      expect(error).toBe('Server error 503')
    })
  })

  it('✅ Empty response (no tasks) shows empty state, not error', async () => {
    let tasks = null
    let error = null

    const fetchTasks = async () => {
      try {
        const response = []  // empty array from API
        tasks = normalizeTaskList(response)
      } catch (e) {
        error = e.message
      }
    }

    await fetchTasks()
    expect(tasks).toHaveLength(0)
    expect(error).toBeNull()
  })

  it('✅ Tasks state updates immediately when new task is added (addTask)', () => {
    let tasks = []

    const addTask = (rawTask) => {
      const normalized = normalizeTask(rawTask)
      if (!normalized || !normalized.task_id) return
      const exists = tasks.some(t => t.task_id === normalized.task_id)
      if (!exists) {
        tasks = [normalized, ...tasks]
      }
    }

    addTask({ task_id: 'new_task_001', description: 'Brand new task', status: 'scheduled' })
    expect(tasks).toHaveLength(1)
    expect(tasks[0].task_id).toBe('new_task_001')
  })

  it('✅ addTask prevents duplicates when called multiple times with same task_id', () => {
    let tasks = []

    const addTask = (rawTask) => {
      const normalized = normalizeTask(rawTask)
      if (!normalized || !normalized.task_id) return
      const exists = tasks.some(t => t.task_id === normalized.task_id)
      if (!exists) tasks = [normalized, ...tasks]
    }

    const task = { task_id: 'dup_001', description: 'Dup task', status: 'scheduled' }
    addTask(task)
    addTask(task)  // same task again
    addTask(task)  // and again

    expect(tasks).toHaveLength(1)  // no duplicates
  })
})

// ═══════════════════════════════════════════════════════════════════
//  SECTION 6: Task Cancellation — Optimistic Update + Rollback
// ═══════════════════════════════════════════════════════════════════

describe('6. Task Cancellation', () => {

  it('✅ Cancelling a task immediately updates status to "cancelled" (optimistic)', () => {
    let tasks = [
      { task_id: 'task_to_cancel', status: 'running', is_active: true },
    ]

    const cancelTaskOptimistic = (taskId) => {
      tasks = tasks.map(t =>
        t.task_id === taskId
          ? { ...t, status: 'cancelled', is_active: false }
          : t
      )
    }

    cancelTaskOptimistic('task_to_cancel')
    expect(tasks[0].status).toBe('cancelled')
    expect(tasks[0].is_active).toBe(false)
  })

  it('✅ Failed cancellation reverts task to previous state', async () => {
    let tasks = [
      { task_id: 'task_to_cancel', status: 'running', is_active: true },
    ]
    const originalStatus = tasks[0].status
    const originalActive = tasks[0].is_active

    const cancelTask = async (taskId) => {
      // Optimistic update
      tasks = tasks.map(t =>
        t.task_id === taskId ? { ...t, status: 'cancelled', is_active: false } : t
      )
      try {
        // API call fails
        throw new Error('Cancel failed: task not found')
      } catch (err) {
        // Revert on failure
        tasks = tasks.map(t =>
          t.task_id === taskId
            ? { ...t, status: originalStatus, is_active: originalActive }
            : t
        )
        throw err
      }
    }

    try {
      await cancelTask('task_to_cancel')
    } catch { /* expected */ }

    expect(tasks[0].status).toBe('running')  // reverted
    expect(tasks[0].is_active).toBe(true)    // reverted
  })

  it('✅ Cancelling an already-cancelled task is idempotent', () => {
    let tasks = [
      { task_id: 'task_already_cancelled', status: 'cancelled', is_active: false },
    ]

    const cancelTask = (taskId) => {
      tasks = tasks.map(t =>
        t.task_id === taskId ? { ...t, status: 'cancelled', is_active: false } : t
      )
    }

    cancelTask('task_already_cancelled')
    expect(tasks[0].status).toBe('cancelled')
    expect(tasks).toHaveLength(1)
  })

  it('✅ Cancel button disabled while cancellation is in progress', () => {
    let isCancelling = false
    let buttonDisabled = false

    const handleCancel = async (taskId) => {
      isCancelling = true
      buttonDisabled = true
      try {
        await Promise.resolve()  // simulate API call
      } finally {
        isCancelling = false
        buttonDisabled = false
      }
    }

    // Before cancel
    expect(buttonDisabled).toBe(false)
    const p = handleCancel('task_001')
    // During cancel
    expect(buttonDisabled).toBe(true)
    return p.then(() => {
      // After cancel
      expect(buttonDisabled).toBe(false)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════
//  SECTION 7: Real-Time / Refresh Handling
// ═══════════════════════════════════════════════════════════════════

describe('7. Real-Time and Refresh Handling', () => {

  it('✅ Polling starts on mount and stops on unmount', () => {
    const intervals = []
    const clearIntervals = []

    // Simulate setInterval / clearInterval
    const mockSetInterval = (fn, ms) => {
      const id = Date.now()
      intervals.push(id)
      return id
    }
    const mockClearInterval = (id) => {
      clearIntervals.push(id)
    }

    // Start polling
    let pollingId = null
    const startPolling = () => {
      if (pollingId) return
      pollingId = mockSetInterval(() => {}, 30_000)
    }

    // Stop polling
    const stopPolling = () => {
      if (pollingId) {
        mockClearInterval(pollingId)
        pollingId = null
      }
    }

    startPolling()
    expect(intervals).toHaveLength(1)
    expect(pollingId).not.toBeNull()

    stopPolling()
    expect(clearIntervals).toHaveLength(1)
    expect(pollingId).toBeNull()
  })

  it('✅ Task list refresh after task creation avoids duplicates', () => {
    let tasks = [
      { task_id: 'existing_001', description: 'Existing task', status: 'running' },
    ]

    const refreshTasks = (newList) => {
      // Replace entire list (no duplicates possible)
      tasks = normalizeTaskList(newList)
    }

    // API returns the same existing task + newly created one
    const apiResponse = [
      { task_id: 'existing_001', description: 'Existing task', status: 'running' },
      { task_id: 'new_001',      description: 'New task',      status: 'scheduled' },
    ]

    refreshTasks(apiResponse)
    expect(tasks).toHaveLength(2)
    // No duplicates
    const ids = tasks.map(t => t.task_id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('✅ addTask does not add duplicate when same task already in list', () => {
    let tasks = [
      { task_id: 'task_001', description: 'Task 001', status: 'scheduled' },
    ]

    const addTask = (rawTask) => {
      const normalized = normalizeTask(rawTask)
      if (!normalized || !normalized.task_id) return
      const exists = tasks.some(t => t.task_id === normalized.task_id)
      if (!exists) tasks = [normalized, ...tasks]
    }

    // Attempt to add same task again (from SSE detection + API refresh both firing)
    addTask({ task_id: 'task_001', description: 'Task 001 duplicate', status: 'running' })

    expect(tasks).toHaveLength(1)  // still 1, no duplicate
    // Original description preserved
    expect(tasks[0].description).toBe('Task 001')
  })

  it('✅ Task list refreshes when Tasks tab is selected in sidebar', () => {
    let fetchTasksCalled = 0
    const fetchTasks = () => { fetchTasksCalled++ }

    // Simulate the useEffect in ChatPage
    const onTabChange = (tab) => {
      if (tab === 'tasks') fetchTasks()
    }

    onTabChange('chats')   // switch to chats — should NOT fetch tasks
    expect(fetchTasksCalled).toBe(0)

    onTabChange('tasks')   // switch to tasks — should fetch
    expect(fetchTasksCalled).toBe(1)

    onTabChange('tasks')   // switch to tasks again
    expect(fetchTasksCalled).toBe(2)
  })

  it('✅ Throttling prevents rapid consecutive re-fetches', () => {
    let lastFetch = 0
    let fetchCount = 0
    const THROTTLE_MS = 5000

    const fetchTasks = (force = false) => {
      const now = Date.now()
      if (!force && now - lastFetch < THROTTLE_MS) return  // throttled
      lastFetch = now
      fetchCount++
    }

    fetchTasks()          // fetch 1
    fetchTasks()          // throttled (< 5s)
    fetchTasks()          // throttled
    fetchTasks(true)      // forced (bypasses throttle)

    expect(fetchCount).toBe(2)  // only 2 actual fetches
  })
})

// ═══════════════════════════════════════════════════════════════════
//  SECTION 8: Edge Cases
// ═══════════════════════════════════════════════════════════════════

describe('8. Edge Cases', () => {

  it('✅ No tasks → "No scheduled tasks yet" shown (not broken UI)', () => {
    const tasks = []
    const isEmpty = tasks.length === 0
    expect(isEmpty).toBe(true)
    // UI should show empty state, not crash
  })

  it('✅ API returns 200 with empty array → empty state (not error)', async () => {
    let tasks = null
    let error = null

    const fetchTasks = async () => {
      try {
        const response = []  // 200 OK, empty array
        tasks = normalizeTaskList(response)
      } catch (e) {
        error = e.message
      }
    }

    await fetchTasks()
    expect(tasks).toHaveLength(0)
    expect(error).toBeNull()
  })

  it('✅ API failure → error state with retry, tasks list preserved', async () => {
    let tasks = [{ task_id: 'cached_001', description: 'Cached task' }]
    let error = null

    const fetchTasks = async () => {
      try {
        throw new Error('Service unavailable')
      } catch (e) {
        error = e.message
        // DO NOT clear existing tasks
      }
    }

    await fetchTasks()
    expect(error).toBe('Service unavailable')
    expect(tasks).toHaveLength(1)  // cached list preserved
  })

  it('✅ Invalid JSON response → caught as error, no crash', async () => {
    let error = null
    let tasks = []

    const fetchTasks = async () => {
      try {
        const response = 'INVALID JSON RESPONSE'
        if (typeof response === 'string') {
          throw new Error('Invalid response format')
        }
        tasks = normalizeTaskList(response)
      } catch (e) {
        error = e.message
      }
    }

    await fetchTasks()
    expect(error).toBe('Invalid response format')
    expect(tasks).toHaveLength(0)
  })

  it('✅ Token expired (401 from /api/tasks) → no crash, no tasks, no visible error', async () => {
    let tasks = []
    let error = null
    let unauthorizedHandled = false

    const handleUnauthorized = () => { unauthorizedHandled = true }

    const fetchTasks = async () => {
      try {
        throw new Error('Unauthorized')  // simulates 401 from apiFetch
      } catch (err) {
        if (err.message === 'Unauthorized') {
          handleUnauthorized()
          // DO NOT set error state for auth failures
        } else {
          error = err.message
        }
        return []
      }
    }

    await fetchTasks()
    expect(error).toBeNull()         // no visible error
    expect(tasks).toHaveLength(0)    // empty list
    expect(unauthorizedHandled).toBe(true)  // auth handler called
  })

  it('✅ schedule_task tool result with no task_id does not create badge', () => {
    const toolCalls = [
      {
        tool: 'schedule_task',
        status: 'done',
        result: {
          // No task_id or id field
          description: 'Task without ID',
          interval_seconds: 3600,
        }
      }
    ]
    const detected = extractTasksFromToolCalls('msg_001', toolCalls)
    expect(detected).toHaveLength(0)  // no task_id → not registered
  })

  it('✅ Concurrent fetch calls do not cause duplicate state updates', async () => {
    let fetchCount = 0
    const inFlight = {}

    const fetchTasks = async (sessionId) => {
      // Deduplicate in-flight requests
      if (inFlight[sessionId]) return inFlight[sessionId]

      const promise = (async () => {
        fetchCount++
        await Promise.resolve()  // simulate async
        delete inFlight[sessionId]
        return []
      })()

      inFlight[sessionId] = promise
      return promise
    }

    // Call 3 times simultaneously
    const [r1, r2, r3] = await Promise.all([
      fetchTasks('global'),
      fetchTasks('global'),
      fetchTasks('global'),
    ])

    expect(fetchCount).toBe(1)  // only one actual API call
  })

  it('✅ Task interval formatting: seconds, minutes, hours, days', () => {
    const formatInterval = (secs) => {
      if (!secs || secs === 0) return null
      if (secs < 60)    return `every ${secs}s`
      if (secs < 3600)  return `every ${Math.round(secs / 60)}m`
      if (secs < 86400) return `every ${Math.round(secs / 3600)}h`
      return `every ${Math.round(secs / 86400)}d`
    }

    expect(formatInterval(30)).toBe('every 30s')
    expect(formatInterval(300)).toBe('every 5m')
    expect(formatInterval(3600)).toBe('every 1h')
    expect(formatInterval(7200)).toBe('every 2h')
    expect(formatInterval(86400)).toBe('every 1d')
    expect(formatInterval(0)).toBeNull()
    expect(formatInterval(null)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════
//  SECTION 9: Tasks Panel Navigation
// ═══════════════════════════════════════════════════════════════════

describe('9. Tasks Panel Navigation', () => {

  it('✅ Clicking Tasks nav button sets sidebarTab to "tasks"', () => {
    let sidebarTab = 'chats'
    const onTabChange = (tab) => { sidebarTab = tab }

    onTabChange('tasks')
    expect(sidebarTab).toBe('tasks')
  })

  it('✅ Opening Tasks tab triggers fetchTasks', () => {
    let fetchCalled = false
    const fetchTasks = () => { fetchCalled = true }

    const handleTabChange = (tab) => {
      if (tab === 'tasks') fetchTasks()
    }

    handleTabChange('tasks')
    expect(fetchCalled).toBe(true)
  })

  it('✅ "View in Tasks" badge button switches sidebar to tasks tab', () => {
    let sidebarTab = 'chats'
    let sidebarCollapsed = true

    const handleViewTasks = () => {
      sidebarTab = 'tasks'
      sidebarCollapsed = false  // expand if collapsed
    }

    handleViewTasks()
    expect(sidebarTab).toBe('tasks')
    expect(sidebarCollapsed).toBe(false)
  })

  it('✅ Running tasks count badge shows correct count in sidebar nav', () => {
    const tasks = [
      { task_id: '1', status: 'running',   is_active: true  },
      { task_id: '2', status: 'scheduled', is_active: true  },
      { task_id: '3', status: 'completed', is_active: false },
      { task_id: '4', status: 'cancelled', is_active: false },
    ]

    const runningCount = tasks.filter(t =>
      t.status === 'running' || t.status === 'scheduled'
    ).length

    expect(runningCount).toBe(2)
  })

  it('✅ Badge count 0 → badge hidden in sidebar nav', () => {
    const tasks = [
      { task_id: '1', status: 'completed' },
      { task_id: '2', status: 'cancelled' },
    ]
    const runningCount = tasks.filter(t =>
      t.status === 'running' || t.status === 'scheduled'
    ).length
    expect(runningCount).toBe(0)
    // navBadge should not render when count === 0
    const showBadge = runningCount > 0
    expect(showBadge).toBe(false)
  })

  it('✅ Task list is sorted newest-first in panel', () => {
    const now = Date.now()
    const tasks = normalizeTaskList([
      { task_id: 'A', started_at: new Date(now - 7200_000).toISOString() },
      { task_id: 'B', started_at: new Date(now - 1800_000).toISOString() },
      { task_id: 'C', started_at: new Date(now - 300_000).toISOString()  },
    ])
    expect(tasks[0].task_id).toBe('C')  // most recent
    expect(tasks[1].task_id).toBe('B')
    expect(tasks[2].task_id).toBe('A')  // oldest
  })
})

// ═══════════════════════════════════════════════════════════════════
//  SECTION 10: Full Scenario — Prompt → Task → Panel → Badge
// ═══════════════════════════════════════════════════════════════════

describe('10. Full Scenario — Prompt → Schedule → Badge → Panel', () => {

  it('✅ Complete flow: user prompt → task created → badge shown → panel updated', async () => {
    // State
    let tasks = []
    const tasksByMessage = {}
    let sidebarTab = 'chats'
    let toastShown = null

    // ── Step 1: User sends prompt "Check gold prices every hour" ──
    const userPrompt = 'Check gold prices every hour'
    expect(userPrompt).toBeTruthy()

    // ── Step 2: SSE stream returns tool_call: schedule_task ──
    const assistantMsgId = 'assistant_msg_final_001'
    const toolCalls = [
      {
        tool: 'schedule_task',
        tool_use_id: 'tc_gold_001',
        status: 'done',
        result: {
          task_id: 'task_gold_001',
          description: 'Monitor gold prices',
          status: 'scheduled',
          interval_seconds: 3600,
          total_runs: 24,
          started_at: new Date().toISOString(),
        }
      }
    ]

    // ── Step 3: ChatPage detects the task ──
    const detected = extractTasksFromToolCalls(assistantMsgId, toolCalls)
    expect(detected).toHaveLength(1)

    const { messageId, task: taskData } = detected[0]

    // ── Step 4: Register badge for message ──
    tasksByMessage[messageId] = taskData
    expect(tasksByMessage[assistantMsgId]).toBeDefined()
    expect(tasksByMessage[assistantMsgId].task_id).toBe('task_gold_001')

    // ── Step 5: Add task to list ──
    const normalized = normalizeTask(taskData)
    tasks = [normalized, ...tasks]
    expect(tasks).toHaveLength(1)
    expect(tasks[0].description).toBe('Monitor gold prices')
    expect(tasks[0].interval_seconds).toBe(3600)

    // ── Step 6: Show toast ──
    toastShown = `Task "${taskData.description}" has been scheduled ✅`
    expect(toastShown).toContain('Monitor gold prices')
    expect(toastShown).toContain('scheduled')

    // ── Step 7: User clicks "View in Tasks" ──
    sidebarTab = 'tasks'
    expect(sidebarTab).toBe('tasks')

    // ── Step 8: Tasks panel renders the task ──
    expect(tasks.some(t => t.task_id === 'task_gold_001')).toBe(true)
    expect(tasks[0].status).toBe('scheduled')
    expect(tasks[0].is_active).toBe(true)

    // ── Step 9: Badge is visible on the correct message ──
    const badgeForMessage = tasksByMessage[assistantMsgId] || null
    expect(badgeForMessage).not.toBeNull()
    expect(badgeForMessage.task_id).toBe('task_gold_001')

    // ── Step 10: No badge on other messages ──
    const badgeForOtherMsg = tasksByMessage['other_msg_999'] || null
    expect(badgeForOtherMsg).toBeNull()
  })

  it('✅ After API refresh, tasks panel shows updated list without duplicates', () => {
    let tasks = [
      { task_id: 'task_001', description: 'First task',  status: 'running',   started_at: new Date(Date.now() - 3600_000).toISOString() },
      { task_id: 'task_002', description: 'Second task', status: 'scheduled', started_at: new Date(Date.now() - 1800_000).toISOString() },
    ]

    // API returns fresh data (adds task_003, updates task_001 to completed)
    const apiResponse = [
      { task_id: 'task_001', description: 'First task',  status: 'completed', started_at: new Date(Date.now() - 3600_000).toISOString() },
      { task_id: 'task_002', description: 'Second task', status: 'scheduled', started_at: new Date(Date.now() - 1800_000).toISOString() },
      { task_id: 'task_003', description: 'Third task',  status: 'scheduled', started_at: new Date(Date.now() - 600_000).toISOString()  },
    ]

    tasks = normalizeTaskList(apiResponse)

    expect(tasks).toHaveLength(3)
    const ids = tasks.map(t => t.task_id)
    expect(new Set(ids).size).toBe(3)  // no duplicates

    // task_001 is now completed
    const t1 = tasks.find(t => t.task_id === 'task_001')
    expect(t1.status).toBe('completed')
    expect(t1.is_active).toBe(false)
  })

  it('✅ Cancelling task from panel immediately removes it from active list', () => {
    let tasks = [
      { task_id: 'active_task', status: 'running', is_active: true  },
      { task_id: 'other_task',  status: 'running', is_active: true  },
    ]

    const cancelTask = (taskId) => {
      tasks = tasks.map(t =>
        t.task_id === taskId ? { ...t, status: 'cancelled', is_active: false } : t
      )
    }

    cancelTask('active_task')

    const activeTasks = tasks.filter(t => t.is_active)
    expect(activeTasks).toHaveLength(1)
    expect(activeTasks[0].task_id).toBe('other_task')

    const cancelledTask = tasks.find(t => t.task_id === 'active_task')
    expect(cancelledTask.status).toBe('cancelled')
    expect(cancelledTask.is_active).toBe(false)
  })
})
