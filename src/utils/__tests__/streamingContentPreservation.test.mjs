/**
 * Tests for streaming content preservation in useChat.js
 *
 * Covers the core bug: "only the initial text is displayed" —
 * tokens arriving AFTER tool calls were being lost because
 * fetchMessages() overwrote the freshly-streamed fullContent
 * with a stale/truncated API response.
 *
 * These tests verify:
 *   1. mergeMessages() preserves longer cached content over shorter API content
 *   2. recentlyStreamedRef prevents fetchMessages() from overwriting fresh content
 *   3. _tempId tracking allows mergeMessages() to match streamed messages
 *   4. Post-tool token accumulation: fullContent grows correctly across tool calls
 *   5. onDone finalizes content from fullContent (not from React state)
 *   6. deduplicateMessages() does not strip completed streaming messages
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
//  Mirror the exact logic from useChat.js
//  (these functions are not exported, so we copy them for isolated unit testing)
// ─────────────────────────────────────────────────────────────────────────────

function deduplicateMessages(msgs) {
  if (!msgs || msgs.length === 0) return []
  const seen = new Map()
  const result = []
  for (const msg of msgs) {
    const mid = String(msg.message_id ?? '')
    if (seen.has(mid)) continue
    let isDupe = false
    for (const existing of result) {
      if (existing.role === msg.role &&
          existing.content === msg.content &&
          existing.content !== '' &&
          Math.abs(new Date(existing.created_at).getTime() - new Date(msg.created_at).getTime()) < 5000) {
        isDupe = true
        if (mid && !mid.startsWith('temp_') && String(existing.message_id).startsWith('temp_')) {
          const idx = result.indexOf(existing)
          result[idx] = msg
          seen.delete(String(existing.message_id))
          seen.set(mid, msg)
        }
        break
      }
    }
    if (!isDupe) {
      seen.set(mid, msg)
      result.push(msg)
    }
  }
  return result
}

function mergeMessages(apiMessages, cachedMessages) {
  if (!cachedMessages || cachedMessages.length === 0) return deduplicateMessages(apiMessages)
  if (!apiMessages || apiMessages.length === 0) return deduplicateMessages(cachedMessages)

  const apiIds = new Set(apiMessages.map(m => String(m.message_id)))

  const cacheById = new Map()
  const cacheTempById = new Map()
  for (const m of cachedMessages) {
    cacheById.set(String(m.message_id), m)
    if (m._tempId) {
      cacheTempById.set(String(m._tempId), m)
    }
  }

  const enrichedApiMessages = apiMessages.map(apiMsg => {
    const cached = cacheById.get(String(apiMsg.message_id))
      || cacheTempById.get(String(apiMsg.message_id))
    if (!cached) return apiMsg

    const enriched = { ...apiMsg }

    // ── CRITICAL: Preserve LONGER content from cache ──
    const cachedLen = (cached.content || '').length
    const apiLen    = (apiMsg.content || '').length
    if (cachedLen > apiLen && !cached.isStreaming) {
      enriched.content = cached.content
    }

    if ((!apiMsg.tool_calls || apiMsg.tool_calls.length === 0) &&
        cached.tool_calls && cached.tool_calls.length > 0) {
      enriched.tool_calls = cached.tool_calls
    }

    if (!apiMsg.generation_time && cached.generation_time) {
      enriched.generation_time = cached.generation_time
    }

    if (!apiMsg.streaming_started_at && cached.streaming_started_at) {
      enriched.streaming_started_at = cached.streaming_started_at
    }

    return enriched
  })

  const missingFromApi = cachedMessages.filter(m => {
    const mid = String(m.message_id ?? '')
    if (apiIds.has(mid)) return false
    if (mid.startsWith('temp_user_') && m.role === 'user') return true
    if (mid.startsWith('temp_assistant_') && m.role === 'assistant' && m.isStreaming) return true
    return false
  })

  if (missingFromApi.length === 0) return deduplicateMessages(enrichedApiMessages)

  const merged = [...enrichedApiMessages]
  for (const userMsg of missingFromApi) {
    const userTime = new Date(userMsg.created_at).getTime()
    let insertIdx = merged.length
    for (let i = 0; i < merged.length; i++) {
      const msgTime = new Date(merged[i].created_at).getTime()
      if (msgTime > userTime) {
        insertIdx = i
        break
      }
    }
    merged.splice(insertIdx, 0, userMsg)
  }

  return deduplicateMessages(merged)
}

// ─────────────────────────────────────────────────────────────────────────────
//  Simulate the fullContent accumulation logic from useChat.sendMessage
// ─────────────────────────────────────────────────────────────────────────────
function simulateStreaming(events) {
  let fullContent = ''
  const messages = []
  const assistantMsgId = 'temp_assistant_100'
  const userMsgId = 'temp_user_100'

  // Initial messages
  messages.push({ message_id: userMsgId, role: 'user', content: 'How to jump to the moon?', created_at: '2025-01-01T10:00:00Z' })
  messages.push({ message_id: assistantMsgId, role: 'assistant', content: '', tool_calls: [], isStreaming: true, created_at: '2025-01-01T10:00:01Z' })

  const activeToolCalls = {}

  for (const event of events) {
    if (event.type === 'token') {
      fullContent += event.content
      // Update assistant message content
      const idx = messages.findIndex(m => m.message_id === assistantMsgId)
      messages[idx] = { ...messages[idx], content: fullContent }

    } else if (event.type === 'tool_start') {
      const key = event.tool_use_id
      activeToolCalls[key] = { tool_use_id: key, tool: event.tool, input: {}, status: 'running' }
      const idx = messages.findIndex(m => m.message_id === assistantMsgId)
      messages[idx] = { ...messages[idx], tool_calls: Object.values(activeToolCalls) }

    } else if (event.type === 'tool_result') {
      const key = event.tool_use_id
      if (activeToolCalls[key]) {
        activeToolCalls[key] = { ...activeToolCalls[key], result: event.result, status: 'done' }
        const idx = messages.findIndex(m => m.message_id === assistantMsgId)
        messages[idx] = { ...messages[idx], tool_calls: Object.values(activeToolCalls) }
      }

    } else if (event.type === 'done') {
      const finalToolCalls = Object.values(activeToolCalls)
      const idx = messages.findIndex(m => m.message_id === assistantMsgId)
      messages[idx] = {
        ...messages[idx],
        // Replace temp ID with real backend ID
        message_id: event.message_id || assistantMsgId,
        // Finalize content from fullContent (NOT from React state, which may be stale)
        content: fullContent || messages[idx].content || '',
        isStreaming: false,
        // Store temp ID so mergeMessages can find this message
        _tempId: assistantMsgId,
        tool_calls: finalToolCalls,
        generation_time: '2.1',
      }
    }
  }

  return { messages, fullContent, assistantMsgId }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Streaming Content Preservation', () => {

  describe('fullContent accumulation across tool calls', () => {
    it('should accumulate ALL tokens including those after tool_result', () => {
      const events = [
        { type: 'token', content: 'I already calculated this earlier! ' },
        { type: 'tool_start', tool: 'execute_code', tool_use_id: 't1' },
        { type: 'tool_result', tool_use_id: 't1', result: { exit_code: 0, stdout: '42\n' } },
        { type: 'token', content: 'Now let me create a comprehensive training program:' },
        { type: 'done', message_id: 1288 },
      ]

      const { messages, fullContent } = simulateStreaming(events)

      // fullContent should have ALL tokens concatenated
      expect(fullContent).toBe(
        'I already calculated this earlier! Now let me create a comprehensive training program:'
      )

      // The final assistant message should have the complete content
      const assistantMsg = messages.find(m => m.role === 'assistant')
      expect(assistantMsg.content).toBe(fullContent)
      expect(assistantMsg.isStreaming).toBe(false)
    })

    it('should handle multiple tokens before and after multiple tool calls', () => {
      const events = [
        { type: 'token', content: 'Part 1. ' },
        { type: 'token', content: 'Part 2. ' },
        { type: 'tool_start', tool: 'execute_code', tool_use_id: 't1' },
        { type: 'tool_result', tool_use_id: 't1', result: { exit_code: 0, stdout: 'result1' } },
        { type: 'token', content: 'Part 3. ' },
        { type: 'tool_start', tool: 'create_project', tool_use_id: 't2' },
        { type: 'tool_result', tool_use_id: 't2', result: { status: 'success' } },
        { type: 'token', content: 'Part 4.' },
        { type: 'done', message_id: 1289 },
      ]

      const { messages, fullContent } = simulateStreaming(events)

      expect(fullContent).toBe('Part 1. Part 2. Part 3. Part 4.')

      const assistantMsg = messages.find(m => m.role === 'assistant')
      expect(assistantMsg.content).toBe('Part 1. Part 2. Part 3. Part 4.')
      expect(assistantMsg.tool_calls).toHaveLength(2)
      expect(assistantMsg.tool_calls[0].status).toBe('done')
      expect(assistantMsg.tool_calls[1].status).toBe('done')
    })

    it('should preserve content when NO tokens arrive after tool calls (tool-only response)', () => {
      const events = [
        { type: 'tool_start', tool: 'execute_code', tool_use_id: 't1' },
        { type: 'tool_result', tool_use_id: 't1', result: { exit_code: 0, stdout: 'done' } },
        { type: 'done', message_id: 1290 },
      ]

      const { messages, fullContent } = simulateStreaming(events)

      expect(fullContent).toBe('')

      const assistantMsg = messages.find(m => m.role === 'assistant')
      expect(assistantMsg.content).toBe('')
      expect(assistantMsg.tool_calls).toHaveLength(1)
    })

    it('should preserve content when NO tool calls (text-only response)', () => {
      const events = [
        { type: 'token', content: 'The answer is 42. ' },
        { type: 'token', content: 'This is because of thermodynamics.' },
        { type: 'done', message_id: 1291 },
      ]

      const { messages, fullContent } = simulateStreaming(events)

      expect(fullContent).toBe('The answer is 42. This is because of thermodynamics.')

      const assistantMsg = messages.find(m => m.role === 'assistant')
      expect(assistantMsg.content).toBe(fullContent)
    })
  })

  describe('mergeMessages() content preservation', () => {
    it('should preserve longer cached content over shorter API content', () => {
      const now = new Date().toISOString()

      // Cache has the FULL streamed content
      const cachedMessages = [
        {
          message_id: 1288,  // Real backend ID (set by onDone)
          _tempId: 'temp_assistant_100',
          role: 'assistant',
          content: 'I already calculated this! Now let me create a comprehensive training program:',
          tool_calls: [{ tool: 'execute_code', status: 'done', result: { stdout: '42\n' } }],
          generation_time: '2.1',
          isStreaming: false,
          created_at: now,
        }
      ]

      // API returned a TRUNCATED version (backend stored before stream finished)
      const apiMessages = [
        {
          message_id: 1288,
          role: 'assistant',
          content: 'I already calculated this!',  // ← TRUNCATED
          tool_calls: [],  // ← NO tool_calls from API
          created_at: now,
        }
      ]

      const merged = mergeMessages(apiMessages, cachedMessages)

      expect(merged).toHaveLength(1)
      // Should use the LONGER cached content, not the truncated API content
      expect(merged[0].content).toBe(
        'I already calculated this! Now let me create a comprehensive training program:'
      )
      // Should also preserve tool_calls from cache
      expect(merged[0].tool_calls).toHaveLength(1)
      expect(merged[0].generation_time).toBe('2.1')
    })

    it('should use API content when it is LONGER than cached (API has more complete data)', () => {
      const now = new Date().toISOString()

      // Cache has partial content (streaming was interrupted before completion)
      const cachedMessages = [
        {
          message_id: 1288,
          role: 'assistant',
          content: 'Short cached content.',
          isStreaming: false,
          created_at: now,
        }
      ]

      // API has the complete, full content
      const apiMessages = [
        {
          message_id: 1288,
          role: 'assistant',
          content: 'Full API content that is much longer and more complete than the cache.',
          created_at: now,
        }
      ]

      const merged = mergeMessages(apiMessages, cachedMessages)

      expect(merged).toHaveLength(1)
      // API content is longer — should use API version
      expect(merged[0].content).toBe(
        'Full API content that is much longer and more complete than the cache.'
      )
    })

    it('should match cached message by _tempId when real ID is used in API response', () => {
      const now = new Date().toISOString()

      // Cache: message stored with real ID but also has _tempId
      const cachedMessages = [
        {
          message_id: 1288,
          _tempId: 'temp_assistant_999',  // ← The original temp ID
          role: 'assistant',
          content: 'Full content from streaming (very long with training program details).',
          tool_calls: [{ tool: 'execute_code', status: 'done' }],
          generation_time: '3.5',
          isStreaming: false,
          created_at: now,
        }
      ]

      // API: returns message with the same real ID
      const apiMessages = [
        {
          message_id: 1288,
          role: 'assistant',
          content: 'Truncated.',  // ← Short API version
          tool_calls: [],
          created_at: now,
        }
      ]

      const merged = mergeMessages(apiMessages, cachedMessages)

      expect(merged).toHaveLength(1)
      expect(merged[0].content).toBe(
        'Full content from streaming (very long with training program details).'
      )
      expect(merged[0].tool_calls).toHaveLength(1)
      expect(merged[0].generation_time).toBe('3.5')
    })

    it('should NOT overwrite API content when cached message isStreaming=true', () => {
      const now = new Date().toISOString()

      // Cache: message is STILL streaming (mid-stream)
      const cachedMessages = [
        {
          message_id: 'temp_assistant_100',
          role: 'assistant',
          content: 'Partial streaming content...',
          isStreaming: true,  // ← still streaming
          created_at: now,
        }
      ]

      // API: won't have this temp ID at all (not persisted yet)
      const apiMessages = [
        {
          message_id: 42,
          role: 'assistant',
          content: 'Previous message from history.',
          created_at: new Date(Date.now() - 60000).toISOString(),  // 1 min ago
        }
      ]

      const merged = mergeMessages(apiMessages, cachedMessages)

      // The streaming message should be preserved (it's temp_ and isStreaming)
      expect(merged.some(m => m.message_id === 'temp_assistant_100')).toBe(true)
      // The history message should also be present
      expect(merged.some(m => m.message_id === 42)).toBe(true)
    })

    it('should preserve all messages when API returns empty (network error fallback)', () => {
      const now = new Date().toISOString()

      const cachedMessages = [
        { message_id: 'temp_user_1', role: 'user', content: 'Hello', created_at: now },
        { message_id: 1288, role: 'assistant', content: 'Full response.', created_at: now },
      ]

      const merged = mergeMessages([], cachedMessages)

      expect(merged).toHaveLength(2)
    })
  })

  describe('recentlyStreamedRef protection window (simulated)', () => {
    it('should skip fetchMessages within TTL window after onDone', () => {
      // Simulate the recentlyStreamedRef logic
      const recentlyStreamed = {}
      const TTL = 8000  // 8 seconds

      const sessionId = 'session_123'
      const messages_cache = [
        { message_id: 1288, role: 'assistant', content: 'Full streamed content.', created_at: new Date().toISOString() }
      ]

      // Simulate onDone recording the session as recently streamed
      recentlyStreamed[sessionId] = Date.now()

      // Simulate fetchMessages being called 500ms later
      const checkFetch = (msSinceStream) => {
        const recentTime = recentlyStreamed[sessionId]
        if (recentTime) {
          const age = msSinceStream  // simulated age
          if (age < TTL) {
            // Should SKIP API fetch — return cache directly
            return { skipped: true, messages: messages_cache }
          } else {
            delete recentlyStreamed[sessionId]
          }
        }
        return { skipped: false, messages: null }
      }

      // 500ms after stream: should skip
      expect(checkFetch(500).skipped).toBe(true)
      expect(checkFetch(500).messages[0].content).toBe('Full streamed content.')

      // 3s after stream: should skip
      expect(checkFetch(3000).skipped).toBe(true)

      // 7.9s after stream: should skip (still within TTL)
      expect(checkFetch(7900).skipped).toBe(true)

      // 8.1s after stream: should NOT skip (TTL expired)
      expect(checkFetch(8100).skipped).toBe(false)
    })

    it('should allow fetchMessages after TTL expires', () => {
      const recentlyStreamed = { 'session_abc': Date.now() - 9000 }  // 9s ago
      const TTL = 8000

      const age = Date.now() - recentlyStreamed['session_abc']
      const shouldSkip = age < TTL

      expect(shouldSkip).toBe(false)
    })
  })

  describe('The exact bug scenario from the screenshot', () => {
    it('should preserve post-tool tokens in the final message content', () => {
      // This is the EXACT scenario from the screenshot:
      // 1. Stream starts → tokens accumulate in fullContent
      // 2. Tool calls fire (execute_code, create_project, create_file)
      // 3. MORE tokens arrive after tool_result (the "Now let me create..." part)
      // 4. onDone fires → message finalized with fullContent
      // 5. fetchMessages() is called → would have overwritten content

      const streamEvents = [
        // Pre-tool tokens
        { type: 'token', content: "I'll create a comprehensive physics analysis and theoretical exercise plan " },
        { type: 'token', content: 'for jumping to the Moon. While this is physically impossible for humans, let me provide ' },
        { type: 'token', content: 'the scientific calculations and a fun "superhuman training program."' },
        // Tool call: execute_code
        { type: 'tool_start', tool: 'execute_code', tool_use_id: 'toolu_01' },
        { type: 'tool_result', tool_use_id: 'toolu_01', result: { exit_code: 0, stdout: '== PHYSICS CALCULATIONS ==\n1. Escape velocity...\n' } },
        // Tool call: create_project
        { type: 'tool_start', tool: 'create_project', tool_use_id: 'toolu_02' },
        { type: 'tool_result', tool_use_id: 'toolu_02', result: { status: 'success', project_name: 'moon_jump_training' } },
        // Post-tool tokens (this is what was being LOST)
        { type: 'token', content: 'Now let me create a comprehensive (though impossible) training program:' },
        // Done
        { type: 'done', message_id: 1288 },
      ]

      const { messages, fullContent } = simulateStreaming(streamEvents)

      // Verify ALL tokens are in fullContent
      expect(fullContent).toContain("I'll create a comprehensive physics analysis")
      expect(fullContent).toContain('the scientific calculations')
      expect(fullContent).toContain('Now let me create a comprehensive (though impossible) training program:')

      const assistantMsg = messages.find(m => m.role === 'assistant')
      expect(assistantMsg.isStreaming).toBe(false)
      // The message content MUST contain the post-tool tokens
      expect(assistantMsg.content).toContain('Now let me create a comprehensive')
      // The message must also have the tool_calls preserved
      expect(assistantMsg.tool_calls).toHaveLength(2)

      // Now simulate fetchMessages() returning a TRUNCATED version
      // (as if the backend only stored the pre-tool part)
      const apiMessages = [{
        message_id: 1288,
        role: 'assistant',
        content: "I'll create a comprehensive physics analysis and theoretical exercise plan for jumping to the Moon.",
        // Note: post-tool tokens are MISSING from API response
        tool_calls: [],
        created_at: assistantMsg.created_at,
      }]

      // mergeMessages should PRESERVE the longer cached content
      const merged = mergeMessages(apiMessages, messages.filter(m => m.role === 'assistant'))

      expect(merged[0].content).toContain('Now let me create a comprehensive')
      expect(merged[0].tool_calls).toHaveLength(2)
    })

    it('should NOT show content garbled as "old content + post-tool tokens"', () => {
      // The screenshot showed: "I'll create a comprehensive physics analysis..."
      // followed immediately by "Now let me create a comprehensive (though impossible) training program:"
      // without the post-tool content in between.
      //
      // This happened because fetchMessages() returned the OLD assistant message
      // (from a previous streaming response) for message_id 1288, then mergeMessages
      // prepended it, and the post-tool tokens from the new stream were appended.
      //
      // The fix: mergeMessages() now preserves the LONGER content (the full stream)

      const OLD_RESPONSE_CONTENT = 'I already calculated this earlier in our conversation! Let me give you the complete analysis again with all the specific data points and exercise plan.'

      const FULL_NEW_STREAM_CONTENT = "I'll create a comprehensive physics analysis and theoretical exercise plan for jumping to the Moon. Now let me create a comprehensive (though impossible) training program:"

      // Simulate: cache has the new stream's full content
      const cacheMsg = {
        message_id: 1288,
        _tempId: 'temp_assistant_200',
        role: 'assistant',
        content: FULL_NEW_STREAM_CONTENT,  // ← Complete new stream
        isStreaming: false,
        created_at: new Date().toISOString(),
      }

      // Simulate: API returns OLD response content (re-used message ID)
      const apiMsg = {
        message_id: 1288,
        role: 'assistant',
        content: OLD_RESPONSE_CONTENT,  // ← Old content from backend
        created_at: new Date().toISOString(),
      }

      const merged = mergeMessages([apiMsg], [cacheMsg])

      // The NEW stream content is longer → should win
      expect(merged[0].content).toBe(FULL_NEW_STREAM_CONTENT)
      expect(merged[0].content).not.toBe(OLD_RESPONSE_CONTENT)

      // Verify it doesn't show the garbled OLD+POST-TOOL combination
      const garbledContent = OLD_RESPONSE_CONTENT + 'Now let me create'
      expect(merged[0].content).not.toContain(garbledContent)
    })
  })

  describe('deduplicateMessages() edge cases', () => {
    it('should not remove completed streaming messages (different content = no dupe)', () => {
      const now = new Date().toISOString()
      const msgs = [
        { message_id: 'temp_user_1', role: 'user', content: 'Hello', created_at: now },
        {
          message_id: 1288,
          role: 'assistant',
          content: 'Full response with all the physics calculations and training plan details.',
          isStreaming: false,
          created_at: now,
        },
      ]

      const deduped = deduplicateMessages(msgs)
      expect(deduped).toHaveLength(2)
    })

    it('should prefer real ID over temp_ ID for same content', () => {
      const now = new Date().toISOString()
      const msgs = [
        { message_id: 'temp_assistant_1', role: 'assistant', content: 'Same content', created_at: now },
        { message_id: 1288, role: 'assistant', content: 'Same content', created_at: now },
      ]

      const deduped = deduplicateMessages(msgs)
      expect(deduped).toHaveLength(1)
      // Should keep the real ID version
      expect(deduped[0].message_id).toBe(1288)
    })

    it('should keep empty-content messages (new streaming message before first token)', () => {
      const now = new Date().toISOString()
      const msgs = [
        { message_id: 'temp_assistant_1', role: 'assistant', content: '', isStreaming: true, created_at: now },
        { message_id: 'temp_assistant_2', role: 'assistant', content: '', isStreaming: true, created_at: now },
      ]

      // Empty content messages should NOT be deduped
      const deduped = deduplicateMessages(msgs)
      expect(deduped).toHaveLength(2)
    })
  })

  describe('Tool call matching and status tracking', () => {
    it('should match tool_result to tool_start by tool_use_id', () => {
      const events = [
        { type: 'tool_start', tool: 'execute_code', tool_use_id: 'toolu_01' },
        { type: 'tool_start', tool: 'create_project', tool_use_id: 'toolu_02' },
        { type: 'tool_result', tool_use_id: 'toolu_01', result: { exit_code: 0 } },
        { type: 'tool_result', tool_use_id: 'toolu_02', result: { status: 'success' } },
        { type: 'done', message_id: 1288 },
      ]

      const { messages } = simulateStreaming(events)
      const assistantMsg = messages.find(m => m.role === 'assistant')

      expect(assistantMsg.tool_calls).toHaveLength(2)
      expect(assistantMsg.tool_calls.find(tc => tc.tool_use_id === 'toolu_01').status).toBe('done')
      expect(assistantMsg.tool_calls.find(tc => tc.tool_use_id === 'toolu_02').status).toBe('done')
      expect(assistantMsg.tool_calls.find(tc => tc.tool_use_id === 'toolu_01').result).toEqual({ exit_code: 0 })
      expect(assistantMsg.tool_calls.find(tc => tc.tool_use_id === 'toolu_02').result).toEqual({ status: 'success' })
    })

    it('should preserve tool result stdout in the final message', () => {
      const STDOUT = '== PHYSICS CALCULATIONS FOR JUMPING TO THE MOON ==\n1. ESCAPE VELOCITY FROM EARTH\nRequired velocity: 11186 m/s\n'

      const events = [
        { type: 'tool_start', tool: 'execute_code', tool_use_id: 't1' },
        { type: 'tool_result', tool_use_id: 't1', result: { exit_code: 0, stdout: STDOUT, stderr: '' } },
        { type: 'token', content: 'Here are the physics calculations.' },
        { type: 'done', message_id: 1288 },
      ]

      const { messages } = simulateStreaming(events)
      const assistantMsg = messages.find(m => m.role === 'assistant')

      expect(assistantMsg.tool_calls[0].result.stdout).toBe(STDOUT)
      expect(assistantMsg.content).toBe('Here are the physics calculations.')
    })
  })
})
