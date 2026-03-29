// In dev the Vite proxy forwards /api/* → backend, so BASE is empty.
// In production set VITE_API_BASE_URL to the real backend origin.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export const SSE_EVENTS = {
  TOKEN:       'token',
  TOOL_START:  'tool_start',
  TOOL_RESULT: 'tool_result',
  THINKING:    'thinking',
  STATUS:      'status',
  ITERATION:   'iteration',
  ARTIFACT:    'artifact',
  DONE:        'done',
  ERROR:       'error',
}

export const SIDEBAR_TABS = {
  CHATS:    'chats',
  TASKS:    'tasks',
  PROJECTS: 'projects',
  EXPLORER: 'explorer',
}

export const TASK_STATUS = {
  RUNNING:   'running',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  FAILED:    'failed',
  SCHEDULED: 'scheduled',
}

export const MESSAGE_ROLES = {
  USER:      'user',
  ASSISTANT: 'assistant',
}

export const TOOL_ICONS = {
  execute_code:           '⚡',
  create_project:         '📁',
  web_search:             '🌐',
  schedule_task:          '⏰',
  cancel_scheduled_task:  '🚫',
  read_file:              '📄',
  list_files:             '📂',
}

export const TOOL_LABELS = {
  execute_code:           'Execute Code',
  create_project:         'Create Project',
  web_search:             'Web Search',
  schedule_task:          'Schedule Task',
  cancel_scheduled_task:  'Cancel Task',
  read_file:              'Read File',
  list_files:             'List Files',
}
