/**
 * Zenith — Mock Data Layer
 * Simulates the backend API when the server is not available.
 * All data matches the exact shape the real API would return.
 */
import { getCookie } from './cookieUtils.js'

// ── Static Users ──
export const MOCK_USERS = [
  { user_id: 1, username: 'demo', email: 'demo@zenith.com', password: 'demo123' },
  { user_id: 2, username: 'alice', email: 'alice@zenith.com', password: 'alice123' },
]

// ── Static Sessions ──
// Use fixed ISO timestamps so every page load shows consistent, realistic dates.
export const MOCK_SESSIONS = [
  {
    session_id: 101,
    title: 'Gold price tracker setup',
    created_at: '2025-06-10T08:30:00.000Z',
    updated_at: '2025-06-10T10:15:00.000Z',
  },
  {
    session_id: 102,
    title: 'Python Fibonacci script',
    created_at: '2025-06-09T14:20:00.000Z',
    updated_at: '2025-06-09T14:22:00.000Z',
  },
  {
    session_id: 103,
    title: 'React todo app project',
    created_at: '2025-06-07T09:00:00.000Z',
    updated_at: '2025-06-07T09:05:00.000Z',
  },
  {
    session_id: 104,
    title: 'Bitcoin price monitoring',
    created_at: '2025-06-05T16:45:00.000Z',
    updated_at: '2025-06-05T16:50:00.000Z',
  },
]

