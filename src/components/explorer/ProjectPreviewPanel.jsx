/**
 * ProjectPreviewPanel — Live project preview panel
 *
 * Renders a full project in an iframe by:
 *   1. Scanning all project files
 *   2. Finding the entry HTML (index.html)
 *   3. Inlining all CSS/JS with resolved relative paths
 *   4. Displaying via blob URL in a sandboxed iframe
 *
 * Features:
 *   - Project selector dropdown
 *   - Run / Stop / Refresh controls
 *   - Real-time build logs
 *   - Error states with actionable messages
 *   - Smooth project switching
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useProjectPreview, PROJECT_PREVIEW_STATUS, FILE_TYPE_CATEGORIES, getFileCategory } from '../../hooks/useProjectPreview.js';
import { useCodePreview, PREVIEW_STATUS, isPreviewable } from '../../hooks/useCodePreview.js';
import { useCodeExecution, EXECUTION_STATUS, getLanguageInfo, isExecutable } from '../../hooks/useCodeExecution.js';
import DownloadButton from './DownloadButton.jsx';
import ConsoleOutputPanel from './ConsoleOutputPanel.jsx';
import { getFileIcon } from './fileIcons.jsx';
import './ProjectPreviewPanel.css';

// ── Status display metadata ──
const STATUS_META = {
  [PROJECT_PREVIEW_STATUS.IDLE]:     { label: 'No preview',    color: '#5a8aac', dot: '#5a8aac' },
  [PROJECT_PREVIEW_STATUS.LOADING]:  { label: 'Building…',     color: '#F9B21C', dot: '#F9B21C' },
  [PROJECT_PREVIEW_STATUS.READY]:    { label: 'Live',          color: '#0A9949', dot: '#0A9949' },
  [PROJECT_PREVIEW_STATUS.ERROR]:    { label: 'Error',         color: '#E42527', dot: '#E42527' },
  [PROJECT_PREVIEW_STATUS.NO_ENTRY]: { label: 'No entry file', color: '#F9B21C', dot: '#F9B21C' },
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
      style={{ animation: 'pp-spin 0.7s linear infinite', display: 'block', flexShrink: 0 }}
    >
      <circle cx="8" cy="8" r="6" fill="none" stroke={color}
        strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

// ── File type icon for the fallback panel ──
function FileTypeIcon({ category, size = 28 }) {
  const info = FILE_TYPE_CATEGORIES[category] || FILE_TYPE_CATEGORIES.other;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        fill="none" stroke={info.color} strokeWidth="1.3" />
      <path d="M14 2v6h6" fill="none" stroke={info.color} strokeWidth="1.3" />
      <text x="12" y="17" textAnchor="middle" fontFamily="monospace" fontWeight="bold" fontSize="5.5" fill={info.color}>
        {info.label.slice(0, 4)}
      </text>
    </svg>
  );
}

// ── View Code Icon ──
function CodeViewIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M5 4L1 8l4 4M11 4l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Folder Icon ──
function FolderOpenIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M2 4a1 1 0 011-1h3l1.5 1.5H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"
        fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {string[]} props.projects         — list of available project names
 * @param {string|null} props.activeProject — currently active project in explorer
 * @param {function} props.onClose          — callback to close the preview panel
 * @param {object|null} props.currentFile   — currently selected file { name, path, _project }
 * @param {string|null} props.fileContent   — file content for code preview
 * @param {function} props.onFileSelect     — callback to open a file in the editor: (project, fileNode) => void
 */
