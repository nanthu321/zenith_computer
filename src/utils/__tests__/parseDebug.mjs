// Quick debug script to verify the production parser works correctly
// Run: node src/utils/__tests__/parseDebug.mjs

const normalizeSSEBuffer = (buf) => {
    buf = buf.replace(/\}(event:)/g, '}\n$1')
    buf = buf.replace(
      /\b(token|tool_start|tool_result|thinking|status|iteration|artifact|done|error)(data:)/g,
      '$1\n$2'
    )
    buf = buf.replace(/\}(data:)/g, '}\n$1')
    return buf
}

const processLines = (lines, currentEvent, dispatchSSE) => {
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        currentEvent = ''
        continue
      }
      if (trimmed.startsWith('event:')) {
        currentEvent = trimmed.slice(6).trim()
      } else if (trimmed.startsWith('data:')) {
        const jsonStr = trimmed.slice(5).trim()
        if (jsonStr && currentEvent) {
          try {
            const data = JSON.parse(jsonStr)
            dispatchSSE(currentEvent, data)
          } catch (e) {
            console.log('JSON PARSE ERROR:', e.message, 'for:', jsonStr.substring(0, 80))
          }
          currentEvent = ''
        }
      }
    }
    return currentEvent
}

// Track dispatched events
const events = []
const dispatchSSE = (type, data) => {
    events.push({ type, data })
}

// ========================================
// TEST 1: Standard newline-delimited SSE
// ========================================
console.log('=== TEST 1: Standard SSE format ===')
const sseChunks = [
  'event: thinking\ndata: {"label": "Thinking", "status": "active"}\n\n',
  'event: iteration\ndata: {"current": 1, "max": 5}\n\n',
  'event: token\ndata: {"content": "Hello world. "}\n\n',
  'event: token\ndata: {"content": "Let me calculate:"}\n\n',
  'event: tool_start\ndata: {"tool": "execute_code", "tool_use_id": "t1", "input": {"code": "print(42)"}}\n\n',
  'event: status\ndata: {"tool": "execute_code", "status": "active"}\n\n',
  'event: status\ndata: {"tool": "execute_code", "status": "done"}\n\n',
  'event: tool_result\ndata: {"tool": "execute_code", "tool_use_id": "t1", "result": {"exit_code": 0, "stdout": "42\\n"}}\n\n',
  'event: done\ndata: {"message_id": 1288}\n\n',
]

let buffer = ''
let currentEvent = ''

for (const chunk of sseChunks) {
    buffer += chunk
    buffer = normalizeSSEBuffer(buffer)
    const lines = buffer.split('\n')
    buffer = lines.pop()
    currentEvent = processLines(lines, currentEvent, dispatchSSE)
}

if (buffer.trim()) {
    let remaining = normalizeSSEBuffer(buffer)
    const remainingLines = remaining.split('\n')
    processLines(remainingLines, currentEvent, dispatchSSE)
}

console.log('Events dispatched:', events.length)
events.forEach((e, i) => console.log(`  ${i}: ${e.type} ${JSON.stringify(e.data).substring(0, 80)}`))

const tokenText = events.filter(e => e.type === 'token').map(e => e.data.content).join('')
console.log('Token text:', JSON.stringify(tokenText))
console.log('tool_start count:', events.filter(e => e.type === 'tool_start').length)
console.log('tool_result count:', events.filter(e => e.type === 'tool_result').length)
console.log('done count:', events.filter(e => e.type === 'done').length)
console.log('')

// ========================================
// TEST 2: Concatenated (no newlines)
// ========================================
console.log('=== TEST 2: Concatenated format (bug report) ===')
events.length = 0
buffer = ''
currentEvent = ''

const concatenatedStream =
  'event: thinkingdata: {"label": "Thinking\\u2026", "status": "active"}' +
  'event: iterationdata: {"current": 1, "max": 5}' +
  'event: thinkingdata: {"label": "Thought", "status": "done"}' +
  'event: tokendata: {"content": "I already calculated this earlier in our conversation! "}' +
  'event: tokendata: {"content": "Let me give you "}' +
  'event: tokendata: {"content": "the results."}' +
  'event: tool_startdata: {"tool": "execute_code", "tool_use_id": "toolu_01", "input": {"code": "import math\\nprint(42)"}}' +
  'event: statusdata: {"tool": "execute_code", "label": "Running code", "status": "active"}' +
  'event: statusdata: {"tool": "execute_code", "label": "Running code", "status": "done"}' +
  'event: tool_resultdata: {"tool": "execute_code", "tool_use_id": "toolu_01", "result": {"exit_code": 0, "stdout": "42\\n", "stderr": ""}}' +
  'event: iterationdata: {"current": 2, "max": 5}' +
  'event: donedata: {"message_id":1288,"session_title":"Moon jump"}'

buffer += concatenatedStream
buffer = normalizeSSEBuffer(buffer)
const lines = buffer.split('\n')
buffer = lines.pop()
currentEvent = processLines(lines, currentEvent, dispatchSSE)

if (buffer.trim()) {
    let remaining = normalizeSSEBuffer(buffer)
    const remainingLines = remaining.split('\n')
    processLines(remainingLines, currentEvent, dispatchSSE)
}

console.log('Events dispatched:', events.length)
events.forEach((e, i) => console.log(`  ${i}: ${e.type} ${JSON.stringify(e.data).substring(0, 80)}`))

const tokenText2 = events.filter(e => e.type === 'token').map(e => e.data.content).join('')
console.log('Token text:', JSON.stringify(tokenText2))
console.log('tool_start count:', events.filter(e => e.type === 'tool_start').length)
console.log('tool_result count:', events.filter(e => e.type === 'tool_result').length)
console.log('done count:', events.filter(e => e.type === 'done').length)

// ========================================
// TEST 3: Edge case - nested JSON with data: in values
// ========================================
console.log('\n=== TEST 3: Nested JSON with code containing data: ===')
events.length = 0
buffer = ''
currentEvent = ''

// The input code contains "data:" as a string value inside JSON
const edgeCase =
  'event: tool_startdata: {"tool": "execute_code", "tool_use_id": "t2", "input": {"code": "data = fetch(url)\\nprint(data)"}}' +
  'event: tool_resultdata: {"tool": "execute_code", "tool_use_id": "t2", "result": {"exit_code": 0, "stdout": "data: ok"}}'

buffer += edgeCase
buffer = normalizeSSEBuffer(buffer)
const lines3 = buffer.split('\n')
buffer = lines3.pop()
currentEvent = processLines(lines3, currentEvent, dispatchSSE)

if (buffer.trim()) {
    let remaining = normalizeSSEBuffer(buffer)
    const remainingLines = remaining.split('\n')
    processLines(remainingLines, currentEvent, dispatchSSE)
}

console.log('Events dispatched:', events.length)
events.forEach((e, i) => console.log(`  ${i}: ${e.type} ${JSON.stringify(e.data).substring(0, 120)}`))
console.log('tool_start count:', events.filter(e => e.type === 'tool_start').length)
console.log('tool_result count:', events.filter(e => e.type === 'tool_result').length)

console.log('\n=== ALL TESTS COMPLETE ===')