// ── Static Messages per Session ──
// NOTE: tool_calls and generation_time are included so they survive page refresh.
export const MOCK_MESSAGES = {
  101: [
    {
      message_id: 1001,
      role: 'user',
      content: 'Track the gold price every 3 hours for 7 days and log it to an Excel file',
      tool_calls: null,
      created_at: '2025-06-10T08:30:00.000Z',
    },
    {
      message_id: 1002,
      role: 'assistant',
      content: "I'll set up an automated gold price tracker for you! This will run every 3 hours for 7 days and append data to an Excel file.\n\nHere's what I'm doing:\n1. **Web search** — find the current gold price\n2. **Extract** — parse the price value\n3. **Excel** — append a row with timestamp + price\n4. **Schedule** — repeat every 3 hours automatically\n\nYour tracker is now live! Check the **Tasks** tab to monitor progress and download the Excel file after the first run.",
      tool_calls: [
        {
          tool_use_id: 'toolu_gold_001',
          tool: 'web_search',
          input: { query: 'current gold price per gram USD INR today', num_results: 5 },
          result: {
            query: 'current gold price per gram USD INR today',
            results: [
              { title: 'Gold Price Today — Live Rate', url: 'https://goldprice.org', snippet: 'Gold price today: $62.45 per gram (USD) | ₹5,198 per gram (INR). Updated 5 minutes ago.' },
              { title: 'MCX Gold Rate — India', url: 'https://mcxindia.com', snippet: 'MCX Gold futures: ₹71,450 per 10g. Spot gold: ₹7,145 per gram.' },
            ],
            status: 'success',
          },
          status: 'done',
        },
        {
          tool_use_id: 'toolu_gold_002',
          tool: 'schedule_task',
          input: {
            description: 'Track gold price every 3 hours and log to Excel',
            interval: '3h',
            duration: '7d',
            steps: [
              { action: 'web_search', params: { query: 'gold price per gram USD today' } },
              { action: 'extract_data', params: { pattern: 'gold price', format: 'number_with_currency' } },
              { action: 'append_to_excel', params: { file: 'gold_prices.xlsx', headers: ['Timestamp', 'Price (USD/g)', 'Price (INR/g)', 'Source'], row: ['{timestamp}', '{extracted_rate}', '', '{source_url}'] } },
            ],
          },
          result: {
            task_id: 'sched_a1b2c3d4',
            status: 'scheduled',
            interval: '3h',
            duration: '7d',
            total_runs: 56,
            next_run: '2025-06-10T13:30:00.000Z',
            description: 'Track gold price every 3 hours and log to Excel',
          },
          status: 'done',
        },
      ],
      generation_time: '4.2',
      created_at: '2025-06-10T08:30:05.000Z',
    },
    {
      message_id: 1003,
      role: 'user',
      content: 'Can you show me what the Excel file will look like?',
      tool_calls: null,
      created_at: '2025-06-10T10:00:00.000Z',
    },
    {
      message_id: 1004,
      role: 'assistant',
      content: "Here's what the **gold_prices.xlsx** file will look like after each run:\n\n| Timestamp | Price (USD/g) | Price (INR/g) | Source |\n|-----------|--------------|--------------|--------|\n| 2025-01-15 09:00 | $62.45 | ₹5,198 | goldprice.org |\n| 2025-01-15 12:00 | $62.61 | ₹5,212 | goldprice.org |\n| 2025-01-15 15:00 | $62.38 | ₹5,196 | goldprice.org |\n\nEach row is appended automatically every 3 hours. After 7 days you'll have **56 data points** ready for analysis.\n\nYou can download the file anytime from the **Tasks tab** → Download button.",
      tool_calls: [],
      generation_time: '2.8',
      created_at: '2025-06-10T10:15:00.000Z',
    },
  ],
  102: [
    {
      message_id: 2001,
      role: 'user',
      content: 'Write and execute a Python script that generates the Fibonacci sequence up to 100',
      tool_calls: null,
      created_at: '2025-06-09T14:20:00.000Z',
    },
    {
      message_id: 2002,
      role: 'assistant',
      content: "I'll write and execute a Python script to generate the Fibonacci sequence up to 100.",
      tool_calls: [
        {
          tool_use_id: 'toolu_fib_001',
          tool: 'execute_code',
          input: {
            language: 'python',
            code: `def fibonacci_up_to(limit):
    sequence = []
    a, b = 0, 1
    while a <= limit:
        sequence.append(a)
        a, b = b, a + b
    return sequence

fibs = fibonacci_up_to(100)
print("Fibonacci sequence up to 100:")
print(fibs)
print(f"\\nTotal numbers: {len(fibs)}")
print(f"Largest value: {fibs[-1]}")`,
            timeout: 30,
          },
          result: {
            status: 'success',
            stdout: 'Fibonacci sequence up to 100:\n[0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89]\n\nTotal numbers: 12\nLargest value: 89',
            stderr: '',
            exit_code: 0,
            execution_time_ms: 47,
          },
          status: 'done',
        },
      ],
      generation_time: '3.1',
      created_at: '2025-06-09T14:20:03.000Z',
    },
    {
      message_id: 2003,
      role: 'assistant',
      content: "The script ran successfully! Here are the results:\n\n**Fibonacci numbers up to 100:**\n```\n[0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89]\n```\n\n- **12 numbers** in the sequence\n- **Largest value:** 89 (the next would be 144, which exceeds 100)\n\nThe algorithm uses an efficient iterative approach — no recursion, so it runs in O(n) time with O(n) space.",
      tool_calls: [],
      generation_time: '2.5',
      created_at: '2025-06-09T14:22:00.000Z',
    },
  ],
  103: [
    {
      message_id: 3001,
      role: 'user',
      content: 'Create a complete React todo app project with all necessary files',
      tool_calls: null,
      created_at: '2025-06-07T09:00:00.000Z',
    },
    {
      message_id: 3002,
      role: 'assistant',
      content: "I'll create a complete React todo app with all the essential files. This will include components, state management, and styling.",
      tool_calls: [
        {
          tool_use_id: 'toolu_proj_001',
          tool: 'create_project',
          input: {
            name: 'react-todo-app',
            description: 'A complete React todo app with CRUD operations and local storage persistence',
            files: [
              { path: 'src/App.jsx', content: '// Main app component' },
              { path: 'src/components/TodoList.jsx', content: '// Todo list component' },
              { path: 'src/components/TodoItem.jsx', content: '// Individual todo item' },
              { path: 'src/components/AddTodo.jsx', content: '// Add new todo form' },
              { path: 'src/App.css', content: '/* App styles */' },
              { path: 'package.json', content: '{}' },
              { path: 'index.html', content: '<!DOCTYPE html>' },
              { path: 'vite.config.js', content: '// Vite config' },
              { path: 'README.md', content: '# React Todo App' },
            ],
          },
          result: {
            project_id: 'proj_e5f6g7h8',
            project_path: '/workspace/users/1/react-todo-app',
            files_created: ['src/App.jsx', 'src/components/TodoList.jsx', 'src/components/TodoItem.jsx', 'src/components/AddTodo.jsx', 'src/App.css', 'package.json', 'index.html', 'vite.config.js', 'README.md'],
            message: "Project 'react-todo-app' created successfully",
          },
          status: 'done',
        },
      ],
      generation_time: '5.6',
      created_at: '2025-06-07T09:00:08.000Z',
    },
    {
      message_id: 3003,
      role: 'assistant',
      content: "Your **React Todo App** is ready! 🎉\n\nHere's what was created:\n\n```\nreact-todo-app/\n├── src/\n│   ├── App.jsx          — Main app with state management\n│   ├── App.css          — Styles\n│   └── components/\n│       ├── TodoList.jsx  — Renders all todos\n│       ├── TodoItem.jsx  — Single todo with edit/delete\n│       └── AddTodo.jsx   — Input form for new todos\n├── package.json\n├── vite.config.js\n├── index.html\n└── README.md\n```\n\n**Features included:**\n- ✅ Add, edit, delete todos\n- ✅ Mark as complete\n- ✅ Filter by status (all/active/done)\n- ✅ LocalStorage persistence\n- ✅ Responsive design\n\nDownload the ZIP from the **Projects tab** and run `npm install && npm run dev`.",
      tool_calls: [],
      generation_time: '3.4',
      created_at: '2025-06-07T09:05:00.000Z',
    },
  ],
  104: [
    {
      message_id: 4001,
      role: 'user',
      content: 'Track Bitcoin price every 1 hour for 3 days',
      tool_calls: null,
      created_at: '2025-06-05T16:45:00.000Z',
    },
    {
      message_id: 4002,
      role: 'assistant',
      content: "Setting up your Bitcoin price monitor — runs every hour for 3 days, all saved to a spreadsheet automatically.",
      tool_calls: [
        {
          tool_use_id: 'toolu_btc_001',
          tool: 'schedule_task',
          input: {
            description: 'Track Bitcoin price every hour',
            interval: '1h',
            duration: '3d',
            steps: [
              { action: 'web_search', params: { query: 'Bitcoin price USD today live' } },
              { action: 'extract_data', params: { pattern: 'Bitcoin price', format: 'number_with_currency' } },
              { action: 'append_to_excel', params: { file: 'bitcoin_prices.xlsx', headers: ['Timestamp', 'Price (USD)', 'Source'], row: ['{timestamp}', '{extracted_rate}', '{source_url}'] } },
            ],
          },
          result: {
            task_id: 'sched_b2c3d4e5',
            status: 'scheduled',
            interval: '1h',
            duration: '3d',
            total_runs: 72,
            next_run: '2025-06-05T17:45:00.000Z',
            description: 'Track Bitcoin price every hour',
          },
          status: 'done',
        },
      ],
      generation_time: '3.8',
      created_at: '2025-06-05T16:45:04.000Z',
    },
    {
      message_id: 4003,
      role: 'assistant',
      content: "✅ **Bitcoin tracker is live!**\n\n- **Interval:** Every 1 hour\n- **Duration:** 3 days (72 total runs)\n- **Output:** `bitcoin_prices.xlsx` in your workspace\n- **Next run:** In ~1 hour\n\nThe tracker will automatically search for the current BTC price, extract the USD value, and append it to your Excel spreadsheet. Check the **Tasks tab** to monitor progress.",
      tool_calls: [],
      generation_time: '2.1',
      created_at: '2025-06-05T16:50:00.000Z',
    },
  ],
}

