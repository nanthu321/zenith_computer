import { useState, useEffect, useCallback, useRef } from "react";
import Editor from "@monaco-editor/react";
import { workspaceApi } from "../../api/workspace";
import { getFileIcon, getLanguageFromExt } from "./fileIcons.jsx";
import "./FileViewer.css";

// Binary file detection by extension
const BINARY_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico",
  "zip", "tar", "gz", "rar", "7z",
  "pdf", "doc", "docx", "xls", "xlsx",
  "mp3", "mp4", "wav", "avi", "mov",
  "exe", "dll", "so", "dylib", "wasm",
  "pyc", "class", "o",
]);

function isBinaryFile(name = "") {
  const ext = name.split(".").pop().toLowerCase();
  return BINARY_EXTS.has(ext);
}

// Detect current theme from document
function getMonacoTheme() {
  const theme = document.documentElement.getAttribute("data-theme");
  return theme === "light" ? "vs" : "vs-dark";
}

export default function FileViewer({ project, file }) {
  const [content, setContent]     = useState("");
  const [original, setOriginal]   = useState("");
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState(null);
  const [monacoTheme, setMonacoTheme] = useState(getMonacoTheme);

  const editorRef    = useRef(null);
  const contentRef   = useRef(content);
  const originalRef  = useRef(original);
  const savingRef    = useRef(saving);
  const fileRef      = useRef(file);
  const projectRef   = useRef(project);

  contentRef.current  = content;
  originalRef.current = original;
  savingRef.current   = saving;
  fileRef.current     = file;
  projectRef.current  = project;

  // Watch for theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setMonacoTheme(getMonacoTheme());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (file && project) {
      loadFile();
    } else {
      setContent("");
      setOriginal("");
      setLoading(false);
      setError(null);
      setSaved(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.path, project]);

  async function loadFile() {
    if (!file || !project) return;
    if (isBinaryFile(file.name)) {
      setContent("");
      setOriginal("");
      setError("binary");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const data = await workspaceApi.readFile(project, file.path);
      const text = typeof data === "string"
        ? data
        : (data?.content ?? JSON.stringify(data, null, 2) ?? "");
      setContent(text);
      setOriginal(text);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const [saveError, setSaveError] = useState(null);

  const doSave = useCallback(async () => {
    const f = fileRef.current;
    const p = projectRef.current;
    const c = contentRef.current;
    if (!f || !p) return;

    setSaving(true);
    setSaveError(null);
    try {
      await workspaceApi.writeFile(p, f.path, c);
      setOriginal(c);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("Save failed:", e);
      setSaveError("Save failed: " + e.message);
      setTimeout(() => setSaveError(null), 5000);
    } finally {
      setSaving(false);
    }
  }, []);

  // Called when Monaco editor mounts
  function handleEditorDidMount(editor, monaco) {
    editorRef.current = editor;

    // Add Ctrl+S / Cmd+S save keybinding
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => {
        if (contentRef.current !== originalRef.current && !savingRef.current) {
          doSave();
        }
      }
    );

    // Focus editor
    editor.focus();
  }

  function handleEditorChange(value) {
    setContent(value || "");
  }

  const isDirty = content !== original;
  const language = file ? getLanguageFromExt(file.name) : "plaintext";
  const fileIconEl = file ? getFileIcon(file.name) : null;

  if (!file) {
    return (
      <div className="fileviewer-empty">
        <div className="fileviewer-empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" style={{ opacity: 0.35 }}>
            <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z" fill="none" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M14 2v6h6" fill="none" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M10 12l-2 2 2 2M14 12l2 2-2 2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p>Select a file to view its contents</p>
        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 4 }}>
          Click on any file in the tree to open it here
        </span>
        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 12, opacity: 0.6 }}>
          Tip: Use Ctrl+S to save changes after editing
        </span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="fileviewer-empty">
        <div className="fileviewer-empty-icon">
          <svg width="36" height="36" viewBox="0 0 16 16" style={{ animation: "spin 0.8s linear infinite" }}>
            <circle cx="8" cy="8" r="6" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round"/>
          </svg>
        </div>
        <p>Loading {file.name}…</p>
      </div>
    );
  }

  if (error === "binary") {
    return (
      <div className="fileviewer-empty">
        <div className="fileviewer-empty-icon">
          <svg width="36" height="36" viewBox="0 0 24 24">
            <rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.3"/>
            <path d="M8 11V7a4 4 0 118 0v4" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.3"/>
          </svg>
        </div>
        <p>Binary file — cannot display</p>
        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 4 }}>
          {file.name}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fileviewer-empty">
        <div className="fileviewer-empty-icon">
          <svg width="36" height="36" viewBox="0 0 24 24">
            <path d="M12 2L2 20h20L12 2z" fill="none" stroke="#ef4444" strokeWidth="1.5"/>
            <line x1="12" y1="9" x2="12" y2="14" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="12" cy="17" r="1" fill="#ef4444"/>
          </svg>
        </div>
        <p>Error: {error}</p>
        <button className="fileviewer-retry-btn" onClick={loadFile}>Retry</button>
      </div>
    );
  }

  return (
    <div className="fileviewer-container">
      {/* Header — VS Code style tab bar */}
      <div className="fileviewer-header">
        <div className="fileviewer-tab">
          {fileIconEl && (
            <span style={{ display: "inline-flex", marginRight: 7 }}>{fileIconEl}</span>
          )}
          <span className="fileviewer-tab-name">{file.name}</span>
          {isDirty && <span className="fileviewer-dirty-dot" />}
        </div>
        <div className="fileviewer-filepath-breadcrumb">
          <svg width="11" height="11" viewBox="0 0 24 24" style={{ marginRight: 5, flexShrink: 0 }}>
            <path d="M4 4h5l2 2h9c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" fill="var(--text-tertiary)" opacity="0.6"/>
          </svg>
          {file.path}
        </div>
        <div className="fileviewer-header-right">
          <span className="fileviewer-lang-badge">
            {language}
          </span>
          {isDirty && (
            <span className="fileviewer-unsaved-badge">
              <svg width="8" height="8" viewBox="0 0 8 8" style={{ marginRight: 4 }}><circle cx="4" cy="4" r="3" fill="currentColor"/></svg>
              Modified
            </span>
          )}
          <button
            onClick={doSave}
            disabled={!isDirty || saving}
            className={`fileviewer-save-btn ${(!isDirty || saving) ? "fileviewer-save-btn-disabled" : ""}`}
          >
            {saving ? (
              <><svg width="13" height="13" viewBox="0 0 16 16" style={{ marginRight: 5, animation: "spin 0.8s linear infinite" }}><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round"/></svg>Saving…</>
            ) : saved ? (
              <><svg width="13" height="13" viewBox="0 0 16 16" style={{ marginRight: 5 }}><path d="M3 8l4 4 6-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>Saved</>
            ) : (
              <><svg width="13" height="13" viewBox="0 0 16 16" style={{ marginRight: 5 }}><path d="M12.5 1.5H3.5a1 1 0 00-1 1v11a1 1 0 001 1h9a1 1 0 001-1v-9l-3-3z" fill="none" stroke="currentColor" strokeWidth="1.2"/><path d="M5.5 1.5v3h4v-3M5.5 14.5v-4h5v4" fill="none" stroke="currentColor" strokeWidth="1.1"/></svg>Save</>
            )}
          </button>
        </div>
      </div>

      {/* Monaco Editor — VS Code's core editor */}
      {/* Save error notification */}
      {saveError && (
        <div className="fileviewer-save-error" onClick={() => setSaveError(null)}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="8" cy="8" r="7" stroke="#ef4444" strokeWidth="1.3"/>
            <path d="M8 4.5v4" stroke="#ef4444" strokeWidth="1.3" strokeLinecap="round"/>
            <circle cx="8" cy="11" r="0.8" fill="#ef4444"/>
          </svg>
          <span>{saveError}</span>
          <button
            className="fileviewer-save-error-close"
            onClick={(e) => { e.stopPropagation(); setSaveError(null); }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      )}

      <div className="fileviewer-monaco-wrapper">
        <Editor
          height="100%"
          language={language}
          theme={monacoTheme}
          value={content}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          loading={
            <div className="fileviewer-monaco-loading">
              <svg width="20" height="20" viewBox="0 0 16 16" style={{ marginBottom: 8, animation: "spin 0.8s linear infinite" }}>
                <circle cx="8" cy="8" r="6" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round"/>
              </svg>
              <span>Initializing editor…</span>
            </div>
          }
          options={{
            fontSize: 13.5,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', monospace",
            fontLigatures: true,
            lineNumbers: "on",
            minimap: { enabled: true, maxColumn: 80 },
            scrollBeyondLastLine: false,
            wordWrap: "off",
            tabSize: 2,
            insertSpaces: true,
            automaticLayout: true,
            renderWhitespace: "selection",
            bracketPairColorization: { enabled: true },
            guides: {
              bracketPairs: true,
              indentation: true,
            },
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            renderLineHighlight: "all",
            scrollbar: {
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
              verticalSliderSize: 10,
              horizontalSliderSize: 10,
            },
            padding: { top: 12, bottom: 12 },
            suggest: {
              showKeywords: true,
              showSnippets: true,
            },
            quickSuggestions: true,
            parameterHints: { enabled: true },
            formatOnPaste: true,
            formatOnType: false,
            folding: true,
            foldingStrategy: "indentation",
            links: true,
            colorDecorators: true,
            contextmenu: true,
            mouseWheelZoom: true,
          }}
        />
      </div>
    </div>
  );
}
