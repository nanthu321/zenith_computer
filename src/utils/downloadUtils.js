// ─────────────────────────────────────────────────────────────
//  Download Utilities — File, Folder & Project Downloads
//  Uses JSZip for client-side ZIP creation
//  Handles MIME types, streaming, progress, and error handling
// ─────────────────────────────────────────────────────────────
import JSZip from "jszip";
import { workspaceApi } from "../api/workspace";
import { getCookie } from "./cookieUtils.js";

// ═══════════════════════════════════════════════════════════════
//  MIME Type Mapping — comprehensive list for correct downloads
// ═══════════════════════════════════════════════════════════════
const MIME_TYPES = {
  // Text / Code
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "application/javascript",
  mjs: "application/javascript",
  jsx: "application/javascript",
  ts: "application/typescript",
  tsx: "application/typescript",
  json: "application/json",
  xml: "application/xml",
  yaml: "application/x-yaml",
  yml: "application/x-yaml",
  toml: "application/toml",
  ini: "text/plain",
  cfg: "text/plain",
  conf: "text/plain",
  env: "text/plain",
  log: "text/plain",
  sql: "application/sql",
  graphql: "application/graphql",
  sh: "application/x-sh",
  bash: "application/x-sh",
  zsh: "application/x-sh",
  bat: "application/x-msdos-program",
  cmd: "application/x-msdos-program",
  ps1: "application/x-powershell",

  // Programming languages
  py: "text/x-python",
  java: "text/x-java-source",
  c: "text/x-c",
  cpp: "text/x-c++src",
  h: "text/x-c",
  hpp: "text/x-c++hdr",
  cs: "text/x-csharp",
  go: "text/x-go",
  rs: "text/x-rust",
  rb: "text/x-ruby",
  php: "application/x-httpd-php",
  swift: "text/x-swift",
  kt: "text/x-kotlin",
  scala: "text/x-scala",
  r: "text/x-r",
  lua: "text/x-lua",
  perl: "text/x-perl",
  pl: "text/x-perl",
  dart: "application/dart",

  // Markup / Config
  svg: "image/svg+xml",
  vue: "text/plain",
  svelte: "text/plain",
  astro: "text/plain",
  dockerfile: "text/plain",
  makefile: "text/plain",
  gitignore: "text/plain",
  editorconfig: "text/plain",
  prettierrc: "application/json",
  eslintrc: "application/json",

  // Images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tiff: "image/tiff",
  tif: "image/tiff",

  // Documents
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",

  // Archives
  zip: "application/zip",
  tar: "application/x-tar",
  gz: "application/gzip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",

  // Audio / Video
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  avi: "video/x-msvideo",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",

  // Fonts
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",

  // Other
  wasm: "application/wasm",
  map: "application/json",
};

// ═══════════════════════════════════════════════════════════════
//  Binary file detection — extensions that should be read as blobs
// ═══════════════════════════════════════════════════════════════
const BINARY_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "tiff", "tif",
  "zip", "tar", "gz", "rar", "7z",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "mp3", "mp4", "wav", "avi", "mov", "ogg", "webm", "mkv",
  "exe", "dll", "so", "dylib", "wasm",
  "pyc", "class", "o",
  "woff", "woff2", "ttf", "otf", "eot",
]);

/**
 * Check if a file is binary based on its extension.
 */
