/**
 * CodePreviewPanel — In-app file preview panel
 *
 * Renders the currently open file directly inside an iframe using
 * blob URLs — no backend server required.
 *
 * Supported file types:
 *   HTML/HTM  → live render
 *   CSS       → applied to a sample page
 *   SVG       → rendered as image
 *   JS/JSX    → sandboxed script runner with console capture
 *   TS/TSX    → sandboxed runner (note: TS syntax not transpiled)
 *   MD/MDX    → rendered as styled HTML
 *   JSON      → pretty-printed
 *   XML/TXT   → syntax-highlighted plain text
 *
 * Disabled when no file is open or the file type is not previewable.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useCodePreview, PREVIEW_STATUS, isPreviewable, getPreviewMode } from '../../hooks/useCodePreview.js';
import './CodePreviewPanel.css';

// ── Status display metadata ──
const STATUS_META = {
  [PREVIEW_STATUS.IDLE]:        { label: 'No preview',   color: '#5a8aac', dot: '#5a8aac' },
  [PREVIEW_STATUS.LOADING]:     { label: 'Rendering…',   color: '#F9B21C', dot: '#F9B21C' },
  [PREVIEW_STATUS.READY]:       { label: 'Live',         color: '#0A9949', dot: '#0A9949' },
  [PREVIEW_STATUS.ERROR]:       { label: 'Error',        color: '#E42527', dot: '#E42527' },
  [PREVIEW_STATUS.UNSUPPORTED]: { label: 'Not supported', color: '#5a8aac', dot: '#3a5570' },
};

// ── Mode labels ──
const MODE_LABELS = {
  html:     'HTML',
  css:      'CSS',
  svg:      'SVG',
  js:       'JavaScript',
  markdown: 'Markdown',
  json:     'JSON',
  xml:      'XML',
  text:     'Plain Text',
  image:    'Image',
};

// ── Icons ──
function RunIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <polygon points="3,2 13,8 3,14" fill="currentColor" />
    </svg>
  );
}

function RefreshIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M13.5 3A7 7 0 002.1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M2.5 13A7 7 0 0013.9 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M2 5.5V9h3.5M14 10.5V7h-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function ExternalLinkIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M10 2h4v4M14 2L8.5 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ConsoleIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 6l3 2.5L4 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 11h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function StopIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function Spinner({ size = 12, color = '#F9B21C' }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 16 16"
      style={{ animation: 'cp-spin 0.7s linear infinite', display: 'block', flexShrink: 0 }}
    >
      <circle cx="8" cy="8" r="6" fill="none" stroke={color}
        strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

// ── "Not previewable" tips per extension ──
const UNSUPPORTED_TIPS = {
  py:   'Python files require a server runtime to execute.',
  java: 'Java files require compilation and a JVM runtime.',
  rs:   'Rust files require compilation.',
  go:   'Go files require compilation.',
  rb:   'Ruby files require a Ruby runtime.',
  php:  'PHP files require a PHP runtime.',
  sh:   'Shell scripts require a terminal runtime.',
  bash: 'Shell scripts require a terminal runtime.',
  c:    'C files require compilation.',
  cpp:  'C++ files require compilation.',
  cs:   'C# files require the .NET runtime.',
  kt:   'Kotlin files require compilation.',
};

function getUnsupportedTip(filename) {
  if (!filename) return 'Open a previewable file to use Preview.';
  const ext = filename.split('.').pop().toLowerCase();
  return UNSUPPORTED_TIPS[ext] || `".${ext}" files cannot be previewed directly in the browser.`;
}

/**
 * @param {object} props
 * @param {object|null} props.currentFile  — the currently open file tab { name, path, _project }
 * @param {string|null} props.fileContent  — the current file content from the editor
 */
