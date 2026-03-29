/**
 * useProjectPreview — Project-level live preview hook
 *
 * Unlike useCodePreview (single-file), this hook:
 *   1. Fetches ALL files in a project recursively
 *   2. Finds the entry HTML file (index.html, or first .html)
 *   3. Resolves relative paths (<link>, <script>, <img>, url()) by
 *      inlining CSS/JS as blob URLs and images as data URIs
 *   4. Builds a single self-contained blob URL for iframe preview
 *
 * States: idle | loading | ready | error | no-entry
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { workspaceApi } from '../api/workspace.js';

export const PROJECT_PREVIEW_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
  NO_ENTRY: 'no-entry',
};

// File type categories for smart fallback UI
export const FILE_TYPE_CATEGORIES = {
  html:       { label: 'HTML',        color: '#e44d26', previewable: true },
  css:        { label: 'CSS',         color: '#1572b6', previewable: true },
  javascript: { label: 'JavaScript',  color: '#f5de19', previewable: true },
  typescript: { label: 'TypeScript',  color: '#3178c6', previewable: true },
  python:     { label: 'Python',      color: '#3776ab', previewable: false },
  java:       { label: 'Java',        color: '#e76f00', previewable: false },
  csharp:     { label: 'C#',          color: '#68217a', previewable: false },
  cpp:        { label: 'C/C++',       color: '#f34b7d', previewable: false },
  go:         { label: 'Go',          color: '#00add8', previewable: false },
  rust:       { label: 'Rust',        color: '#dea584', previewable: false },
  ruby:       { label: 'Ruby',        color: '#cc342d', previewable: false },
  php:        { label: 'PHP',         color: '#4f5b93', previewable: false },
  swift:      { label: 'Swift',       color: '#fa7343', previewable: false },
  kotlin:     { label: 'Kotlin',      color: '#7f52ff', previewable: false },
  shell:      { label: 'Shell',       color: '#4ec9b0', previewable: false },
  markdown:   { label: 'Markdown',    color: '#519aba', previewable: true },
  json:       { label: 'JSON',        color: '#f5de19', previewable: true },
  xml:        { label: 'XML',         color: '#e44d26', previewable: true },
  svg:        { label: 'SVG',         color: '#ffb13b', previewable: true },
  image:      { label: 'Image',       color: '#a074c4', previewable: false },
  config:     { label: 'Config',      color: '#a8b9cc', previewable: false },
  data:       { label: 'Data',        color: '#e6a817', previewable: false },
  other:      { label: 'Other',       color: '#a8b9cc', previewable: false },
};

// Map file extension to category
const EXT_TO_CATEGORY = {
  html: 'html', htm: 'html',
  css: 'css', scss: 'css', sass: 'css', less: 'css',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', pyw: 'python', pyi: 'python', ipynb: 'python',
  java: 'java', jar: 'java', class: 'java',
  cs: 'csharp',
  c: 'cpp', cpp: 'cpp', cc: 'cpp', h: 'cpp', hpp: 'cpp',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin', scala: 'kotlin',
  sh: 'shell', bash: 'shell', zsh: 'shell', bat: 'shell', ps1: 'shell',
  md: 'markdown', mdx: 'markdown', markdown: 'markdown',
  json: 'json',
  xml: 'xml',
  svg: 'svg',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image', ico: 'image',
  yaml: 'config', yml: 'config', toml: 'config', ini: 'config', cfg: 'config', conf: 'config', env: 'config',
  sql: 'data', db: 'data', sqlite: 'data', csv: 'data',
};

/**
 * Detect the file type category from a filename.
 */
export function getFileCategory(filename) {
  if (!filename) return 'other';
  const ext = filename.split('.').pop().toLowerCase();
  return EXT_TO_CATEGORY[ext] || 'other';
}

/**
 * Analyze a project's files and return a summary of file types.
 * Returns { categories: { [category]: count }, primaryCategory, hasHtml, totalFiles, files }
 */
export function analyzeProjectFiles(files) {
  const categories = {};
  let hasHtml = false;

  for (const f of files) {
    const cat = getFileCategory(f.name);
    categories[cat] = (categories[cat] || 0) + 1;
    if (cat === 'html') hasHtml = true;
  }

  // Determine primary (most common) category
  let primaryCategory = 'other';
  let maxCount = 0;
  for (const [cat, count] of Object.entries(categories)) {
    if (count > maxCount) {
      maxCount = count;
      primaryCategory = cat;
    }
  }

  return { categories, primaryCategory, hasHtml, totalFiles: files.length, files };
}

