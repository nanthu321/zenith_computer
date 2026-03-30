/**
 * WorkspacePanel — Embeddable file explorer for ChatPage
 *
 * Unlike the full-page WorkspaceExplorer, this component is designed
 * to be rendered INSIDE the ChatPage's main area. It provides:
 *   - A file tree sidebar (left) with all projects
 *   - A file editor panel (right) with tabs, breadcrumbs, Monaco editor
 *
 * It does NOT render its own activity bar or page-level chrome — that's
 * handled by the parent ChatPage + Sidebar.
 */
import { useState, useEffect, useRef, useCallback, createRef } from "react";
import { useNavigate } from "react-router-dom";
import { workspaceApi } from "../../api/workspace";
import FileTree from "./FileTree.jsx";
import FileViewer from "./FileViewer.jsx";
import DownloadButton from "./DownloadButton.jsx";
import ExplorerThemeToggle from "./ExplorerThemeToggle.jsx";
import ProjectPreviewPanel from "./ProjectPreviewPanel.jsx";
import { getFileIcon } from "./fileIcons.jsx";
import { useToast } from "../ToastNotification.jsx";
import "./WorkspacePanel.css";

/* ── Constants ── */
const TREE_MIN = 180;
const TREE_MAX = 420;
const TREE_DEFAULT = 240;

/* ── Small helper: Chevron ── */
function Chevron({ open }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 12 12" fill="none"
      style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.1s ease", display: "block" }}
    >
      <path d="M4 3l4 3-4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Normalize project list ── */
function normalizeProjects(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.projects && Array.isArray(data.projects)) return data.projects;
  if (data.data && Array.isArray(data.data)) return data.data;
  return [];
}