export default function ProjectPreviewPanel({ projects = [], activeProject = null, onClose, currentFile = null, fileContent = null, onFileSelect }) {
  // ── Project preview hook ──
  const {
    status,
    previewUrl,
    errorMessage,
    entryFilePath,
    logs,
    currentProject,
    projectAnalysis,
    startPreview,
    stopPreview,
    refreshPreview,
  } = useProjectPreview();

  // ── Code preview hook (for individual file preview) ──
  const {
    status: codeStatus,
    previewUrl: codePreviewUrl,
    errorMessage: codeErrorMessage,
    startPreview: startCodePreview,
    stopPreview: stopCodePreview,
  } = useCodePreview();

  // ── Code execution hook (for Java, Python, etc.) ──
  const {
    status: execStatus,
    output: execOutput,
    exitCode: execExitCode,
    executionTime: execTime,
    errorMessage: execErrorMessage,
    currentFile: execCurrentFile,
    execute: executeCode,
    stopExecution,
    clearOutput: clearExecOutput,
    reset: resetExecution,
  } = useCodeExecution();

  // ── Preview mode: 'project' (whole project), 'file' (single file preview), or 'console' (code execution) ──
  const [previewMode, setPreviewMode] = useState('project');
  const [showConsole, setShowConsole] = useState(false);
  const [selectedProject, setSelectedProject] = useState(activeProject || projects[0] || '');
  const [iframeKey, setIframeKey] = useState(0);
  const [showLogs, setShowLogs] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const logsEndRef = useRef(null);

  // Sync selected project when activeProject changes
  useEffect(() => {
    if (activeProject && activeProject !== selectedProject) {
      setSelectedProject(activeProject);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject]);

  // Auto-switch to file preview mode when a previewable file is selected
  const lastFileRef = useRef(null);
  useEffect(() => {
    if (currentFile && currentFile.name) {
      const filePreviewable = isPreviewable(currentFile.name);
      const fileExecutable = isExecutable(currentFile.name);
      if (filePreviewable && previewMode === 'project' && status !== PROJECT_PREVIEW_STATUS.READY) {
        // Don't auto-switch if project preview is already running and live
      }
      // When switching to an executable file, auto-show the console mode hint
      if (fileExecutable && previewMode === 'project' && status !== PROJECT_PREVIEW_STATUS.READY) {
        // Will be handled by the UI — show Run Code button
      }
      lastFileRef.current = currentFile;
    }
  }, [currentFile, previewMode, status]);

  // Handle running code execution
  const handleRunCode = useCallback(() => {
    if (!currentFile || !currentFile.name) return;
    const content = fileContent;
    if (content == null) {
      // If no file content provided, signal the parent to fetch it
      return;
    }
    setPreviewMode('console');
    setShowConsole(true);
    executeCode(currentFile.name, content);
  }, [currentFile, fileContent, executeCode]);

  // Handle stopping code execution
  const handleStopExecution = useCallback(() => {
    stopExecution();
  }, [stopExecution]);

  // Auto-scroll logs
  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogs]);

  // Run preview
  const handleRun = useCallback(() => {
    if (!selectedProject) return;
    setIframeError(false);
    setIframeKey(k => k + 1);
    startPreview(selectedProject);
  }, [selectedProject, startPreview]);

  // Stop preview
  const handleStop = useCallback(() => {
    stopPreview();
    setIframeError(false);
  }, [stopPreview]);

  // Refresh
  const handleRefresh = useCallback(() => {
    if (!selectedProject) return;
    setIframeError(false);
    setIframeKey(k => k + 1);
    refreshPreview(selectedProject);
  }, [selectedProject, refreshPreview]);

  // Open in new tab
  const handleOpenExternal = useCallback(() => {
    if (previewUrl) window.open(previewUrl, '_blank', 'noopener,noreferrer');
  }, [previewUrl]);

  // Project switch
  const handleProjectChange = useCallback((e) => {
    const newProject = e.target.value;
    setSelectedProject(newProject);
    // If preview is running, restart with new project
    if (status === PROJECT_PREVIEW_STATUS.READY || status === PROJECT_PREVIEW_STATUS.LOADING) {
      setIframeError(false);
      setIframeKey(k => k + 1);
      startPreview(newProject);
    }
  }, [status, startPreview]);

  const handleIframeLoad = useCallback(() => setIframeError(false), []);
  const handleIframeError = useCallback(() => setIframeError(true), []);

  const isReady = status === PROJECT_PREVIEW_STATUS.READY;
  const isLoading = status === PROJECT_PREVIEW_STATUS.LOADING;
  const isRunning = isReady || isLoading;
  const meta = STATUS_META[status] || STATUS_META[PROJECT_PREVIEW_STATUS.IDLE];

  return (
    <div className="pp-panel">
      {/* ══ Toolbar ══ */}
      <div className="pp-toolbar">
        <div className="pp-toolbar-left">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: '#0A9949' }}>
            <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.2" />
            <path d="M6 5l4 3-4 3z" fill="currentColor" />
          </svg>

          {projects.length > 1 ? (
            <select
              className="pp-project-select"
              value={selectedProject}
              onChange={handleProjectChange}
              title="Select project to preview"
            >
              {projects.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          ) : (
            <span className="pp-project-name" title={selectedProject}>
              {selectedProject || 'No project'}
            </span>
          )}
        </div>

        <div className="pp-toolbar-right">
          {!isRunning ? (
            <button
              className={`pp-btn pp-btn-run ${!selectedProject ? 'pp-btn-disabled' : ''}`}
              onClick={handleRun}
              disabled={!selectedProject}
              title={selectedProject ? `Preview ${selectedProject}` : 'No project selected'}
            >
              <RunIcon size={12} />
              <span>Run</span>
            </button>
          ) : (
            <>
              <button className="pp-btn pp-btn-stop" onClick={handleStop} title="Stop preview">
                <StopIcon size={11} />
                <span>Stop</span>
              </button>
              {isReady && (
                <button className="pp-btn pp-btn-icon" onClick={handleRefresh} title="Refresh preview">
                  <RefreshIcon size={13} />
                </button>
              )}
            </>
          )}

          {isReady && previewUrl && (
            <button className="pp-btn pp-btn-icon" onClick={handleOpenExternal} title="Open in new tab">
              <ExternalLinkIcon size={13} />
            </button>
          )}

          {/* Run Code button — for executable files (Java, Python, etc.) */}
          {currentFile && isExecutable(currentFile.name) && (
            <>
              {execStatus !== EXECUTION_STATUS.RUNNING ? (
                <button
                  className={`pp-btn pp-btn-exec ${!fileContent ? 'pp-btn-disabled' : ''}`}
                  onClick={handleRunCode}
                  disabled={!fileContent}
                  title={fileContent
                    ? `Run ${currentFile.name} (${getLanguageInfo(currentFile.name)?.label || 'Code'})`
                    : 'Open file first to run it'
                  }
                >
                  <RunIcon size={12} />
                  <span>Run Code</span>
                </button>
              ) : (
                <button
                  className="pp-btn pp-btn-stop"
                  onClick={handleStopExecution}
                  title="Stop execution"
                >
                  <StopIcon size={11} />
                  <span>Stop</span>
                </button>
              )}
            </>
          )}

          {/* Preview mode toggle: Project / File */}
          {currentFile && isPreviewable(currentFile.name) && (
            <button
              className={`pp-btn pp-btn-mode ${previewMode === 'file' ? 'pp-btn-mode-active' : ''}`}
              onClick={() => {
                if (previewMode === 'file') {
                  setPreviewMode('project');
                  stopCodePreview();
                } else {
                  setPreviewMode('file');
                  if (currentFile && fileContent != null) {
                    setIframeKey(k => k + 1);
                    startCodePreview(currentFile.name, fileContent);
                  }
                }
              }}
              title={previewMode === 'file' ? 'Switch to Project Preview' : 'Preview current file'}
            >
              <CodeViewIcon size={12} />
              <span>{previewMode === 'file' ? 'Project' : 'File'}</span>
            </button>
          )}

          {/* Console toggle — show/hide when there's execution output */}
          {(execOutput.length > 0 || previewMode === 'console') && (
            <button
              className={`pp-btn pp-btn-icon ${showConsole ? 'pp-btn-active' : ''}`}
              onClick={() => setShowConsole(v => !v)}
              title={showConsole ? 'Hide console' : 'Show console output'}
            >
              <ConsoleIcon size={13} />
            </button>
          )}

          <button
            className={`pp-btn pp-btn-icon ${showLogs ? 'pp-btn-active' : ''}`}
            onClick={() => setShowLogs(v => !v)}
            title="Toggle build log"
          >
            <ConsoleIcon size={13} />
          </button>

          {onClose && (
            <button className="pp-btn pp-btn-icon pp-btn-close" onClick={onClose} title="Close preview panel">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ══ Status bar ══ */}
      <div className="pp-statusbar">
        <span
          className="pp-status-dot"
          style={{
            background: meta.dot,
            animation: isLoading ? 'pp-pulse 1s ease infinite' : 'none',
          }}
        />
        <span className="pp-status-label" style={{ color: meta.color }}>
          {isLoading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Spinner size={11} color={meta.dot} />
              {meta.label}
            </span>
          ) : meta.label}
        </span>

        {isReady && entryFilePath && (
          <span className="pp-entry-pill" title={`Entry: ${entryFilePath}`}>
            {entryFilePath}
          </span>
        )}

        {(status === PROJECT_PREVIEW_STATUS.ERROR || status === PROJECT_PREVIEW_STATUS.NO_ENTRY) && errorMessage && (
          <span className="pp-status-error" title={errorMessage}>{errorMessage}</span>
        )}

        {currentProject && (
          <span className="pp-status-project">{currentProject}</span>
        )}
      </div>

      {/* ══ Main content ══ */}
      <div className={`pp-content ${showLogs ? 'pp-content-with-logs' : ''}`}>

        {/* Idle — ready to run (project mode only) */}
        {previewMode === 'project' && status === PROJECT_PREVIEW_STATUS.IDLE && (
          <div className="pp-empty">
            <div className="pp-empty-icon">
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                <rect x="3" y="6" width="38" height="26" rx="3" stroke="#226DB4" strokeWidth="1.5" opacity="0.4" />
                <path d="M14 38h16M22 32v6" stroke="#226DB4" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
                <polygon points="16,14 30,22 16,30" fill="#0A9949" opacity="0.75" />
              </svg>
            </div>
            {selectedProject ? (
              <>
                <p className="pp-empty-title">Ready to preview</p>
                <p className="pp-empty-sub">
                  Click <strong>Run</strong> to render <em>{selectedProject}</em> live.
                </p>
                <button className="pp-run-big-btn" onClick={handleRun}>
                  <RunIcon size={14} />
                  Run Preview
                </button>
              </>
            ) : (
              <>
                <p className="pp-empty-title">No project selected</p>
                <p className="pp-empty-sub">
                  Select a project from the dropdown or expand one in the explorer.
                </p>
              </>
            )}
          </div>
        )}

        {/* Loading (project mode) */}
        {previewMode === 'project' && isLoading && (
          <div className="pp-empty pp-loading-state">
            <div className="pp-loading-spinner">
              <Spinner size={40} color="#F9B21C" />
            </div>
            <p className="pp-empty-title">Building preview…</p>
            <p className="pp-empty-sub">Scanning files and resolving assets</p>
          </div>
        )}

        {/* Error (project mode) */}
        {previewMode === 'project' && status === PROJECT_PREVIEW_STATUS.ERROR && (
          <div className="pp-empty pp-error-state">
            <div className="pp-empty-icon pp-empty-icon-error">
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                <path d="M22 6L4 38h36L22 6z" fill="none" stroke="#E42527" strokeWidth="1.5" opacity="0.6" />
                <line x1="22" y1="18" x2="22" y2="28" stroke="#E42527" strokeWidth="2" strokeLinecap="round" />
                <circle cx="22" cy="33" r="1.5" fill="#E42527" />
              </svg>
            </div>
            <p className="pp-empty-title pp-error-title">Preview failed</p>
            {errorMessage && <p className="pp-error-detail">{errorMessage}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="pp-run-big-btn" onClick={handleRun}>
                <RefreshIcon size={13} /> Retry
              </button>
              <button className="pp-run-big-btn pp-log-btn" onClick={() => setShowLogs(true)}>
                <ConsoleIcon size={13} /> View Logs
              </button>
            </div>
          </div>
        )}

        {/* No entry file — Smart fallback with file-type actions (project mode) */}
        {previewMode === 'project' && status === PROJECT_PREVIEW_STATUS.NO_ENTRY && (
          <div className="pp-empty pp-no-entry-state">
            {projectAnalysis && projectAnalysis.totalFiles > 0 ? (
              /* ── Non-HTML project detected — show smart fallback ── */
              <>
                <div className="pp-empty-icon pp-empty-icon-filetype"
                  style={{ borderColor: `${(FILE_TYPE_CATEGORIES[projectAnalysis.primaryCategory] || FILE_TYPE_CATEGORIES.other).color}20` }}>
                  <FileTypeIcon category={projectAnalysis.primaryCategory} size={44} />
                </div>
                <p className="pp-empty-title">Preview not available for this file type</p>
                <p className="pp-empty-sub">
                  {errorMessage || `This is a ${(FILE_TYPE_CATEGORIES[projectAnalysis.primaryCategory] || FILE_TYPE_CATEGORIES.other).label} project. Live preview is only available for HTML-based projects.`}
                </p>

                {/* ── File type breakdown ── */}
                <div className="pp-filetype-summary">
                  {Object.entries(projectAnalysis.categories)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 6)
                    .map(([cat, count]) => {
                      const info = FILE_TYPE_CATEGORIES[cat] || FILE_TYPE_CATEGORIES.other;
                      return (
                        <span key={cat} className="pp-filetype-chip" style={{ borderColor: `${info.color}30`, color: info.color }}>
                          <span className="pp-filetype-chip-dot" style={{ background: info.color }} />
                          {info.label}
                          <span className="pp-filetype-chip-count">{count}</span>
                        </span>
                      );
                    })}
                </div>

                {/* ── Action buttons for non-previewable projects ── */}
                <div className="pp-fallback-actions">
                  {/* Run Code — execute the first runnable file */}
                  {projectAnalysis.files && projectAnalysis.files.length > 0 && (() => {
                    const runnableFile = projectAnalysis.files.find(f => isExecutable(f.name));
                    if (!runnableFile) return null;
                    const langInfo = getLanguageInfo(runnableFile.name);
                    return (
                      <button
                        className="pp-action-btn pp-action-btn-run"
                        onClick={() => {
                          // Open the file in editor first, then user can click "Run Code" in toolbar
                          if (onFileSelect) {
                            onFileSelect(selectedProject, { name: runnableFile.name, path: runnableFile.path, type: 'file' });
                          }
                        }}
                        title={`Open ${runnableFile.name} and run it (${langInfo?.label || 'code'})`}
                      >
                        <RunIcon size={12} />
                        <span>Run {langInfo?.label || 'Code'}</span>
                      </button>
                    );
                  })()}

                  {/* View Code — open a file in the editor */}
                  {projectAnalysis.files && projectAnalysis.files.length > 0 && onFileSelect && (
                    <button
                      className="pp-action-btn pp-action-btn-primary"
                      onClick={() => {
                        // Open the first code file in the editor
                        const codeFile = projectAnalysis.files.find(f => {
                          const cat = getFileCategory(f.name);
                          return cat !== 'image' && cat !== 'data';
                        }) || projectAnalysis.files[0];
                        if (codeFile && onFileSelect) {
                          onFileSelect(selectedProject, { name: codeFile.name, path: codeFile.path, type: 'file' });
                        }
                      }}
                      title="Open a file from this project in the editor"
                    >
                      <CodeViewIcon size={14} />
                      <span>View Code</span>
                    </button>
                  )}

                  {/* Download Project */}
                  <div className="pp-action-btn-download-wrap">
                    <DownloadButton
                      type="project"
                      project={selectedProject}
                      name={selectedProject}
                      size={14}
                      className="pp-action-dl-btn"
                    />
                    <span className="pp-action-btn-label">Download</span>
                  </div>

                  {/* Open in Explorer */}
                  {onFileSelect && (
                    <button
                      className="pp-action-btn pp-action-btn-secondary"
                      onClick={() => {
                        // Signal to expand this project in the explorer
                        if (onFileSelect) {
                          onFileSelect(selectedProject, null);
                        }
                      }}
                      title="Expand this project in the file explorer"
                    >
                      <FolderOpenIcon size={14} />
                      <span>Open in Explorer</span>
                    </button>
                  )}
                </div>

                {/* ── Recent project files with icons ── */}
                {projectAnalysis.files && projectAnalysis.files.length > 0 && (
                  <div className="pp-project-files-list">
                    <span className="pp-files-list-label">Project files:</span>
                    <div className="pp-files-list-items">
                      {projectAnalysis.files.slice(0, 8).map((f) => {
                        const cat = getFileCategory(f.name);
                        const catInfo = FILE_TYPE_CATEGORIES[cat] || FILE_TYPE_CATEGORIES.other;
                        return (
                          <button
                            key={f.path}
                            className="pp-file-item"
                            onClick={() => {
                              if (onFileSelect) {
                                onFileSelect(selectedProject, { name: f.name, path: f.path, type: 'file' });
                              }
                            }}
                            title={`Open ${f.path}`}
                          >
                            <span className="pp-file-item-icon">{getFileIcon(f.name)}</span>
                            <span className="pp-file-item-name">{f.name}</span>
                            <span className="pp-file-item-cat" style={{ color: catInfo.color }}>{catInfo.label}</span>
                          </button>
                        );
                      })}
                      {projectAnalysis.files.length > 8 && (
                        <span className="pp-files-more">+{projectAnalysis.files.length - 8} more files</span>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* ── Empty project or no analysis ── */
              <>
                <div className="pp-empty-icon pp-empty-icon-warn">
                  <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                    <path d="M24 4H12a2 2 0 00-2 2v32a2 2 0 002 2h20a2 2 0 002-2V14l-10-10z"
                      fill="none" stroke="#F9B21C" strokeWidth="1.5" opacity="0.4" />
                    <path d="M24 4v10h10" stroke="#F9B21C" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
                    <path d="M22 22v6M22 31v1" stroke="#F9B21C" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
                  </svg>
                </div>
                <p className="pp-empty-title">No entry file found</p>
                <p className="pp-empty-sub">
                  {errorMessage || 'Add an index.html file to the project root to enable preview.'}
                </p>
                <div className="pp-supported-list">
                  <span className="pp-supported-label">Looking for:</span>
                  <span className="pp-supported-chips">
                    {['index.html', 'index.htm', '*.html'].map(t => (
                      <span key={t} className="pp-type-chip">{t}</span>
                    ))}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── File Preview Mode ── */}
        {previewMode === 'file' && currentFile && (
          <>
            {/* File preview idle — ready to run */}
            {codeStatus === PREVIEW_STATUS.IDLE && isPreviewable(currentFile.name) && (
              <div className="pp-empty">
                <div className="pp-empty-icon pp-empty-icon-ready">
                  <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                    <rect x="3" y="6" width="38" height="26" rx="3" stroke="#226DB4" strokeWidth="1.5" opacity="0.4" />
                    <path d="M14 38h16M22 32v6" stroke="#226DB4" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
                    <polygon points="16,14 30,22 16,30" fill="#0A9949" opacity="0.75" />
                  </svg>
                </div>
                <p className="pp-empty-title">Preview file: {currentFile.name}</p>
                <p className="pp-empty-sub">Click <strong>Run</strong> to render this file.</p>
                <button className="pp-run-big-btn" onClick={() => {
                  if (currentFile && fileContent != null) {
                    setIframeKey(k => k + 1);
                    startCodePreview(currentFile.name, fileContent);
                  }
                }}>
                  <RunIcon size={14} />
                  Run Preview
                </button>
              </div>
            )}

            {/* File preview not supported */}
            {codeStatus === PREVIEW_STATUS.IDLE && !isPreviewable(currentFile.name) && (
              <div className="pp-empty pp-no-entry-state">
                <div className="pp-empty-icon pp-empty-icon-filetype">
                  <FileTypeIcon category={getFileCategory(currentFile.name)} size={44} />
                </div>
                <p className="pp-empty-title">Preview not available for this file type</p>
                <p className="pp-empty-sub">
                  <em>{currentFile.name}</em> is a {(FILE_TYPE_CATEGORIES[getFileCategory(currentFile.name)] || FILE_TYPE_CATEGORIES.other).label} file and cannot be previewed in the browser.
                </p>
                <div className="pp-fallback-actions">
                  <button className="pp-action-btn pp-action-btn-secondary" onClick={() => setPreviewMode('project')}>
                    <FolderOpenIcon size={14} />
                    <span>Back to Project</span>
                  </button>
                </div>
              </div>
            )}

            {/* File preview loading */}
            {codeStatus === PREVIEW_STATUS.LOADING && (
              <div className="pp-empty pp-loading-state">
                <div className="pp-loading-spinner">
                  <Spinner size={40} color="#F9B21C" />
                </div>
                <p className="pp-empty-title">Rendering {currentFile.name}…</p>
              </div>
            )}

            {/* File preview error */}
            {codeStatus === PREVIEW_STATUS.ERROR && (
              <div className="pp-empty pp-error-state">
                <div className="pp-empty-icon pp-empty-icon-error">
                  <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                    <path d="M22 6L4 38h36L22 6z" fill="none" stroke="#E42527" strokeWidth="1.5" opacity="0.6" />
                    <line x1="22" y1="18" x2="22" y2="28" stroke="#E42527" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="22" cy="33" r="1.5" fill="#E42527" />
                  </svg>
                </div>
                <p className="pp-empty-title pp-error-title">File preview failed</p>
                {codeErrorMessage && <p className="pp-error-detail">{codeErrorMessage}</p>}
              </div>
            )}

            {/* File preview live iframe */}
            {codeStatus === PREVIEW_STATUS.READY && codePreviewUrl && (
              <div className="pp-iframe-wrapper">
                <iframe
                  key={`file-${iframeKey}`}
                  src={codePreviewUrl}
                  className="pp-iframe"
                  title={`Preview — ${currentFile.name}`}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  allow="clipboard-read; clipboard-write"
                  onLoad={handleIframeLoad}
                  onError={handleIframeError}
                />
              </div>
            )}
          </>
        )}

        {/* ── Console Execution Mode ── */}
        {previewMode === 'console' && (
          <>
            {/* Console idle — ready to run */}
            {execStatus === EXECUTION_STATUS.IDLE && currentFile && isExecutable(currentFile.name) && (
              <div className="pp-empty pp-exec-ready-state">
                <div className="pp-empty-icon pp-empty-icon-exec">
                  <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                    <rect x="3" y="6" width="38" height="28" rx="3" stroke="#226DB4" strokeWidth="1.5" opacity="0.4" />
                    <path d="M10 16l6 5-6 5" stroke="#0A9949" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
                    <line x1="20" y1="26" x2="32" y2="26" stroke="#0A9949" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
                  </svg>
                </div>
                <p className="pp-empty-title">
                  Ready to run {getLanguageInfo(currentFile.name)?.label || 'code'}
                </p>
                <p className="pp-empty-sub">
                  Click <strong>Run Code</strong> to execute <em>{currentFile.name}</em> and see console output.
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button className="pp-run-big-btn pp-run-exec-btn" onClick={handleRunCode}>
                    <RunIcon size={14} />
                    Run Code
                  </button>
                  <button
                    className="pp-run-big-btn pp-back-btn"
                    onClick={() => setPreviewMode('project')}
                  >
                    <FolderOpenIcon size={14} />
                    Back to Project
                  </button>
                </div>
              </div>
            )}

            {/* Console idle — file not executable */}
            {execStatus === EXECUTION_STATUS.IDLE && currentFile && !isExecutable(currentFile.name) && (
              <div className="pp-empty pp-no-entry-state">
                <div className="pp-empty-icon pp-empty-icon-filetype">
                  <FileTypeIcon category={getFileCategory(currentFile.name)} size={44} />
                </div>
                <p className="pp-empty-title">Cannot execute this file type</p>
                <p className="pp-empty-sub">
                  <em>{currentFile.name}</em> is not a supported executable file.
                  Supported: Python, Java, JavaScript, Shell.
                </p>
                <div className="pp-fallback-actions">
                  <button className="pp-action-btn pp-action-btn-secondary" onClick={() => setPreviewMode('project')}>
                    <FolderOpenIcon size={14} />
                    <span>Back to Project</span>
                  </button>
                </div>
              </div>
            )}

            {/* Console idle — no file selected */}
            {execStatus === EXECUTION_STATUS.IDLE && !currentFile && (
              <div className="pp-empty">
                <div className="pp-empty-icon">
                  <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                    <rect x="3" y="6" width="38" height="28" rx="3" stroke="#5a8aac" strokeWidth="1.5" opacity="0.3" />
                    <path d="M10 16l6 5-6 5" stroke="#5a8aac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
                    <line x1="20" y1="26" x2="32" y2="26" stroke="#5a8aac" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
                  </svg>
                </div>
                <p className="pp-empty-title">No file selected</p>
                <p className="pp-empty-sub">Open a code file to execute it.</p>
              </div>
            )}

            {/* Console unsupported */}
            {execStatus === EXECUTION_STATUS.UNSUPPORTED && (
              <div className="pp-empty pp-no-entry-state">
                <div className="pp-empty-icon pp-empty-icon-filetype">
                  <FileTypeIcon category={getFileCategory(currentFile?.name || '')} size={44} />
                </div>
                <p className="pp-empty-title">Execution not supported</p>
                <p className="pp-empty-sub">{execErrorMessage || 'This file type cannot be executed.'}</p>
                <div className="pp-fallback-actions">
                  <button className="pp-action-btn pp-action-btn-secondary" onClick={() => setPreviewMode('project')}>
                    <FolderOpenIcon size={14} />
                    <span>Back to Project</span>
                  </button>
                </div>
              </div>
            )}

            {/* Console running / completed — show output panel */}
            {(execStatus === EXECUTION_STATUS.RUNNING ||
              execStatus === EXECUTION_STATUS.SUCCESS ||
              execStatus === EXECUTION_STATUS.ERROR ||
              execStatus === EXECUTION_STATUS.TIMEOUT) && (
              <ConsoleOutputPanel
                output={execOutput}
                status={execStatus}
                exitCode={execExitCode}
                executionTime={execTime}
                currentFile={execCurrentFile}
                onClear={clearExecOutput}
                onStop={handleStopExecution}
                onClose={() => {
                  setPreviewMode('project');
                  resetExecution();
                }}
              />
            )}
          </>
        )}

        {/* Live iframe — Project preview */}
        {previewMode === 'project' && isReady && previewUrl && (
          <div className="pp-iframe-wrapper">
            {iframeError && (
              <div className="pp-iframe-error-overlay">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <path d="M16 4L3 28h26L16 4z" fill="none" stroke="#E42527" strokeWidth="1.5" />
                  <line x1="16" y1="13" x2="16" y2="20" stroke="#E42527" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="16" cy="23.5" r="1.2" fill="#E42527" />
                </svg>
                <p>Preview not available</p>
                <p style={{ fontSize: 12, color: '#5a8aac', margin: 0 }}>
                  The project may have errors or unsupported features
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  <button className="pp-run-big-btn" onClick={handleRefresh}>
                    <RefreshIcon size={13} /> Retry
                  </button>
                  <button className="pp-run-big-btn" onClick={handleOpenExternal}>
                    <ExternalLinkIcon size={13} /> Open in Tab
                  </button>
                </div>
              </div>
            )}
            <iframe
              key={iframeKey}
              src={previewUrl}
              className="pp-iframe"
              title={`Preview — ${currentProject}`}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              allow="clipboard-read; clipboard-write"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />
          </div>
        )}
      </div>

      {/* ══ Inline Console Output (shown in project/file mode when execution has output) ══ */}
      {showConsole && previewMode !== 'console' && execOutput.length > 0 && (
        <div className="pp-inline-console">
          <ConsoleOutputPanel
            output={execOutput}
            status={execStatus}
            exitCode={execExitCode}
            executionTime={execTime}
            currentFile={execCurrentFile}
            onClear={clearExecOutput}
            onStop={handleStopExecution}
            onClose={() => setShowConsole(false)}
          />
        </div>
      )}

      {/* ══ Log Console ══ */}
      {showLogs && (
        <div className="pp-log-console">
          <div className="pp-log-header">
            <span className="pp-log-title">
              <ConsoleIcon size={12} />
              Build Log
            </span>
            <button className="pp-log-close" onClick={() => setShowLogs(false)} title="Close logs">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="pp-log-body">
            {logs.length === 0 ? (
              <span className="pp-log-empty">No output yet. Click Run to preview.</span>
            ) : (
              logs.map((line, i) => (
                <div
                  key={i}
                  className={`pp-log-line ${
                    line.includes('ERROR') ? 'pp-log-error'
                    : line.includes('ready') || line.includes('Ready') ? 'pp-log-success'
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
