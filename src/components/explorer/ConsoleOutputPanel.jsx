/**
 * ConsoleOutputPanel — Terminal-style output display
 *
 * Renders execution output in a dark terminal-like panel with:
 *   - Color-coded stdout/stderr/system lines
 *   - Execution status header with timing info
 *   - Auto-scroll to bottom on new output
 *   - Clear / Copy buttons
 *   - Scrollable output area
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import { EXECUTION_STATUS, EXECUTABLE_LANGUAGES, getExecutionLanguage } from '../../hooks/useCodeExecution.js';
import './ConsoleOutputPanel.css';

// ── Status badge metadata ──
const STATUS_META = {
  [EXECUTION_STATUS.IDLE]:        { label: 'Idle',        color: '#5a8aac', bg: 'rgba(90,138,172,0.08)' },
  [EXECUTION_STATUS.RUNNING]:     { label: 'Running…',    color: '#F9B21C', bg: 'rgba(249,178,28,0.08)' },
  [EXECUTION_STATUS.SUCCESS]:     { label: 'Completed',   color: '#0A9949', bg: 'rgba(10,153,73,0.08)' },
  [EXECUTION_STATUS.ERROR]:       { label: 'Error',       color: '#E42527', bg: 'rgba(228,37,39,0.08)' },
  [EXECUTION_STATUS.TIMEOUT]:     { label: 'Timed Out',   color: '#F9B21C', bg: 'rgba(249,178,28,0.08)' },
  [EXECUTION_STATUS.UNSUPPORTED]: { label: 'Unsupported', color: '#5a8aac', bg: 'rgba(90,138,172,0.08)' },
};

// ── Icons ──
function ClearIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M4 4l1 10a1 1 0 001 1h4a1 1 0 001-1l1-10"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="5" y="5" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M11 5V3a1 1 0 00-1-1H4a1 1 0 00-1 1v8a1 1 0 001 1h1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function SpinnerIcon({ size = 12 }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 16 16"
      style={{ animation: 'cop-spin 0.7s linear infinite', display: 'block', flexShrink: 0 }}
    >
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor"
        strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {Array} props.output — Array of { type: 'stdout'|'stderr'|'system', text: string, timestamp?: number }
 * @param {string} props.status — Execution status from EXECUTION_STATUS
 * @param {number|null} props.exitCode — Process exit code
 * @param {number|null} props.executionTime — Execution time in ms
 * @param {string|null} props.currentFile — Currently executing filename
 * @param {function} props.onClear — Clear output callback
 * @param {function} props.onStop — Stop execution callback
 * @param {function} props.onClose — Close console callback
 */
export default function ConsoleOutputPanel({
  output = [],
  status = EXECUTION_STATUS.IDLE,
  exitCode = null,
  executionTime = null,
  currentFile = null,
  onClear,
  onStop,
  onClose,
}) {
  const outputEndRef = useRef(null);
  const outputContainerRef = useRef(null);
  const [copied, setCopied] = useState(false);

  // Auto-scroll to bottom on new output
  useEffect(() => {
    if (outputEndRef.current) {
      outputEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [output]);

  // Copy all output to clipboard
  const handleCopy = useCallback(() => {
    const text = output
      .map(line => line.text)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [output]);

  const meta = STATUS_META[status] || STATUS_META[EXECUTION_STATUS.IDLE];
  const isRunning = status === EXECUTION_STATUS.RUNNING;
  const lang = currentFile ? getExecutionLanguage(currentFile) : null;
  const langInfo = lang ? EXECUTABLE_LANGUAGES[lang] : null;

  return (
    <div className="cop-panel">
      {/* ── Header bar ── */}
      <div className="cop-header">
        <div className="cop-header-left">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <rect x="1" y="2" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M4 6l3 2.5L4 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 11h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span className="cop-header-title">Console Output</span>

          {/* Language badge */}
          {langInfo && (
            <span
              className="cop-lang-badge"
              style={{ borderColor: `${langInfo.color}30`, color: langInfo.color }}
            >
              {langInfo.label}
            </span>
          )}

          {/* Status badge */}
          <span
            className="cop-status-badge"
            style={{ background: meta.bg, color: meta.color, borderColor: `${meta.color}25` }}
          >
            {isRunning && <SpinnerIcon size={10} />}
            {meta.label}
          </span>

          {/* Execution time */}
          {executionTime != null && !isRunning && (
            <span className="cop-timing">{executionTime}ms</span>
          )}

          {/* Exit code */}
          {exitCode != null && !isRunning && (
            <span className={`cop-exitcode ${exitCode === 0 ? 'cop-exitcode-ok' : 'cop-exitcode-err'}`}>
              exit: {exitCode}
            </span>
          )}
        </div>

        <div className="cop-header-right">
          {/* Stop button (while running) */}
          {isRunning && onStop && (
            <button className="cop-btn cop-btn-stop" onClick={onStop} title="Stop execution">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor" />
              </svg>
            </button>
          )}

          {/* Copy button */}
          {output.length > 0 && (
            <button className="cop-btn" onClick={handleCopy} title="Copy output">
              {copied ? (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <CopyIcon size={12} />
              )}
            </button>
          )}

          {/* Clear button */}
          {output.length > 0 && onClear && (
            <button className="cop-btn" onClick={onClear} title="Clear console">
              <ClearIcon size={12} />
            </button>
          )}

          {/* Close button */}
          {onClose && (
            <button className="cop-btn cop-btn-close" onClick={onClose} title="Close console">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Output body ── */}
      <div className="cop-body" ref={outputContainerRef}>
        {output.length === 0 ? (
          <div className="cop-empty">
            <span className="cop-empty-text">
              {isRunning ? 'Waiting for output…' : 'No output yet. Click Run to execute code.'}
            </span>
          </div>
        ) : (
          output.map((line, i) => (
            <div
              key={i}
              className={`cop-line cop-line-${line.type}`}
            >
              {line.type === 'system' && <span className="cop-line-prefix cop-prefix-system">›</span>}
              {line.type === 'stderr' && <span className="cop-line-prefix cop-prefix-stderr">✗</span>}
              <span className="cop-line-text">{line.text}</span>
            </div>
          ))
        )}
        <div ref={outputEndRef} />
      </div>
    </div>
  );
}
