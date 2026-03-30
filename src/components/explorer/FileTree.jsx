import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { workspaceApi } from "../../api/workspace";
import { getFileIcon, getFolderIcon } from "./fileIcons.jsx";
import DownloadButton from "./DownloadButton.jsx";
import { useToast } from "../ToastNotification.jsx";

// ── Normalize entries from various API response shapes ──
function normalizeEntries(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.entries && Array.isArray(data.entries)) return data.entries;
  if (data.files && Array.isArray(data.files)) return data.files;
  if (data.children && Array.isArray(data.children)) return data.children;
  return [];
}

// ── Chevron arrow SVG ──
function ChevronIcon({ open }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.15s ease",
        flexShrink: 0,
        display: "block",
      }}
    >
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Spinner SVG ──
function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" style={{ animation: "spin 0.8s linear infinite", display: "block" }}>
      <circle cx="8" cy="8" r="6" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
    </svg>
  );
}

// ── Inline creation input (VSCode-style) ──
function InlineCreateInput({ depth, type, onSubmit, onCancel }) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);
  // Track disposition to prevent double-submit from Enter + blur firing together
  const dispositionRef = useRef(null); // null | "submit" | "cancel"

  useEffect(() => {
    // Autofocus after mount — use rAF so the DOM is ready
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  function commit(val) {
    // Guard: only allow one commit per mount
    if (dispositionRef.current !== null) return;
    dispositionRef.current = "submit";
    const trimmed = (val ?? value).trim();
    if (!trimmed) {
      dispositionRef.current = "cancel";
      onCancel();
      return;
    }
    onSubmit(trimmed);
  }

  function cancel() {
    if (dispositionRef.current !== null) return;
    dispositionRef.current = "cancel";
    onCancel();
  }

  const icon = type === "folder"
    ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4a1 1 0 011-1h3l1.5 1.5H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" fill="none" stroke="#dcb67a" strokeWidth="1.2"/></svg>
    : <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V4l-3-3z" fill="none" stroke="currentColor" strokeWidth="1.2"/><path d="M10 1v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>;

  return (
    <div
      className="filetree-node filetree-inline-create-row"
      style={{ paddingLeft: depth * 18 + 4 }}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="filetree-chevron filetree-chevron-hidden" />
      <span className="filetree-icon">{icon}</span>
      <input
        ref={inputRef}
        className="filetree-inline-create-input"
        value={value}
        placeholder={type === "folder" ? "Folder name" : "File name"}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          // onBlur fires after onKeyDown; if Enter already committed, skip
          if (dispositionRef.current === null) commit(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(value);
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
      />
    </div>
  );
}

// ── Single tree node (recursive, Antigravity-style) ──
function TreeNode({
  node, project, depth, selectedFile,
  onFileClick, onDelete, onRename, onNewFile, onNewFolder, onRefreshRoot, onInlineError, onToast,
}) {
  const [open, setOpen]               = useState(false);
  const [children, setChildren]       = useState(null);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [renamingId, setRenamingId]   = useState(false);
  const [renameVal, setRenameVal]     = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showMenu, setShowMenu]       = useState(false);
  const [inlineCreate, setInlineCreate] = useState(null); // null | "file" | "folder"

  const isDir = node.type === "directory" || node.type === "dir" || node.is_directory === true;

  // Refreshes children list from the server — always re-fetches to stay in sync
  async function loadChildren() {
    if (!isDir) return;
    setLoadingChildren(true);
    try {
      const data = await workspaceApi.listFiles(project, node.path || "");
      const entries = normalizeEntries(data);
      // Sort: directories first, then files, both alphabetical
      entries.sort((a, b) => {
        const aDir = a.type === "directory" || a.type === "dir" || a.is_directory;
        const bDir = b.type === "directory" || b.type === "dir" || b.is_directory;
        if (aDir && !bDir) return -1;
        if (!aDir && bDir) return 1;
        return (a.name || "").localeCompare(b.name || "");
      });
      setChildren(entries);
    } catch (e) {
      console.error("[FileTree] loadChildren failed:", e);
      setChildren([]);
    } finally {
      setLoadingChildren(false);
    }
  }

  function handleToggle() {
    if (!isDir) return;
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && !children) loadChildren();
  }

  // Opens a folder (if closed) and waits until children are loaded before showing inline input
  function openAndCreate(createType) {
    if (!open) {
      setOpen(true);
      if (!children) {
        // Load children first, then show the inline input after load
        setLoadingChildren(true);
        workspaceApi.listFiles(project, node.path || "")
          .then((data) => {
            const entries = normalizeEntries(data);
            entries.sort((a, b) => {
              const aDir = a.type === "directory" || a.type === "dir" || a.is_directory;
              const bDir = b.type === "directory" || b.type === "dir" || b.is_directory;
              if (aDir && !bDir) return -1;
              if (!aDir && bDir) return 1;
              return (a.name || "").localeCompare(b.name || "");
            });
            setChildren(entries);
          })
          .catch(() => setChildren([]))
          .finally(() => {
            setLoadingChildren(false);
            setInlineCreate(createType);
          });
        return; // inline input shown after load completes
      }
    }
    // Folder already open (or children already loaded) — show inline input immediately
    setInlineCreate(createType);
  }

  async function handleRename() {
    const trimmed = renameVal.trim();
    if (!trimmed || trimmed === node.name) {
      setRenamingId(false);
      return;
    }
    const parentPath = node.path && node.path.includes("/")
      ? node.path.substring(0, node.path.lastIndexOf("/"))
      : "";
    const newPath = parentPath ? `${parentPath}/${trimmed}` : trimmed;
    try {
      await onRename(node.path, newPath);
    } catch (e) {
      console.error("Rename failed:", e);
      onInlineError?.("Rename failed: " + e.message);
    }
    setRenamingId(false);
  }

  const isSelected = selectedFile === node.path && !isDir;
  const indent = depth * 18;

  // Icon
  const icon = isDir ? getFolderIcon(node.name, open) : getFileIcon(node.name);

  return (
    <div className="filetree-node-group">
      {/* The row */}
      <div
        className={`filetree-node ${isSelected ? "filetree-node-selected" : ""}`}
        style={{ paddingLeft: indent + 4 }}
        onMouseEnter={() => setShowMenu(true)}
        onMouseLeave={() => { setShowMenu(false); setConfirmDelete(false); }}
        onClick={() => {
          if (isDir) handleToggle();
          else onFileClick(node);
        }}
      >
        {/* Chevron for folders */}
        <span className={`filetree-chevron ${isDir ? "" : "filetree-chevron-hidden"}`}>
          {isDir && (
            loadingChildren
              ? <SpinnerIcon />
              : <ChevronIcon open={open} />
          )}
        </span>

        {/* Icon */}
        <span className="filetree-icon">{icon}</span>

        {/* Name or rename input */}
        {renamingId ? (
          <input
            autoFocus
            className="filetree-rename-input"
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleRename(); }
              if (e.key === "Escape") { e.preventDefault(); setRenamingId(false); }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="filetree-name">{node.name}</span>
        )}

        {/* Hover action buttons */}
        {showMenu && !renamingId && (
          <div className="filetree-actions" onClick={(e) => e.stopPropagation()}>
            {isDir && (
              <>
                <button
                  title="New file"
                  onClick={(e) => { e.stopPropagation(); openAndCreate("file"); }}
                  className="filetree-action-btn"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16"><path d="M10 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V4l-3-3z" fill="none" stroke="currentColor" strokeWidth="1.2"/><path d="M10 1v3h3M6 9h4M8 7v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                </button>
                <button
                  title="New folder"
                  onClick={(e) => { e.stopPropagation(); openAndCreate("folder"); }}
                  className="filetree-action-btn"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16"><path d="M2 4a1 1 0 011-1h3l1.5 1.5H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" fill="none" stroke="currentColor" strokeWidth="1.2"/><path d="M6 8.5h4M8 6.5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                </button>
              </>
            )}
            {/* Download button — file or folder */}
            <DownloadButton
              type={isDir ? "folder" : "file"}
              project={project}
              path={node.path}
              name={node.name}
              size={13}
              className="dl-btn-tree"
              onToast={onToast}
            />
            <button
              title="Rename"
              onClick={(e) => { e.stopPropagation(); setRenamingId(true); setRenameVal(node.name); }}
              className="filetree-action-btn"
            >
              <svg width="13" height="13" viewBox="0 0 16 16"><path d="M11.5 1.5l3 3L5 14H2v-3l9.5-9.5z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            {confirmDelete ? (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(node.path); }}
                  className="filetree-action-btn filetree-action-btn-confirm"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16"><path d="M3 8l4 4 6-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                  className="filetree-action-btn"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                </button>
              </>
            ) : (
              <button
                title="Delete"
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                className="filetree-action-btn filetree-action-btn-danger"
              >
                <svg width="13" height="13" viewBox="0 0 16 16"><path d="M2 4h12M5.3 4V2.7a.7.7 0 01.7-.7h4a.7.7 0 01.7.7V4M6.5 7v4.5M9.5 7v4.5M3.5 4l.8 9.3a1 1 0 001 .9h5.4a1 1 0 001-.9L12.5 4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Children (with indent guide) */}
      {isDir && open && (
        <div className="filetree-children" style={{ marginLeft: indent + 11 }}>
          {/* Inline creation input (VSCode-style) */}
          {inlineCreate && (
            <InlineCreateInput
              key={inlineCreate} /* remount when type changes */
              depth={depth + 1}
              type={inlineCreate}
              onSubmit={async (inputName) => {
                const path = node.path ? `${node.path}/${inputName}` : inputName;
                try {
                  if (inlineCreate === "folder") {
                    await onNewFolder(path, true);
                  } else {
                    await onNewFile(path, true);
                  }
                  // Always refresh this folder's children after successful create.
                  // onNewFile/onNewFolder already call loadRoot() in the parent,
                  // but we also need to refresh THIS node's children to show the
                  // new entry in the subtree immediately.
                  try {
                    await loadChildren();
                  } catch (_) {
                    // Best-effort refresh — the parent loadRoot will catch it
                  }
                } catch (e) {
                  // errors handled by parent via onInlineError
                }
                setInlineCreate(null);
              }}
              onCancel={() => setInlineCreate(null)}
            />
          )}
          {children && children.length > 0 ? (
            children.map((child) => {
              const childName = child.name || child.filename || "";
              // Build the correct full path for this child.
              // The API may return:
              //   a) No path at all → build from parent: "parentPath/childName"
              //   b) A relative path (just the name) → build from parent
              //   c) A full path that already includes the parent prefix → use as-is
              // We always prefer building from parent + name to avoid ambiguity,
              // UNLESS the API returns a full path that already starts with the parent prefix.
              const parentPrefix = node.path ? `${node.path}/` : "";
              let childPath;
              if (child.path && child.path.startsWith(parentPrefix) && child.path !== childName) {
                // API returned a full path that includes the parent — use it directly
                childPath = child.path;
              } else {
                // Build path from parent + child name (safest default)
                childPath = node.path ? `${node.path}/${childName}` : childName;
              }

              return (
                <TreeNode
                  key={`${childName}-${childPath}`}
                  node={{ ...child, name: childName, path: childPath }}
                  project={project}
                  depth={depth + 1}
                  selectedFile={selectedFile}
                  onFileClick={onFileClick}
                  onDelete={onDelete}
                  onRename={onRename}
                  onNewFile={onNewFile}
                  onNewFolder={onNewFolder}
                  onRefreshRoot={onRefreshRoot}
                  onInlineError={onInlineError}
                  onToast={onToast}
                />
              );
            })
          ) : (
            !loadingChildren && children !== null && children.length === 0 && !inlineCreate && (
              <div className="filetree-empty-folder" style={{ paddingLeft: (depth + 1) * 18 + 24 }}>
                <span>Empty folder</span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ── FileTree root component ──
const FileTree = forwardRef(function FileTree({ project, selectedFile, onFileSelect, onFileDeleted, pendingCreate, onPendingCreateConsumed }, ref) {
  const { toast } = useToast();
  const [entries, setEntries]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [rootInlineCreate, setRootInlineCreate] = useState(null); // null | "file" | "folder"
  const [inlineError, setInlineError] = useState(null);
  const errorTimerRef = useRef(null);

  // Respond to external pendingCreate signal from parent (e.g. top-level New File / New Folder buttons)
  // We store the pending type in a ref so it survives across renders while the tree is loading.
  const pendingCreateRef = useRef(null);

  useEffect(() => {
    if (pendingCreate) {
      if (!loading) {
        // Tree is ready — show the inline input immediately
        setRootInlineCreate(pendingCreate);
        onPendingCreateConsumed?.();
      } else {
        // Tree is still loading — save for later and consume from parent
        // so parent doesn't keep re-sending it
        pendingCreateRef.current = pendingCreate;
        onPendingCreateConsumed?.();
      }
    }
  }, [pendingCreate]);

  // When loading finishes, check if we have a deferred pendingCreate to show
  useEffect(() => {
    if (!loading && pendingCreateRef.current) {
      setRootInlineCreate(pendingCreateRef.current);
      pendingCreateRef.current = null;
    }
  }, [loading]);

  // ── Expose imperative actions to parent via ref ──
  useImperativeHandle(ref, () => ({
    triggerNewFile: () => setRootInlineCreate("file"),
    triggerNewFolder: () => setRootInlineCreate("folder"),
    triggerRefresh: () => loadRoot(),
  }));

  function showInlineError(msg) {
    setInlineError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setInlineError(null), 4000);
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

  useEffect(() => {
    if (project) loadRoot();
    else {
      setEntries([]);
      setLoading(false);
    }
  }, [project]);

  async function loadRoot() {
    setLoading(true);
    setError(null);
    try {
      const data = await workspaceApi.listFiles(project, "");
      const raw = normalizeEntries(data);
      // Sort: directories first, then files
      raw.sort((a, b) => {
        const aDir = a.type === "directory" || a.type === "dir" || a.is_directory;
        const bDir = b.type === "directory" || b.type === "dir" || b.is_directory;
        if (aDir && !bDir) return -1;
        if (!aDir && bDir) return 1;
        return (a.name || "").localeCompare(b.name || "");
      });
      setEntries(raw);
    } catch (e) {
      console.error("[FileTree] loadRoot failed:", e);
      setError(e.message);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(path) {
    try {
      await workspaceApi.deleteFile(project, path);
      onFileDeleted?.(path);
      await loadRoot();
    } catch (e) {
      console.error("Delete failed:", e);
      showInlineError("Delete failed: " + e.message);
    }
  }

  async function handleRename(from, to) {
    try {
      await workspaceApi.renameFile(project, from, to);
      await loadRoot();
    } catch (e) {
      console.error("Rename failed:", e);
      showInlineError("Rename failed: " + e.message);
    }
  }

  // Called from inline input (with isInline=true) or from TreeNode children
  async function handleNewFile(pathOrDir, isInline) {
    if (isInline) {
      // pathOrDir is the full path already
      try {
        await workspaceApi.writeFile(project, pathOrDir, "");
        const fileName = pathOrDir.split("/").pop();
        // Always refresh root to keep the tree in sync — this handles both
        // root-level files AND nested files (since the root listing may also
        // reflect new child entries in some API implementations).
        await loadRoot();
        onFileSelect({ name: fileName, path: pathOrDir, type: "file" });
      } catch (e) {
        console.error("Create file failed:", e);
        showInlineError("Create file failed: " + e.message);
        throw e; // re-throw so TreeNode knows to NOT clear inlineCreate prematurely
      }
      return;
    }
    // Legacy fallback — should not happen anymore
    setRootInlineCreate("file");
  }

  async function handleNewFolder(pathOrDir, isInline) {
    if (isInline) {
      // pathOrDir is the full path already
      try {
        await workspaceApi.createFolder(project, pathOrDir);
        // Always refresh root to keep the tree in sync
        await loadRoot();
      } catch (e) {
        console.error("Create folder failed:", e);
        showInlineError("Create folder failed: " + e.message);
        throw e; // re-throw so TreeNode knows to NOT clear inlineCreate prematurely
      }
      return;
    }
    // Legacy fallback
    setRootInlineCreate("folder");
  }

  if (loading) {
    return (
      <div className="explorer-empty">
        <SpinnerIcon />
        <span style={{ marginTop: 8 }}>Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="explorer-empty">
        <p style={{ color: "#ef4444" }}>Error: {error}</p>
        <button className="explorer-empty-action-btn" onClick={loadRoot} style={{ marginTop: 8 }}>
          Retry
        </button>
      </div>
    );
  }

  if (entries.length === 0 && !rootInlineCreate) {
    return (
      <div className="explorer-empty">
        No files yet.
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <button className="explorer-empty-action-btn" onClick={() => setRootInlineCreate("file")}>New File</button>
          <button className="explorer-empty-action-btn" onClick={() => setRootInlineCreate("folder")}>New Folder</button>
        </div>
      </div>
    );
  }

  // Empty project with inline creation input shown
  if (entries.length === 0 && rootInlineCreate) {
    return (
      <div className="filetree-root">
   
        <InlineCreateInput
          key={rootInlineCreate}
          depth={0}
          type={rootInlineCreate}
          onSubmit={async (inputName) => {
            try {
              if (rootInlineCreate === "folder") {
                await workspaceApi.createFolder(project, inputName);
              } else {
                await workspaceApi.writeFile(project, inputName, "");
                onFileSelect({ name: inputName, path: inputName, type: "file" });
              }
              setRootInlineCreate(null);
              loadRoot();
            } catch (e) {
              console.error("Create failed:", e);
              showInlineError("Create failed: " + e.message);
              setRootInlineCreate(null);
            }
          }}
          onCancel={() => setRootInlineCreate(null)}
        />
        {inlineError && (
          <div className="filetree-inline-error-toast" onClick={() => setInlineError(null)}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="8" cy="8" r="7" stroke="#ef4444" strokeWidth="1.3"/>
              <path d="M8 4.5v4" stroke="#ef4444" strokeWidth="1.3" strokeLinecap="round"/>
              <circle cx="8" cy="11" r="0.8" fill="#ef4444"/>
            </svg>
            <span>{inlineError}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="filetree-root">


      {/* Root-level inline creation input */}
      {rootInlineCreate && (
        <InlineCreateInput
          key={rootInlineCreate}
          depth={0}
          type={rootInlineCreate}
          onSubmit={async (inputName) => {
            try {
              if (rootInlineCreate === "folder") {
                await workspaceApi.createFolder(project, inputName);
              } else {
                await workspaceApi.writeFile(project, inputName, "");
                onFileSelect({ name: inputName, path: inputName, type: "file" });
              }
              setRootInlineCreate(null);
              loadRoot();
            } catch (e) {
              console.error("Create failed:", e);
              showInlineError("Create failed: " + e.message);
              setRootInlineCreate(null);
            }
          }}
          onCancel={() => setRootInlineCreate(null)}
        />
      )}

      {/* Tree entries */}
      {entries.map((entry) => {
        const entryName = entry.name || entry.filename || "";
        const entryPath = entry.path || entryName;

        return (
          <TreeNode
            key={entryName}
            node={{ ...entry, name: entryName, path: entryPath }}
            project={project}
            depth={0}
            selectedFile={selectedFile}
            onFileClick={onFileSelect}
            onDelete={handleDelete}
            onRename={handleRename}
            onNewFile={handleNewFile}
            onNewFolder={handleNewFolder}
            onRefreshRoot={loadRoot}
            onInlineError={showInlineError}
            onToast={handleDownloadToast}
          />
        );
      })}

      {/* Inline error toast */}
      {inlineError && (
        <div className="filetree-inline-error-toast" onClick={() => setInlineError(null)}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="8" cy="8" r="7" stroke="#ef4444" strokeWidth="1.3"/>
            <path d="M8 4.5v4" stroke="#ef4444" strokeWidth="1.3" strokeLinecap="round"/>
            <circle cx="8" cy="11" r="0.8" fill="#ef4444"/>
          </svg>
          <span>{inlineError}</span>
        </div>
      )}
    </div>
  );
});

FileTree.displayName = "FileTree";

export default FileTree;