/**
 * Check if a file is executable (can be run via backend).
 * Re-exports logic consistent with useCodeExecution.
 */
export function isExecutableFile(filename) {
  if (!filename) return false;
  const ext = filename.split('.').pop().toLowerCase();
  return ['py', 'pyw', 'java', 'js', 'mjs', 'sh', 'bash'].includes(ext);
}

// Image extensions we can inline as data URIs
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg']);



function getExt(filename) {
  return (filename || '').split('.').pop().toLowerCase();
}

/**
 * Normalize a relative path against a base directory.
 * normalizePath('css/style.css', 'pages/about.html') → 'pages/css/style.css'
 * normalizePath('../style.css', 'pages/about.html')  → 'style.css'
 * normalizePath('/style.css', 'pages/about.html')    → 'style.css'  (project-root-relative)
 */
function resolvePath(href, baseFilePath) {
  // Strip query strings and fragments
  const clean = href.split('?')[0].split('#')[0].trim();
  if (!clean) return null;

  // Absolute URL (http/https/data/blob) — leave as-is
  if (/^(https?:|data:|blob:|\/\/)/i.test(clean)) return null;

  // Project-root-relative (starts with /)
  if (clean.startsWith('/')) return clean.slice(1);

  // Relative path — resolve against the base file's directory
  const baseDir = baseFilePath.includes('/') 
    ? baseFilePath.substring(0, baseFilePath.lastIndexOf('/'))
    : '';

  const parts = (baseDir ? baseDir + '/' + clean : clean).split('/');
  const resolved = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') { resolved.pop(); continue; }
    resolved.push(part);
  }
  return resolved.join('/');
}

/**
 * Recursively list all files in a project.
 * Returns a flat array of { name, path, type } objects.
 *
 * Strategy: try recursive=true first. If the API returns a flat list
 * with file entries, use that. If it only returns top-level entries
 * (some backends ignore recursive), manually recurse into directories.
 */
async function listAllFiles(project, dirPath = '') {
  let entries;
  try {
    entries = await workspaceApi.listFiles(project, dirPath, true);
  } catch (_) {
    entries = await workspaceApi.listFiles(project, dirPath, false);
  }
  const normalized = Array.isArray(entries) ? entries : (entries?.entries || entries?.files || entries?.children || []);
  
  const result = [];
  for (const entry of normalized) {
    const name = entry.name || entry.filename || '';
    const path = entry.path || (dirPath ? `${dirPath}/${name}` : name);
    const isDir = entry.type === 'directory' || entry.type === 'dir' || entry.is_directory;
    
    if (isDir) {
      // Recurse into subdirectory (handles both recursive and non-recursive APIs)
      try {
        const children = await listAllFiles(project, path);
        result.push(...children);
      } catch (_) {
        // Skip inaccessible directories
      }
    } else {
      result.push({ name, path, type: 'file' });
    }
  }
  return result;
}

/**
 * Read file content. Returns string for text files, or null on error.
 */
async function readFileContent(project, filePath) {
  try {
    const data = await workspaceApi.readFile(project, filePath);
    return typeof data === 'string' ? data : (data?.content ?? null);
  } catch (_) {
    return null;
  }
}

/**
 * Find the entry HTML file for a project.
 * Priority: index.html (root) > index.htm > first .html file
 */
function findEntryFile(files) {
  // Root-level index.html
  const rootIndex = files.find(f => f.path === 'index.html' || f.path === 'Index.html');
  if (rootIndex) return rootIndex;

  // Root-level index.htm
  const rootIndexHtm = files.find(f => f.path === 'index.htm' || f.path === 'Index.htm');
  if (rootIndexHtm) return rootIndexHtm;

  // Any index.html in any directory (prefer shallowest)
  const indexFiles = files
    .filter(f => /^index\.html?$/i.test(f.name))
    .sort((a, b) => (a.path.split('/').length) - (b.path.split('/').length));
  if (indexFiles.length > 0) return indexFiles[0];

  // First .html file (shallowest)
  const htmlFiles = files
    .filter(f => /\.html?$/i.test(f.name))
    .sort((a, b) => (a.path.split('/').length) - (b.path.split('/').length));
  if (htmlFiles.length > 0) return htmlFiles[0];

  return null;
}

/**
 * Build a fully self-contained HTML blob from a project.
 * Reads the entry HTML, inlines all relative CSS/JS/images.
 */
