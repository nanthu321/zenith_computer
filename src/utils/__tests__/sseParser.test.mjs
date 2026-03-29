/**
 * Unit tests for the SSE stream parser in api.js
 *
 * Tests the core parsing logic that processes text/event-stream responses
 * and dispatches events to the correct callbacks. Covers:
 *   - Normal SSE format (newline-separated event/data pairs)
 *   - Concatenated events (no newlines between event fields)
 *   - Chunk boundary splits (event: in one chunk, data: in the next)
 *   - All event types: token, tool_start, tool_result, thinking, status, iteration, artifact, done, error
 *   - Buffer flushing at end of stream
 *   - Malformed JSON resilience
 *   - Cross-chunk JSON accumulation (incomplete JSON across reader.read() calls)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────
//  Extract the parser logic for unit testing
//  (mirrors processLinesWithAccum + dispatchSSE + normalizeSSEBuffer from api.js)
// ─────────────────────────────────────────────────

function createSSEParser(callbacks) {
  const {
    onToken, onToolStart, onToolResult, onDone, onError,
    onThinking, onStatus, onIteration, onArtifact,
  } = callbacks

  const dispatchSSE = (eventType, data) => {
    switch (eventType) {
      case 'token':      onToken?.(data.content); break
      case 'tool_start': onToolStart?.(data); break
      case 'tool_result': onToolResult?.(data); break
      case 'thinking':   onThinking?.(data); break
      case 'status':     onStatus?.(data); break
      case 'iteration':  onIteration?.(data); break
      case 'artifact':   onArtifact?.(data); break
      case 'done':       onDone?.(data); break
      case 'error':      onError?.(data.error); break
    }
  }

  // Mirrors normalizeSSEBuffer from api.js exactly
  const normalizeSSEBuffer = (buf) => {
    // Step 1: Insert newline before `event:` when preceded by `}` (end of JSON data)
    buf = buf.replace(/\}(event:)/g, '}\n$1')

    // Step 2: Insert newline before `data:` when preceded by a known event type name
    buf = buf.replace(
      /\b(token|tool_start|tool_result|thinking|status|iteration|artifact|done|error)(data:)/g,
      '$1\n$2'
    )

    // Step 3: Insert newline before `data:` when preceded by `}` (end of JSON)
    buf = buf.replace(/\}(data:)/g, '}\n$1')

    return buf
  }

  // Mirrors processLinesWithAccum from api.js:
  // - handles cross-chunk incomplete JSON accumulation
  // - handles multi-line data: values (SSE spec)
  // - dispatches immediately on successful JSON parse
  let currentEvent = ''
  let pendingDataAccum = ''

  const processLinesWithAccum = (lines) => {
    let dataAccum = pendingDataAccum

    const tryDispatch = () => {
      if (dataAccum && currentEvent) {
        try {
          const data = JSON.parse(dataAccum)
          dispatchSSE(currentEvent, data)
          currentEvent = ''
          dataAccum = ''
          pendingDataAccum = ''
          return true
        } catch {
          pendingDataAccum = dataAccum
          return false
        }
      }
      return false
    }

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        // SSE boundary — flush any pending data
        if (dataAccum && currentEvent) {
          try {
            const data = JSON.parse(dataAccum)
            dispatchSSE(currentEvent, data)
          } catch { /* ignore malformed */ }
        }
        currentEvent = ''
        dataAccum = ''
        pendingDataAccum = ''
        continue
      }
      if (trimmed.startsWith('event:')) {
        tryDispatch()
        currentEvent = trimmed.slice(6).trim()
        dataAccum = ''
        pendingDataAccum = ''
      } else if (trimmed.startsWith('data:')) {
        const jsonStr = trimmed.slice(5).trim()
        dataAccum = dataAccum ? dataAccum + '\n' + jsonStr : jsonStr
        tryDispatch()
      }
    }

    pendingDataAccum = dataAccum
  }

  let buffer = ''

  return {
    /** Feed a raw chunk of SSE text (simulating reader.read()) */
    feed(chunk) {
      buffer += chunk
      buffer = normalizeSSEBuffer(buffer)
      const lines = buffer.split('\n')
      buffer = lines.pop()
      processLinesWithAccum(lines)
    },

    /** Flush remaining buffer (called when stream ends) */
    flush() {
      if (buffer.trim()) {
        const remaining = normalizeSSEBuffer(buffer)
        const remainingLines = remaining.split('\n')
        // Add trailing empty line to trigger SSE boundary flush
        remainingLines.push('')
        processLinesWithAccum(remainingLines)
        buffer = ''
      } else if (pendingDataAccum && currentEvent) {
        // Flush any cross-chunk accumulated data
        try {
          const data = JSON.parse(pendingDataAccum)
          dispatchSSE(currentEvent, data)
        } catch { /* ignore */ }
        currentEvent = ''
        pendingDataAccum = ''
      }
    },
  }
}

