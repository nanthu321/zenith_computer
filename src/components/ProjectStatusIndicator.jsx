import React from 'react'
import './ProjectStatusIndicator.css'

/**
 * ProjectStatusIndicator — Small inline badge shown inside chat messages
 * when a project is being created/generated/completed.
 *
 * Props:
 *   status: 'creating' | 'generating' | 'completed'
 *   projectName: string (optional)
 */

const CheckSVG = () => (
  <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
    <path d="M2 5.5l2.2 2.2L8 3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const STATUS_CONFIG = {
  creating: {
    label: 'Creating project',
    className: 'project-status-indicator--creating',
    icon: 'spinner',
  },
  generating: {
    label: 'Generating',
    className: 'project-status-indicator--generating',
    icon: 'spinner',
  },
  completed: {
    label: 'Project ready',
    className: 'project-status-indicator--completed',
    icon: 'check',
  },
}

export default function ProjectStatusIndicator({ status, projectName }) {
  if (!status || !STATUS_CONFIG[status]) return null

  const config = STATUS_CONFIG[status]

  return (
    <div className={`project-status-indicator ${config.className}`}>
      <span className="psi-icon">
        {config.icon === 'spinner' ? (
          <span className="psi-spinner" />
        ) : (
          <span className="psi-check"><CheckSVG /></span>
        )}
      </span>
      <span className="psi-label">
        {config.label}
        {projectName && (
          <>
            {' '}
            <span className="psi-project-name">{projectName}</span>
          </>
        )}
      </span>
    </div>
  )
}

/**
 * ProjectDot — Small colored dot for Explorer/Projects panel items.
 *
 * Props:
 *   status: 'creating' | 'generating' | 'completed' | null
 */
export function ProjectDot({ status }) {
  if (!status) return null

  const classMap = {
    creating: 'project-dot--creating',
    generating: 'project-dot--generating',
    completed: 'project-dot--completed',
  }

  const cls = classMap[status]
  if (!cls) return null

  return <span className={`project-dot ${cls}`} />
}

/**
 * ProjectItemStatus — Dot + small label for sidebar project items.
 *
 * Props:
 *   status: 'creating' | 'generating' | 'completed' | null
 */
export function ProjectItemStatus({ status }) {
  if (!status) return null

  const labelMap = {
    creating: 'Creating',
    generating: 'Generating',
    completed: 'New',
  }

  const labelClassMap = {
    creating: 'project-item-status-label--creating',
    generating: 'project-item-status-label--generating',
    completed: 'project-item-status-label--completed',
  }

  return (
    <span className="project-item-status">
      <span className={`project-item-status-label ${labelClassMap[status] || ''}`}>
        {labelMap[status] || ''}
      </span>
      <ProjectDot status={status} />
    </span>
  )
}