/* ── Project section (expandable folder in tree sidebar) ── */
function ProjectSection({ name, isOpen, onToggle, onFileSelect, onFileDeleted, selectedFile, pendingCreate, onPendingCreateConsumed, onToast, fileTreeRef, onCreateInProject }) {
  return (
    <div className="wsp-project-section">
      <div className="wsp-section-header" onClick={onToggle}>
        <span className="wsp-section-chevron"><Chevron open={isOpen} /></span>
        <span className="wsp-section-title" title={name}>{name}</span>
        <div className="wsp-section-actions" onClick={(e) => e.stopPropagation()}>
          {/* Buttons moved from filetree-root-actions */}
          <button title="New file" onClick={() => {
            // If FileTree is mounted (project expanded), use imperative ref directly.
            // Otherwise, use the pendingCreate mechanism which also expands the project.
            if (fileTreeRef?.current?.triggerNewFile) {
              fileTreeRef.current.triggerNewFile();
            } else {
              onCreateInProject?.(name, "file");
            }
          }} className="filetree-action-btn">
            <svg width="15" height="15" viewBox="0 0 16 16"><path d="M10 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V4l-3-3z" fill="none" stroke="currentColor" strokeWidth="1.2"/><path d="M10 1v3h3M6 9h4M8 7v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
          </button>
          <button title="New folder" onClick={() => {
            if (fileTreeRef?.current?.triggerNewFolder) {
              fileTreeRef.current.triggerNewFolder();
            } else {
              onCreateInProject?.(name, "folder");
            }
          }} className="filetree-action-btn">
            <svg width="15" height="15" viewBox="0 0 16 16"><path d="M2 4a1 1 0 011-1h3l1.5 1.5H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" fill="none" stroke="currentColor" strokeWidth="1.2"/><path d="M6 8.5h4M8 6.5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
          </button>
          <button title="Refresh" onClick={() => fileTreeRef?.current?.triggerRefresh()} className="filetree-action-btn">
            <svg width="15" height="15" viewBox="0 0 16 16"><path d="M13.5 3A7 7 0 002.1 9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M2.5 13A7 7 0 0013.9 7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M2 5.5V9h3.5M14 10.5V7h-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <DownloadButton
            type="project"
            project={name}
            name={name}
            size={13}
            className="dl-btn-section"
            onToast={onToast}
          />
        </div>
      </div>
      {isOpen && (
        <div className="wsp-section-body">
          <FileTree
            ref={fileTreeRef}
            project={name}
            selectedFile={selectedFile}
            onFileSelect={onFileSelect}
            onFileDeleted={onFileDeleted}
            pendingCreate={pendingCreate}
            onPendingCreateConsumed={onPendingCreateConsumed}
          />
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   WorkspacePanel — the embeddable explorer
   ════════════════════════════════════════════════════════════════ */
export default function WorkspacePanel() {
  const navigate = useNavigate();
  const { toast, ToastPortal } = useToast();

  const [projects, setProjects] = useState([]);  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState(null);

  /* ── Expanded projects ── */
  const [expandedProjects, setExpandedProjects] = useState(new Set());

  /* ── Active project context (tracks which project the selected file belongs to) ── */
  const [activeProject, setActiveProject] = useState(null);

  /* ── Open tabs + selected file ── */
  const [openTabs, setOpenTabs] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);

  /* ── Preview panel state ── */
  const [showPreview, setShowPreview] = useState(false);

  /* ── FileTree refs (one per project for imperative actions) ── */
  const fileTreeRefsMap = useRef({});
  function getFileTreeRef(projectName) {
    if (!fileTreeRefsMap.current[projectName]) {
      fileTreeRefsMap.current[projectName] = createRef();
    }
    return fileTreeRefsMap.current[projectName];
  }

  /* ── Tree sidebar width (resizable) ── */
  const [treeWidth, setTreeWidth] = useState(TREE_DEFAULT);
  const resizingRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWRef = useRef(TREE_DEFAULT);

  /* ── Load projects ── */
  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const data = await workspaceApi.listProjects();
      const list = normalizeProjects(data);
      const names = list.map((p) => (typeof p === "string" ? p : p.name || p.project_name || "")).filter(Boolean);
      setProjects(names);
    } catch (e) {
      setProjectsError(e.message);
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  /* ── Tab management ── */
  function openTab(fileNode, project) {
    if (!fileNode || !fileNode.path) return;
    const isDir = fileNode.type === "directory" || fileNode.type === "dir" || fileNode.is_directory;
    if (isDir) return;

    const tabNode = { ...fileNode, _project: project || activeProject };
    setOpenTabs((prev) => {
      if (prev.some((t) => t.path === fileNode.path && t._project === tabNode._project)) return prev;
      return [...prev, tabNode];
    });
    setSelectedFile(tabNode);
    if (project) setActiveProject(project);
  }

  function closeTab(filePath, project) {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => !(t.path === filePath && t._project === project));
      setSelectedFile((cur) => {
        if (!(cur?.path === filePath && cur?._project === project)) return cur;
        if (next.length === 0) return null;
        const closedIdx = prev.findIndex((t) => t.path === filePath && t._project === project);
        return next[Math.min(closedIdx, next.length - 1)];
      });
      return next;
    });
  }

  function handleFileSelect(project, fileNode) { openTab(fileNode, project); }
  function handleFileDeleted(path) { closeTab(path, activeProject); }

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

  /* ── Project toggle ── */
  function toggleProject(name) {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function collapseAll() { setExpandedProjects(new Set()); }

  // ── Top-level new file/folder creation ──
  const [pendingCreate, setPendingCreate] = useState(null);

  function handleTopNewFile() {
    let targetProject = null;
    if (expandedProjects.size === 1) {
      targetProject = [...expandedProjects][0];
    } else if (activeProject && projects.includes(activeProject)) {
      targetProject = activeProject;
    } else if (projects.length > 0) {
      targetProject = projects[0];
    }
    if (!targetProject) return;
    setExpandedProjects((prev) => new Set([...prev, targetProject]));
    setActiveProject(targetProject);
    setPendingCreate({ type: "file", project: targetProject });
  }

  function handleTopNewFolder() {
    let targetProject = null;
    if (expandedProjects.size === 1) {
      targetProject = [...expandedProjects][0];
    } else if (activeProject && projects.includes(activeProject)) {
      targetProject = activeProject;
    } else if (projects.length > 0) {
      targetProject = projects[0];
    }
    if (!targetProject) return;
    setExpandedProjects((prev) => new Set([...prev, targetProject]));
    setActiveProject(targetProject);
    setPendingCreate({ type: "folder", project: targetProject });
  }

  function triggerCreateInProject(targetProject, createType) {
    // Ensure the project is expanded so FileTree mounts
    setExpandedProjects((prev) => new Set([...prev, targetProject]));
    setActiveProject(targetProject);
    setPendingCreate({ type: createType, project: targetProject });
  }

  function handlePendingCreateConsumed() {
    setPendingCreate(null);
  }

  /* ── Resize handler ── */
  function handleResizeMouseDown(e) {
    e.preventDefault();
    resizingRef.current = true;
    resizeStartXRef.current = e.clientX;
    resizeStartWRef.current = treeWidth;
    window.addEventListener("mousemove", handleResizeMouseMove);
    window.addEventListener("mouseup", handleResizeMouseUp);
  }

  const handleResizeMouseMove = useCallback((e) => {
    if (!resizingRef.current) return;
    const delta = e.clientX - resizeStartXRef.current;
    setTreeWidth(Math.max(TREE_MIN, Math.min(TREE_MAX, resizeStartWRef.current + delta)));
  }, []);

  const handleResizeMouseUp = useCallback(() => {
    resizingRef.current = false;
    window.removeEventListener("mousemove", handleResizeMouseMove);
    window.removeEventListener("mouseup", handleResizeMouseUp);
  }, [handleResizeMouseMove]);

  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", handleResizeMouseMove);
      window.removeEventListener("mouseup", handleResizeMouseUp);
    };
  }, [handleResizeMouseMove, handleResizeMouseUp]);

  /* ── Breadcrumb ── */
  function getBreadcrumbs() {
    if (!selectedFile) return [];
    const crumbs = [];
    if (selectedFile._project) crumbs.push(selectedFile._project);
    if (selectedFile.path) crumbs.push(...selectedFile.path.split("/"));
    return crumbs;
  }

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="wsp-container">
      <ToastPortal />
      {/* ── Tree Sidebar ── */}
