// ─────────────────────────────────────────────────────────────────
//  Workspace API — All calls to /api/workspace/* and /api/projects/*
//  Bypasses utils/api.js apiFetch() because the workspace endpoints
//  need the X-User-Id header and use the Vite proxy middleware
//  (workspaceProxyPlugin in vite.config.js) during development.
// ─────────────────────────────────────────────────────────────────

import { getCookie, clearAllZenithCookies } from '../utils/cookieUtils.js';

const WS_BASE = "/api/workspace";
const PROJECTS_BASE = "/api/projects";

/**
 * Extract a human-readable error message from an HTML error page.
 * Handles Tomcat/Apache default error pages like "HTTP Status 405 – Method Not Allowed".
 */
function parseHtmlError(html, status) {
  // Try to extract <title> content
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1].trim();
    // Clean up Tomcat-style titles like "HTTP Status 405 – Method Not Allowed"
    const cleaned = title.replace(/^HTTP\s+Status\s+\d+\s*[–—-]\s*/i, "").trim();
    if (cleaned) return cleaned;
  }
  // Try to extract <h1> content
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (h1Match) return h1Match[1].trim();
  // Fallback
  return `Server error (HTTP ${status})`;
}

// Logout flag to prevent multiple redirects
let _isLoggingOut = false;

function handleUnauthorized() {
  if (_isLoggingOut) return;
  _isLoggingOut = true;
  clearAllZenithCookies();
  // Also purge any zenith_ keys from localStorage
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("zenith_")) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch (_) { /* ignore */ }
  setTimeout(() => {
    window.location.href = "/login";
    _isLoggingOut = false;
  }, 100);
}

/** Extract user_id from stored user cookie or JWT token */
function getUserId() {
  try {
    const storedUser = getCookie("zenith_user");
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      if (parsed.user_id) return String(parsed.user_id);
      if (parsed.id) return String(parsed.id);
    }
  } catch (_) { /* ignore */ }
  // Fallback: extract from JWT
  try {
    const token = getCookie("zenith_token");
    if (token) {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const uid = payload.user_id || payload.sub || payload.id;
      if (uid) return String(uid);
    }
  } catch (_) { /* ignore */ }
  return null;
}

/**
 * Generic fetch wrapper for workspace endpoints.
 * Sends Authorization + X-User-Id headers.
 */
