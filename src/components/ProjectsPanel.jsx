import React from 'react'
import { ProjectItemStatus } from './ProjectStatusIndicator.jsx'
import { useProjectStatus } from '../context/ProjectStatusContext.jsx'
import './ProjectsPanel.css'

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function getFileCount(files) {
  if (!files) return 0
  if (Array.isArray(files)) return files.length
  try {
    const parsed = JSON.parse(files)
    return Array.isArray(parsed) ? parsed.length : 0
  } catch { return 0 }
}

export default function ProjectsPanel({ projects, onDownload, onRefresh, onProjectClick }) {
  const { getProjectStatus, markProjectViewed } = useProjectStatus()
  if (projects.length === 0) {
    return (
      <div className="panel-empty">
        <div className="panel-empty-icon">📁</div>
        <p>No projects yet</p>
        <span className="panel-empty-hint">Ask Zenith to create a project for you</span>
      </div>
    )
  }

  return (
    <div className="projects-panel">
      <div className="panel-header">
        <span className="panel-title">Projects</span>
        <button className="panel-refresh-btn" onClick={onRefresh} title="Refresh">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M10 6A4 4 0 102 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M10 3v3H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <ul className="projects-list">
        {projects.map((project) => {
          const fileCount = getFileCount(project.files)
          const statusEntry = getProjectStatus(project.name)
          const projectStatus = statusEntry?.status || null

          const handleProjectItemClick = () => {
            // Mark as viewed when clicked
            if (projectStatus === 'completed') {
              markProjectViewed(project.name)
            }
            onProjectClick?.(project)
          }

          return (
            <li
              key={project.project_id}
              className={`project-item ${projectStatus ? 'project-item--has-status' : ''}`}
              onClick={handleProjectItemClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleProjectItemClick()}
            >
              <div className="project-icon-wrapper">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4h5l1.5 2H14v7H2V4z" stroke="var(--brand-secondary)" strokeWidth="1.2" strokeLinejoin="round"/>
                </svg>
              </div>

              <div className="project-body">
                <div className="project-name">{project.name}</div>
                {project.description && (
                  <div className="project-desc">{project.description}</div>
                )}
                <div className="project-meta">
                  {fileCount > 0 && (
                    <span className="project-files-count">
                      {fileCount} file{fileCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  <span className="project-date">{formatDate(project.created_at)}</span>
                </div>
              </div>

              {/* Status indicator */}
              <ProjectItemStatus status={projectStatus} />

              <button
                className="project-download-btn"
                onClick={(e) => { e.stopPropagation(); onDownload(project.project_id) }}
                title="Download as ZIP"
                aria-label={`Download ${project.name}`}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 2v7M4 7l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 11h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