// ── Static Tasks ──
// Empty by default — tasks are fetched from the backend database only.
// No hardcoded/default tasks should appear in the UI.
export const MOCK_TASKS = []

// ── Static Projects ──
export const MOCK_PROJECTS = [
  {
    project_id: 'proj_e5f6g7h8',
    name: 'react-todo-app',
    description: 'A complete React todo app with CRUD operations and local storage persistence',
    files: JSON.stringify(['src/App.jsx', 'src/components/TodoList.jsx', 'src/components/TodoItem.jsx', 'src/components/AddTodo.jsx', 'src/App.css', 'package.json', 'index.html', 'vite.config.js', 'README.md']),
    created_at: '2025-06-07T09:00:00.000Z',
  },
  {
    project_id: 'proj_f6g7h8i9',
    name: 'python-web-scraper',
    description: 'A Python web scraper with BeautifulSoup and requests for extracting product data',
    files: JSON.stringify(['scraper.py', 'parser.py', 'exporter.py', 'requirements.txt', 'README.md']),
    created_at: '2025-06-04T11:30:00.000Z',
  },
  {
    project_id: 'proj_g7h8i9j0',
    name: 'flask-rest-api',
    description: 'RESTful API with Flask, SQLAlchemy, JWT authentication, and Swagger docs',
    files: JSON.stringify(['app.py', 'models.py', 'routes/auth.py', 'routes/api.py', 'config.py', 'requirements.txt', 'README.md']),
    created_at: '2025-05-31T15:00:00.000Z',
  },
]

// ── In-memory session/message store for new sessions created during demo ──
let _sessions = [...MOCK_SESSIONS]
let _messages = { ...MOCK_MESSAGES }
let _tasks    = [...MOCK_TASKS]
let _projects = [...MOCK_PROJECTS]
let _nextSessionId = 200
let _nextMessageId = 9000

// ── Mock auth store ──
let _currentUser = null

// ── Mock theme store (per user) ──
// Maps user_id → theme preference ('dark' | 'light' | 'system')
const _userThemes = {}

// ── Mock OAuth store (per user) ──
// Maps user_id → array of linked provider objects
const _userOAuthLinks = {}

