import { useState, useEffect, useCallback, useRef } from "react";
import { workspaceApi } from "../../api/workspace";
import { getFileIcon, getFolderIcon } from "./fileIcons.jsx";
import DownloadButton from "./DownloadButton.jsx";
import ExplorerThemeToggle from "./ExplorerThemeToggle.jsx";
import { useToast } from "../ToastNotification.jsx";
import "./ExplorerPanel.css";

// ── Normalize entries from various API shapes ──
function normalizeEntries(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.entries && Array.isArray(data.entries)) return data.entries;
  if (data.files && Array.isArray(data.files)) return data.files;
  if (data.children && Array.isArray(data.children)) return data.children;
  return [];
}

function normalizeProjects(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.projects && Array.isArray(data.projects)) return data.projects;
  if (data.data && Array.isArray(data.data)) return data.data;
  return [];
}

// Sort: directories first, then files, both alphabetical
function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    const aDir = a.type === "directory" || a.type === "dir" || a.is_directory;
    const bDir = b.type === "directory" || b.type === "dir" || b.is_directory;
    if (aDir && !bDir) return -1;
    if (!aDir && bDir) return 1;
    return (a.name || "").localeCompare(b.name || "");
  });
}

// ── Chevron arrow ──
function ChevronIcon({ open }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16" fill="none"
      style={{
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.12s ease",
        display: "block",
      }}
    >
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Spinner ──
function Spinner({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ animation: "ep-spin 0.7s linear infinite", display: "block" }}>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

// ════════════════════════════════════════════════════════════
//  FileNode — single file/folder row (recursive)
// ════════════════════════════════════════════════════════════
function FileNode({ node, project, depth, onFileSelect, onToast }) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState(null);
  const [loading, setLoading] = useState(false);

  const isDir = node.type === "directory" || node.type === "dir" || node.is_directory === true;

  async function loadChildren() {
    if (!isDir) return;
    setLoading(true);
    try {
      const data = await workspaceApi.listFiles(project, node.path || "");
      setChildren(sortEntries(normalizeEntries(data)));
    } catch (e) {
      console.error("[ExplorerPanel] loadChildren failed:", e);
      setChildren([]);
    } finally {
      setLoading(false);
    }
  }

  function handleClick() {
    if (isDir) {
      const willOpen = !open;
      setOpen(willOpen);
      if (willOpen && !children) loadChildren();
    } else {
      onFileSelect?.(project, node);
    }
  }

  const icon = isDir ? getFolderIcon(node.name, open) : getFileIcon(node.name);
  const indent = depth * 16;

  return (
    <>
      <div
        className="ep-node"
        style={{ paddingLeft: indent + 4 }}
        onClick={handleClick}
        title={node.path || node.name}
      >
        <span className={`ep-chevron ${isDir ? "" : "ep-chevron-hidden"}`}>
          {isDir && (loading ? <Spinner size={12} /> : <ChevronIcon open={open} />)}
        </span>
        <span className="ep-icon">{icon}</span>
        <span className="ep-name">{node.name}</span>
        <span className="ep-node-actions">
          <DownloadButton
            type={isDir ? "folder" : "file"}
            project={project}
            path={node.path}
            name={node.name}
            size={12}
            className="dl-btn-tree"
            onToast={onToast}
          />
        </span>
      </div>

      {isDir && open && children && (
        <div className="ep-children" style={{ marginLeft: indent + 8 }}>
          {children.length === 0 ? (
            <div className="ep-empty-dir" style={{ paddingLeft: (depth + 1) * 16 + 20 }}>
              (empty)
            </div>
          ) : (
            children.map((child) => {
              const childName = child.name || child.filename || "";
              // Build the correct full path for this child.
              // The API may return a full path, a relative-only name, or nothing.
              // We prefer building from parent + name to avoid duplicate segments,
              // unless the API returns a full path already prefixed by the parent path.
              const parentPrefix = node.path ? `${node.path}/` : "";
              let childPath;
              if (child.path && child.path.startsWith(parentPrefix) && child.path !== childName) {
                childPath = child.path;
              } else {
                childPath = node.path ? `${node.path}/${childName}` : childName;
              }
              return (
                <FileNode
                  key={childName}
                  node={{ ...child, name: childName, path: childPath }}
                  project={project}
                  depth={depth + 1}
                  onFileSelect={onFileSelect}
                  onToast={onToast}
                />
              );
            })
          )}
        </div>
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════
//  ProjectNode — a project shown as a root-level folder
// ════════════════════════════════════════════════════════════
function ProjectNode({ name, onFileSelect, collapseAllSignal, onToast }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState(null);
  const [loading, setLoading] = useState(false);

  // Respond to collapse-all signal
  useEffect(() => {
    if (collapseAllSignal > 0) setOpen(false);
  }, [collapseAllSignal]);

  async function loadEntries() {
    setLoading(true);
    try {
      const data = await workspaceApi.listFiles(name, "");
      setEntries(sortEntries(normalizeEntries(data)));
    } catch (e) {
      console.error("[ExplorerPanel] loadEntries failed:", e);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  function handleToggle() {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && !entries) loadEntries();
  }

  function handleRefresh(e) {
    e.stopPropagation();
    setEntries(null);
    if (open) loadEntries();
  }

  return (
    <div className="ep-project-group">
      {/* Project header row */}
      <div className="ep-project-header" onClick={handleToggle}>
        <span className="ep-chevron">
          {loading ? <Spinner size={12} /> : <ChevronIcon open={open} />}
        </span>
        <span className="ep-icon">{getFolderIcon(name, open)}</span>
        <span className="ep-project-name">{name}</span>
        <div className="ep-project-actions" onClick={(e) => e.stopPropagation()}>
          <DownloadButton
            type="project"
            project={name}
            name={name}
            size={14}
            className="dl-btn-explorer"
            onToast={onToast}
          />
          <button className="ep-action-btn" title="Refresh" onClick={handleRefresh}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M13.5 3A7 7 0 002.1 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M2.5 13A7 7 0 0013.9 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M2 5.5V9h3.5M14 10.5V7h-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </button>
        </div>
      </div>

      {/* Files */}
      {open && entries && (
        <div className="ep-children" style={{ marginLeft: 8 }}>
          {entries.length === 0 ? (
            <div className="ep-empty-dir" style={{ paddingLeft: 32 }}>(empty project)</div>
          ) : (
            entries.map((entry) => {
              const entryName = entry.name || entry.filename || "";
              const entryPath = entry.path || entryName;
              return (
                <FileNode
                  key={entryName}
                  node={{ ...entry, name: entryName, path: entryPath }}
                  project={name}
                  depth={1}
                  onFileSelect={onFileSelect}
                  onToast={onToast}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  ExplorerPanel — the main sidebar panel
// ════════════════════════════════════════════════════════════
export default function ExplorerPanel({ onOpenFile }) {
  const { toast, ToastPortal } = useToast();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [showNewProject, setShowNewProject] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectError, setNewProjectError] = useState(null);
  const newProjectInputRef = useRef(null);
  const newProjectValueRef = useRef("");

  useEffect(() => {
    if (showNewProject) {
      requestAnimationFrame(() => {
        if (newProjectInputRef.current) {
          newProjectInputRef.current.value = "";
          newProjectInputRef.current.focus();
        }
      });
    }
  }, [showNewProject]);

  function openNewProjectInput() {
    newProjectValueRef.current = "";
    setNewProjectError(null);
    setShowNewProject(true);
  }

  function closeNewProjectInput() {
    if (creatingProject) return;
    newProjectValueRef.current = "";
    setNewProjectError(null);
    setShowNewProject(false);
  }

  async function handleCreateProject() {
    const name = newProjectValueRef.current.trim();
    if (!name) {
      closeNewProjectInput();
      return;
    }
    // Case-insensitive duplicate check
    const duplicate = projects.find(
      (p) => p.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      setNewProjectError(`Project "${duplicate}" already exists`);
      return;
    }
    setCreatingProject(true);
    setNewProjectError(null);
    try {
      await workspaceApi.createProject(name);
      newProjectValueRef.current = "";
      setNewProjectError(null);
      setShowNewProject(false);
      await loadProjects();
    } catch (e) {
      console.error("[ExplorerPanel] createProject failed:", e);
      setNewProjectError(e.message || "Failed to create project");
    } finally {
      setCreatingProject(false);
    }
  }

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await workspaceApi.listProjects();
      const list = normalizeProjects(data);
      setProjects(list.map((p) => (typeof p === "string" ? p : p.name || p.project_name || "")));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // ── Toast handler for download notifications ──
  function handleDownloadToast(message, type) {
    if (type === "success") {
      toast.success(message);
    } else if (type === "error") {
      toast.error(message);
    } else {
      toast(message);
    }
  }

  function handleFileSelect(project, fileNode) {
    // Bubble up to parent — could open file viewer, or navigate to workspace
    onOpenFile?.(project, fileNode);
  }

  if (loading) {
    return (
      <div className="ep-panel">
        <div className="ep-header">
          <span className="ep-header-title">EXPLORER</span>
          <div className="ep-header-actions" style={{ opacity: 1 }}>
            <ExplorerThemeToggle size={14} btnClass="ett-header" />
          </div>
        </div>
        <div className="ep-loading">
          <Spinner size={16} />
          <span>Loading projects…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ep-panel">
        <div className="ep-header">
          <span className="ep-header-title">EXPLORER</span>
          <div className="ep-header-actions" style={{ opacity: 1 }}>
            <ExplorerThemeToggle size={14} btnClass="ett-header" />
          </div>
        </div>
        <div className="ep-loading">
          <span style={{ color: "#ef4444", fontSize: "0.78rem" }}>Error: {error}</span>
          <button className="ep-retry-btn" onClick={loadProjects}>Retry</button>
        </div>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="ep-panel">
        <div className="ep-header">
          <span className="ep-header-title">EXPLORER</span>
          <div className="ep-header-actions">
            <button className="ep-action-btn" title="New Project..." onClick={openNewProjectInput}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M2 4a1 1 0 011-1h3l1.5 1.5H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                <path d="M6 8.5h4M8 6.5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </button>
            <ExplorerThemeToggle size={14} btnClass="ett-header ett-divider" />
          </div>
        </div>
        {showNewProject && (
          <div style={{ padding: "4px 8px", userSelect: "text" }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <input
              ref={newProjectInputRef}
              style={{
                width: "100%", height: 22, padding: "0 6px", fontSize: 13,
                fontFamily: "inherit", border: "1px solid #007fd4", borderRadius: 0,
                color: "#ccc", background: "#313131", outline: "none",
                boxSizing: "border-box", userSelect: "text", cursor: "text",
              }}
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="Project name..."
              defaultValue=""
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation();
                newProjectValueRef.current = e.target.value;
                if (newProjectError) setNewProjectError(null);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") { e.preventDefault(); handleCreateProject(); }
                if (e.key === "Escape") { e.preventDefault(); closeNewProjectInput(); }
              }}
              onBlur={() => {
                setTimeout(() => {
                  if (!creatingProject && newProjectInputRef.current) {
                    const val = newProjectInputRef.current.value.trim();
                    if (!val) closeNewProjectInput();
                  }
                }, 250);
              }}
              disabled={creatingProject}
            />
            {creatingProject && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", color: "#858585", fontSize: 12 }}>
                <Spinner size={12} /> Creating project…
              </div>
            )}
            {newProjectError && (
              <div style={{ fontSize: 12, color: "#f48771", padding: "2px 0" }}>{newProjectError}</div>
            )}
          </div>
        )}
        <div className="ep-loading">
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No projects yet</span>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 4 }}>
            Ask Zenith to create one
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="ep-panel">
      <ToastPortal />
      {/* Header bar with single New Project action */}
      <div className="ep-header">
        <span className="ep-header-title">EXPLORER</span>
        <div className="ep-header-actions">
          <button className="ep-action-btn" title="New Project..." onClick={openNewProjectInput}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 4a1 1 0 011-1h3l1.5 1.5H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
              <path d="M6 8.5h4M8 6.5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </button>
          <ExplorerThemeToggle size={14} btnClass="ett-header ett-divider" />
        </div>
      </div>

      {/* Tree body */}
      <div className="ep-tree-body">
        {showNewProject && (
          <div
            style={{ padding: "4px 8px", borderBottom: "1px solid #1e1e1e", userSelect: "text" }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              ref={newProjectInputRef}
              style={{
                width: "100%", height: 22, padding: "0 6px", fontSize: 13,
                fontFamily: "inherit", border: "1px solid #007fd4", borderRadius: 0,
                color: "#ccc", background: "#313131", outline: "none",
                boxSizing: "border-box", userSelect: "text", cursor: "text",
              }}
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="Project name..."
              defaultValue=""
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation();
                newProjectValueRef.current = e.target.value;
                if (newProjectError) setNewProjectError(null);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") { e.preventDefault(); handleCreateProject(); }
                if (e.key === "Escape") { e.preventDefault(); closeNewProjectInput(); }
              }}
              onBlur={() => {
                setTimeout(() => {
                  if (!creatingProject && newProjectInputRef.current) {
                    const val = newProjectInputRef.current.value.trim();
                    if (!val) closeNewProjectInput();
                  }
                }, 250);
              }}
              disabled={creatingProject}
            />
            {creatingProject && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", color: "#858585", fontSize: 12 }}>
                <Spinner size={12} /> Creating project…
              </div>
            )}
            {newProjectError && (
              <div style={{ fontSize: 12, color: "#f48771", padding: "2px 0" }}>{newProjectError}</div>
            )}
          </div>
        )}
        {projects.map((name) => (
          <ProjectNode
            key={name}
            name={name}
            onFileSelect={handleFileSelect}
            collapseAllSignal={collapseSignal}
            onToast={handleDownloadToast}
          />
        ))}
      </div>
    </div>
  );
}
