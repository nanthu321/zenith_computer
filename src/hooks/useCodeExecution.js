/**
 * useCodeExecution — Client-side code execution hook
 *
 * Sends code to the backend for compilation + execution in a
 * sandboxed environment, then streams/returns the console output.
 *
 * Supported languages:
 *   - Python (.py)    → runs via python3 interpreter
 *   - Java (.java)    → compiles with javac, runs with java
 *   - JavaScript (.js, .mjs) → runs via Node.js
 *   - Shell (.sh, .bash) → runs via bash
 *
 * States: idle | running | success | error | timeout | unsupported
 *
 * Security:
 *   - Execution is sandboxed on the backend with timeouts
 *   - Maximum output size is capped
 *   - Dangerous operations are blocked by the backend sandbox
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { workspaceApi } from '../api/workspace.js';

// ── Execution states ──
export const EXECUTION_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  SUCCESS: 'success',
  ERROR: 'error',
  TIMEOUT: 'timeout',
  UNSUPPORTED: 'unsupported',
};

// ── Language metadata for supported executable file types ──
export const EXECUTABLE_LANGUAGES = {
  python: {
    label: 'Python',
    extensions: ['py', 'pyw'],
    color: '#3776ab',
    icon: '🐍',
    command: 'python3',
  },
  java: {
    label: 'Java',
    extensions: ['java'],
    color: '#e76f00',
    icon: '☕',
    command: 'javac + java',
  },
  javascript: {
    label: 'JavaScript',
    extensions: ['js', 'mjs'],
    color: '#f5de19',
    icon: 'JS',
    command: 'node',
  },
  shell: {
    label: 'Shell',
    extensions: ['sh', 'bash'],
    color: '#4ec9b0',
    icon: '$',
    command: 'bash',
  },
};

// Extension → language mapping
const EXT_TO_LANGUAGE = {};
for (const [lang, meta] of Object.entries(EXECUTABLE_LANGUAGES)) {
  for (const ext of meta.extensions) {
    EXT_TO_LANGUAGE[ext] = lang;
  }
}

/**
 * Detect the execution language from a filename.
 * Returns the language key (e.g., 'python', 'java') or null if unsupported.
 */
export function getExecutionLanguage(filename) {
  if (!filename) return null;
  const ext = filename.split('.').pop().toLowerCase();
  return EXT_TO_LANGUAGE[ext] || null;
}

/**
 * Returns true if the file can be executed server-side.
 */
export function isExecutable(filename) {
  return getExecutionLanguage(filename) !== null;
}

/**
 * Get language metadata for a filename.
 */
export function getLanguageInfo(filename) {
  const lang = getExecutionLanguage(filename);
  if (!lang) return null;
  return EXECUTABLE_LANGUAGES[lang];
}

/**
 * Maximum execution time (seconds) — must match backend config.
 */
const MAX_EXECUTION_TIME = 30;

/**
 * Maximum output lines to keep in the console.
 */
const MAX_OUTPUT_LINES = 500;

/**
 * Simulate code execution locally (for when backend is unavailable).
 * This provides a client-side fallback for JavaScript only.
 */
function executeJsLocally(code) {
  const output = [];
  const startTime = Date.now();

  // Capture console output
  const fakeConsole = {
    log: (...args) => output.push({ type: 'stdout', text: args.map(String).join(' ') }),
    warn: (...args) => output.push({ type: 'stderr', text: '[WARN] ' + args.map(String).join(' ') }),
    error: (...args) => output.push({ type: 'stderr', text: '[ERROR] ' + args.map(String).join(' ') }),
    info: (...args) => output.push({ type: 'stdout', text: args.map(String).join(' ') }),
  };

  try {
    // Create a sandboxed function with fake console
    const fn = new Function('console', code);
    fn(fakeConsole);
  } catch (err) {
    output.push({ type: 'stderr', text: `Error: ${err.message}` });
  }

  const elapsed = Date.now() - startTime;
  return {
    success: output.every(o => o.type === 'stdout'),
    output,
    exitCode: output.some(o => o.type === 'stderr') ? 1 : 0,
    executionTime: elapsed,
  };
}

/**
 * Execute code via the backend API.
 * Falls back to local execution for JavaScript if the backend is unavailable.
 */
async function executeCodeOnBackend(language, filename, code) {
  // Try backend execution first
  try {
    const result = await workspaceApi.executeCode(language, filename, code);

    // Normalize the result
    return {
      success: result.success !== false && (result.exitCode === 0 || result.exit_code === 0),
      output: normalizeOutput(result.output || result.stdout || ''),
      errorOutput: normalizeOutput(result.errorOutput || result.stderr || ''),
      exitCode: result.exitCode ?? result.exit_code ?? 0,
      executionTime: result.executionTime ?? result.execution_time ?? 0,
      timedOut: result.timedOut ?? result.timed_out ?? false,
    };
  } catch (backendErr) {
    console.warn('[useCodeExecution] Backend execution failed:', backendErr.message);

    // Fallback: for JavaScript, execute locally
    if (language === 'javascript') {
      console.info('[useCodeExecution] Falling back to local JS execution');
      const localResult = executeJsLocally(code);
      return {
        success: localResult.exitCode === 0,
        output: localResult.output.filter(o => o.type === 'stdout').map(o => o.text),
        errorOutput: localResult.output.filter(o => o.type === 'stderr').map(o => o.text),
        exitCode: localResult.exitCode,
        executionTime: localResult.executionTime,
        timedOut: false,
        _localExecution: true,
      };
    }

    // For other languages, we need the backend
    throw new Error(
      `Server-side execution is required for ${EXECUTABLE_LANGUAGES[language]?.label || language} files. ` +
      `Backend returned: ${backendErr.message}`
    );
  }
}