// ─────────────────────────────────────────────────
//  Test helper: create fresh callback mocks
// ─────────────────────────────────────────────────
function createCallbacks() {
  return {
    onToken:     vi.fn(),
    onToolStart: vi.fn(),
    onToolResult: vi.fn(),
    onDone:      vi.fn(),
    onError:     vi.fn(),
    onThinking:  vi.fn(),
    onStatus:    vi.fn(),
    onIteration: vi.fn(),
    onArtifact:  vi.fn(),
  }
}

// ─────────────────────────────────────────────────
//  Tests
// ─────────────────────────────────────────────────

describe('SSE Parser', () => {
  let callbacks

  beforeEach(() => {
    callbacks = createCallbacks()
  })

  describe('Standard newline-delimited SSE format', () => {
    it('should parse a single token event', () => {
      const parser = createSSEParser(callbacks)
      parser.feed('event: token\ndata: {"content": "Hello"}\n\n')
      expect(callbacks.onToken).toHaveBeenCalledWith('Hello')
      expect(callbacks.onToken).toHaveBeenCalledTimes(1)
    })

    it('should parse multiple token events', () => {
      const parser = createSSEParser(callbacks)
      parser.feed('event: token\ndata: {"content": "Hello "}\n\nevent: token\ndata: {"content": "world"}\n\n')
      expect(callbacks.onToken).toHaveBeenCalledTimes(2)
      expect(callbacks.onToken).toHaveBeenNthCalledWith(1, 'Hello ')
      expect(callbacks.onToken).toHaveBeenNthCalledWith(2, 'world')
    })

    it('should parse thinking, iteration, token, and done events in sequence', () => {
      const parser = createSSEParser(callbacks)
      parser.feed(
        'event: thinking\ndata: {"label": "Thinking…", "status": "active"}\n\n' +
        'event: iteration\ndata: {"current": 1, "max": 5}\n\n' +
        'event: token\ndata: {"content": "Result"}\n\n' +
        'event: done\ndata: {"message_id": 123}\n\n'
      )
      expect(callbacks.onThinking).toHaveBeenCalledWith({ label: 'Thinking…', status: 'active' })
      expect(callbacks.onIteration).toHaveBeenCalledWith({ current: 1, max: 5 })
      expect(callbacks.onToken).toHaveBeenCalledWith('Result')
      expect(callbacks.onDone).toHaveBeenCalledWith({ message_id: 123 })
    })
  })

  describe('Chunk boundary handling (event: in one chunk, data: in next)', () => {
    it('should handle event: and data: split across two chunks', () => {
      const parser = createSSEParser(callbacks)
      parser.feed('event: token\n')
      // At this point, event: line is in processed lines, data: has not arrived
      expect(callbacks.onToken).not.toHaveBeenCalled()

      parser.feed('data: {"content": "delayed"}\n\n')
      expect(callbacks.onToken).toHaveBeenCalledWith('delayed')
    })

    it('should handle data: split mid-JSON across chunks', () => {
      const parser = createSSEParser(callbacks)
      parser.feed('event: token\ndata: {"conte')
      // Incomplete JSON — nothing dispatched yet
      expect(callbacks.onToken).not.toHaveBeenCalled()

      parser.feed('nt": "split"}\n\n')
      expect(callbacks.onToken).toHaveBeenCalledWith('split')
    })

    it('should handle multiple events across many small chunks', () => {
      const parser = createSSEParser(callbacks)
      parser.feed('event: ')
      parser.feed('thinking\n')
      parser.feed('data: {"label": "Think", "status": "active"}\n')
      parser.feed('\n')
      parser.feed('event: token\ndata: ')
      parser.feed('{"content": "Hi"}\n\n')

      expect(callbacks.onThinking).toHaveBeenCalledWith({ label: 'Think', status: 'active' })
      expect(callbacks.onToken).toHaveBeenCalledWith('Hi')
    })
  })

  describe('Concatenated events (no newlines between event/data fields)', () => {
    it('should handle event+data concatenated without newlines', () => {
      const parser = createSSEParser(callbacks)
      // This simulates: "event: thinkingdata: {...}event: tokendata: {...}"
      parser.feed('event: thinkingdata: {"label": "Thinking", "status": "active"}event: tokendata: {"content": "Hello"}\n')

      expect(callbacks.onThinking).toHaveBeenCalledWith({ label: 'Thinking', status: 'active' })
      expect(callbacks.onToken).toHaveBeenCalledWith('Hello')
    })

    it('should handle the full sample stream from the bug report', () => {
      const parser = createSSEParser(callbacks)

      // Simulate the exact stream from the bug report (concatenated).
      // Note: flush() is required because the last event has no trailing
      // newline, so it remains in the parser's internal buffer.
      parser.feed(
        'event: thinkingdata: {"label": "Thinking\\u2026", "status": "active"}' +
        'event: iterationdata: {"current": 1, "max": 5}' +
        'event: thinkingdata: {"label": "Thought", "status": "done"}' +
        'event: tokendata: {"content": "I already calculated this earlier"}' +
        'event: tokendata: {"content": " in our conversation!"}' +
        'event: tool_startdata: {"tool": "execute_code", "tool_use_id": "toolu_01", "input": {"code": "print(1)"}}'
      )
      parser.flush()

      expect(callbacks.onThinking).toHaveBeenCalledTimes(2)
      expect(callbacks.onIteration).toHaveBeenCalledWith({ current: 1, max: 5 })
      expect(callbacks.onToken).toHaveBeenCalledTimes(2)
      expect(callbacks.onToken).toHaveBeenNthCalledWith(1, 'I already calculated this earlier')
      expect(callbacks.onToken).toHaveBeenNthCalledWith(2, ' in our conversation!')
      expect(callbacks.onToolStart).toHaveBeenCalledWith({
        tool: 'execute_code',
        tool_use_id: 'toolu_01',
        input: { code: 'print(1)' },
      })
    })
  })

  describe('Tool start and result events', () => {
    it('should parse tool_start with full input', () => {
      const parser = createSSEParser(callbacks)
      const toolData = {
        tool: 'execute_code',
        tool_use_id: 'toolu_abc',
        input: { code: 'print("hello")' },
      }
      parser.feed(`event: tool_start\ndata: ${JSON.stringify(toolData)}\n\n`)
      expect(callbacks.onToolStart).toHaveBeenCalledWith(toolData)
    })

    it('should parse tool_result with result data', () => {
      const parser = createSSEParser(callbacks)
      const resultData = {
        tool: 'execute_code',
        tool_use_id: 'toolu_abc',
        result: { exit_code: 0, stdout: 'hello\n', stderr: '' },
      }
      parser.feed(`event: tool_result\ndata: ${JSON.stringify(resultData)}\n\n`)
      expect(callbacks.onToolResult).toHaveBeenCalledWith(resultData)
    })

    it('should handle tokens after tool_result (continuation of response)', () => {
      const parser = createSSEParser(callbacks)
      parser.feed(
        'event: token\ndata: {"content": "Before tool"}\n\n' +
        'event: tool_start\ndata: {"tool": "execute_code", "tool_use_id": "t1", "input": {}}\n\n' +
        'event: tool_result\ndata: {"tool": "execute_code", "tool_use_id": "t1", "result": {"exit_code": 0}}\n\n' +
        'event: token\ndata: {"content": "After tool"}\n\n' +
        'event: done\ndata: {"message_id": 42}\n\n'
      )

      expect(callbacks.onToken).toHaveBeenCalledTimes(2)
      expect(callbacks.onToken).toHaveBeenNthCalledWith(1, 'Before tool')
      expect(callbacks.onToken).toHaveBeenNthCalledWith(2, 'After tool')
      expect(callbacks.onToolStart).toHaveBeenCalledTimes(1)
      expect(callbacks.onToolResult).toHaveBeenCalledTimes(1)
      expect(callbacks.onDone).toHaveBeenCalledWith({ message_id: 42 })
    })
  })

  describe('Status events', () => {
    it('should parse active and done status events', () => {
      const parser = createSSEParser(callbacks)
      parser.feed(
        'event: status\ndata: {"tool": "execute_code", "label": "Running code", "icon": "⚡", "status": "active"}\n\n' +
        'event: status\ndata: {"tool": "execute_code", "label": "Running code", "icon": "⚡", "status": "done"}\n\n'
      )

      expect(callbacks.onStatus).toHaveBeenCalledTimes(2)
      expect(callbacks.onStatus).toHaveBeenNthCalledWith(1, expect.objectContaining({ status: 'active' }))
      expect(callbacks.onStatus).toHaveBeenNthCalledWith(2, expect.objectContaining({ status: 'done' }))
    })
  })

  describe('Artifact events', () => {
    it('should parse artifact events', () => {
      const parser = createSSEParser(callbacks)
      parser.feed('event: artifact\ndata: {"id": "art_1", "type": "file", "name": "test.py"}\n\n')
      expect(callbacks.onArtifact).toHaveBeenCalledWith({ id: 'art_1', type: 'file', name: 'test.py' })
    })
  })

  describe('Error events', () => {
    it('should parse error events and call onError with the error string', () => {
      const parser = createSSEParser(callbacks)
      parser.feed('event: error\ndata: {"error": "Something went wrong"}\n\n')
      expect(callbacks.onError).toHaveBeenCalledWith('Something went wrong')
    })
  })

  describe('Buffer flushing', () => {
    it('should flush remaining data when stream ends', () => {
      const parser = createSSEParser(callbacks)
      // Feed data without trailing newline
      parser.feed('event: done\ndata: {"message_id": 999}')
      // Data is still in buffer, not yet dispatched
      expect(callbacks.onDone).not.toHaveBeenCalled()

      // Flush
      parser.flush()
      expect(callbacks.onDone).toHaveBeenCalledWith({ message_id: 999 })
    })

    it('should handle concatenated events in flush', () => {
      const parser = createSSEParser(callbacks)
      parser.feed('event: tokendata: {"content": "last chunk"}event: donedata: {"message_id": 1}')
      parser.flush()

      expect(callbacks.onToken).toHaveBeenCalledWith('last chunk')
      expect(callbacks.onDone).toHaveBeenCalledWith({ message_id: 1 })
    })
  })

  describe('Malformed data resilience', () => {
    it('should ignore malformed JSON and continue parsing', () => {
      const parser = createSSEParser(callbacks)
      parser.feed(
        'event: token\ndata: {INVALID JSON}\n\n' +
        'event: token\ndata: {"content": "valid"}\n\n'
      )

      // First token had bad JSON — skipped
      // Second token is valid
      expect(callbacks.onToken).toHaveBeenCalledTimes(1)
      expect(callbacks.onToken).toHaveBeenCalledWith('valid')
    })

    it('should ignore data lines without a preceding event type', () => {
      const parser = createSSEParser(callbacks)
      // data: line with no prior event:
      parser.feed('data: {"content": "orphan"}\n\n')
      expect(callbacks.onToken).not.toHaveBeenCalled()
      expect(callbacks.onDone).not.toHaveBeenCalled()
    })

    it('should handle empty chunks gracefully', () => {
      const parser = createSSEParser(callbacks)
      parser.feed('')
      parser.feed('')
      parser.feed('event: token\ndata: {"content": "after empty"}\n\n')
      expect(callbacks.onToken).toHaveBeenCalledWith('after empty')
    })
  })

  describe('Full realistic stream simulation', () => {
    it('should correctly parse a complete multi-tool response', () => {
      const parser = createSSEParser(callbacks)
      const tokenContents = []
      callbacks.onToken.mockImplementation(content => tokenContents.push(content))

      // Simulate the full stream from the bug report, delivered in realistic chunks
      const fullStream = [
        'event: thinking\ndata: {"label": "Thinking…", "status": "active"}\n\n',
        'event: iteration\ndata: {"current": 1, "max": 5}\n\n',
        'event: thinking\ndata: {"label": "Thought", "status": "done"}\n\n',
        'event: token\ndata: {"content": "I already calculated this"}\n\n',
        'event: token\ndata: {"content": " earlier! Let me give you"}\n\n',
        'event: token\ndata: {"content": " the results."}\n\n',
        'event: tool_start\ndata: {"tool": "execute_code", "tool_use_id": "t1", "input": {"code": "print(42)"}}\n\n',
        'event: status\ndata: {"tool": "execute_code", "label": "Running code", "icon": "⚡", "status": "active"}\n\n',
        'event: status\ndata: {"tool": "execute_code", "label": "Running code", "icon": "⚡", "status": "done"}\n\n',
        'event: tool_result\ndata: {"tool": "execute_code", "tool_use_id": "t1", "result": {"exit_code": 0, "stdout": "42\\n"}}\n\n',
        'event: iteration\ndata: {"current": 2, "max": 5}\n\n',
        'event: token\ndata: {"content": "Here are the results from the code."}\n\n',
        'event: done\ndata: {"message_id": 1288, "session_title": "Moon jump calculations"}\n\n',
      ]

      for (const chunk of fullStream) {
        parser.feed(chunk)
      }

      expect(callbacks.onThinking).toHaveBeenCalledTimes(2)
      expect(callbacks.onIteration).toHaveBeenCalledTimes(2)
      expect(callbacks.onToken).toHaveBeenCalledTimes(4)
      expect(tokenContents.join('')).toBe(
        'I already calculated this earlier! Let me give you the results.Here are the results from the code.'
      )
      expect(callbacks.onToolStart).toHaveBeenCalledTimes(1)
      expect(callbacks.onStatus).toHaveBeenCalledTimes(2)
      expect(callbacks.onToolResult).toHaveBeenCalledTimes(1)
      expect(callbacks.onDone).toHaveBeenCalledWith({
        message_id: 1288,
        session_title: 'Moon jump calculations',
      })
    })
  })

  describe('Full bug-report stream (concatenated, no newlines)', () => {
    it('should correctly parse the exact concatenated stream from the bug report', () => {
      const parser = createSSEParser(callbacks)
      const tokenContents = []
      callbacks.onToken.mockImplementation(content => tokenContents.push(content))

      // This is the EXACT stream from the user's bug report — all events
      // concatenated without newlines (the root cause of the original bug).
      const concatenatedStream =
        'event: thinkingdata: {"label": "Thinking\\u2026", "status": "active"}' +
        'event: iterationdata: {"current": 1, "max": 5}' +
        'event: thinkingdata: {"label": "Thought", "status": "done"}' +
        'event: tokendata: {"content": "I already calculated this earlier in our conversation! Let me give you the complete analysis again with all the specific data points an"}' +
        'event: tokendata: {"content": "d exer"}' +
        'event: tokendata: {"content": "cise plan."}' +
        'event: tool_startdata: {"tool": "execute_code", "tool_use_id": "toolu_01FhwiqRYEcuEiPY2o8PXY4n", "input": {"code": "import math\\nprint(42)"}}' +
        'event: statusdata: {"tool": "execute_code", "label": "Running code", "icon": "\\u26a1", "args_preview": "import math", "status": "active"}' +
        'event: statusdata: {"tool": "execute_code", "label": "Running code", "icon": "\\u26a1", "args_preview": "import math", "status": "done"}' +
        'event: tool_resultdata: {"tool": "execute_code", "tool_use_id": "toolu_01FhwiqRYEcuEiPY2o8PXY4n", "result": {"exit_code": 0, "stdout": "42\\n", "stderr": ""}}' +
        'event: iterationdata: {"current": 2, "max": 5}' +
        'event: tool_startdata: {"tool": "create_project", "tool_use_id": "toolu_01C542dC2f1kTYLTBtUsAuAp", "input": {"project_name": "moon_jump_training"}}' +
        'event: statusdata: {"tool": "create_project", "label": "Creating project", "icon": "\\ud83d\\udcc1", "args_preview": "moon_jump_training", "status": "active"}' +
        'event: statusdata: {"tool": "create_project", "label": "Creating project", "icon": "\\ud83d\\udcc1", "args_preview": "moon_jump_training", "status": "done"}' +
        'event: tool_resultdata: {"tool": "create_project", "tool_use_id": "toolu_01C542dC2f1kTYLTBtUsAuAp", "result": {"status": "success", "project_name": "moon_jump_training"}}' +
        'event: iterationdata: {"current": 3, "max": 5}' +
        'event: donedata: {"message_id":1288,"session_title":"Track Bitcoin price every 3 hours for 7 days and l..."}';

      parser.feed(concatenatedStream)
      parser.flush()

      // Verify thinking events
      expect(callbacks.onThinking).toHaveBeenCalledTimes(2)
      expect(callbacks.onThinking).toHaveBeenNthCalledWith(1, { label: 'Thinking\u2026', status: 'active' })
      expect(callbacks.onThinking).toHaveBeenNthCalledWith(2, { label: 'Thought', status: 'done' })

      // Verify iteration events
      expect(callbacks.onIteration).toHaveBeenCalledTimes(3)
      expect(callbacks.onIteration).toHaveBeenNthCalledWith(1, { current: 1, max: 5 })
      expect(callbacks.onIteration).toHaveBeenNthCalledWith(2, { current: 2, max: 5 })
      expect(callbacks.onIteration).toHaveBeenNthCalledWith(3, { current: 3, max: 5 })

      // Verify ALL token events are captured (this was the user's main complaint)
      expect(callbacks.onToken).toHaveBeenCalledTimes(3)
      const fullText = tokenContents.join('')
      expect(fullText).toBe(
        'I already calculated this earlier in our conversation! Let me give you the complete analysis again with all the specific data points and exercise plan.'
      )

      // Verify tool_start events (execute_code + create_project)
      expect(callbacks.onToolStart).toHaveBeenCalledTimes(2)
      expect(callbacks.onToolStart).toHaveBeenNthCalledWith(1, expect.objectContaining({
        tool: 'execute_code',
        tool_use_id: 'toolu_01FhwiqRYEcuEiPY2o8PXY4n',
      }))
      expect(callbacks.onToolStart).toHaveBeenNthCalledWith(2, expect.objectContaining({
        tool: 'create_project',
        tool_use_id: 'toolu_01C542dC2f1kTYLTBtUsAuAp',
      }))

      // Verify tool_result events
      expect(callbacks.onToolResult).toHaveBeenCalledTimes(2)
      expect(callbacks.onToolResult).toHaveBeenNthCalledWith(1, expect.objectContaining({
        tool_use_id: 'toolu_01FhwiqRYEcuEiPY2o8PXY4n',
        result: expect.objectContaining({ exit_code: 0, stdout: '42\n' }),
      }))
      expect(callbacks.onToolResult).toHaveBeenNthCalledWith(2, expect.objectContaining({
        tool_use_id: 'toolu_01C542dC2f1kTYLTBtUsAuAp',
        result: expect.objectContaining({ status: 'success' }),
      }))

      // Verify status events (2 per tool: active + done)
      expect(callbacks.onStatus).toHaveBeenCalledTimes(4)

      // Verify done event
      expect(callbacks.onDone).toHaveBeenCalledWith({
        message_id: 1288,
        session_title: 'Track Bitcoin price every 3 hours for 7 days and l...',
      })
    })

    it('should handle concatenated stream delivered in small chunks', () => {
      const parser = createSSEParser(callbacks)
      const tokenContents = []
      callbacks.onToken.mockImplementation(content => tokenContents.push(content))

      // Deliver the same concatenated data in tiny random chunks
      const fullData =
        'event: thinkingdata: {"label": "Thinking", "status": "active"}' +
        'event: tokendata: {"content": "Hello "}' +
        'event: tokendata: {"content": "world!"}' +
        'event: tool_startdata: {"tool": "execute_code", "tool_use_id": "t1", "input": {"code": "x"}}' +
        'event: tool_resultdata: {"tool": "execute_code", "tool_use_id": "t1", "result": {"exit_code": 0, "stdout": "ok"}}' +
        'event: donedata: {"message_id": 42}'

      // Feed 10 characters at a time
      for (let i = 0; i < fullData.length; i += 10) {
        parser.feed(fullData.slice(i, i + 10))
      }
      parser.flush()

      expect(callbacks.onThinking).toHaveBeenCalledTimes(1)
      expect(callbacks.onToken).toHaveBeenCalledTimes(2)
      expect(tokenContents.join('')).toBe('Hello world!')
      expect(callbacks.onToolStart).toHaveBeenCalledTimes(1)
      expect(callbacks.onToolResult).toHaveBeenCalledTimes(1)
      expect(callbacks.onDone).toHaveBeenCalledWith({ message_id: 42 })
    })

    it('should not corrupt event type names during normalization', () => {
      const parser = createSSEParser(callbacks)

      // Each of these event types previously got corrupted by the regex:
      // "thinkingdata:" → "thinkin" + "data:" (lost 'g')
      // "iterationdata:" → "iteratio" + "data:" (lost 'n')
      // "tokendata:" → "toke" + "data:" (lost 'n')
      // "tool_startdata:" → "tool_star" + "data:" (lost 't')
      // "tool_resultdata:" → "tool_resul" + "data:" (lost 't')
      // "statusdata:" → "statu" + "data:" (lost 's')
      // "donedata:" → "don" + "data:" (lost 'e')
      const allTypes =
        'event: thinkingdata: {"label": "T", "status": "active"}' +
        'event: iterationdata: {"current": 1, "max": 3}' +
        'event: tokendata: {"content": "hi"}' +
        'event: tool_startdata: {"tool": "web_search", "tool_use_id": "x", "input": {}}' +
        'event: statusdata: {"tool": "web_search", "status": "active", "label": "Searching"}' +
        'event: tool_resultdata: {"tool": "web_search", "tool_use_id": "x", "result": {}}' +
        'event: artifactdata: {"id": "a1", "type": "file", "name": "test.py"}' +
        'event: errordata: {"error": "test error"}' +
        'event: donedata: {"message_id": 99}'

      parser.feed(allTypes)
      parser.flush()

      expect(callbacks.onThinking).toHaveBeenCalledTimes(1)
      expect(callbacks.onIteration).toHaveBeenCalledTimes(1)
      expect(callbacks.onToken).toHaveBeenCalledTimes(1)
      expect(callbacks.onToken).toHaveBeenCalledWith('hi')
      expect(callbacks.onToolStart).toHaveBeenCalledTimes(1)
      expect(callbacks.onStatus).toHaveBeenCalledTimes(1)
      expect(callbacks.onToolResult).toHaveBeenCalledTimes(1)
      expect(callbacks.onArtifact).toHaveBeenCalledTimes(1)
      expect(callbacks.onError).toHaveBeenCalledWith('test error')
      expect(callbacks.onDone).toHaveBeenCalledWith({ message_id: 99 })
    })

    it('should handle tokens after tool_result in concatenated stream', () => {
      const parser = createSSEParser(callbacks)
      const tokenContents = []
      callbacks.onToken.mockImplementation(content => tokenContents.push(content))

      const stream =
        'event: tokendata: {"content": "Before tool. "}' +
        'event: tool_startdata: {"tool": "execute_code", "tool_use_id": "t1", "input": {"code": "print(1)"}}' +
        'event: tool_resultdata: {"tool": "execute_code", "tool_use_id": "t1", "result": {"exit_code": 0, "stdout": "1\\n"}}' +
        'event: tokendata: {"content": "After tool. "}' +
        'event: tokendata: {"content": "More text."}' +
        'event: donedata: {"message_id": 5}'

      parser.feed(stream)
      parser.flush()

      expect(callbacks.onToken).toHaveBeenCalledTimes(3)
      expect(tokenContents.join('')).toBe('Before tool. After tool. More text.')
      expect(callbacks.onToolStart).toHaveBeenCalledTimes(1)
      expect(callbacks.onToolResult).toHaveBeenCalledTimes(1)
      expect(callbacks.onDone).toHaveBeenCalledTimes(1)
    })
  })

  describe('Edge cases with event: followed by space variations', () => {
    it('should handle "event: " with extra spaces', () => {
      const parser = createSSEParser(callbacks)
      parser.feed('event:  token\ndata: {"content": "spaced"}\n\n')
      expect(callbacks.onToken).toHaveBeenCalledWith('spaced')
    })

    it('should handle "event:" with no space before type', () => {
      const parser = createSSEParser(callbacks)
      parser.feed('event:token\ndata: {"content": "nospace"}\n\n')
      expect(callbacks.onToken).toHaveBeenCalledWith('nospace')
    })
  })

  describe('Cross-chunk JSON accumulation (enhanced parser)', () => {
    it('should accumulate JSON split across multiple feed() calls', () => {
      const parser = createSSEParser(callbacks)
      // JSON for a tool_result is split across 3 chunks
      parser.feed('event: tool_result\ndata: {"tool": "execute_code", "tool_use_id": "t1", "result": {"exit_code": 0,')
      expect(callbacks.onToolResult).not.toHaveBeenCalled()  // incomplete JSON

      parser.feed(' "stdout": "hello\\n",')
      expect(callbacks.onToolResult).not.toHaveBeenCalled()  // still incomplete

      parser.feed(' "stderr": ""}}\n\n')
      expect(callbacks.onToolResult).toHaveBeenCalledWith({
        tool: 'execute_code',
        tool_use_id: 't1',
        result: { exit_code: 0, stdout: 'hello\n', stderr: '' },
      })
    })

    it('should handle large tool_result spanning many chunks', () => {
      const parser = createSSEParser(callbacks)
      const largeOutput = 'line1\nline2\nline3\n'.repeat(50)
      const resultData = JSON.stringify({
        tool: 'execute_code',
        tool_use_id: 'big_t1',
        result: { exit_code: 0, stdout: largeOutput, stderr: '' },
      })

      // Feed the data line in 20-char chunks
      const fullLine = `event: tool_result\ndata: ${resultData}\n\n`
      for (let i = 0; i < fullLine.length; i += 20) {
        parser.feed(fullLine.slice(i, i + 20))
      }

      expect(callbacks.onToolResult).toHaveBeenCalledTimes(1)
      expect(callbacks.onToolResult).toHaveBeenCalledWith(
        expect.objectContaining({ tool_use_id: 'big_t1' })
      )
    })
  })

  describe('tool_result with content fields (inline text output)', () => {
    it('should parse tool_result with content field (read_file style)', () => {
      const parser = createSSEParser(callbacks)
      const resultData = {
        tool: 'read_file',
        tool_use_id: 'rf_01',
        result: { content: 'file contents here', status: 'success' },
      }
      parser.feed(`event: tool_result\ndata: ${JSON.stringify(resultData)}\n\n`)
      expect(callbacks.onToolResult).toHaveBeenCalledWith(resultData)
      // Verify content is accessible in the result
      const call = callbacks.onToolResult.mock.calls[0][0]
      expect(call.result.content).toBe('file contents here')
    })

    it('should parse tool_result with output field', () => {
      const parser = createSSEParser(callbacks)
      const resultData = {
        tool: 'web_fetch',
        tool_use_id: 'wf_01',
        result: { output: 'fetched page content', status: 'success' },
      }
      parser.feed(`event: tool_result\ndata: ${JSON.stringify(resultData)}\n\n`)
      expect(callbacks.onToolResult).toHaveBeenCalledWith(resultData)
      const call = callbacks.onToolResult.mock.calls[0][0]
      expect(call.result.output).toBe('fetched page content')
    })

    it('should handle tool_result with complex nested result', () => {
      const parser = createSSEParser(callbacks)
      const resultData = {
        tool: 'execute_code',
        tool_use_id: 'ec_01',
        result: {
          exit_code: 0,
          stdout: '{"fitness_score": 8.7, "calories": 420, "steps": 12000}',
          stderr: '',
          execution_time_ms: 145,
        },
      }
      parser.feed(`event: tool_result\ndata: ${JSON.stringify(resultData)}\n\n`)
      expect(callbacks.onToolResult).toHaveBeenCalledWith(resultData)
      const call = callbacks.onToolResult.mock.calls[0][0]
      expect(call.result.stdout).toContain('fitness_score')
    })
  })

  describe('Thinking indicator events', () => {
    it('should parse thinking event with active status', () => {
      const parser = createSSEParser(callbacks)
      parser.feed('event: thinking\ndata: {"label": "Thinking…", "status": "active"}\n\n')
      expect(callbacks.onThinking).toHaveBeenCalledWith({ label: 'Thinking…', status: 'active' })
    })

    it('should parse thinking event transitioning to done', () => {
      const parser = createSSEParser(callbacks)
      parser.feed(
        'event: thinking\ndata: {"label": "Thinking…", "status": "active"}\n\n' +
        'event: thinking\ndata: {"label": "Thought", "status": "done"}\n\n'
      )
      expect(callbacks.onThinking).toHaveBeenCalledTimes(2)
      expect(callbacks.onThinking).toHaveBeenNthCalledWith(1, expect.objectContaining({ status: 'active' }))
      expect(callbacks.onThinking).toHaveBeenNthCalledWith(2, expect.objectContaining({ status: 'done' }))
    })

    it('should handle tokens arriving after thinking is done', () => {
      const parser = createSSEParser(callbacks)
      const tokens = []
      callbacks.onToken.mockImplementation(c => tokens.push(c))

      parser.feed(
        'event: thinking\ndata: {"label": "Thinking…", "status": "active"}\n\n' +
        'event: thinking\ndata: {"label": "Thought", "status": "done"}\n\n' +
        'event: token\ndata: {"content": "Here is my answer: "}\n\n' +
        'event: token\ndata: {"content": "42."}\n\n' +
        'event: done\ndata: {"message_id": 777}\n\n'
      )

      expect(callbacks.onThinking).toHaveBeenCalledTimes(2)
      expect(callbacks.onToken).toHaveBeenCalledTimes(2)
      expect(tokens.join('')).toBe('Here is my answer: 42.')
      expect(callbacks.onDone).toHaveBeenCalledWith({ message_id: 777 })
    })
  })

  describe('Full response: tokens + tools + tokens (the primary bug scenario)', () => {
    it('should accumulate ALL tokens across tool calls as a complete response', () => {
      const parser = createSSEParser(callbacks)
      const tokens = []
      callbacks.onToken.mockImplementation(c => tokens.push(c))

      // This is the exact pattern that was failing:
      // initial text → tool call → more text after tool → done
      const stream =
        'event: thinking\ndata: {"label": "Thinking…", "status": "active"}\n\n' +
        'event: thinking\ndata: {"label": "Thought", "status": "done"}\n\n' +
        'event: token\ndata: {"content": "I already calculated this earlier in our conversation! "}\n\n' +
        'event: token\ndata: {"content": "Let me give you the complete analysis."}\n\n' +
        'event: tool_start\ndata: {"tool": "execute_code", "tool_use_id": "t1", "input": {"code": "import math\\nresult = math.sqrt(9.81 * 1.62)\\nprint(f\'Jump height factor: {result:.4f}\')"}}\n\n' +
        'event: status\ndata: {"tool": "execute_code", "label": "Executing code", "icon": "⚡", "status": "active"}\n\n' +
        'event: tool_result\ndata: {"tool": "execute_code", "tool_use_id": "t1", "result": {"exit_code": 0, "stdout": "Jump height factor: 3.9841\\n", "stderr": ""}}\n\n' +
        'event: status\ndata: {"tool": "execute_code", "label": "Executing code", "icon": "⚡", "status": "done"}\n\n' +
        'event: token\ndata: {"content": "\\n\\n**Results:**\\n- Jump height factor: 3.984\\n- On Moon you can jump 3.98x higher than on Earth."}\n\n' +
        'event: token\ndata: {"content": "\\n\\nHere is your complete exercise plan!"}\n\n' +
        'event: done\ndata: {"message_id": 1288, "session_title": "Moon jump analysis"}\n\n'

      for (const line of stream.split('\n\n')) {
        if (line) parser.feed(line + '\n\n')
      }

      // All 4 token events should be captured
      expect(callbacks.onToken).toHaveBeenCalledTimes(4)
      const fullText = tokens.join('')
      expect(fullText).toContain('I already calculated this earlier')
      expect(fullText).toContain('Let me give you the complete analysis.')
      expect(fullText).toContain('Results:')
      expect(fullText).toContain('Here is your complete exercise plan!')

      // Tool events should be properly dispatched
      expect(callbacks.onToolStart).toHaveBeenCalledTimes(1)
      expect(callbacks.onToolResult).toHaveBeenCalledTimes(1)
      expect(callbacks.onDone).toHaveBeenCalledWith({
        message_id: 1288,
        session_title: 'Moon jump analysis',
      })
    })
  })
})
