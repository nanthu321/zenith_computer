// ─────────────────────────────────────────────────────────────
//  DownloadButton — Reusable download icon button with states
//  Shows: idle → spinning → success/error
//  Used in ExplorerPanel, FileTree, WorkspaceExplorer, etc.
// ─────────────────────────────────────────────────────────────
import { useState, useRef, useCallback } from "react";
import { downloadFile, downloadFolderAsZip, downloadProjectAsZip } from "../../utils/downloadUtils";
import "./DownloadButton.css";

// ── SVG Icons ──
const DownloadIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path
      d="M8 2v8M5 7.5L8 10.5 11 7.5"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3 12.5h10"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

const SpinnerIcon = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    style={{ animation: "dl-spin 0.7s linear infinite", display: "block" }}
  >
    <circle
      cx="8" cy="8" r="6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeDasharray="28"
      strokeDashoffset="8"
      strokeLinecap="round"
      opacity="0.6"
    />
  </svg>
);

const CheckIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path
      d="M3 8l4 4 6-7"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ErrorIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path
      d="M5 5l6 6M11 5l-6 6"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * DownloadButton — versatile download trigger.
 *
 * @param {string} type - "file" | "folder" | "project"
 * @param {string} project - Project name
 * @param {string} path - File/folder path (not needed for project)
 * @param {string} name - Display name (file name, folder name, or project name)
 * @param {number} size - Icon size (default 14)
 * @param {string} className - Additional CSS class
 * @param {function} onToast - Optional callback: (message, type) => void
 */
export default function DownloadButton({
  type = "file",
  project,
  path,
  name,
  size = 14,
  className = "",
  onToast,
}) {
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const timeoutRef = useRef(null);

  const resetStatus = useCallback((delay = 2000) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setStatus("idle"), delay);
  }, []);

  const handleClick = useCallback(
    async (e) => {
      e.stopPropagation();
      e.preventDefault();

      if (status === "loading") return; // prevent double-click

      const callbacks = {
        onStart: () => setStatus("loading"),
        onSuccess: (filename, count) => {
          setStatus("success");
          if (type === "file") {
            onToast?.(`Downloaded ${filename}`, "success");
          } else {
            const label = count >= 0 ? ` (${count} files)` : "";
            onToast?.(`Downloaded ${filename}${label}`, "success");
          }
          resetStatus();
        },
        onError: (msg) => {
          setStatus("error");
          onToast?.(`Download failed: ${msg}`, "error");
          resetStatus(3000);
        },
        onProgress: () => {}, // Could be used for progress bar
      };

      if (type === "file") {
        await downloadFile(project, path, name, callbacks);
      } else if (type === "folder") {
        await downloadFolderAsZip(project, path, name, callbacks);
      } else if (type === "project") {
        await downloadProjectAsZip(project, callbacks);
      }
    },
    [type, project, path, name, status, onToast, resetStatus]
  );

  // Determine icon and title
  let icon;
  let title;
  let statusClass = "";

  switch (status) {
    case "loading":
      icon = <SpinnerIcon size={size} />;
      title = "Downloading…";
      statusClass = "dl-btn-loading";
      break;
    case "success":
      icon = <CheckIcon size={size} />;
      title = "Downloaded!";
      statusClass = "dl-btn-success";
      break;
    case "error":
      icon = <ErrorIcon size={size} />;
      title = "Download failed";
      statusClass = "dl-btn-error";
      break;
    default:
      icon = <DownloadIcon size={size} />;
      title =
        type === "file"
          ? `Download ${name || "file"}`
          : type === "folder"
          ? `Download ${name || "folder"} as ZIP`
          : `Download ${name || "project"} as ZIP`;
      break;
  }

  return (
    <button
      className={`dl-btn ${statusClass} ${className}`}
      onClick={handleClick}
      disabled={status === "loading"}
      title={title}
      aria-label={title}
    >
      {icon}
    </button>
  );
}