<div className="wsp-tree-sidebar" style={{ width: treeWidth, minWidth: treeWidth, maxWidth: treeWidth }}>
        {}
        <div className="wsp-tree-header">
          <span className="wsp-tree-header-title">EXPLORER</span>
          <div className="wsp-tree-header-actions">
            {/* New File */}
            <button className="wsp-tree-action-btn" title="New File..." onClick={handleTopNewFile}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V4l-3-3z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                <path d="M10 1v3h3M6 9h4M8 7v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </button>
            {/* New Folder */}
            <button className="wsp-tree-action-btn" title="New Folder..." onClick={handleTopNewFolder}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4a1 1 0 011-1h3l1.5 1.5H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                <path d="M6 8.5h4M8 6.5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </button>
            {/* Refresh */}
            <button className="wsp-tree-action-btn" title="Refresh Explorer" onClick={loadProjects}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M13.5 3A7 7 0 002.1 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M2.5 13A7 7 0 0013.9 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M2 5.5V9h3.5M14 10.5V7h-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </button>
            {/* Collapse All */}
            <button className="wsp-tree-action-btn" title="Collapse All" onClick={collapseAll}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M9 9H1v5l1 1h6l1-1V9zM9 3l-1-1H2L1 3v5h8V3z" stroke="currentColor" strokeWidth="1" fill="none"/>
                <path d="M7 3V2L6 1H1L0 2v5l1 1" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.5"/>
              </svg>
            </button>
            {/* Theme Toggle */}
            <ExplorerThemeToggle size={14} btnClass="ett-header ett-divider" />
          </div>
        </div>

        {/* Back to Chat button */}
        <button className="wsp-back-to-chat-btn" onClick={() => navigate('/chat')} title="Back to Chat">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Back to Chat</span>
        </button>
        {/* File tree body */}
        <div className="wsp-tree-body">
          {projectsLoading ? (
            <div className="wsp-tree-status">
              <svg width="16" height="16" viewBox="0 0 16 16" style={{ animation: "wsp-spin 0.7s linear infinite" }}>
                <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" opacity="0.5"/>
              </svg>
              <span>Loading projects…</span>
            </div>
          ) : projectsError ? (
            <div className="wsp-tree-status">
              <span style={{ color: "#f48771", fontSize: 12 }}>Error: {projectsError}</span>
              <button className="wsp-retry-btn" onClick={loadProjects}>Retry</button>
            </div>
          ) : projects.length === 0 ? (
            <div className="wsp-tree-status">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.2, marginBottom: 8 }}>
                <path d="M4 4h5l2 2h9v13H4V4z" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
              <span style={{ fontSize: 13 }}>No projects yet</span>
              <span style={{ fontSize: 12, opacity: 0.5 }}>Ask Zenith to create one</span>
              <button className="wsp-retry-btn" onClick={loadProjects} style={{ marginTop: 8 }}>Refresh</button>
            </div>
          ) : (
            projects.map((name) => (
              <ProjectSection
                key={name}
                name={name}
                isOpen={expandedProjects.has(name)}
                onToggle={() => toggleProject(name)}
                onFileSelect={(fileNode) => handleFileSelect(name, fileNode)}
                onFileDeleted={handleFileDeleted}
                selectedFile={activeProject === name ? selectedFile?.path : null}
                pendingCreate={pendingCreate && pendingCreate.project === name ? pendingCreate.type : null}
                onPendingCreateConsumed={handlePendingCreateConsumed}
                onToast={handleDownloadToast}
                fileTreeRef={getFileTreeRef(name)}
                onCreateInProject={triggerCreateInProject}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Resize Handle ── */}
      <div className="wsp-resize-handle" onMouseDown={handleResizeMouseDown} />

      {/* ── Editor + Preview wrapper ── */}
      <div style={{ display: 'flex', flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {/* ── Editor Panel ── */}
        <div className="wsp-editor-panel">
          {/* Tab bar */}
          <div className="wsp-tab-bar">
            {openTabs.map((tab) => {
              const isActive = tab.path === selectedFile?.path && tab._project === selectedFile?._project;
              const icon = getFileIcon(tab.name);
              return (
                <div
                  key={`${tab._project}/${tab.path}`}
                  className={`wsp-tab ${isActive ? "wsp-tab-active" : ""}`}
                  onClick={() => { setSelectedFile(tab); setActiveProject(tab._project); }}
                  title={`${tab._project}/${tab.path}`}
                >
                  <span className="wsp-tab-icon">{icon}</span>
                  <span className="wsp-tab-name">{tab.name}</span>
                  <button
                    className="wsp-tab-close"
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.path, tab._project); }}
                    title="Close"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              );
            })}

            {/* Preview toggle button */}
            <button
              className={`vsc-tab-preview-btn ${showPreview ? "vsc-tab-preview-btn-active" : ""}`}
              onClick={() => setShowPreview((v) => !v)}
              title={showPreview ? "Close Preview" : "Open Preview"}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="2" width="14" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M6 6l4 3-4 3z" fill="currentColor" opacity="0.7" />
              </svg>
              <span>Preview</span>
            </button>
          </div>

          {/* Breadcrumb */}
          {selectedFile && (
            <div className="wsp-breadcrumb">
              {breadcrumbs.map((crumb, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center" }}>
                  {i > 0 && <span className="wsp-breadcrumb-sep">›</span>}
                  <span className={`wsp-breadcrumb-item ${i === breadcrumbs.length - 1 ? "wsp-breadcrumb-current" : ""}`}>
                    {crumb}
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* File viewer / empty state */}
          <FileViewer
            project={selectedFile?._project || activeProject}
            file={selectedFile}
          />
        </div>

        {/* ── Preview Panel (split right) ── */}
        {showPreview && (
          <>
            <div className="vsc-preview-resize-handle" />
            <div className="vsc-preview-panel" style={{ width: 480, minWidth: 280 }}>
              <ProjectPreviewPanel
                projects={projects}
                activeProject={activeProject}
                onClose={() => setShowPreview(false)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
