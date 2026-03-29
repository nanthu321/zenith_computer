import { useState, useEffect } from "react";
import { workspaceApi } from "../../api/workspace";
import { getProjectIcon } from "./fileIcons.jsx";
import DownloadButton from "./DownloadButton.jsx";
import { useToast } from "../ToastNotification.jsx";

// ── Normalize project list from various API response shapes ──
function normalizeProjects(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.projects && Array.isArray(data.projects)) return data.projects;
  if (data.data && Array.isArray(data.data)) return data.data;
  return [];
}

export default function ProjectList({ selectedProject, onSelect }) {
  const { toast, ToastPortal } = useToast();
  const [projects, setProjects]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [renamingId, setRenamingId]   = useState(null);
  const [renameVal, setRenameVal]     = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting]       = useState(null);

  useEffect(() => { loadProjects(); }, []);

  async function loadProjects() {
    setLoading(true);
    setError(null);
    try {
      const data = await workspaceApi.listProjects();
      setProjects(normalizeProjects(data));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(name) {
    setDeleting(name);
    try {
      await workspaceApi.deleteProject(name);
      setConfirmDelete(null);
      if (selectedProject === name) onSelect(null);
      await loadProjects();
    } catch (e) {
      console.error("Delete failed:", e);
      setError("Delete failed: " + e.message);
    } finally {
      setDeleting(null);
    }
  }

  async function handleRename(oldName) {
    if (!renameVal.trim() || renameVal.trim() === oldName) {
      setRenamingId(null);
      return;
    }
    try {
      await workspaceApi.renameProject(oldName, renameVal.trim());
      if (selectedProject === oldName) onSelect(renameVal.trim());
      await loadProjects();
    } catch (e) {
      console.error("Rename failed:", e);
      setError("Rename failed: " + e.message);
    } finally {
      setRenamingId(null);
    }
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

  const projIcon = getProjectIcon();

  if (loading) return (
    <div className="explorer-empty">
      <svg width="16" height="16" viewBox="0 0 16 16" style={{ animation: "spin 0.8s linear infinite", marginRight: 8 }}>
        <circle cx="8" cy="8" r="6" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
      </svg>
      Loading projects…
    </div>
  );
  if (error)
    return (
      <div className="explorer-empty">
        <p style={{ marginBottom: 8, color: "#ef4444" }}>Error: {error}</p>
        <button className="explorer-empty-action-btn" onClick={loadProjects}>Retry</button>
      </div>
    );
  if (!projects || projects.length === 0)
    return (
      <div className="explorer-empty">
        No projects yet.
        <br/>
        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
          Ask the agent to create one
        </span>
        <button className="explorer-empty-action-btn" onClick={loadProjects} style={{ marginTop: 10 }}>Refresh</button>
      </div>
    );

  return (
    <div className="explorer-project-list">
      <ToastPortal />
      {projects.map((p) => {
        const name = typeof p === "string" ? p : (p.name || p.project_name || "");
        const fileCount = typeof p === "object" ? (p.file_count ?? p.fileCount ?? null) : null;

        if (!name) return null;

        return (
          <div
            key={name}
            className={`explorer-project-row ${selectedProject === name ? "explorer-project-active" : ""}`}
          >
            {renamingId === name ? (
              <input
                autoFocus
                className="explorer-rename-input"
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onBlur={() => handleRename(name)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename(name);
                  if (e.key === "Escape") setRenamingId(null);
                }}
              />
            ) : (
              <div
                className="explorer-project-name"
                onClick={() => onSelect(name)}
              >
                <span className="explorer-project-icon">
                  {projIcon}
                </span>
                <span className="explorer-project-label">{name}</span>
                {fileCount != null && (
                  <span className="explorer-project-meta">{fileCount} files</span>
                )}
              </div>
            )}

            <div className="explorer-project-actions">
              <button
                title="Rename"
                onClick={(e) => { e.stopPropagation(); setRenamingId(name); setRenameVal(name); }}
                className="explorer-icon-btn"
              ><i className="fa-solid fa-pen" /></button>

              <DownloadButton
                type="project"
                project={name}
                name={name}
                size={13}
                className="dl-btn-tree"
                onToast={handleDownloadToast}
              />

              {confirmDelete === name ? (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(name); }}
                    className="explorer-icon-btn explorer-icon-btn-danger"
                    disabled={deleting === name}
                  >{deleting === name
                    ? <i className="fa-solid fa-spinner fa-spin" />
                    : <i className="fa-solid fa-check" />
                  }</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
                    className="explorer-icon-btn"
                    disabled={deleting === name}
                  ><i className="fa-solid fa-xmark" /></button>
                </>
              ) : (
                <button
                  title="Delete project"
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(name); }}
                  className="explorer-icon-btn"
                ><i className="fa-solid fa-trash" /></button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