/**
 * Normalize output to an array of strings.
 */
function normalizeOutput(output) {
  if (!output) return [];
  if (Array.isArray(output)) return output.map(String);
  if (typeof output === 'string') return output.split('\n');
  return [String(output)];
}

/**
 * React hook for code execution with console output.
 */
export function useCodeExecution() {
  const [status, setStatus] = useState(EXECUTION_STATUS.IDLE);
  const [output, setOutput] = useState([]); // Array of { type: 'stdout'|'stderr'|'system', text: string, timestamp?: number }
  const [exitCode, setExitCode] = useState(null);
  const [executionTime, setExecutionTime] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [currentFile, setCurrentFile] = useState(null);

  const abortRef = useRef(null);
  const startTimeRef = useRef(null);

  /**
   * Add a line to the console output.
   */
  const addOutput = useCallback((type, text) => {
    setOutput(prev => {
      const next = [...prev, {
        type,
        text,
        timestamp: Date.now(),
      }];
      // Cap output size
      if (next.length > MAX_OUTPUT_LINES) {
        return [...next.slice(-MAX_OUTPUT_LINES)];
      }
      return next;
    });
  }, []);

  /**
   * Clear console output.
   */
  const clearOutput = useCallback(() => {
    setOutput([]);
    setExitCode(null);
    setExecutionTime(null);
    setErrorMessage(null);
  }, []);

  /**
   * Stop/abort the current execution.
   */
  const stopExecution = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (status === EXECUTION_STATUS.RUNNING) {
      setStatus(EXECUTION_STATUS.IDLE);
      addOutput('system', '⛔ Execution cancelled by user.');
    }
  }, [status, addOutput]);

  /**
   * Execute code.
   * @param {string} filename - The filename (used for language detection)
   * @param {string} code - The code to execute
   */
  const execute = useCallback(async (filename, code) => {
    if (!filename || code == null) {
      setStatus(EXECUTION_STATUS.ERROR);
      setErrorMessage('No file content to execute.');
      return;
    }

    const language = getExecutionLanguage(filename);
    if (!language) {
      setStatus(EXECUTION_STATUS.UNSUPPORTED);
      setErrorMessage(`"${filename}" is not a supported executable file type.`);
      return;
    }

    // Set up abort controller
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    const langInfo = EXECUTABLE_LANGUAGES[language];
    setStatus(EXECUTION_STATUS.RUNNING);
    setErrorMessage(null);
    setExitCode(null);
    setExecutionTime(null);
    setCurrentFile(filename);
    setOutput([]);

    // Add system header
    addOutput('system', `▶ Running ${langInfo.label} — ${filename}`);
    addOutput('system', `  Command: ${langInfo.command}`);
    addOutput('system', '─'.repeat(50));

    startTimeRef.current = Date.now();

    try {
const result = await executeCodeOnBackend(
        language,
        filename,
        code
      );
      // Check if execution was aborted
      if (abortRef.current?.signal.aborted) return;

      // Add stdout lines
      if (result.output && result.output.length > 0) {
        for (const line of result.output) {
          addOutput('stdout', line);
        }
      }

      // Add stderr lines
      if (result.errorOutput && result.errorOutput.length > 0) {
        for (const line of result.errorOutput) {
          addOutput('stderr', line);
        }
      }

      // If no output at all
      if ((!result.output || result.output.length === 0) && (!result.errorOutput || result.errorOutput.length === 0)) {
        addOutput('system', '(no output)');
      }

      const elapsed = result.executionTime || (Date.now() - startTimeRef.current);

      // Add summary footer
      addOutput('system', '─'.repeat(50));

      if (result.timedOut) {
        setStatus(EXECUTION_STATUS.TIMEOUT);
        addOutput('system', `⏱ Execution timed out after ${MAX_EXECUTION_TIME}s`);
        setErrorMessage(`Execution timed out after ${MAX_EXECUTION_TIME} seconds.`);
      } else if (result.success) {
        setStatus(EXECUTION_STATUS.SUCCESS);
        addOutput('system', `✓ Process exited with code ${result.exitCode} (${elapsed}ms)`);
      } else {
        setStatus(EXECUTION_STATUS.ERROR);
        addOutput('system', `✗ Process exited with code ${result.exitCode} (${elapsed}ms)`);
        setErrorMessage(`Process exited with code ${result.exitCode}`);
      }

      if (result._localExecution) {
        addOutput('system', '⚠ Executed locally in browser (backend unavailable)');
      }

      setExitCode(result.exitCode);
      setExecutionTime(elapsed);

    } catch (err) {
      if (abortRef.current?.signal.aborted) return;

      const elapsed = Date.now() - startTimeRef.current;
      setStatus(EXECUTION_STATUS.ERROR);
      setErrorMessage(err.message || 'Execution failed');
      addOutput('stderr', err.message || 'Unknown execution error');
      addOutput('system', '─'.repeat(50));
      addOutput('system', `✗ Execution failed (${elapsed}ms)`);
      setExitCode(1);
      setExecutionTime(elapsed);
    }
  }, [addOutput]);

  /**
   * Reset to idle state.
   */
  const reset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStatus(EXECUTION_STATUS.IDLE);
    setOutput([]);
    setExitCode(null);
    setExecutionTime(null);
    setErrorMessage(null);
    setCurrentFile(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  return {
    status,
    output,
    exitCode,
    executionTime,
    errorMessage,
    currentFile,
    execute,
    stopExecution,
    clearOutput,
    reset,
    // Utility re-exports
    isExecutable,
    getExecutionLanguage,
    getLanguageInfo,
  };
}
