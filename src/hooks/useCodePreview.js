/**
 * useCodePreview — Client-side file preview hook
 *
 * Strategy per file type:
 *  - HTML / HTM   → render content directly in an iframe via blob URL (instant, no server)
 *  - CSS          → wrap in a styled HTML doc and render in iframe
 *  - SVG          → render as <img> in an iframe wrapper
 *  - JS / TS      → show in a sandboxed JS runner iframe (eval in blob)
 *  - Markdown     → render as styled HTML in iframe
 *  - Images       → display directly
 *  - Non-runnable → status = 'unsupported'
 *
 * States: idle | loading | ready | error | unsupported
 */
import { useState, useCallback, useRef, useEffect } from 'react';

export const PREVIEW_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
  UNSUPPORTED: 'unsupported',
};

// File extensions that can be previewed
export const PREVIEWABLE_EXTS = new Set([
  'html', 'htm',
  'css',
  'svg',
  'js', 'mjs',
  'ts', 'tsx', 'jsx',
  'md', 'markdown', 'mdx',
  'json',
  'txt',
  'xml',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico',
]);

// Extensions that render as live interactive content
export const RUNNABLE_EXTS = new Set([
  'html', 'htm',
  'css',
  'svg',
  'js', 'mjs',
  'md', 'markdown', 'mdx',
  'json',
  'txt',
  'xml',
]);

// Image extensions — rendered directly
export const IMAGE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico',
]);

/**
 * Get the preview "mode" for a given filename.
 * Returns one of: 'html' | 'css' | 'svg' | 'js' | 'markdown' | 'json' | 'text' | 'xml' | 'image' | null
 */
export function getPreviewMode(filename = '') {
  if (!filename) return null;
  const ext = filename.split('.').pop().toLowerCase();
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'css') return 'css';
  if (ext === 'svg') return 'svg';
  if (ext === 'js' || ext === 'mjs' || ext === 'jsx' || ext === 'ts' || ext === 'tsx') return 'js';
  if (ext === 'md' || ext === 'markdown' || ext === 'mdx') return 'markdown';
  if (ext === 'json') return 'json';
  if (ext === 'xml') return 'xml';
  if (ext === 'txt') return 'text';
  if (IMAGE_EXTS.has(ext)) return 'image';
  return null;
}

/**
 * Returns true if the file can be previewed in-app.
 */
export function isPreviewable(filename = '') {
  if (!filename) return false;
  const ext = filename.split('.').pop().toLowerCase();
  return RUNNABLE_EXTS.has(ext) || IMAGE_EXTS.has(ext);
}

