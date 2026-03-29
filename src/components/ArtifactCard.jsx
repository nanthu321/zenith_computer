import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./ArtifactCard.css";

// ── ArtifactCard ──────────────────────────────────────────────────────────
//
// Previously rendered HTML/SVG artifacts inline as iframes.
// Now shows a compact "View Project" card instead — keeps the chat clean
// and guides the user to the dedicated Explorer section.
//
// Props:
//   artifact.id           — unique string id
//   artifact.type         — "html" | "svg"
//   artifact.title        — display title shown in the card
//   artifact.content      — raw HTML or SVG string (used for copy only)
//   artifact.project_name — optional project name for direct navigation

export default function ArtifactCard({ artifact }) {
  const navigate = useNavigate();

  // Derive a project name from multiple possible sources
  const projectName =
    artifact.project_name ||
    artifact.projectName ||
    null;

  function handleViewProject() {
    if (projectName) {
      navigate(`/workspace?project=${encodeURIComponent(projectName)}`);
    } else {
      navigate("/workspace");
    }
  }

  // Type icon mapping
  const typeIcons = { html: "🌐", svg: "🎨", json: "📋", md: "📝" };
  const typeIcon = typeIcons[artifact.type] || "📄";

  return (
    <div className="artifact-card">
      {/* ── Info row: badge + title ── */}
      <div className="artifact-header">
        <div className="artifact-header-left">
          <span className={`artifact-badge artifact-badge-${artifact.type}`}>
            {typeIcon} {artifact.type}
          </span>
          <span className="artifact-title" title={artifact.title}>
            {artifact.title}
          </span>
        </div>

        {/* Copy source button */}
        <div className="artifact-controls">
          <CopyButton content={artifact.content} />
        </div>
      </div>

      {/* ── "View Project" action row ── */}
      <div className="artifact-action-row">
        <span className="artifact-preview-note">
          Preview available in Explorer
        </span>
        <button
          className="artifact-view-project-btn"
          onClick={handleViewProject}
          title={projectName ? `Open "${projectName}" in Explorer` : "Open in Explorer"}
        >
          <FolderIcon />
          {projectName ? `View Project: ${projectName}` : "View Project"}
          <ExternalLinkIcon />
        </button>
      </div>
    </div>
  );
}

// ── CopyButton ────────────────────────────────────────────────────────────
function CopyButton({ content }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) { /* clipboard write failed */ }
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy source"
      className={`artifact-copy-btn ${copied ? "artifact-copy-btn-copied" : ""}`}
    >
      {copied ? "✓ copied" : "copy source"}
    </button>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────
function FolderIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 3a1 1 0 011-1h3.172a1 1 0 01.707.293L8.414 3.5H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1V3z"
        stroke="currentColor" strokeWidth="1.2" fill="none"
      />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 10L10 2M10 2H5.5M10 2V6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