export default function CodePreviewPanel({ currentFile = null, fileContent = null }) {
  const {
    status,
    previewUrl,
    previewMode,
    errorMessage,
    logs,
    startPreview,
    stopPreview,
    refreshPreview,
  } = useCodePreview();

  const lastFileRef = useRef(null);
  const lastContentRef = useRef(null);

  const [iframeKey, setIframeKey] = useState(0);
  const [showLogs, setShowLogs] = useState(false);
  const logsEndRef = useRef(null);
  const [iframeError, setIframeError] = useState(false);

  // Auto-scroll logs
  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogs]);

  const filename = currentFile?.name || '';
  const canPreview = Boolean(filename && isPreviewable(filename));
  const mode = getPreviewMode(filename);

  // When the file changes, reset preview so user must click Run again
  useEffect(() => {
    const prev = lastFileRef.current;
    if (prev && (prev.path !== currentFile?.path || prev._project !== currentFile?._project)) {
      stopPreview();
      setIframeError(false);
    }
    lastFileRef.current = currentFile;
  }, [currentFile, stopPreview]);

  // Run preview
  const handleRun = useCallback(() => {
    if (!currentFile || !canPreview) return;
    const content = fileContent != null ? fileContent : '';
    lastContentRef.current = content;
    setIframeError(false);
    setIframeKey(k => k + 1);
    startPreview(currentFile.name, content);
  }, [currentFile, canPreview, fileContent, startPreview]);

  // Stop preview
  const handleStop = useCallback(() => {
    stopPreview();
    setIframeError(false);
  }, [stopPreview]);

  // Refresh with latest editor content
  const handleRefresh = useCallback(() => {
    if (!currentFile || !canPreview) return;
    const content = fileContent != null ? fileContent : lastContentRef.current ?? '';
    setIframeError(false);
    setIframeKey(k => k + 1);
    refreshPreview(currentFile.name, content);
  }, [currentFile, canPreview, fileContent, refreshPreview]);

  const handleOpenExternal = useCallback(() => {
    if (previewUrl) window.open(previewUrl, '_blank', 'noopener,noreferrer');
  }, [previewUrl]);

  const handleIframeLoad = useCallback(() => setIframeError(false), []);
  const handleIframeError = useCallback(() => setIframeError(true), []);

  const isReady = status === PREVIEW_STATUS.READY;
  const isLoading = status === PREVIEW_STATUS.LOADING;
  const isRunning = isReady || isLoading;
  const meta = STATUS_META[status] || STATUS_META[PREVIEW_STATUS.IDLE];

  return (
    <div className="cp-panel">
      {/* ══ Toolbar ══ */}
      <div className="cp-toolbar">
        <div className="cp-toolbar-left">
          {currentFile ? (
            <span className="cp-current-file" title={`${currentFile._project}/${currentFile.path}`}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <path d="M10 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V4l-3-3z"
                  fill="none" stroke="currentColor" strokeWidth="1.2" />
                <path d="M10 1v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <span className="cp-current-file-name">{currentFile.name}</span>
              {mode && canPreview && (
                <span className="cp-mode-badge">{MODE_LABELS[mode] || mode}</span>
              )}
              {!canPreview && (
                <span className="cp-mode-badge cp-mode-badge-unsupported">Not supported</span>
              )}
            </span>
          ) : (
            <span className="cp-no-file-hint">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.4 }}>
                <path d="M10 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V4l-3-3z"
                  fill="none" stroke="currentColor" strokeWidth="1.2" />
                <path d="M10 1v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              No file open
            </span>
          )}
        </div>

        <div className="cp-toolbar-right">
          {!isRunning ? (
            <button
              className={`cp-btn ${canPreview ? 'cp-btn-run' : 'cp-btn-run-disabled'}`}
              onClick={handleRun}
              disabled={!canPreview}
              title={
                !currentFile
                  ? 'Open a file to preview it'
                  : !canPreview
                  ? getUnsupportedTip(filename)
                  : `Preview ${filename}`
              }
            >
              <RunIcon size={13} />
              <span>Run</span>
            </button>
          ) : (
            <>
              <button
                className="cp-btn cp-btn-stop"
                onClick={handleStop}
                title="Stop preview"
              >
                <StopIcon size={11} />
                <span>Stop</span>
              </button>
              {isReady && (
                <button
                  className="cp-btn cp-btn-icon"
                  onClick={handleRefresh}
                  title="Re-render with latest editor content"
                >
                  <RefreshIcon size={13} />
                </button>
              )}
            </>
          )}

          {isReady && previewUrl && (
            <button
              className="cp-btn cp-btn-icon"
              onClick={handleOpenExternal}
              title="Open in new tab"
            >
              <ExternalLinkIcon size={13} />
            </button>
          )}

          <button
            className={`cp-btn cp-btn-icon ${showLogs ? 'cp-btn-active' : ''}`}
            onClick={() => setShowLogs(v => !v)}
            title="Toggle console"
          >
            <ConsoleIcon size={13} />
          </button>
        </div>
      </div>

      {/* ══ Status bar ══ */}
      <div className="cp-statusbar">
        <span
          className="cp-status-dot"
          style={{
            background: meta.dot,
            animation: isLoading ? 'cp-pulse 1s ease infinite' : 'none',
          }}
        />
        <span className="cp-status-label" style={{ color: meta.color }}>
          {isLoading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Spinner size={11} color={meta.dot} />
              {meta.label}
            </span>
          ) : meta.label}
        </span>

        {isReady && previewMode && (
          <span className="cp-mode-pill">{MODE_LABELS[previewMode] || previewMode}</span>
        )}

        {status === PREVIEW_STATUS.ERROR && errorMessage && (
          <span className="cp-status-error" title={errorMessage}>{errorMessage}</span>
        )}

        {status === PREVIEW_STATUS.UNSUPPORTED && (
          <span className="cp-status-unsupported">{getUnsupportedTip(filename)}</span>
        )}

        {currentFile && (
          <span className="cp-status-project" title={`${currentFile._project}/${currentFile.path}`}>
            {currentFile._project}/{currentFile.path}
          </span>
        )}
      </div>

      {/* ══ Main content ══ */}
      <div className={`cp-content ${showLogs ? 'cp-content-with-logs' : ''}`}>

        {/* No file open */}
        {!currentFile && (
          <div className="cp-empty">
            <div className="cp-empty-icon">
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                <path d="M24 4H12a2 2 0 00-2 2v32a2 2 0 002 2h20a2 2 0 002-2V14l-10-10z"
                  fill="none" stroke="#226DB4" strokeWidth="1.5" opacity="0.4" />
                <path d="M24 4v10h10" stroke="#226DB4" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
                <path d="M16 24h12M16 29h8" stroke="#226DB4" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
              </svg>
            </div>
            <p className="cp-empty-title">No file open</p>
            <p className="cp-empty-sub">
              Open a file from the explorer, then click <strong>Run</strong> to preview it here.
            </p>
            <div className="cp-supported-list">
              <span className="cp-supported-label">Supported types:</span>
              <span className="cp-supported-chips">
                {['HTML', 'CSS', 'SVG', 'JS', 'JSX', 'TS', 'TSX', 'MD', 'JSON', 'XML', 'TXT'].map(t => (
                  <span key={t} className="cp-type-chip">{t}</span>
                ))}
              </span>
            </div>
          </div>
        )}

        {/* File open but not previewable */}
        {currentFile && !canPreview && status !== PREVIEW_STATUS.UNSUPPORTED && (
          <div className="cp-empty cp-unsupported-state">
            <div className="cp-empty-icon cp-empty-icon-unsupported">
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                <path d="M24 4H12a2 2 0 00-2 2v32a2 2 0 002 2h20a2 2 0 002-2V14l-10-10z"
                  fill="none" stroke="#5a8aac" strokeWidth="1.5" opacity="0.35" />
                <path d="M24 4v10h10" stroke="#5a8aac" strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
                <circle cx="22" cy="30" r="6" stroke="#5a8aac" strokeWidth="1.5" opacity="0.35" />
                <path d="M19 33l6-6" stroke="#5a8aac" strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
              </svg>
            </div>
            <p className="cp-empty-title">Cannot preview <em>{filename}</em></p>
            <p className="cp-empty-sub">{getUnsupportedTip(filename)}</p>
            <div className="cp-supported-list">
              <span className="cp-supported-label">Supported types:</span>
              <span className="cp-supported-chips">
                {['HTML', 'CSS', 'SVG', 'JS', 'JSX', 'TS', 'TSX', 'MD', 'JSON', 'XML', 'TXT'].map(t => (
                  <span key={t} className="cp-type-chip">{t}</span>
                ))}
              </span>
            </div>
          </div>
        )}

        {/* Ready to run */}
        {currentFile && canPreview && status === PREVIEW_STATUS.IDLE && (
          <div className="cp-empty">
            <div className="cp-empty-icon cp-empty-icon-ready">
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                <rect x="3" y="6" width="38" height="26" rx="3" stroke="#226DB4" strokeWidth="1.5" opacity="0.4" />
                <path d="M14 38h16M22 32v6" stroke="#226DB4" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
                <polygon points="16,14 30,22 16,30" fill="#0A9949" opacity="0.75" />
              </svg>
            </div>
            <p className="cp-empty-title">Ready to preview</p>
            <p className="cp-empty-sub">
              Click <strong>Run</strong> to render <em>{filename}</em>.
            </p>
            <button className="cp-run-big-btn" onClick={handleRun}>
              <RunIcon size={14} />
              Run Preview
            </button>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="cp-empty cp-starting">
            <div className="cp-starting-spinner">
              <Spinner size={40} color="#F9B21C" />
            </div>
            <p className="cp-empty-title">Rendering preview…</p>
          </div>
        )}

        {/* Error */}
        {status === PREVIEW_STATUS.ERROR && (
          <div className="cp-empty cp-error-state">
            <div className="cp-empty-icon cp-empty-icon-error">
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                <path d="M22 6L4 38h36L22 6z" fill="none" stroke="#E42527" strokeWidth="1.5" opacity="0.6" />
                <line x1="22" y1="18" x2="22" y2="28" stroke="#E42527" strokeWidth="2" strokeLinecap="round" />
                <circle cx="22" cy="33" r="1.5" fill="#E42527" />
              </svg>
            </div>
            <p className="cp-empty-title cp-error-title">Preview failed</p>
            {errorMessage && <p className="cp-error-detail">{errorMessage}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="cp-run-big-btn" onClick={handleRun}>
                <RefreshIcon size={13} /> Retry
              </button>
              <button className="cp-run-big-btn cp-log-btn" onClick={() => setShowLogs(true)}>
                <ConsoleIcon size={13} /> View Logs
              </button>
            </div>
          </div>
        )}

        {/* Unsupported (after click) */}
        {status === PREVIEW_STATUS.UNSUPPORTED && (
          <div className="cp-empty cp-unsupported-state">
            <div className="cp-empty-icon cp-empty-icon-unsupported">
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                <circle cx="22" cy="22" r="18" stroke="#5a8aac" strokeWidth="1.5" opacity="0.35" />
                <path d="M15 29l14-14M29 29L15 15" stroke="#5a8aac" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
              </svg>
            </div>
            <p className="cp-empty-title">Not supported</p>
            <p className="cp-empty-sub">{getUnsupportedTip(filename)}</p>
          </div>
        )}

        {/* Live iframe */}
        {isReady && previewUrl && (
          <div className="cp-iframe-wrapper">
            {iframeError && (
              <div className="cp-iframe-error-overlay">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <path d="M16 4L3 28h26L16 4z" fill="none" stroke="#E42527" strokeWidth="1.5" />
                  <line x1="16" y1="13" x2="16" y2="20" stroke="#E42527" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="16" cy="23.5" r="1.2" fill="#E42527" />
                </svg>
                <p>Failed to render preview</p>
                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  <button className="cp-run-big-btn" onClick={handleRefresh}>
                    <RefreshIcon size={13} /> Retry
                  </button>
                  <button className="cp-run-big-btn" onClick={handleOpenExternal}>
                    <ExternalLinkIcon size={13} /> Open in Tab
                  </button>
                </div>
              </div>
            )}
            <iframe
              key={iframeKey}
              src={previewUrl}
              className="cp-iframe"
              title={`Preview — ${filename}`}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              allow="clipboard-read; clipboard-write"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />
          </div>
        )}
      </div>

      {/* ══ Log Console ══ */}
      {showLogs && (
        <div className="cp-log-console">
          <div className="cp-log-header">
            <span className="cp-log-title">
              <ConsoleIcon size={12} />
              Console
            </span>
            <button
              className="cp-log-action-btn"
              onClick={() => setShowLogs(false)}
              title="Close console"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="cp-log-body">
            {logs.length === 0 ? (
              <span className="cp-log-empty">No output yet. Click Run to preview.</span>
            ) : (
              logs.map((line, i) => (
                <div
                  key={i}
                  className={`cp-log-line ${
                    line.includes('ERROR') ? 'cp-log-error'
                    : line.includes('ready') || line.includes('Ready') ? 'cp-log-success'
                    : ''
                  }`}
                >
                  {line}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