async function req(method, path, body) {
  const token = getCookie("zenith_token");
  if (!token) {
    handleUnauthorized();
    throw new Error("No auth token");
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const uid = getUserId();
  if (uid) headers["X-User-Id"] = uid;

  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(WS_BASE + path, opts);
  } catch (networkErr) {
    console.error("[workspace] Network error:", networkErr);
    throw new Error("Cannot reach server. Check your connection.");
  }

  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Unauthorized");
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return null;
  }

  const contentType = res.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const text = await res.text();
    if (res.ok && !text.trim()) return null;
    if (res.ok && text) return text;
    // Parse HTML error pages for a cleaner message
    const msg = text.includes("<") ? parseHtmlError(text, res.status) : text.substring(0, 200);
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    if (res.ok) return null;
    const err = new Error(`Invalid JSON from server (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }

  if (!res.ok) {
    const err = new Error(data.error || data.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  if (data.success !== undefined && data.data !== undefined) {
    return data.data;
  }

  if (data.success === false) {
    throw new Error(data.error || data.message || "Request failed");
  }

  return data;
}

/**
 * Fetch wrapper for the regular /api/projects endpoint.
 * This endpoint does NOT require X-User-Id (uses JWT only).
 * Used as a fallback when /api/workspace/* is unavailable.
 */
async function projectsReq(method, path, body) {
  const token = getCookie("zenith_token");
  if (!token) {
    handleUnauthorized();
    throw new Error("No auth token");
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  // Also include X-User-Id for consistency — some backend endpoints may need it
  const uid = getUserId();
  if (uid) headers["X-User-Id"] = uid;

  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(PROJECTS_BASE + path, opts);
  } catch (networkErr) {
    console.error("[workspace/projects] Network error:", networkErr);
    throw new Error("Cannot reach server. Check your connection.");
  }

  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Unauthorized");
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return null;
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    if (res.ok && !text.trim()) return null;
    if (res.ok && text) return text;
    // Parse HTML error pages for a cleaner message
    const msg = text.includes("<") ? parseHtmlError(text, res.status) : text.substring(0, 200);
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    if (res.ok) return null;
    const err = new Error(`Invalid JSON from server (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }

  if (!res.ok) {
    const err = new Error(data.error || data.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  if (data.success !== undefined && data.data !== undefined) {
    return data.data;
  }

  if (data.success === false) {
    throw new Error(data.error || data.message || "Request failed");
  }

  return data;
}

/**
 * List projects — tries /api/workspace/projects first, falls back
 * to /api/projects (which doesn't require X-User-Id header).
 *
 * Once the workspace endpoint fails, subsequent calls skip it and
 * go directly to the fallback to avoid repeated 403 latency.
 * The fallback flag resets after 5 minutes so we can retry the
 * primary endpoint periodically.
 */
let _useProjectsFallback = false;
let _fallbackTimestamp = 0;
const FALLBACK_RESET_MS = 5 * 60 * 1000; // 5 minutes

async function listProjectsWithFallback() {
  // Reset fallback flag after timeout so we periodically retry primary endpoint
  if (_useProjectsFallback && (Date.now() - _fallbackTimestamp > FALLBACK_RESET_MS)) {
    _useProjectsFallback = false;
  }

  // If workspace endpoint previously failed, skip it and use fallback directly
  if (!_useProjectsFallback) {
    try {
      return await req("GET", "/projects");
    } catch (wsErr) {
      console.warn("[workspace] /api/workspace/projects failed:", wsErr.message, "— switching to /api/projects fallback");
      _useProjectsFallback = true;
      _fallbackTimestamp = Date.now();
    }
  }

  // Fallback: use /api/projects (doesn't require X-User-Id)
  try {
    const data = await projectsReq("GET", "");
    // Normalize: /api/projects returns objects with name field,
    // /api/workspace/projects returns strings.  Return strings for consistency.
    if (Array.isArray(data)) {
      return data.map((p) =>
        typeof p === "string" ? p : (p.name || p.project_name || "")
      ).filter(Boolean);
    }
    return data;
  } catch (fallbackErr) {
    // Both endpoints failed — provide a clearer error message
    if (fallbackErr.status === 404) {
      throw new Error("Project listing endpoint not available. The backend may be starting up — please try again in a moment.");
    }
    throw fallbackErr;
  }
}

export const workspaceApi = {
  // ── Projects ──
  listProjects: () => listProjectsWithFallback(),

  createProject: async (name) => {
    // Try workspace endpoint first, then fall back to /api/projects.
    // Always try workspace first for POST even if GET listing used fallback,
    // since the backend may support POST on /api/workspace/projects even if
    // GET was initially unavailable.
    let wsErr = null;
    try {
      return await req("POST", "/projects", { name });
    } catch (e) {
      wsErr = e;
      console.warn("[workspace] createProject via /api/workspace failed:", e.message, "— trying /api/projects fallback");
    }
    // Fallback: use /api/projects
    try {
      return await projectsReq("POST", "", { name });
    } catch (fallbackErr) {
      console.warn("[workspace] createProject fallback also failed:", fallbackErr.message);
      // If both return 405, give a clear message
      if ((wsErr?.status === 405 || fallbackErr.status === 405)) {
        throw new Error("Project creation is not supported by the server. Please ask Zenith to create a project via chat instead.");
      }
      // Throw the more informative error
      throw fallbackErr;
    }
  },

  deleteProject: (name) =>
    req("DELETE", `/projects/${encodeURIComponent(name)}`),

  renameProject: (name, newName) =>
    req("POST", `/projects/${encodeURIComponent(name)}/rename`, { new_name: newName }),

  // ── Files ──
  listFiles: (project, path = "", recursive = false) =>
    req("GET", `/projects/${encodeURIComponent(project)}/files?path=${encodeURIComponent(path)}&recursive=${recursive}`),

  readFile: (project, path) =>
    req("GET", `/projects/${encodeURIComponent(project)}/file?path=${encodeURIComponent(path)}`),

  writeFile: async (project, path, content) => {
    // Ensure parent directories exist by attempting to create them first.
    // This prevents failures when creating files in nested paths that
    // don't exist yet (e.g., "src/components/Button.jsx" when "src/components/" is missing).
    if (path && path.includes("/")) {
      const parentPath = path.substring(0, path.lastIndexOf("/"));
      if (parentPath) {
        try {
          await req("POST", `/projects/${encodeURIComponent(project)}/folder`, { path: parentPath });
        } catch (_) {
          // Folder may already exist — ignore errors
        }
      }
    }
    return req("PUT", `/projects/${encodeURIComponent(project)}/file`, { path, content });
  },

  deleteFile: (project, path) =>
    req("DELETE", `/projects/${encodeURIComponent(project)}/file?path=${encodeURIComponent(path)}`),

  renameFile: (project, from, to) =>
    req("POST", `/projects/${encodeURIComponent(project)}/file/rename`, { from, to }),

  createFolder: async (project, path) => {
    // For nested paths like "src/components/utils", ensure parent directories exist
    // by creating each level. Some backends don't support recursive folder creation.
    if (path && path.includes("/")) {
      const segments = path.split("/");
      let currentPath = "";
      for (let i = 0; i < segments.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${segments[i]}` : segments[i];
        try {
          await req("POST", `/projects/${encodeURIComponent(project)}/folder`, { path: currentPath });
        } catch (_) {
          // Parent folder may already exist — ignore errors
        }
      }
    }
    return req("POST", `/projects/${encodeURIComponent(project)}/folder`, { path });
  },

  // ── Code Execution (compile & run) ──
  /**
   * Execute code on the server in a sandboxed environment.
   * @param {string} language — 'python' | 'java' | 'javascript' | 'shell'
   * @param {string} filename — Original filename (used by compiler)
   * @param {string} code — Source code to execute
   * @returns {{ success, output, errorOutput, exitCode, executionTime, timedOut }}
   */
  executeCode: async (language, filename, code) => {
    // Try the workspace execution endpoint first
    try {
      return await req("POST", "/execute", { language, filename, code });
    } catch (wsErr) {
      console.warn("[workspace] /api/workspace/execute failed:", wsErr.message, "— trying /api/projects/execute fallback");
      // Fallback: try /api/projects/execute
      try {
        return await projectsReq("POST", "/execute", { language, filename, code });
      } catch (fallbackErr) {
        console.warn("[workspace] /api/projects/execute fallback also failed:", fallbackErr.message);
        // If both return 404/405, the backend doesn't support execution
        if (wsErr?.status === 404 || wsErr?.status === 405 || fallbackErr.status === 404 || fallbackErr.status === 405) {
          throw new Error(
            "Code execution is not supported by the server. " +
            "The backend does not have the /execute endpoint. " +
            "JavaScript can be run locally in the browser as a fallback."
          );
        }
        throw fallbackErr;
      }
    }
  },

  // ── Preview (run project in-app) ──
  /**
   * Start a preview server for a project.
   * Returns { url, port } on success.
   */
  startPreview: (project) =>
    req("POST", `/projects/${encodeURIComponent(project)}/preview/start`),

  /**
   * Stop the preview server for a project.
   */
  stopPreview: (project) =>
    req("POST", `/projects/${encodeURIComponent(project)}/preview/stop`),

  /**
   * Get current preview status for a project.
   * Returns { status, url, port }
   */
  getPreviewStatus: (project) =>
    req("GET", `/projects/${encodeURIComponent(project)}/preview/status`),

  /**
   * Probe the preview URL to check if the server is up.
   * Uses the /api/workspace proxy so iframe can't be used for probing.
   * Returns { ready: true } when the server responds with 2xx/3xx.
   */
  probePreview: async (project, url) => {
    try {
      const result = await req("GET", `/projects/${encodeURIComponent(project)}/preview/probe?url=${encodeURIComponent(url)}`);
      return result || { ready: true };
    } catch (e) {
      // If the endpoint doesn't exist, fall back to a direct HEAD fetch
      // (will work if CORS allows it, otherwise gracefully fails).
try {
        await fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
        // no-cors mode always gives opaque response — treat as ready if no network error
        return { ready: true };
      } catch (_) {
      }
    }
  },

  // ── Download ZIP ──
  // Spec route: GET /api/project-download/{projectId}
  // Fallback:   GET /api/projects/{project}/download (legacy)
  downloadProject: (project) => {
    const token = getCookie("zenith_token");
    if (!token) {
      handleUnauthorized();
      return;
    }
    const dlHeaders = { Authorization: `Bearer ${token}` };
    const uid = getUserId();
    if (uid) dlHeaders["X-User-Id"] = uid;

    // Primary URL per API spec
    const primaryUrl = `/api/project-download/${encodeURIComponent(project)}`;
    // Legacy fallback URL
    const fallbackUrl = `/api/projects/${encodeURIComponent(project)}/download`;

    const triggerDownload = (blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${project}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    };

    fetch(primaryUrl, { headers: dlHeaders })
      .then((r) => {
        if (r.status === 401) {
          handleUnauthorized();
          throw new Error("Unauthorized");
        }
        if (!r.ok) {
          // Primary URL failed — try fallback
          console.warn(`[workspace] Primary download URL failed (${r.status}), trying fallback...`);
          throw new Error(`Primary download failed: ${r.status}`);
        }
        return r.blob();
      })
      .then(triggerDownload)
      .catch((primaryErr) => {
        if (primaryErr.message === "Unauthorized") return;

        // Fallback to legacy URL
        fetch(fallbackUrl, { headers: dlHeaders })
          .then((r) => {
            if (r.status === 401) {
              handleUnauthorized();
              throw new Error("Unauthorized");
            }
            if (!r.ok) throw new Error(`Download failed: ${r.status}`);
            return r.blob();
          })
          .then(triggerDownload)
          .catch((fallbackErr) => {
            if (fallbackErr.message === "Unauthorized") return;
            console.error("[workspace] Download failed (both URLs):", fallbackErr.message);
          });
      });
  },
};