// ─────────────────────────────────────────────────────────
//  Helper: get current mock user (shared by multiple handlers)
// ─────────────────────────────────────────────────────────
function _getCurrentMockUser() {
  if (_currentUser) return _currentUser
  const token = getCookie('zenith_token')
  if (token && token.startsWith('mock_jwt_token_')) {
    const userId = parseInt(token.split('_')[3])
    const user = MOCK_USERS.find(u => u.user_id === userId)
    if (user) {
      _currentUser = { user_id: user.user_id, username: user.username, email: user.email }
      return _currentUser
    }
  }
  // Default to demo user for easy onboarding
  _currentUser = { user_id: 1, username: 'demo', email: 'demo@zenith.com' }
  return _currentUser
}

// ─────────────────────────────────────────────────────────
//  Mock API Handlers
// ─────────────────────────────────────────────────────────

export const mockHandlers = {

  // POST /api/auth/login
  'POST /api/auth/login': async (body) => {
    const { email, password } = body
    const user = MOCK_USERS.find(u => u.email === email && u.password === password)
    if (!user) throw new Error('Invalid email or password')
    _currentUser = { user_id: user.user_id, username: user.username, email: user.email }
    return {
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      token: `mock_jwt_token_${user.user_id}_${Date.now()}`,
    }
  },

  // POST /api/auth/register
  'POST /api/auth/register': async (body) => {
    const { username, email, password } = body
    if (MOCK_USERS.find(u => u.email === email)) throw new Error('Email already registered')
    if (MOCK_USERS.find(u => u.username === username)) throw new Error('Username already taken')
    const newUser = { user_id: MOCK_USERS.length + 10, username, email, password }
    MOCK_USERS.push(newUser)
    _currentUser = { user_id: newUser.user_id, username, email }
    return {
      user_id: newUser.user_id,
      username,
      email,
      token: `mock_jwt_token_${newUser.user_id}_${Date.now()}`,
    }
  },

  // GET /api/auth/me
  'GET /api/auth/me': async () => {
    if (_currentUser) return _currentUser
    // Try to recover from token
    const token = getCookie('zenith_token')
    if (token && token.startsWith('mock_jwt_token_')) {
      const userId = parseInt(token.split('_')[3])
      const user = MOCK_USERS.find(u => u.user_id === userId)
      if (user) {
        _currentUser = { user_id: user.user_id, username: user.username, email: user.email }
        return _currentUser
      }
    }
    // Default to demo user for easy onboarding
    _currentUser = { user_id: 1, username: 'demo', email: 'demo@zenith.com' }
    return _currentUser
  },

  // GET /api/auth/theme — Get current user's theme preference
  'GET /api/auth/theme': async () => {
    if (!_currentUser) {
      // Try to recover user from token (same as GET /api/auth/me)
      const token = getCookie('zenith_token')
      if (token && token.startsWith('mock_jwt_token_')) {
        const userId = parseInt(token.split('_')[3])
        const user = MOCK_USERS.find(u => u.user_id === userId)
        if (user) _currentUser = { user_id: user.user_id, username: user.username, email: user.email }
      }
    }
    if (!_currentUser) throw new Error('User not found')
    const theme = _userThemes[_currentUser.user_id] || 'dark'
    return { theme }
  },

  // PUT /api/auth/theme — Update user's theme preference
  'PUT /api/auth/theme': async (body) => {
    if (!body || typeof body !== 'object' || !body.theme) {
      throw new Error('Missing required field: "theme"')
    }
    const theme = body.theme
    if (!theme || typeof theme !== 'string' || !theme.trim()) {
      throw new Error('"theme" must not be empty')
    }
    const allowed = ['light', 'dark', 'system']
    if (!allowed.includes(theme)) {
      throw new Error(`Invalid theme "${theme}". Allowed values: [${allowed.join(', ')}]`)
    }
    if (!_currentUser) {
      const token = getCookie('zenith_token')
      if (token && token.startsWith('mock_jwt_token_')) {
        const userId = parseInt(token.split('_')[3])
        const user = MOCK_USERS.find(u => u.user_id === userId)
        if (user) _currentUser = { user_id: user.user_id, username: user.username, email: user.email }
      }
    }
    if (!_currentUser) throw new Error('User not found')
    _userThemes[_currentUser.user_id] = theme
    return { message: 'Theme updated', theme }
  },

  // ── OAuth Endpoints ──

  // GET /api/auth/oauth/link — List linked OAuth providers
  'GET /api/auth/oauth/link': async () => {
    const user = _getCurrentMockUser()
    if (!user) throw new Error('Unauthorized')
    const links = _userOAuthLinks[user.user_id] || []
    return [...links]
  },

  // POST /api/auth/oauth/link — Save provider credentials / start linking
  'POST /api/auth/oauth/link': async (body) => {
    const user = _getCurrentMockUser()
    if (!user) throw new Error('Unauthorized')
    if (!body || !body.provider) throw new Error('Missing required field: "provider"')

    const providerId = body.provider
    if (!_userOAuthLinks[user.user_id]) _userOAuthLinks[user.user_id] = []

    // Check if already linked
    const existing = _userOAuthLinks[user.user_id].find(p => p.provider === providerId)

    if (body.client_id && body.client_secret) {
      // OAuth provider (e.g. Zoho) — in real backend this returns an auth_url
      // In mock mode, simulate immediate connection
      const link = {
        provider: providerId,
        status: 'connected',
        linked_at: new Date().toISOString(),
        client_id: body.client_id,
        has_credentials: true,
      }
      if (existing) {
        Object.assign(existing, link)
      } else {
        _userOAuthLinks[user.user_id].push(link)
      }
      return { provider: providerId, status: 'connected', message: `${providerId} linked successfully` }
    } else if (body.api_key) {
      // API-key provider (e.g. GitHub, Slack)
      const link = {
        provider: providerId,
        status: 'connected',
        linked_at: new Date().toISOString(),
        has_credentials: true,
        auth_type: body.header_type || 'Bearer',
      }
      if (existing) {
        Object.assign(existing, link)
      } else {
        _userOAuthLinks[user.user_id].push(link)
      }
      return { provider: providerId, status: 'connected', message: `${providerId} linked successfully` }
    }

    throw new Error('Missing credentials: provide either client_id+client_secret or api_key')
  },

  // PUT /api/auth/oauth/link — Refresh access token for a provider
  'PUT /api/auth/oauth/link': async (body) => {
    const user = _getCurrentMockUser()
    if (!user) throw new Error('Unauthorized')
    if (!body || !body.provider) throw new Error('Missing required field: "provider"')

    const links = _userOAuthLinks[user.user_id] || []
    const existing = links.find(p => p.provider === body.provider)
    if (!existing) throw new Error(`Provider "${body.provider}" is not linked`)

    existing.refreshed_at = new Date().toISOString()
    existing.status = 'connected'
    return { provider: body.provider, status: 'connected', message: 'Token refreshed' }
  },

  // DELETE /api/auth/oauth/link?provider=... — Unlink a provider
  // Note: matchMock handles query string extraction; this receives the full URL match
  'DELETE /api/auth/oauth/link': async (providerId) => {
    const user = _getCurrentMockUser()
    if (!user) throw new Error('Unauthorized')
    if (!providerId) throw new Error('Missing required query parameter: "provider"')

    if (!_userOAuthLinks[user.user_id]) _userOAuthLinks[user.user_id] = []
    const before = _userOAuthLinks[user.user_id].length
    _userOAuthLinks[user.user_id] = _userOAuthLinks[user.user_id].filter(
      p => p.provider !== providerId
    )
    const removed = _userOAuthLinks[user.user_id].length < before
    if (!removed) throw new Error(`Provider "${providerId}" is not linked`)

    return { provider: providerId, status: 'unlinked', message: `${providerId} disconnected` }
  },

  // GET /api/auth/oauth/callback — Browser OAuth callback
  'GET /api/auth/oauth/callback': async () => {
    // In mock mode, simulate a successful callback
    return { provider: 'mock', status: 'connected', message: 'OAuth callback processed (mock)' }
  },

  // POST /api/auth/oauth/callback — Programmatic token exchange
  'POST /api/auth/oauth/callback': async (body) => {
    if (!body || !body.code) throw new Error('Missing required field: "code"')
    const providerId = body.provider || 'unknown'
    const user = _getCurrentMockUser()
    if (!user) throw new Error('Unauthorized')

    // Simulate successful exchange
    if (!_userOAuthLinks[user.user_id]) _userOAuthLinks[user.user_id] = []
    const existing = _userOAuthLinks[user.user_id].find(p => p.provider === providerId)
    if (existing) {
      existing.status = 'connected'
      existing.linked_at = new Date().toISOString()
    } else {
      _userOAuthLinks[user.user_id].push({
        provider: providerId,
        status: 'connected',
        linked_at: new Date().toISOString(),
        has_credentials: true,
      })
    }
    return { provider: providerId, status: 'connected', message: 'Token exchange successful (mock)' }
  },

  // POST /api/auth/oauth/zoho/init — Zoho-specific init/refresh
  'POST /api/auth/oauth/zoho/init': async (body) => {
    const user = _getCurrentMockUser()
    if (!user) throw new Error('Unauthorized')

    const links = _userOAuthLinks[user.user_id] || []
    const existing = links.find(p => p.provider === 'zoho')

    if (existing && existing.status === 'connected') {
      // Already linked — perform silent refresh
      existing.refreshed_at = new Date().toISOString()
      return { provider: 'zoho', status: 'connected', message: 'Zoho token refreshed silently' }
    }

    // Not linked yet — in real backend, would return an auth_url
    // In mock mode, simulate immediate connection if credentials provided
    if (body?.client_id && body?.client_secret) {
      if (!_userOAuthLinks[user.user_id]) _userOAuthLinks[user.user_id] = []
      _userOAuthLinks[user.user_id].push({
        provider: 'zoho',
        status: 'connected',
        linked_at: new Date().toISOString(),
        has_credentials: true,
        client_id: body.client_id,
      })
      return { provider: 'zoho', status: 'connected', message: 'Zoho connected (mock)' }
    }

    // No credentials — return mock auth URL
    return {
      provider: 'zoho',
      status: 'pending',
      auth_url: 'https://accounts.zoho.com/oauth/v2/auth?client_id=mock&redirect_uri=mock&scope=mock&response_type=code',
      message: 'Redirect user to auth_url to complete Zoho authorization',
    }
  },

  // GET /api/sessions
  'GET /api/sessions': async () => {
    return [..._sessions].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
  },

  // POST /api/sessions
  'POST /api/sessions': async (body) => {
    const session = {
      session_id: _nextSessionId++,
      title: body.title || 'New conversation',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    _sessions.unshift(session)
    _messages[session.session_id] = []
    return session
  },

  // DELETE /api/sessions/:id
  'DELETE /api/sessions': async (sessionId) => {
    _sessions = _sessions.filter(s => s.session_id !== parseInt(sessionId))
    delete _messages[sessionId]
    return { message: 'Session deleted' }
  },

  // GET /api/sessions/:id/messages
  'GET /api/sessions/messages': async (sessionId) => {
    return _messages[parseInt(sessionId)] || []
  },

  // GET /api/tasks — list all tasks for authenticated user
  'GET /api/tasks': async () => {
    return [..._tasks]
  },

  // Note: There is no POST /api/tasks endpoint on the backend.
  // Tasks are created server-side by the AI agent's schedule_task tool.

  // POST /api/task-cancel/{taskId} — cancel a task
  // (mock key uses 'POST /api/tasks/cancel' for matchMock routing)
  'POST /api/tasks/cancel': async (taskId) => {
    _tasks = _tasks.map(t =>
      t.task_id === taskId ? { ...t, status: 'cancelled', is_active: false } : t
    )
    return { task_id: taskId, status: 'cancelled' }
  },

  // GET /api/projects
  'GET /api/projects': async () => {
    return [..._projects]
  },

  }

// ─────────────────────────────────────────────────────────
//  SSE Stream Simulation for Chat
// ─────────────────────────────────────────────────────────

const MOCK_AI_RESPONSES = [
  {
    keywords: ['fibonacci', 'fib'],
    tokens: [
      "I'll generate the Fibonacci sequence for you using Python!\n\n",
    ],
    tool: {
      tool_use_id: 'toolu_mock_001',
      tool: 'execute_code',
      input: { language: 'python', code: 'def fib(n):\n    a, b = 0, 1\n    while a <= n:\n        print(a, end=" ")\n        a, b = b, a + b\n\nfib(100)' },
      result: { status: 'success', stdout: '0 1 1 2 3 5 8 13 21 34 55 89', stderr: '', exit_code: 0, execution_time_ms: 42 },
    },
    after: "\nThe Fibonacci sequence up to 100 is:\n```\n0 1 1 2 3 5 8 13 21 34 55 89\n```\n**12 numbers** in total. The algorithm runs in O(n) time.",
  },
  {
    keywords: ['gold', 'price', 'track'],
    tokens: ["I'll set up a gold price tracker for you! 📈\n\n"],
    tool: {
      tool_use_id: 'toolu_mock_002',
      tool: 'web_search',
      input: { query: 'current gold price per gram USD today' },
      result: { query: 'gold price per gram USD', results: [{ title: 'Gold Price Today', url: 'https://goldprice.org', snippet: 'Gold: $62.45/gram USD | ₹5,198/gram INR. Updated just now.' }] },
    },
    after: "\n**Current Gold Price:** $62.45/gram (USD) | ₹5,198/gram (INR)\n\nYour tracking task has been scheduled! Check the **Tasks tab** to monitor it.",
  },
  {
    keywords: ['bitcoin', 'btc', 'crypto'],
    tokens: ["Setting up your Bitcoin price monitor! ₿\n\n"],
    tool: {
      tool_use_id: 'toolu_mock_003',
      tool: 'schedule_task',
      input: { description: 'Track Bitcoin price hourly', interval: '1h', duration: '3d', steps: [] },
      result: { task_id: `sched_new_${Date.now()}`, status: 'scheduled', interval: '1h', duration: '3d', total_runs: 72, description: 'Track Bitcoin price hourly' },
    },
    after: "\n✅ **Bitcoin tracker scheduled!**\n- Runs every **1 hour** for **3 days**\n- Output saved to `bitcoin_prices.xlsx`\n- Check the **Tasks tab** to monitor and download results.",
  },
  {
    keywords: ['project', 'react', 'todo', 'create', 'build app'],
    tokens: ["I'll create that project for you right away! 🚀\n\n"],
    tool: {
      tool_use_id: 'toolu_mock_004',
      tool: 'create_project',
      input: { name: 'my-app', description: 'AI-generated project', files: [{ path: 'src/App.jsx', content: '' }, { path: 'package.json', content: '' }] },
      result: { project_id: `proj_new_${Date.now()}`, project_path: '/workspace/users/1/my-app', files_created: ['src/App.jsx', 'package.json', 'README.md', 'index.html'] },
    },
    after: "\n✅ **Project created!** It's now available in the **Projects tab** for download as a ZIP file.\n\nRun `npm install && npm run dev` to start development.",
  },
  {
    keywords: ['search', 'weather', 'news', 'latest', 'today'],
    tokens: ["Let me search the web for that information! 🌐\n\n"],
    tool: {
      tool_use_id: 'toolu_mock_005',
      tool: 'web_search',
      input: { query: 'latest information today' },
      result: { query: 'latest information', results: [{ title: 'Search Result 1', url: 'https://example.com', snippet: 'Here is the latest information available on the topic...' }, { title: 'Search Result 2', url: 'https://news.example.com', snippet: 'Additional context and data from the web search...' }] },
    },
    after: "\nHere are the top results I found! The information above should help answer your question. Let me know if you need more specific details.",
  },
]

const DEFAULT_RESPONSE = {
  tokens: ["I'm Zenith, your intelligent task agent! I can help you with:\n\n"],
  noTool: true,
  after: "- ⚡ **Execute code** — Python, JavaScript, Bash\n- 📁 **Create projects** — Full multi-file apps\n- 🌐 **Search the web** — Live data & information\n- ⏰ **Schedule tasks** — Recurring automation\n\nTry asking me to *\"run a Python script\"*, *\"create a React app\"*, or *\"track gold prices every 3 hours\"*!",
}

/**
 * Simulate the SSE chat stream with thinking, status, iteration & artifact events.
 * Returns a cleanup function (like AbortController)
 */
export function mockStreamChat(sessionId, message, callbacks) {
  const {
    onToken, onToolStart, onToolResult, onDone, onError,
    onThinking, onStatus, onIteration, onArtifact,
  } = callbacks

  let cancelled = false
  let timeouts = []
  const streamStartTime = Date.now()

  const cancel = () => {
    if (cancelled) return
    cancelled = true
    timeouts.forEach(clearTimeout)
    // Notify the chat hook that generation was stopped so it can
    // clean up isStreaming state and mark the message as complete
    setTimeout(() => {
      callbacks.onDone?.({ message_id: null, session_title: null, aborted: true })
    }, 0)
  }

  const fire = (fn, data, d) => {
    timeouts.push(setTimeout(() => { if (!cancelled) fn?.(data) }, d))
  }

  const msgLower = message.toLowerCase()
  const match = MOCK_AI_RESPONSES.find(r =>
    r.keywords.some(kw => msgLower.includes(kw))
  )
  const response = match || DEFAULT_RESPONSE

  let delay = 0

  // ── 1. Thinking card: appears immediately ──
  fire(onThinking, { label: 'Thinking…', status: 'active' }, delay)
  delay += 400

  // ── 2. Iteration bar (if tool exists, simulate 2 steps) ──
  if (!response.noTool && response.tool) {
    fire(onIteration, { current: 1, max: 2 }, delay)
    delay += 200
  }

  // ── 3. Stream initial tokens ──
  const allTokens = [...response.tokens]
  allTokens.forEach((token) => {
    for (let i = 0; i < token.length; i++) {
      const char = token[i]
      const d = delay + i * 18
      fire(onToken, char, d)
    }
    delay += token.length * 18
  })

  // ── 4. Mark thinking as done once first tokens have streamed ──
  fire(onThinking, { label: 'Thought', status: 'done' }, delay)

  // ── 5. Tool call with status cards ──
  if (!response.noTool && response.tool) {
    const toolName = response.tool.tool
    const toolIcon = {
      execute_code: '⚡', web_search: '🌐', schedule_task: '⏰',
      create_project: '📁', read_file: '📄', list_files: '📂',
    }[toolName] || '🔧'
    const toolLabel = {
      execute_code: 'Executing code', web_search: 'Searching the web',
      schedule_task: 'Scheduling task', create_project: 'Creating project',
      read_file: 'Reading file', list_files: 'Listing files',
    }[toolName] || `Running ${toolName}`

    // Status card: active
    fire(onStatus, {
      tool: toolName, status: 'active', icon: toolIcon,
      label: toolLabel,
      args_preview: response.tool.input?.query || response.tool.input?.language || '',
    }, delay + 100)

    // Tool start
    fire(onToolStart, {
      tool_use_id: response.tool.tool_use_id,
      tool: toolName,
      input: response.tool.input,
    }, delay + 200)

    // Tool result + status done
    fire(onToolResult, {
      tool_use_id: response.tool.tool_use_id,
      tool: toolName,
      result: response.tool.result,
    }, delay + 1400)

    fire(onStatus, {
      tool: toolName, status: 'done', icon: toolIcon,
      label: toolLabel,
      args_preview: response.tool.input?.query || response.tool.input?.language || '',
    }, delay + 1400)

    // Update iteration to step 2
    fire(onIteration, { current: 2, max: 2 }, delay + 1500)

    delay += 1800
  }

  // ── 6. After-tool tokens ──
  if (response.after) {
    for (let i = 0; i < response.after.length; i++) {
      const char = response.after[i]
      const d = delay + i * 16
      fire(onToken, char, d)
    }
    delay += response.after.length * 16
  }

  // ── 7. Artifact (for chart/visual requests) ──
  const wantsChart = msgLower.includes('chart') || msgLower.includes('graph') || msgLower.includes('visual') || msgLower.includes('draw')
  if (wantsChart) {
    fire(onArtifact, {
      id: `artifact_${Date.now()}`,
      type: 'html',
      title: 'Bar Chart — Sample Data',
      content: `<!DOCTYPE html>
<html><head><style>
  body { margin: 0; padding: 24px; font-family: -apple-system, sans-serif; background: #fff; }
  .chart { display: flex; align-items: flex-end; gap: 12px; height: 200px; padding: 20px 0; }
  .bar-group { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .bar { width: 48px; border-radius: 6px 6px 0 0; transition: height 0.8s ease;
         background: linear-gradient(180deg, #6366f1, #818cf8); }
  .label { font-size: 12px; color: #64748b; }
  .value { font-size: 11px; color: #6366f1; font-weight: 600; }
  h3 { margin: 0 0 8px; color: #1e293b; font-size: 16px; }
</style></head><body>
  <h3>Monthly Sales (units)</h3>
  <div class="chart">
    <div class="bar-group"><div class="value">42</div><div class="bar" style="height:84px"></div><div class="label">Jan</div></div>
    <div class="bar-group"><div class="value">68</div><div class="bar" style="height:136px"></div><div class="label">Feb</div></div>
    <div class="bar-group"><div class="value">55</div><div class="bar" style="height:110px"></div><div class="label">Mar</div></div>
    <div class="bar-group"><div class="value">91</div><div class="bar" style="height:182px"></div><div class="label">Apr</div></div>
    <div class="bar-group"><div class="value">73</div><div class="bar" style="height:146px"></div><div class="label">May</div></div>
  </div>
</body></html>`,
    }, delay + 200)
    delay += 400
  }

  // ── 8. Done event ──
  timeouts.push(setTimeout(() => {
    if (!cancelled) {
      // Calculate generation time
      const generationTime = ((Date.now() - streamStartTime) / 1000).toFixed(1)

      // Save message to in-memory store — include tool_calls and generation_time
      // so they survive page refresh (fetched back via GET /api/sessions/:id/messages)
      const sid = parseInt(sessionId)
      if (!_messages[sid]) _messages[sid] = []
      _messages[sid].push({
        message_id: _nextMessageId++,
        role: 'user',
        content: message,
        tool_calls: null,
        created_at: new Date().toISOString(),
      })
      const assistantContent = response.tokens.join('') + (response.after || '')
      const finalToolCalls = response.tool && !response.noTool
        ? [{ ...response.tool, status: 'done' }]
        : []
      _messages[sid].push({
        message_id: _nextMessageId++,
        role: 'assistant',
        content: assistantContent,
        tool_calls: finalToolCalls,
        generation_time: generationTime,
        created_at: new Date().toISOString(),
      })

      // Always update session's updated_at when a message is completed
      const sess = _sessions.find(s => s.session_id === sid)
      let sessionTitle = sess?.title
      if (sess) {
        sess.updated_at = new Date().toISOString()
        // Also update title if still the default
        if (sess.title === 'New conversation') {
          sessionTitle = message.length > 50 ? message.substring(0, 47) + '...' : message
          sess.title = sessionTitle
        }
      }

      onDone?.({ message_id: _nextMessageId - 1, session_title: sessionTitle })
    }
  }, delay + 200))

  return { abort: cancel }
}