export function isBinaryFile(filename) {
  const ext = (filename || "").split(".").pop().toLowerCase();
  return BINARY_EXTS.has(ext);
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(filename) {
  const ext = (filename || "").split(".").pop().toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

/**
 * Get file extension from filename
 */
function getExtension(filename) {
  const parts = (filename || "").split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

// ═══════════════════════════════════════════════════════════════
//  SINGLE FILE DOWNLOAD
//  Fetches file content from API and triggers browser download
// ═══════════════════════════════════════════════════════════════

/**
 * Download a single file with correct MIME type and extension.
 *
 * For binary files, attempts a direct fetch to the file endpoint
 * and downloads as a blob. For text files, uses the workspace API.
 *
 * @param {string} project - Project name
 * @param {string} filePath - Path to the file within the project
 * @param {string} fileName - Display name of the file
 * @param {object} callbacks - { onStart, onSuccess, onError }
 */
export async function downloadFile(project, filePath, fileName, callbacks = {}) {
  const { onStart, onSuccess, onError } = callbacks;

  try {
    onStart?.();

    // Binary files — try direct download endpoint first
    if (isBinaryFile(fileName)) {
      const directSuccess = await tryDirectFileDownload(project, filePath, fileName);
      if (directSuccess) {
        onSuccess?.(fileName);
        return;
      }
      // If direct download fails, fall through to API-based download
    }

    // Fetch file content from the workspace API
    const data = await workspaceApi.readFile(project, filePath);

    // Normalize content to string
    let content;
    if (typeof data === "string") {
      content = data;
    } else if (data?.content !== undefined) {
      content = typeof data.content === "string"
        ? data.content
        : JSON.stringify(data.content, null, 2);
    } else {
      content = JSON.stringify(data, null, 2);
    }

    // Determine MIME type
    const mimeType = getMimeType(fileName);

    // Create blob and trigger download
    const blob = new Blob([content], { type: mimeType });
    triggerBlobDownload(blob, fileName);

    onSuccess?.(fileName);
  } catch (err) {
    console.error("[downloadUtils] File download failed:", err);
    onError?.(err.message || "Download failed");
  }
}

// ═══════════════════════════════════════════════════════════════
//  FOLDER DOWNLOAD (as ZIP)
//  Recursively fetches all files in a folder and creates a ZIP
// ═══════════════════════════════════════════════════════════════

/**
 * Download a folder as a .zip file.
 * Recursively fetches all files maintaining folder structure.
 *
 * @param {string} project - Project name
 * @param {string} folderPath - Path to the folder within the project
 * @param {string} folderName - Display name of the folder (used for zip name)
 * @param {object} callbacks - { onStart, onProgress, onSuccess, onError }
 */
export async function downloadFolderAsZip(project, folderPath, folderName, callbacks = {}) {
  const { onStart, onProgress, onSuccess, onError } = callbacks;

  try {
    onStart?.();

    const zip = new JSZip();
    const files = [];

    // Recursively collect all files in the folder
    await collectFiles(project, folderPath, "", files, onProgress);

    if (files.length === 0) {
      // Empty folder — still create an empty zip
      zip.folder(folderName);
    } else {
      // Add all files to the zip
      let processed = 0;
      for (const file of files) {
        try {
          const data = await workspaceApi.readFile(project, file.fullPath);
          let content;
          if (typeof data === "string") {
            content = data;
          } else if (data?.content !== undefined) {
            content = typeof data.content === "string"
              ? data.content
              : JSON.stringify(data.content, null, 2);
          } else {
            content = JSON.stringify(data, null, 2);
          }
          zip.file(file.relativePath, content);
        } catch (err) {
          // Skip files that can't be read (e.g., binary files)
          console.warn(`[downloadUtils] Skipping file ${file.fullPath}:`, err.message);
        }
        processed++;
        onProgress?.({
          current: processed,
          total: files.length,
          fileName: file.relativePath,
        });
      }
    }

    // Generate the ZIP blob
    const blob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    // Trigger download
    const zipName = `${folderName}.zip`;
    triggerBlobDownload(blob, zipName);

    onSuccess?.(zipName, files.length);
  } catch (err) {
    console.error("[downloadUtils] Folder download failed:", err);
    onError?.(err.message || "Download failed");
  }
}

// ═══════════════════════════════════════════════════════════════
//  PROJECT DOWNLOAD (as ZIP)
//  Downloads entire project as a zip (uses folder download
//  with root path, or backend endpoint if available)
// ═══════════════════════════════════════════════════════════════

/**
 * Download an entire project as a .zip file.
 * First tries the backend download endpoint, falls back to
 * client-side ZIP creation.
 *
 * @param {string} project - Project name
 * @param {object} callbacks - { onStart, onProgress, onSuccess, onError }
 */
export async function downloadProjectAsZip(project, callbacks = {}) {
  const { onStart, onProgress, onSuccess, onError } = callbacks;

  try {
    onStart?.();

    // Try backend download endpoint first (faster for large projects)
    const backendSuccess = await tryBackendDownload(project);
    if (backendSuccess) {
      onSuccess?.(`${project}.zip`, -1); // -1 = unknown file count
      return;
    }

    // Fallback: client-side ZIP creation
    const zip = new JSZip();
    const files = [];

    // Collect all files from root
    await collectFiles(project, "", "", files, onProgress);

    if (files.length === 0) {
      zip.folder(project);
    } else {
      let processed = 0;
      for (const file of files) {
        try {
          const data = await workspaceApi.readFile(project, file.fullPath);
          let content;
          if (typeof data === "string") {
            content = data;
          } else if (data?.content !== undefined) {
            content = typeof data.content === "string"
              ? data.content
              : JSON.stringify(data.content, null, 2);
          } else {
            content = JSON.stringify(data, null, 2);
          }
          zip.file(file.relativePath, content);
        } catch (err) {
          console.warn(`[downloadUtils] Skipping file ${file.fullPath}:`, err.message);
        }
        processed++;
        onProgress?.({
          current: processed,
          total: files.length,
          fileName: file.relativePath,
        });
      }
    }

    const blob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    triggerBlobDownload(blob, `${project}.zip`);
    onSuccess?.(`${project}.zip`, files.length);
  } catch (err) {
    console.error("[downloadUtils] Project download failed:", err);
    onError?.(err.message || "Download failed");
  }
}

// ═══════════════════════════════════════════════════════════════
//  HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Recursively collect all file entries from a directory.
 */
async function collectFiles(project, basePath, relativePath, result, onProgress) {
  try {
    const data = await workspaceApi.listFiles(project, basePath);
    const entries = normalizeEntries(data);

    for (const entry of entries) {
      const name = entry.name || entry.filename || "";
      const isDir =
        entry.type === "directory" ||
        entry.type === "dir" ||
        entry.is_directory === true;

      const fullPath = basePath ? `${basePath}/${name}` : name;
      const relPath = relativePath ? `${relativePath}/${name}` : name;

      if (isDir) {
        // Recurse into subdirectory
        await collectFiles(project, fullPath, relPath, result, onProgress);
      } else {
        result.push({ fullPath, relativePath: relPath, name });
      }
    }
  } catch (err) {
    console.warn(`[downloadUtils] Failed to list ${basePath}:`, err.message);
  }
}

/**
 * Normalize API entries (same logic as other components)
 */
function normalizeEntries(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.entries && Array.isArray(data.entries)) return data.entries;
  if (data.files && Array.isArray(data.files)) return data.files;
  if (data.children && Array.isArray(data.children)) return data.children;
  return [];
}

/**
 * Build auth headers for direct download requests.
 * Reads token and user data from cookies.
 */
function buildDownloadHeaders(extra = {}) {
  const token = getCookie("zenith_token");
  if (!token) return null;

  const headers = {
    Authorization: `Bearer ${token}`,
    ...extra,
  };

  try {
    const storedUser = getCookie("zenith_user");
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      const uid = parsed.user_id || parsed.id;
      if (uid) headers["X-User-Id"] = String(uid);
    }
  } catch (_) { /* ignore */ }

  return headers;
}

/**
 * Try to download a binary file directly via fetch.
 * Returns true if successful, false if unavailable.
 */
async function tryDirectFileDownload(project, filePath, fileName) {
  try {
    const headers = buildDownloadHeaders({ Accept: "application/octet-stream" });
    if (!headers) return false;

    const url = `/api/workspace/projects/${encodeURIComponent(project)}/file?path=${encodeURIComponent(filePath)}`;

    const res = await fetch(url, { headers });
    if (!res.ok) return false;

    const blob = await res.blob();
    if (blob.size === 0) return false;

    triggerBlobDownload(blob, fileName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Try to use the backend download endpoint.
 * Returns true if successful, false if unavailable.
 */
async function tryBackendDownload(project) {
  try {
    const headers = buildDownloadHeaders();
    if (!headers) return false;

    const url = `/api/projects/${encodeURIComponent(project)}/download`;

    const res = await fetch(url, { headers });

    if (!res.ok) return false;

    const blob = await res.blob();
    if (blob.size === 0) return false;

    triggerBlobDownload(blob, `${project}.zip`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Trigger a blob download in the browser.
 * Creates a temporary anchor element and clicks it.
 */
function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 150);
}