// ── Markdown-to-HTML (lightweight, no deps) ──
function simpleMarkdownToHtml(md) {
  let html = md
    // Escape HTML entities first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Code blocks
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code class="language-${lang}">${code.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')}</code></pre>`)
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headings
    .replace(/^######\s(.+)$/gm, '<h6>$1</h6>')
    .replace(/^#####\s(.+)$/gm, '<h5>$1</h5>')
    .replace(/^####\s(.+)$/gm, '<h4>$1</h4>')
    .replace(/^###\s(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s(.+)$/gm, '<h1>$1</h1>')
    // Bold & Italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Strikethrough
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    // Blockquote
    .replace(/^>\s(.+)$/gm, '<blockquote>$1</blockquote>')
    // Horizontal rule
    .replace(/^(---|\*\*\*|___)$/gm, '<hr />')
    // Unordered list
    .replace(/^\s*[-*+]\s(.+)$/gm, '<li>$1</li>')
    // Ordered list
    .replace(/^\s*\d+\.\s(.+)$/gm, '<li>$1</li>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // Images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%" />')
    // Line breaks → paragraphs
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br />');

  return `<p>${html}</p>`;
}

// ── Build blob HTML for different preview modes ──
function buildPreviewHtml(mode, content, filename = '') {
  const darkStyle = `
    :root { color-scheme: light dark; }
    body {
      margin: 0; padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px; line-height: 1.6;
      background: #1e1e2e; color: #cdd6f4;
    }
    a { color: #89b4fa; }
    code, pre {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 13px;
      background: #313244; border-radius: 6px; padding: 2px 6px;
    }
    pre { padding: 16px; overflow-x: auto; }
    pre code { background: none; padding: 0; border-radius: 0; }
    blockquote {
      border-left: 4px solid #89b4fa;
      margin: 0; padding: 8px 16px;
      background: rgba(137,180,250,0.08); border-radius: 0 8px 8px 0;
    }
    h1,h2,h3,h4,h5,h6 { color: #cba6f7; margin-top: 1.5em; margin-bottom: 0.5em; }
    hr { border: none; border-top: 1px solid #45475a; margin: 1.5em 0; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #45475a; padding: 8px 12px; }
    th { background: #313244; }
    img { max-width: 100%; }
    del { opacity: 0.6; }
  `;

  if (mode === 'html') {
    // Inject directly — the content IS the HTML
    return content;
  }

  if (mode === 'css') {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>CSS Preview — ${filename}</title>
  <style>
    body { margin: 0; background: #1e1e2e; }
    .cp-css-preview-wrapper { padding: 20px; }
  </style>
  <style>
    ${content}
  </style>
</head>
<body>
  <div class="cp-css-preview-wrapper">
    <h1>CSS Preview</h1>
    <p>Your stylesheet has been applied to this page.</p>
    <div class="sample-card" style="padding:16px;border-radius:8px;margin-top:16px;">
      <h2>Sample Card</h2>
      <p>This is a sample element to preview your CSS styles.</p>
      <button>Sample Button</button>
    </div>
    <a href="#">Sample Link</a>
  </div>
</body>
</html>`;
  }

  if (mode === 'svg') {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>SVG Preview — ${filename}</title>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #1e1e2e; }
    .svgwrap {
      display: flex; align-items: center; justify-content: center;
      width: 100%; height: 100%; min-height: 100vh;
    }
    img { max-width: 90vw; max-height: 90vh; object-fit: contain;
      border-radius: 8px; box-shadow: 0 4px 24px rgba(0,0,0,0.5); }
  </style>
</head>
<body>
  <div class="svgwrap">
    <img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}"
         alt="${filename}" />
  </div>
</body>
</html>`;
  }

  if (mode === 'js') {
    // Wrap in a sandboxed runner that captures console output
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>JS Runner — ${filename}</title>
  <style>
    ${darkStyle}
    .console-line { font-family: 'JetBrains Mono', monospace; font-size: 12px; padding: 3px 0; border-bottom: 1px solid #313244; }
    .console-line.error { color: #f38ba8; }
    .console-line.warn { color: #fab387; }
    .console-line.info { color: #89b4fa; }
    .console-line.log { color: #a6e3a1; }
    #console { background: #11111b; padding: 12px 16px; border-radius: 8px; margin-top: 16px; min-height: 60px; }
    #output { margin-top: 16px; }
    .badge { display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; margin-bottom:10px; }
    .badge-js { background: rgba(249,178,28,0.15); color:#F9B21C; border:1px solid rgba(249,178,28,0.3); }
    .badge-ts { background: rgba(49,120,198,0.15); color:#3178c6; border:1px solid rgba(49,120,198,0.3); }
  </style>
</head>
<body>
  <div>
    <span class="badge badge-js">${filename.endsWith('.ts') || filename.endsWith('.tsx') ? 'TypeScript (preview only)' : 'JavaScript'}</span>
    <div id="output"></div>
    <h3 style="color:#cba6f7;margin-top:1.5em;font-size:13px;text-transform:uppercase;letter-spacing:0.08em;">Console Output</h3>
    <div id="console"><span style="color:#585b70;font-size:12px;">— running script —</span></div>
  </div>
  <script>
    const consoleEl = document.getElementById('console');
    const outputEl = document.getElementById('output');
    function appendLog(msg, type) {
      const line = document.createElement('div');
      line.className = 'console-line ' + type;
      line.textContent = msg;
      consoleEl.appendChild(line);
    }
    const _log = console.log;
    const _warn = console.warn;
    const _error = console.error;
    const _info = console.info;
    console.log = (...a) => { appendLog(a.map(String).join(' '), 'log'); _log(...a); };
    console.warn = (...a) => { appendLog(a.map(String).join(' '), 'warn'); _warn(...a); };
    console.error = (...a) => { appendLog(a.map(String).join(' '), 'error'); _error(...a); };
    console.info = (...a) => { appendLog(a.map(String).join(' '), 'info'); _info(...a); };
    window.onerror = function(msg, src, line, col, err) {
      appendLog('ERROR: ' + msg + ' (line ' + line + ')', 'error');
    };
    // Remove the placeholder text
    consoleEl.innerHTML = '';
    try {
      ${content}
    } catch(e) {
      appendLog('ERROR: ' + e.message, 'error');
    }
  </script>
</body>
</html>`;
  }

  if (mode === 'markdown') {
    const htmlBody = simpleMarkdownToHtml(content);
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${filename}</title>
  <style>
    ${darkStyle}
    body { padding: 32px; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 2em; border-bottom: 2px solid #313244; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #313244; padding-bottom: 0.2em; }
    li { margin: 4px 0; }
    ul, ol { padding-left: 2em; }
  </style>
</head>
<body>
  ${htmlBody}
</body>
</html>`;
  }

  if (mode === 'json') {
    let formatted = content;
    try { formatted = JSON.stringify(JSON.parse(content), null, 2); } catch (_) { /* use raw */ }
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${filename}</title>
  <style>
    ${darkStyle}
    body { padding: 0; margin: 0; }
    pre { margin: 0; padding: 20px; min-height: 100vh; font-size: 13px; white-space: pre-wrap; word-break: break-all; }
    .key { color: #89dceb; }
    .string { color: #a6e3a1; }
    .number { color: #fab387; }
    .bool { color: #cba6f7; }
    .null { color: #585b70; }
  </style>
</head>
<body>
  <pre>${formatted.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
</body>
</html>`;
  }

  if (mode === 'xml') {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${filename}</title>
  <style>
    ${darkStyle}
    body { padding: 0; margin: 0; }
    pre { margin: 0; padding: 20px; min-height: 100vh; white-space: pre-wrap; word-break: break-all; font-size: 12.5px; }
  </style>
</head>
<body>
  <pre>${content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
</body>
</html>`;
  }

  if (mode === 'text') {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${filename}</title>
  <style>
    ${darkStyle}
    body { padding: 0; margin: 0; }
    pre { margin: 0; padding: 20px; min-height: 100vh; white-space: pre-wrap; word-break: break-all; font-size: 13px; }
  </style>
</head>
<body>
  <pre>${content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
</body>
</html>`;
  }

  return null;
}

export function useCodePreview() {
  const [status, setStatus] = useState(PREVIEW_STATUS.IDLE);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewMode, setPreviewMode] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [logs, setLogs] = useState([]);

  // Keep track of current blob URL so we can revoke it
  const blobUrlRef = useRef(null);

  const addLog = useCallback((line) => {
    setLogs((prev) => {
      const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
      return [...prev, `[${ts}] ${line}`];
    });
  }, []);

  // Revoke blob URL on cleanup
  const revokeBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  // Stop / reset preview
  const stopPreview = useCallback(() => {
    revokeBlobUrl();
    setStatus(PREVIEW_STATUS.IDLE);
    setPreviewUrl(null);
    setPreviewMode(null);
    setErrorMessage(null);
  }, [revokeBlobUrl]);

  /**
   * Run preview for a file.
   * @param {string} filename — the file name (used for extension detection)
   * @param {string} content — the file content
   */
  const startPreview = useCallback((filename, content) => {
    if (!filename || content == null) {
      setStatus(PREVIEW_STATUS.ERROR);
      setErrorMessage('No file content to preview.');
      return;
    }

    const mode = getPreviewMode(filename);

    if (!mode) {
      setStatus(PREVIEW_STATUS.UNSUPPORTED);
      setPreviewMode(null);
      setErrorMessage(null);
      setPreviewUrl(null);
      return;
    }

    setStatus(PREVIEW_STATUS.LOADING);
    setErrorMessage(null);
    setLogs([]);
    addLog(`Building preview for "${filename}" (mode: ${mode})…`);

    try {
      // Handle image files — serve as data URL directly
      if (mode === 'image') {
        revokeBlobUrl();
        // Content is base64 or raw bytes — for now show a placeholder message
        // since FileViewer loads text; images are blocked by BINARY_EXTS.
        // We'll show a message instead.
        setStatus(PREVIEW_STATUS.READY);
        setPreviewMode(mode);
        setPreviewUrl(null); // Handled separately in panel
        addLog(`Image preview ready.`);
        return;
      }

      // Build the HTML wrapper
      const htmlDoc = buildPreviewHtml(mode, content, filename);
      if (!htmlDoc) {
        setStatus(PREVIEW_STATUS.UNSUPPORTED);
        return;
      }

      // Create blob URL
      revokeBlobUrl();
      const blob = new Blob([htmlDoc], { type: 'text/html; charset=utf-8' });
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;

      setPreviewMode(mode);
      setPreviewUrl(url);
      setStatus(PREVIEW_STATUS.READY);
      addLog(`Preview ready (${mode} mode).`);
    } catch (err) {
      setStatus(PREVIEW_STATUS.ERROR);
      setErrorMessage(err.message || 'Failed to build preview.');
      addLog(`ERROR: ${err.message}`);
    }
  }, [addLog, revokeBlobUrl]);

  // Refresh: re-run with same file (caller should pass content again)
  const refreshPreview = useCallback((filename, content) => {
    startPreview(filename, content);
  }, [startPreview]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      revokeBlobUrl();
    };
  }, [revokeBlobUrl]);

  return {
    status,
    previewUrl,
    previewMode,
    errorMessage,
    logs,
    startPreview,
    stopPreview,
    refreshPreview,
    isPreviewable,
    getPreviewMode,
  };
}