async function buildProjectPreview(project, files, entryFile) {
  // Build a lookup map: path → file entry
  const fileMap = new Map();
  for (const f of files) {
    fileMap.set(f.path, f);
    // Also map with leading slash removed
    if (f.path.startsWith('/')) fileMap.set(f.path.slice(1), f);
  }

  // Read the entry HTML
  let html = await readFileContent(project, entryFile.path);
  if (!html) throw new Error(`Could not read entry file: ${entryFile.path}`);

  // Track file contents we've already fetched
  const contentCache = new Map();
  contentCache.set(entryFile.path, html);

  // Helper: fetch + cache file content
  async function getContent(filePath) {
    if (contentCache.has(filePath)) return contentCache.get(filePath);
    const content = await readFileContent(project, filePath);
    if (content !== null) contentCache.set(filePath, content);
    return content;
  }

  // ═══ Phase 1: Replace <link rel="stylesheet" href="..."> with inline <style> ═══
  const linkRegex = /<link\s+[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi;
  const linkMatches = [...html.matchAll(linkRegex)];
  
  for (const match of linkMatches.reverse()) {
    const tag = match[0];
    const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;

    const resolvedPath = resolvePath(hrefMatch[1], entryFile.path);
    if (!resolvedPath) continue; // External URL

    const cssContent = await getContent(resolvedPath);
    if (cssContent !== null) {
      // Also resolve url() inside CSS
      const processedCss = await processCssUrls(project, cssContent, resolvedPath, fileMap, contentCache);
      const replacement = `<style data-original-href="${hrefMatch[1]}">\n${processedCss}\n</style>`;
      html = html.slice(0, match.index) + replacement + html.slice(match.index + tag.length);
    }
  }

  // ═══ Phase 2: Replace <script src="..."> with inline <script> ═══
  const scriptRegex = /<script\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi;
  const scriptMatches = [...html.matchAll(scriptRegex)];

  for (const match of scriptMatches.reverse()) {
    const src = match[1];
    const resolvedPath = resolvePath(src, entryFile.path);
    if (!resolvedPath) continue;

    const jsContent = await getContent(resolvedPath);
    if (jsContent !== null) {
      // Preserve type attribute if present
      const typeMatch = match[0].match(/type\s*=\s*["']([^"']+)["']/i);
      const typeAttr = typeMatch ? ` type="${typeMatch[1]}"` : '';
      const replacement = `<script${typeAttr} data-original-src="${src}">\n${jsContent}\n</script>`;
      html = html.slice(0, match.index) + replacement + html.slice(match.index + match[0].length);
    }
  }

  // ═══ Phase 3: Replace <img src="..."> with data URIs for local images ═══
  const imgRegex = /<img\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const imgMatches = [...html.matchAll(imgRegex)];

  for (const match of imgMatches.reverse()) {
    const src = match[1];
    const resolvedPath = resolvePath(src, entryFile.path);
    if (!resolvedPath) continue;

    const ext = getExt(resolvedPath);
    if (IMAGE_EXTS.has(ext) && ext === 'svg') {
      // SVG can be inlined as text
      const svgContent = await getContent(resolvedPath);
      if (svgContent !== null) {
        const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;
        const newTag = match[0].replace(src, dataUri);
        html = html.slice(0, match.index) + newTag + html.slice(match.index + match[0].length);
      }
    }
    // For binary images we can't inline without base64 — leave src as-is
    // The preview will show broken images for local binary images (acceptable trade-off)
  }

  // ═══ Phase 4: Inline <style> blocks — resolve url() within ═══
  const styleBlockRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  const styleMatches = [...html.matchAll(styleBlockRegex)];

  for (const match of styleMatches.reverse()) {
    // Only process if it doesn't already have data-original-href (we already processed those above)
    if (match[0].includes('data-original-href')) continue;
    const cssContent = match[1];
    const processedCss = await processCssUrls(project, cssContent, entryFile.path, fileMap, contentCache);
    if (processedCss !== cssContent) {
      const replacement = match[0].replace(cssContent, processedCss);
      html = html.slice(0, match.index) + replacement + html.slice(match.index + match[0].length);
    }
  }

  return html;
}

/**
 * Process url() references inside CSS content.
 * Resolves relative paths to data URIs or inlined content.
 */
async function processCssUrls(project, cssContent, cssFilePath, _fileMap, contentCache) {
  const urlRegex = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
  let result = cssContent;
  const matches = [...cssContent.matchAll(urlRegex)];

  for (const match of matches.reverse()) {
    const originalUrl = match[1];
    const resolvedPath = resolvePath(originalUrl, cssFilePath);
    if (!resolvedPath) continue;

    const ext = getExt(resolvedPath);
    if (ext === 'svg') {
      let content = contentCache.get(resolvedPath);
      if (!content) {
        content = await readFileContent(project, resolvedPath);
        if (content) contentCache.set(resolvedPath, content);
      }
      if (content) {
        const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
        result = result.slice(0, match.index) + `url("${dataUri}")` + result.slice(match.index + match[0].length);
      }
    }
    // For binary images in CSS, we leave as-is (same limitation)
  }

  return result;
}

/**
 * React hook for project-level preview.
 */
export function useProjectPreview() {
  const [status, setStatus] = useState(PROJECT_PREVIEW_STATUS.IDLE);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [entryFilePath, setEntryFilePath] = useState(null);
  const [logs, setLogs] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [projectAnalysis, setProjectAnalysis] = useState(null);

  const blobUrlRef = useRef(null);
  const abortRef = useRef(false);

  const addLog = useCallback((line) => {
    setLogs((prev) => {
      const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
      return [...prev, `[${ts}] ${line}`];
    });
  }, []);

  const revokeBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  const stopPreview = useCallback(() => {
    abortRef.current = true;
    revokeBlobUrl();
    setStatus(PROJECT_PREVIEW_STATUS.IDLE);
    setPreviewUrl(null);
    setErrorMessage(null);
    setEntryFilePath(null);
    setCurrentProject(null);
  }, [revokeBlobUrl]);

  /**
   * Start preview for a project.
   * Fetches all files, finds entry HTML, builds self-contained blob.
   */
  const startPreview = useCallback(async (projectName) => {
    if (!projectName) {
      setStatus(PROJECT_PREVIEW_STATUS.ERROR);
      setErrorMessage('No project selected.');
      return;
    }

    abortRef.current = false;
    setStatus(PROJECT_PREVIEW_STATUS.LOADING);
    setErrorMessage(null);
    setLogs([]);
    setCurrentProject(projectName);
    setEntryFilePath(null);
    setProjectAnalysis(null);
    addLog(`Starting preview for project "${projectName}"…`);

    try {
      // Step 1: List all files
      addLog('Scanning project files…');
      const files = await listAllFiles(projectName);
      if (abortRef.current) return;
      addLog(`Found ${files.length} file(s).`);

      // Analyze project file composition
      const analysis = analyzeProjectFiles(files);
      setProjectAnalysis(analysis);

      if (files.length === 0) {
        setStatus(PROJECT_PREVIEW_STATUS.NO_ENTRY);
        setErrorMessage('Project is empty — no files found.');
        addLog('ERROR: Project is empty.');
        return;
      }

      // Step 2: Find entry file
      const entry = findEntryFile(files);
      if (!entry) {
        setStatus(PROJECT_PREVIEW_STATUS.NO_ENTRY);
        const catInfo = FILE_TYPE_CATEGORIES[analysis.primaryCategory];
        const catLabel = catInfo ? catInfo.label : 'code';
        setErrorMessage(`This is a ${catLabel} project — no HTML entry file found for live preview.`);
        addLog(`INFO: ${catLabel} project detected (${files.length} files). No HTML entry for preview.`);
        return;
      }

      setEntryFilePath(entry.path);
      addLog(`Entry file: ${entry.path}`);

      // Step 3: Build preview
      addLog('Building preview (resolving assets)…');
      const html = await buildProjectPreview(projectName, files, entry);
      if (abortRef.current) return;

      // Step 4: Create blob URL
      revokeBlobUrl();
      const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;

      setPreviewUrl(url);
      setStatus(PROJECT_PREVIEW_STATUS.READY);
      addLog('Preview ready.');
    } catch (err) {
      if (abortRef.current) return;
      console.error('[useProjectPreview] Error:', err);
      setStatus(PROJECT_PREVIEW_STATUS.ERROR);
      setErrorMessage(err.message || 'Failed to build project preview.');
      addLog(`ERROR: ${err.message}`);
    }
  }, [addLog, revokeBlobUrl]);

  /**
   * Refresh the preview (re-fetch and re-build).
   */
  const refreshPreview = useCallback((projectName) => {
    startPreview(projectName || currentProject);
  }, [startPreview, currentProject]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  return {
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
  };
}
