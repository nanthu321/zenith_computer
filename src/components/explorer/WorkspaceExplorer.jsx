import { useState, useEffect, useRef, useCallback, createRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { workspaceApi } from "../../api/workspace";
import FileTree from "./FileTree.jsx";
import FileViewer from "./FileViewer.jsx";
import DownloadButton from "./DownloadButton.jsx";
import ExplorerThemeToggle from "./ExplorerThemeToggle.jsx";
import ProjectPreviewPanel from "./ProjectPreviewPanel.jsx";
import { getFileIcon, getFolderIcon } from "./fileIcons.jsx";
import { useToast } from "../ToastNotification.jsx";
import { useProjectStatus } from "../../context/ProjectStatusContext.jsx";
import "../ProjectStatusIndicator.css";
import "./WorkspaceExplorer.css";

// ── Min/Max sidebar width (mirrors CSS clamping) ──
const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 500;
const SIDEBAR_DEFAULT = 260;

// ── Activity bar tab IDs ──
const TABS = { EXPLORER: "explorer", SEARCH: "search", SOURCE: "source", DEBUG: "debug", EXTENSIONS: "extensions" };

// ── Small icon button (activity bar + sidebar header) ──


// ── Activity bar icon button ──
function ActivityBtn({ title, active, onClick, children, badge }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`vsc-activity-btn ${active ? "vsc-activity-btn-active" : ""}`}
    >
      {children}
      {badge != null && <span className="vsc-activity-badge">{badge}</span>}
    </button>
  );
}

// ── Spinner (reused in multiple places) ──
function Spinner({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      style={{ animation: "vsc-spin 0.7s linear infinite", display: "block" }}
    >
      <circle
        cx="8" cy="8" r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="28"
        strokeDashoffset="8"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

// ── Chevron ──
function Chevron({ open }) {
  return (
    <svg
      width="12" height="12"
      viewBox="0 0 12 12"
      fill="none"
      style={{
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.1s ease",
        display: "block",
      }}
    >
      <path d="M4 3l4 3-4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Normalize helpers ──
function normalizeProjects(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.projects && Array.isArray(data.projects)) return data.projects;
  if (data.data && Array.isArray(data.data)) return data.data;
  return [];
}

// ════════════════════════════════════════════════════════════
//  ProjectSection — a single project shown as expandable
//  section (like VS Code workspace folders). Shows all
//  projects simultaneously, each with its own file tree.
// ════════════════════════════════════════════════════════════
function ProjectSection({ name, isOpen, onToggle, onFileSelect, onFileDeleted, selectedFile, pendingCreate, onPendingCreateConsumed, onToast, fileTreeRef, projectStatus }) {
  return (
    <div className="vsc-project-section">
      {/* Section header — sticky, bold uppercase like VS Code */}
      <div className="vsc-section-header" onClick={onToggle}>
        <span className="vsc-section-chevron">
          <Chevron open={isOpen} />
        </span>
        <span className="vsc-section-title" title={name}>
          {name}
        </span>
        {/* Status indicator dot */}
        {projectStatus && (
          <span className={`vsc-section-status-dot vsc-section-status-dot--${projectStatus}`} />
        )}
        <div className="vsc-section-actions" onClick={(e) => e.stopPropagation()}>
          {/* Buttons moved from filetree-root-actions */}
          <button title="New file" onClick={() => fileTreeRef?.current?.triggerNewFile()} className="filetree-action-btn">
            <svg width="15" height="15" viewBox="0 0 16 16"><path d="M10 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V4l-3-3z" fill="none" stroke="currentColor" strokeWidth="1.2"/><path d="M10 1v3h3M6 9h4M8 7v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
          </button>
          <button title="New folder" onClick={() => fileTreeRef?.current?.triggerNewFolder()} className="filetree-action-btn">
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

      {/* File tree body */}
      {isOpen && (
        <div className="vsc-section-body">
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

// ════════════════════════════════════════════════════════════
//  ProjectPickerOverlay — shown when user clicks New File /
//  New Folder but multiple projects exist and none is clearly
//  selected. Lets the user pick which project to create in.
// ════════════════════════════════════════════════════════════
function ProjectPickerOverlay({ projects, createType, onSelect, onCancel }) {
  const label = createType === "folder" ? "New Folder" : "New File";
  return (
    <div className="vsc-project-picker-backdrop" onClick={onCancel}>
      <div className="vsc-project-picker" onClick={(e) => e.stopPropagation()}>
        <div className="vsc-project-picker-title">
          Select a project for &quot;{label}&quot;
        </div>
        <div className="vsc-project-picker-list">
          {projects.map((name) => (
            <button
              key={name}
              className="vsc-project-picker-item"
              onClick={() => onSelect(name)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4a1 1 0 011-1h3l1.5 1.5H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" stroke="#dcb67a" strokeWidth="1.2" fill="none"/>
              </svg>
              <span>{name}</span>
            </button>
          ))}
        </div>
        <button className="vsc-project-picker-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  WorkspaceExplorer — main VS Code–style layout
//  Shows ALL projects simultaneously in sidebar (like image)
// ════════════════════════════════════════════════════════════
export default function WorkspaceExplorer() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast, ToastPortal } = useToast();
  const { statuses: projectStatuses, getProjectStatus, markProjectViewed } = useProjectStatus();

  // ── Activity bar tab ──
  const [activeTab, setActiveTab] = useState(TABS.EXPLORER);

  // ── Sidebar width (resizable) ──
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  // ── Projects list ──
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState(null);

  // ── Project search query ──
  const [projectSearch, setProjectSearch] = useState("");

  // ── Expanded projects set ──
  const [expandedProjects, setExpandedProjects] = useState(new Set());

  // ── Track which project a selected file belongs to ──
  const [activeProject, setActiveProject] = useState(null);

  // ── Open file tabs ──
  const [openTabs, setOpenTabs] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);

  // ── Track current file content for execution/preview ──
  const [activeFileContent, setActiveFileContent] = useState(null);

  // ── Load file content when selected file changes (for execution support) ──
  useEffect(() => {
    if (!selectedFile || !selectedFile.path || !selectedFile._project) {
      setActiveFileContent(null);
      return;
    }
    // Check if it's a binary file — don't load binary content
    const ext = selectedFile.name?.split('.').pop().toLowerCase() || '';
    const binaryExts = new Set(['png','jpg','jpeg','gif','webp','bmp','ico','zip','tar','gz','rar','7z','pdf','doc','docx','xls','xlsx','mp3','mp4','wav','avi','mov','exe','dll','so','dylib','wasm','pyc','class','o']);
    if (binaryExts.has(ext)) {
      setActiveFileContent(null);
      return;
    }
    // Read file content asynchronously
    let cancelled = false;
    setActiveFileContent(null); // Reset while loading
    workspaceApi.readFile(selectedFile._project, selectedFile.path)
      .then(data => {
        if (cancelled) return;
        const text = typeof data === 'string'
          ? data
          : (data?.content ?? JSON.stringify(data, null, 2) ?? '');
        setActiveFileContent(text);
      })
      .catch(() => {
        if (!cancelled) setActiveFileContent(null);
      });
    return () => { cancelled = true; };
  }, [selectedFile?.path, selectedFile?._project]);

  // ── New project creation state ──
  const [showNewProjectInput, setShowNewProjectInput] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectError, setNewProjectError] = useState(null);
  const newProjectInputRef = useRef(null);
  // Use a ref to track current input value to avoid stale closure issues
  const newProjectValueRef = useRef("");

  // ── FileTree refs (one per project for imperative actions) ──
  const fileTreeRefsMap = useRef({});

  // Helper to get or create a ref for a given project name
  function getFileTreeRef(projectName) {
    if (!fileTreeRefsMap.current[projectName]) {
      fileTreeRefsMap.current[projectName] = createRef();
    }
    return fileTreeRefsMap.current[projectName];
  }

  // ── Preview panel state ──
  const [showPreview, setShowPreview] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(480);
  const previewResizingRef = useRef(false);
  const previewResizeStartXRef = useRef(0);
  const previewResizeStartWRef = useRef(480);

  const PREVIEW_MIN = 280;
  const PREVIEW_MAX = 800;

  // ── Preview resize handlers ──
  function handlePreviewResizeMouseDown(e) {
    e.preventDefault();
    previewResizingRef.current = true;
    previewResizeStartXRef.current = e.clientX;
    previewResizeStartWRef.current = previewWidth;
    window.addEventListener("mousemove", handlePreviewResizeMouseMove);
    window.addEventListener("mouseup", handlePreviewResizeMouseUp);
  }

  const handlePreviewResizeMouseMove = useCallback((e) => {
    if (!previewResizingRef.current) return;
    // Dragging left increases preview width, dragging right decreases
    const delta = previewResizeStartXRef.current - e.clientX;
    setPreviewWidth(
      Math.max(PREVIEW_MIN, Math.min(PREVIEW_MAX, previewResizeStartWRef.current + delta))
    );
  }, []);

  const handlePreviewResizeMouseUp = useCallback(() => {
    previewResizingRef.current = false;
    window.removeEventListener("mousemove", handlePreviewResizeMouseMove);
    window.removeEventListener("mouseup", handlePreviewResizeMouseUp);
  }, [handlePreviewResizeMouseMove]);

  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", handlePreviewResizeMouseMove);
      window.removeEventListener("mouseup", handlePreviewResizeMouseUp);
    };
  }, [handlePreviewResizeMouseMove, handlePreviewResizeMouseUp]);

  // ── Resize state ──
  const resizingRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWRef = useRef(SIDEBAR_DEFAULT);

  // ── Focus new project input when shown ──
  useEffect(() => {
    if (showNewProjectInput) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        if (newProjectInputRef.current) {
          newProjectInputRef.current.focus();
        }
      });
    }
  }, [showNewProjectInput]);

  // ── Open new project input ──
  function openNewProjectInput() {
    newProjectValueRef.current = "";
    setNewProjectError(null);
    setShowNewProjectInput(true);
  }

  // ── Close/cancel new project input ──
  function closeNewProjectInput() {
    if (creatingProject) return;
    newProjectValueRef.current = "";
    setNewProjectError(null);
    setShowNewProjectInput(false);
  }

  // ── Create new project handler ──
  async function handleCreateProject() {
    const name = newProjectValueRef.current.trim();
    if (!name) {
      closeNewProjectInput();
      return;
    }
    // Check for duplicate (case-insensitive since project names may be uppercased)
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
      // Success — hide input, refresh list
      newProjectValueRef.current = "";
      setNewProjectError(null);
      setShowNewProjectInput(false);
      const data = await workspaceApi.listProjects();
      const list = normalizeProjects(data);
      const names = list.map((p) => (typeof p === "string" ? p : p.name || p.project_name || "")).filter(Boolean);
      setProjects(names);
      // Auto-expand the newly created project (match case-insensitively)
      const createdName = names.find(
        (n) => n.toLowerCase() === name.toLowerCase()
      ) || name;
      setExpandedProjects((prev) => new Set([...prev, createdName]));
      setActiveProject(createdName);
    } catch (e) {
      console.error("[Explorer] createProject failed:", e);
      setNewProjectError(e.message || "Failed to create project");
    } finally {
      setCreatingProject(false);
    }
  }

  // ── Load projects ──
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

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // ── Deep-link: open project/file from URL params ──
  useEffect(() => {
    const pParam = searchParams.get("project");
    const fParam = searchParams.get("file");
    if (pParam) {
      setExpandedProjects((prev) => new Set([...prev, pParam]));
      setActiveProject(pParam);
      // Mark as viewed when navigated to via deep-link
      markProjectViewed(pParam);
      if (fParam) {
        const fileNode = { name: fParam.split("/").pop(), path: fParam, type: "file" };
        openTab(fileNode, pParam);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Tab management ──
  function openTab(fileNode, project) {
    if (!fileNode || !fileNode.path) return;
    const isDir = Boolean(
      fileNode.type === "directory" || fileNode.type === "dir" || fileNode.is_directory
    );
    if (isDir) return;

    // Store project in the tab object for the editor
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

  function handleFileSelect(project, fileNode) {
    openTab(fileNode, project);
    // Mark project as viewed when user interacts with its files
    const status = getProjectStatus(project);
    if (status && status.status === 'completed') {
      markProjectViewed(project);
    }
  }

  function handleFileDeleted(path) {
    closeTab(path, activeProject);
  }

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

  // ── Project toggle ──
  function toggleProject(name) {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else {
        next.add(name);
        // Mark as viewed when the user expands the project
        const status = getProjectStatus(name);
        if (status && status.status === 'completed') {
          markProjectViewed(name);
        }
      }
      return next;
    });
  }

  // ── Collapse all projects ──
  function collapseAll() {
    setExpandedProjects(new Set());
  }

  // ── Top-level new file/folder creation ──
  // Tracks a pending create request: { type: "file"|"folder", project: string }
  const [pendingCreate, setPendingCreate] = useState(null);

  // ── Project picker for new file/folder when target project is ambiguous ──
  const [showProjectPicker, setShowProjectPicker] = useState(null); // null | "file" | "folder"

  /**
   * Determine the target project for new file/folder creation.
   * Priority:
   *   1. If exactly one project is expanded → use it
   *   2. If activeProject is set (last interacted project) → use it
   *   3. If only one project exists → use it
   *   4. Otherwise → show a project picker dialog
   */
  function resolveTargetProject() {
    if (expandedProjects.size === 1) {
      return [...expandedProjects][0];
    }
    if (activeProject && projects.includes(activeProject)) {
      return activeProject;
    }
    if (projects.length === 1) {
      return projects[0];
    }
    return null; // ambiguous — need user to pick
  }

  function triggerCreateInProject(targetProject, createType) {
    // Ensure the project is expanded
    setExpandedProjects((prev) => new Set([...prev, targetProject]));
    setActiveProject(targetProject);
    setPendingCreate({ type: createType, project: targetProject });
  }

  function handleTopNewFile() {
    if (projects.length === 0) return;
    const target = resolveTargetProject();
    if (target) {
      triggerCreateInProject(target, "file");
    } else {
      // Multiple projects, none clearly selected → show picker
      setShowProjectPicker("file");
    }
  }

  function handleTopNewFolder() {
    if (projects.length === 0) return;
    const target = resolveTargetProject();
    if (target) {
      triggerCreateInProject(target, "folder");
    } else {
      // Multiple projects, none clearly selected → show picker
      setShowProjectPicker("folder");
    }
  }

  function handleProjectPickerSelect(projectName) {
    if (showProjectPicker && projectName) {
      triggerCreateInProject(projectName, showProjectPicker);
    }
    setShowProjectPicker(null);
  }

  // Clear pending create after it's consumed by the FileTree
  function handlePendingCreateConsumed() {
    setPendingCreate(null);
  }

  // ── Sidebar resize handler ──
  function handleResizeMouseDown(e) {
    e.preventDefault();
    resizingRef.current = true;
    resizeStartXRef.current = e.clientX;
    resizeStartWRef.current = sidebarWidth;
    window.addEventListener("mousemove", handleResizeMouseMove);
    window.addEventListener("mouseup", handleResizeMouseUp);
  }

  const handleResizeMouseMove = useCallback((e) => {
    if (!resizingRef.current) return;
    const delta = e.clientX - resizeStartXRef.current;
    setSidebarWidth(
      Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, resizeStartWRef.current + delta))
    );
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

  // ── Toggle sidebar visibility ──
  function toggleSidebar(tab) {
    if (activeTab === tab && sidebarVisible) {
      setSidebarVisible(false);
    } else {
      setSidebarVisible(true);
      setActiveTab(tab);
    }
  }

  // ── Breadcrumb segments from file path ──
  function getBreadcrumbs() {
    if (!selectedFile) return [];
    const crumbs = [];
    if (selectedFile._project) crumbs.push(selectedFile._project);
    if (selectedFile.path) crumbs.push(...selectedFile.path.split("/"));
    return crumbs;
  }

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="vsc-page">
      <ToastPortal />
      {/* ── Activity Bar ── */}
      <div className="vsc-activity-bar">
        <div className="vsc-activity-top">
          {/* Explorer */}
          <ActivityBtn
            title="Explorer (Ctrl+Shift+E)"
            active={activeTab === TABS.EXPLORER && sidebarVisible}
            onClick={() => toggleSidebar(TABS.EXPLORER)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M17.5 0H8.5L7 1.5V6H2.5L1 7.5V22.07L2.5 23.57H13.03L14.53 22.07V17.5H19L20.5 16V3L17.5 0ZM13.03 22.07H2.5V7.5H10V13H13.03V22.07ZM13.03 12H11L7 8V1.5H17.5V12H13.03ZM14.53 16V13.5L17 16H14.53Z" fill="currentColor"/>
            </svg>
          </ActivityBtn>
        </div>

        {/* Bottom activity bar icons */}
        <div className="vsc-activity-bottom">
          {/* Theme Toggle */}
          <ExplorerThemeToggle size={20} btnClass="ett-activity" />
          {/* Chat — navigate to main chat page */}
          <ActivityBtn title="Back to Chat" onClick={() => navigate('/chat')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" fill="currentColor"/>
              <path d="M7 9h10v2H7zm0-3h10v2H7z" fill="currentColor"/>
            </svg>
          </ActivityBtn>
        </div>
      </div>

      {/* ── Sidebar (collapsible) ── */}
      {sidebarVisible && (
        <>
          <div
            className="vsc-sidebar"
            style={{ width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }}
          >
            {/* Sidebar header — "EXPLORER" with action icons */}
            <div className="vsc-sidebar-header">
              <span className="vsc-sidebar-title">
                {activeTab === TABS.EXPLORER ? "PROJECTS" : activeTab === TABS.SEARCH ? "SEARCH" : activeTab === TABS.SOURCE ? "SOURCE CONTROL" : activeTab === TABS.DEBUG ? "RUN AND DEBUG" : "EXTENSIONS"}
              </span>
              {activeTab === TABS.EXPLORER && (
                <div className="vsc-sidebar-header-actions vsc-sidebar-header-actions-visible">
                  <button
                    className="vsc-icon-btn"
                    title="New Project"
                    onClick={openNewProjectInput}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                  <button
                    className="vsc-icon-btn"
                    title="New File"
                    onClick={handleTopNewFile}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16"><path d="M10 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V4l-3-3z" fill="none" stroke="currentColor" strokeWidth="1.2"/><path d="M10 1v3h3M6 9h4M8 7v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  </button>
                  <button
                    className="vsc-icon-btn"
                    title="Collapse All"
                    onClick={collapseAll}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M3 4l5 5 5-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M3 9l5 5 5-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity="0.4"/>
                    </svg>
                  </button>
                  <button
                    className="vsc-icon-btn"
                    title="Refresh Projects"
                    onClick={loadProjects}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M13.5 3A7 7 0 002.1 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      <path d="M2.5 13A7 7 0 0013.9 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      <path d="M2 5.5V9h3.5M14 10.5V7h-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Sidebar body */}
            <div className="vsc-sidebar-body">
              {activeTab === TABS.EXPLORER && (
                <>
{/* Search input */}
                  {projects.length > 0 && (
                    <div style={{ padding: "6px 12px 8px" }}>
                      <input
                        type="text"
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        placeholder="Search projects…"
                        className="vsc-project-search-input"
                        style={{
                          width: "100%",
                          padding: "6px 10px",
                          fontSize: 12,
                          borderRadius: 6,
                          outline: "none",
                        }}
                      />
                    </div>
                  )}

                  {/* Inline new project input */}
                  {showNewProjectInput && (
                    <div className="vsc-new-project-row">
                      <div className="vsc-new-project-input-row">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
                          <path d="M4 4h5l2 2h9v13H4V4z" stroke="currentColor" strokeWidth="1.3"/>
                        </svg>
                        <input
                          ref={newProjectInputRef}
                          type="text"
                          className="vsc-new-project-input"
                          placeholder="Project name…"
                          disabled={creatingProject}
                          defaultValue=""
                          onChange={(e) => { newProjectValueRef.current = e.target.value; }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreateProject();
                            if (e.key === "Escape") closeNewProjectInput();
                          }}
                          onBlur={() => {
                            // Small delay to allow button click to register
                            setTimeout(() => {
                              if (!creatingProject) closeNewProjectInput();
                            }, 200);
                          }}
                        />
                        {creatingProject && <Spinner size={14} />}
                      </div>
                      {newProjectError && (
                        <div className="vsc-new-project-error">
                          <span>{newProjectError}</span>
                          <button className="vsc-new-project-error-close" onClick={() => setNewProjectError(null)}>
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {projectsLoading ? (
                    <div className="vsc-sidebar-status">
                      <Spinner size={16} />
                      <span>Loading projects…</span>
                    </div>
                  ) : projectsError ? (
                    <div className="vsc-sidebar-status">
                      <span className="vsc-error-text">Error: {projectsError}</span>
                      <button className="vsc-retry-btn" onClick={loadProjects}>Retry</button>
                    </div>
                  ) : projects.length === 0 ? (
                    <div className="vsc-sidebar-status">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.25, marginBottom: 8 }}>
                        <path d="M4 4h5l2 2h9v13H4V4z" stroke="currentColor" strokeWidth="1.3"/>
                      </svg>
                      <span className="vsc-empty-text">No projects yet</span>
                      <span className="vsc-empty-sub">Ask Zenith to create one via chat, or create a new project below</span>
                      <button className="vsc-retry-btn" onClick={openNewProjectInput} style={{ marginTop: 10 }}>
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ marginRight: 6 }}>
                          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        New Project
                      </button>
                      <button className="vsc-retry-btn" onClick={loadProjects} style={{ marginTop: 6 }}>Refresh</button>
                    </div>
                  ) : (
                    /* ── All projects as expandable sections ── */
                    projects
                      .filter((p) => p.toLowerCase().includes(projectSearch.toLowerCase()))
                      .map((name) => {
                        const statusEntry = projectStatuses[name.toLowerCase()];
                        const pStatus = statusEntry?.status || null;
                        return (
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
                            projectStatus={pStatus}
                          />
                        );
                      })
                  )}
                </>
              )}

              {activeTab === TABS.SEARCH && (
                <div className="vsc-sidebar-status">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.25, marginBottom: 8 }}>
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M16.5 16.5l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  <span className="vsc-empty-text">Search</span>
                  <span className="vsc-empty-sub">Full-text search coming soon</span>
                </div>
              )}

              {activeTab === TABS.SOURCE && (
                <div className="vsc-sidebar-status">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.2, marginBottom: 8 }}>
                    <path d="M21.007 8.222A3.738 3.738 0 0 0 15.045 5.2a3.737 3.737 0 0 0 1.156 6.583 2.988 2.988 0 0 1-2.668 1.67h-2.99a4.456 4.456 0 0 0-2.989 1.165V7.559a3.736 3.736 0 1 0-1.494 0v8.882a3.736 3.736 0 1 0 1.494.07 2.99 2.99 0 0 1 2.99-2.764h2.99a4.485 4.485 0 0 0 4.243-3.083 3.736 3.736 0 0 0 3.23-2.442z" fill="currentColor" opacity="0.3"/>
                  </svg>
                  <span className="vsc-empty-text">Source Control</span>
                  <span className="vsc-empty-sub">Coming soon</span>
                </div>
              )}

              {activeTab === TABS.DEBUG && (
                <div className="vsc-sidebar-status">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.2, marginBottom: 8 }}>
                    <path d="M10 20h4V4h-4v16zm-6 0h4V10H4v10zm12-14v14h4V6h-4z" fill="currentColor" opacity="0.4"/>
                  </svg>
                  <span className="vsc-empty-text">Run and Debug</span>
                  <span className="vsc-empty-sub">Coming soon</span>
                </div>
              )}

              {activeTab === TABS.EXTENSIONS && (
                <div className="vsc-sidebar-status">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.2, marginBottom: 8 }}>
                    <path d="M13.5 1.5L15 0h4.5L21 1.5V6l-1.5 1.5H15L13.5 6V1.5zM0 10.5L1.5 9h4.5L7.5 10.5V15L6 16.5H1.5L0 15v-4.5zM13.5 10.5L15 9h4.5L21 10.5V15l-1.5 1.5H15L13.5 15v-4.5zM0 1.5L1.5 0h4.5L7.5 1.5V6L6 7.5H1.5L0 6V1.5z" fill="currentColor" transform="translate(1.5 3.75)" opacity="0.4"/>
                  </svg>
                  <span className="vsc-empty-text">Extensions</span>
                  <span className="vsc-empty-sub">Coming soon</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Resize Handle ── */}
          <div
            className="vsc-resize-handle"
            onMouseDown={handleResizeMouseDown}
          />
        </>
      )}

      {/* ── Project Picker Overlay (shown when target project is ambiguous) ── */}
      {showProjectPicker && (
        <ProjectPickerOverlay
          projects={projects}
          createType={showProjectPicker}
          onSelect={handleProjectPickerSelect}
          onCancel={() => setShowProjectPicker(null)}
        />
      )}

      {/* ── Editor + Preview split container ── */}
      <div className="vsc-editor-and-preview">

        {/* ── Editor Panel ── */}
        <div className="vsc-editor-panel">
          {/* Tab bar — hidden when no tabs are open for cleaner empty state */}
          {openTabs.length > 0 && (
          <div className="vsc-tab-bar">
            {openTabs.map((tab) => {
              const isActive = tab.path === selectedFile?.path && tab._project === selectedFile?._project;
              const icon = getFileIcon(tab.name);
              return (
                <div
                  key={`${tab._project}/${tab.path}`}
                  className={`vsc-tab ${isActive ? "vsc-tab-active" : ""}`}
                  onClick={() => { setSelectedFile(tab); setActiveProject(tab._project); }}
                  title={`${tab._project}/${tab.path}`}
                >
                  <span className="vsc-tab-icon">{icon}</span>
                  <span className="vsc-tab-name">{tab.name}</span>
                  <button
                    className="vsc-tab-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.path, tab._project);
                    }}
                    title="Close"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              );
            })}

            {/* Preview toggle button — visible only when there are open tabs */}
            {openTabs.length > 0 && (
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
            )}
          </div>
          )}

          {/* Breadcrumb */}
          {selectedFile && (
            <div className="vsc-breadcrumb">
              {breadcrumbs.map((crumb, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center" }}>
                  {i > 0 && <span className="vsc-breadcrumb-sep">›</span>}
                  <span
                    className={`vsc-breadcrumb-item ${i === breadcrumbs.length - 1 ? "vsc-breadcrumb-current" : ""}`}
                  >
                    {crumb}
                  </span>
                </span>
              ))}
            </div>
          )}

          <FileViewer
            project={selectedFile?._project || activeProject}
            file={selectedFile}
          />
        </div>

        {/* ── Preview Panel (split right) ── */}
        {showPreview && (
          <>
            {/* Resize handle between editor and preview */}
            <div
              className="vsc-preview-resize-handle"
              onMouseDown={handlePreviewResizeMouseDown}
            />

            {/* Preview panel with its own header */}
            <div
              className="vsc-preview-panel"
              style={{ width: previewWidth, minWidth: previewWidth, maxWidth: previewWidth }}
            >
              <ProjectPreviewPanel
                projects={projects}
                activeProject={activeProject}
                onClose={() => setShowPreview(false)}
                currentFile={selectedFile}
                fileContent={activeFileContent}
                onFileSelect={(project, fileNode) => {
                  if (fileNode) {
                    handleFileSelect(project, fileNode);
                  }
                  // Expand the project in explorer
                  if (project) {
                    setExpandedProjects((prev) => new Set([...prev, project]));
                    setActiveProject(project);
                  }
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
