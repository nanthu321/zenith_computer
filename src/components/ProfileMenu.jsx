import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import './ProfileMenu.css'
import zenithLogo from '../assets/ZenithLogo.webp'
import { getPreference, savePreferenceAsync } from '../utils/preferences.js'
import ThemeToggle from './ThemeToggle.jsx'

/* ═══════════════════════════════════════════════════════════
   DEFAULT CONNECTORS CATALOGUE
   ═══════════════════════════════════════════════════════════ */
const DEFAULT_CONNECTORS = [
  {
    id: 'zoho',
    name: 'Zoho',
    desc: 'Zoho suite — CRM, Cliq, Projects, Meeting & more',
    logo: zenithLogo,
    type: 'zoho',
    docsUrl: 'https://www.zoho.com/developer/help/api-overview.html',
  },
  {
    id: 'github',
    name: 'GitHub',
    desc: 'Code hosting & version control',
    logo: null,
    type: 'others',
    authType: 'header',
    icon: 'github',
    docsUrl: 'https://docs.github.com/en/rest',
  },
  {
    id: 'google_drive',
    name: 'Google Drive',
    desc: 'Cloud storage & file sharing',
    logo: null,
    type: 'others',
    icon: 'gdrive',
    docsUrl: 'https://developers.google.com/drive/api',
  },
  {
    id: 'slack',
    name: 'Slack',
    desc: 'Messaging & workflow automation',
    logo: null,
    type: 'others',
    icon: 'slack',
    docsUrl: 'https://api.slack.com/methods',
  },
  {
    id: 'jira',
    name: 'Jira',
    desc: 'Project & issue tracking',
    logo: null,
    type: 'others',
    icon: 'jira',
    docsUrl: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/',
  },
]

/* ═══════════════════════════════════════════════════════════
   INLINE SVG ICONS FOR NON-ZOHO CONNECTORS
   ═══════════════════════════════════════════════════════════ */
function ConnectorIcon({ icon, size = 28 }) {
  const s = size
  switch (icon) {
    case 'github':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"
            fill="currentColor"/>
        </svg>
      )
    case 'gdrive':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path d="M8.267 14.68l-1.6 2.769H16.8l1.6-2.769H8.267z" fill="#3777E3"/>
          <path d="M15.467 5.232H8.533L2 16.68l1.6 2.769L10.133 7.999l5.334.001z" fill="#FFCF63"/>
          <path d="M21.6 16.68L15.467 5.232l-5.334-.001L16.4 16.68h5.2z" fill="#11A861"/>
        </svg>
      )
    case 'slack':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path d="M6.194 14.644a1.903 1.903 0 01-1.902 1.903 1.903 1.903 0 01-1.903-1.903 1.903 1.903 0 011.903-1.902h1.902v1.902zm.957 0a1.903 1.903 0 011.902-1.902 1.903 1.903 0 011.903 1.902v4.762a1.903 1.903 0 01-1.903 1.903 1.903 1.903 0 01-1.902-1.903v-4.762z" fill="#E01E5A"/>
          <path d="M9.053 6.194a1.903 1.903 0 01-1.902-1.902 1.903 1.903 0 011.902-1.903 1.903 1.903 0 011.903 1.903v1.902H9.053zm0 .963a1.903 1.903 0 011.903 1.902 1.903 1.903 0 01-1.903 1.903H4.29a1.903 1.903 0 01-1.903-1.903 1.903 1.903 0 011.903-1.902h4.762z" fill="#36C5F0"/>
          <path d="M17.806 9.06a1.903 1.903 0 011.902-1.903A1.903 1.903 0 0121.612 9.06a1.903 1.903 0 01-1.903 1.902h-1.903V9.059zm-.957 0a1.903 1.903 0 01-1.903 1.902 1.903 1.903 0 01-1.902-1.903V4.29a1.903 1.903 0 011.902-1.903 1.903 1.903 0 011.903 1.903V9.06z" fill="#2EB67D"/>
          <path d="M14.946 17.806a1.903 1.903 0 011.903 1.902 1.903 1.903 0 01-1.903 1.903 1.903 1.903 0 01-1.902-1.903v-1.902h1.902zm0-.957a1.903 1.903 0 01-1.902-1.903 1.903 1.903 0 011.902-1.902h4.762a1.903 1.903 0 011.903 1.902 1.903 1.903 0 01-1.903 1.903h-4.762z" fill="#ECB22E"/>
        </svg>
      )
    case 'jira':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path d="M12.005 2L5.235 8.77l3.18 3.18L12.005 8.36l3.59 3.59 3.18-3.18L12.005 2z" fill="#2684FF"/>
          <path d="M8.415 11.95L5.235 15.13 12.005 21.9l6.77-6.77-3.18-3.18-3.59 3.59-3.59-3.59z" fill="#2684FF"/>
          <path d="M12.005 8.36L8.415 11.95l3.59 3.59 3.59-3.59-3.59-3.59z" fill="#2684FF" fillOpacity="0.4"/>
        </svg>
      )
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
  }
}

/* ═══════════════════════════════════════════════════════════
   MAIN EXPORT: ProfileMenu
   ═══════════════════════════════════════════════════════════ */
export default function ProfileMenu({ user, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ bottom: 0, left: 0 })
  const [activeModal, setActiveModal] = useState(null) // 'profile' | 'settings' | 'help'
  const triggerRef = useRef(null)

  /* ── Profile edit state ── */
  const [displayName, setDisplayName] = useState(user?.username || '')
  const [username, setUsername] = useState(user?.username || '')
  const [profileSaved, setProfileSaved] = useState(false)

  /* ── Settings state ── */
  const [settingsTab, setSettingsTab] = useState('personalization')
  const [personalizationText, setPersonalizationText] = useState(() => getPreference('zenith_custom_instructions', ''))
  const [prefSaved, setPrefSaved] = useState(false)
  const [prefSaving, setPrefSaving] = useState(false)

  /* ── Connectors state ── */
  const [connectedIds, setConnectedIds] = useState([])        // ids that are fully connected
  const [connectingId, setConnectingId] = useState(null)       // id whose form is open
  const [connectorForms, setConnectorForms] = useState({})     // { [id]: { field: value, ... } }
  const [connectorSaved, setConnectorSaved] = useState(null)   // id that just saved
  const [apiReferOpen, setApiReferOpen] = useState({})         // { [id]: bool }

  /* sync user data */
  useEffect(() => {
    if (user) {
      setDisplayName(user.username || '')
      setUsername(user.username || '')
    }
  }, [user])

  /* ── Toggle menu ── */
  const toggleMenu = useCallback(() => {
    if (!menuOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setMenuPos({
        bottom: window.innerHeight - rect.top + 8,
        left: rect.left,
      })
    }
    setMenuOpen(v => !v)
  }, [menuOpen])

  /* ── Close menu on outside click ── */
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => {
      if (triggerRef.current?.contains(e.target)) return
      // Don't close if clicking inside the portal menu
      const menu = document.getElementById('pm-popup-menu')
      if (menu?.contains(e.target)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  /* ── Close menu on Escape ── */
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (activeModal) setActiveModal(null)
        else if (menuOpen) setMenuOpen(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [menuOpen, activeModal])

  /* ── Menu item click handlers ── */
  const openModal = (modal) => {
    setMenuOpen(false)
    setActiveModal(modal)
    if (modal === 'settings') { setSettingsTab('personalization'); setPersonalizationText(getPreference('zenith_custom_instructions', '')); setPrefSaved(false) }
    if (modal === 'profile') setProfileSaved(false)
  }

  const handleLogout = () => {
    setMenuOpen(false)
    onLogout()
  }

  const handleSaveProfile = () => {
    // In a real app, call API here
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2000)
  }

  /* ── Connector helpers ── */
  const getDefaultFormFields = (conn) => {
    if (conn?.type === 'zoho') {
      return { client_id: '', client_secret: '', redirect_url: '' }
    }
    if (conn?.authType === 'header') {
      return { api_key: '', header_type: '' }
    }
    return { api_key: '', provider: '', header_type: '' }
  }

  const handleConnectorFieldChange = (connId, field, value) => {
    setConnectorForms(prev => ({
      ...prev,
      [connId]: { ...(prev[connId] || {}), [field]: value },
    }))
  }

  const openConnectorForm = (connector) => {
    if (!connectorForms[connector.id]) {
      setConnectorForms(prev => ({ ...prev, [connector.id]: getDefaultFormFields() }))
    }
    setConnectingId(connector.id)
  }

  const closeConnectorForm = () => {
    setConnectingId(null)
  }

  const handleConnectorSave = (connId) => {
    const form = connectorForms[connId] || {}
    const conn = DEFAULT_CONNECTORS.find(c => c.id === connId)
    if (conn?.type === 'zoho') {
      if (!form.client_id?.trim() || !form.client_secret?.trim() || !form.redirect_url?.trim()) return
    } else if (conn?.authType === 'header') {
      if (!form.api_key?.trim() || !form.header_type?.trim()) return
    } else {
      if (!form.api_key?.trim()) return
    }
    setConnectedIds(prev => prev.includes(connId) ? prev : [...prev, connId])
    setConnectorSaved(connId)
    setTimeout(() => { setConnectorSaved(null); setConnectingId(null) }, 1500)
  }

  const handleDisconnect = (connId) => {
    setConnectedIds(prev => prev.filter(id => id !== connId))
    setConnectorForms(prev => { const n = { ...prev }; delete n[connId]; return n })
  }

  const toggleApiRefer = (connId) => {
    setApiReferOpen(prev => ({ ...prev, [connId]: !prev[connId] }))
  }

  const userInitials = user?.username
    ? user.username.substring(0, 2).toUpperCase()
    : 'NA'

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */
  return (
    <>
      {/* ── Trigger: Profile row in sidebar footer ── */}
      <div className="pm-trigger" ref={triggerRef} onClick={toggleMenu} role="button" tabIndex={0}>
        <div className="pm-avatar">{userInitials}</div>
        <div className="pm-user-info">
          <span className="pm-user-name">{user?.username || 'User'}</span>
          <span className="pm-user-plan">Free</span>
        </div>
        <svg className="pm-dots" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="3" r="1.2" fill="currentColor"/>
          <circle cx="8" cy="8" r="1.2" fill="currentColor"/>
          <circle cx="8" cy="13" r="1.2" fill="currentColor"/>
        </svg>
      </div>

      {/* ── Popup Menu (portal) ── */}
      {menuOpen && createPortal(
        <div className="pm-menu-overlay">
          <div
            id="pm-popup-menu"
            className="pm-menu"
            style={{ bottom: menuPos.bottom, left: menuPos.left }}
          >
            {/* User info header */}
            <div className="pm-menu-header">
              <div className="pm-menu-avatar">{userInitials}</div>
              <div className="pm-menu-user">
                <span className="pm-menu-name">{user?.username || 'User'}</span>
                <span className="pm-menu-handle">@{user?.username || 'user'}</span>
              </div>
            </div>

            <div className="pm-menu-divider" />

            {/* Menu items */}
            <button className="pm-menu-item" onClick={() => openModal('profile')}>
              <div className="pm-menu-item-avatar">{userInitials}</div>
              <span>Profile</span>
            </button>

            <button className="pm-menu-item" onClick={() => openModal('settings')}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M7.5 2h3l.4 2.1a5.5 5.5 0 011.3.8l2-.8 1.5 2.6-1.6 1.3a5.8 5.8 0 010 1.6l1.6 1.3-1.5 2.6-2-.8a5.5 5.5 0 01-1.3.8L10.5 16h-3l-.4-2.1a5.5 5.5 0 01-1.3-.8l-2 .8-1.5-2.6 1.6-1.3a5.8 5.8 0 010-1.6L2.3 7.1l1.5-2.6 2 .8a5.5 5.5 0 011.3-.8L7.5 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
              <span>Settings</span>
            </button>

            <button className="pm-menu-item pm-menu-item-help" onClick={() => openModal('help')}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M6.5 7a2.5 2.5 0 015 0c0 1.5-2.5 1.5-2.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <circle cx="9" cy="13" r="0.8" fill="currentColor"/>
              </svg>
              <span>Help</span>
              <svg className="pm-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            <div className="pm-menu-divider" />

            <button className="pm-menu-item pm-menu-logout" onClick={handleLogout}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M6.5 2.5H4A1.5 1.5 0 002.5 4v10A1.5 1.5 0 004 15.5h2.5M12 12.5l3.5-3.5L12 5.5M7 9h8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Log out</span>
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ═══════════════════════════════════════════════════════════
         MODALS
         ═══════════════════════════════════════════════════════════ */}

      {/* ── Edit Profile Modal ── */}
      {activeModal === 'profile' && createPortal(
        <div className="pm-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="pm-modal pm-modal-profile" onClick={e => e.stopPropagation()}>
            <h2 className="pm-modal-title">Edit profile</h2>

            <div className="pm-profile-avatar-section">
              <div className="pm-profile-avatar-large">{userInitials}</div>
              
            </div>

            <div className="pm-form-group">
              <label className="pm-form-label">Display name</label>
              <input
                type="text"
                className="pm-form-input"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Your display name"
              />
            </div>

            <div className="pm-form-group">
              <label className="pm-form-label">Username</label>
              <input
                type="text"
                className="pm-form-input"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Your username"
              />
            </div>

            <p className="pm-profile-hint">
              Your profile helps people recognize you. Your name and username are also used in the Zenith app.
            </p>

            <div className="pm-modal-actions">
              <button className="pm-btn pm-btn-cancel" onClick={() => setActiveModal(null)}>Cancel</button>
              <button className="pm-btn pm-btn-save" onClick={handleSaveProfile}>
                {profileSaved ? '✓ Saved' : 'Save'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Settings Modal (Personalization, Connectors, Account) ── */}
      {activeModal === 'settings' && createPortal(
        <div className="pm-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="pm-modal pm-modal-settings" onClick={e => e.stopPropagation()}>
            {/* Close button */}
            <button className="pm-settings-close" onClick={() => setActiveModal(null)}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>

            <div className="pm-settings-layout">
              {/* Sidebar tabs */}
              <nav className="pm-settings-nav">
                <button
                  className={`pm-settings-tab ${settingsTab === 'personalization' ? 'pm-settings-tab-active' : ''}`}
                  onClick={() => setSettingsTab('personalization')}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.9 2.9l1.4 1.4M11.7 11.7l1.4 1.4M2.9 13.1l1.4-1.4M11.7 4.3l1.4-1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  Personalization
                </button>
                <button
                  className={`pm-settings-tab ${settingsTab === 'connectors' ? 'pm-settings-tab-active' : ''}`}
                  onClick={() => setSettingsTab('connectors')}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M5.5 2v3.5a1.5 1.5 0 003 0V2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    <path d="M7 5.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    <circle cx="7" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M12 6.5a2 2 0 00-2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    <path d="M13.5 6.5a3.5 3.5 0 00-3.5-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  Connectors
                </button>
                <button
                  className={`pm-settings-tab ${settingsTab === 'account' ? 'pm-settings-tab-active' : ''}`}
                  onClick={() => setSettingsTab('account')}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  Account
                </button>
              </nav>

              {/* Content area */}
              <div className="pm-settings-content">
                {/* Personalization */}
                {settingsTab === 'personalization' && (
                  <div className="pm-settings-panel">
                    <h3 className="pm-settings-heading">Personalization</h3>
                    <p className="pm-settings-desc">
                      Tell Zenith about yourself so it can give better, more tailored responses.
                    </p>

                    {/* ── Theme Selector ── */}
                    <div className="pm-form-group">
                      <label className="pm-form-label">Theme</label>
                      <p className="pm-form-hint" style={{ marginBottom: 8 }}>
                        Toggle between dark and light appearance.
                      </p>
                      <ThemeToggle size="md" />
                    </div>

                    <div className="pm-form-group">
                      <label className="pm-form-label">About you</label>
                      <textarea
                        className="pm-form-textarea"
                        rows={6}
                        value={personalizationText}
                        onChange={e => setPersonalizationText(e.target.value)}
                        placeholder="What do you do? What are you working on? What are your preferences for how Zenith should respond?"
                      />
                      <span className="pm-form-hint">{personalizationText.length}/1500 characters</span>
                    </div>
                    <div className="pm-settings-panel-actions">
                      <button
                        className="pm-btn pm-btn-save"
                        disabled={prefSaving}
                        onClick={async () => {
                          setPrefSaving(true)
                          try {
                            await savePreferenceAsync('zenith_custom_instructions', personalizationText)
                            setPrefSaved(true)
                            setTimeout(() => setPrefSaved(false), 2000)
                          } catch (err) {
                            console.error('[ProfileMenu] Failed to save preferences:', err.message)
                            // Determine if this is a transient server error or an auth issue
                            const msg = err.message || ''
                            const isAuthError = /unauthorized|401/i.test(msg)
                            const isServerError = /^(5\d\d|502|503|Cannot reach|network)/i.test(msg)
                            if (isAuthError) {
                              alert('Your session has expired. Please log in again.')
                            } else if (isServerError) {
                              alert('The server is temporarily unavailable. Your preferences are saved locally and will sync when the server is back.')
                            } else {
                              alert('Failed to save preferences. Please try again.')
                            }
                          } finally {
                            setPrefSaving(false)
                          }
                        }}
                      >
                        {prefSaving ? 'Saving…' : prefSaved ? '✓ Saved' : 'Save preferences'}
                      </button>
                    </div>
                  </div>
                )}

                {/* ═══════ Connectors Tab ═══════ */}
                {settingsTab === 'connectors' && (
                  <div className="pm-settings-panel">
                    <div className="pm-connectors-header">
                      <div>
                        <h3 className="pm-settings-heading">Connectors</h3>
                        <p className="pm-settings-desc" style={{ marginBottom: 0 }}>
                          Allow Zenith to reference other apps and services for more context.
                        </p>
                      </div>
                    </div>

                    {/* Connector list */}
                    <div className="pm-connectors-list">
                      {DEFAULT_CONNECTORS.map(conn => {
                        const isConnected  = connectedIds.includes(conn.id)
                        const isFormOpen   = connectingId === conn.id
                        const form         = connectorForms[conn.id] || getDefaultFormFields(conn)
                        const justSaved    = connectorSaved === conn.id
                        const isApiRefOpen = apiReferOpen[conn.id]

                        return (
                          <div
                            key={conn.id}
                            className={`pm-connector-card ${isConnected ? 'pm-connector-connected' : 'pm-connector-disconnected'} ${isFormOpen ? 'pm-connector-expanded' : ''}`}
                          >
                            {/* ── Card row ── */}
                            <div className="pm-connector-row">
                              <div className={`pm-connector-logo ${!isConnected && !isFormOpen ? 'pm-connector-logo-blurred' : ''}`}>
                                {conn.logo
                                  ? <img src={conn.logo} alt={conn.name} />
                                  : <ConnectorIcon icon={conn.icon} size={28} />
                                }
                              </div>
                              <div className={`pm-connector-info ${!isConnected && !isFormOpen ? 'pm-connector-info-blurred' : ''}`}>
                                <span className="pm-connector-name">{conn.name}</span>
                                <span className="pm-connector-desc">{conn.desc}</span>
                              </div>
                              <div className="pm-connector-actions">
                                {isConnected ? (
                                  <>
                                    <span className="pm-connector-badge">
                                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                      </svg>
                                      Connected
                                    </span>
                                    <button className="pm-btn pm-btn-sm pm-btn-disconnect" onClick={() => handleDisconnect(conn.id)}>
                                      Disconnect
                                    </button>
                                  </>
                                ) : isFormOpen ? (
                                  <button className="pm-btn pm-btn-sm pm-btn-cancel" onClick={closeConnectorForm}>
                                    Cancel
                                  </button>
                                ) : (
                                  <button className="pm-btn pm-btn-sm pm-btn-connect" onClick={() => openConnectorForm(conn)}>
                                    Connect
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* ── Expanded connection form ── */}
                            {isFormOpen && (
                              <div className="pm-connector-form">
                                <div className="pm-connector-form-divider" />

                                <div className="pm-connector-form-body">
                                  {conn.type === 'zoho' ? (
                                    <>
                                      <p className="pm-connector-form-title">
                                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                          <path d="M7 1v5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2"/>
                                        </svg>
                                        Zoho OAuth Credentials
                                      </p>
                                      <div className="pm-connector-fields-grid">
                                        <div className="pm-form-group">
                                          <label className="pm-form-label">Client ID <span className="pm-field-required">*</span></label>
                                          <input
                                            type="text"
                                            className="pm-form-input"
                                            placeholder="Enter Client ID"
                                            value={form.client_id || ''}
                                            onChange={e => handleConnectorFieldChange(conn.id, 'client_id', e.target.value)}
                                          />
                                        </div>
                                        <div className="pm-form-group">
                                          <label className="pm-form-label">Client Secret <span className="pm-field-required">*</span></label>
                                          <input
                                            type="password"
                                            className="pm-form-input"
                                            placeholder="Enter Client Secret"
                                            value={form.client_secret || ''}
                                            onChange={e => handleConnectorFieldChange(conn.id, 'client_secret', e.target.value)}
                                          />
                                        </div>
                                        <div className="pm-form-group pm-form-group-full">
                                          <label className="pm-form-label">Redirect URL <span className="pm-field-required">*</span></label>
                                          <input
                                            type="url"
                                            className="pm-form-input"
                                            placeholder="https://yourdomain.com/callback"
                                            value={form.redirect_url || ''}
                                            onChange={e => handleConnectorFieldChange(conn.id, 'redirect_url', e.target.value)}
                                          />
                                        </div>
                                      </div>
                                    </>
                                  ) : conn.authType === 'header' ? (
                                    <>
                                      <p className="pm-connector-form-title">
                                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                          <path d="M7 1v5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2"/>
                                        </svg>
                                        API Credentials (Header Auth)
                                      </p>
                                      <div className="pm-connector-fields-grid">
                                        <div className="pm-form-group pm-form-group-full">
                                          <label className="pm-form-label">API Key <span className="pm-field-required">*</span></label>
                                          <input
                                            type="password"
                                            className="pm-form-input"
                                            placeholder="Enter API Key"
                                            value={form.api_key || ''}
                                            onChange={e => handleConnectorFieldChange(conn.id, 'api_key', e.target.value)}
                                          />
                                        </div>
                                        <div className="pm-form-group pm-form-group-full">
                                          <label className="pm-form-label">Header Type <span className="pm-field-required">*</span></label>
                                          <input
                                            type="text"
                                            className="pm-form-input"
                                            placeholder="e.g. Bearer, token"
                                            value={form.header_type || ''}
                                            onChange={e => handleConnectorFieldChange(conn.id, 'header_type', e.target.value)}
                                          />
                                        </div>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <p className="pm-connector-form-title">
                                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                          <path d="M7 1v5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2"/>
                                        </svg>
                                        API Credentials
                                      </p>
                                      <div className="pm-connector-fields-grid">
                                        <div className="pm-form-group pm-form-group-full">
                                          <label className="pm-form-label">API Key <span className="pm-field-required">*</span></label>
                                          <input
                                            type="password"
                                            className="pm-form-input"
                                            placeholder="Enter API Key"
                                            value={form.api_key || ''}
                                            onChange={e => handleConnectorFieldChange(conn.id, 'api_key', e.target.value)}
                                          />
                                        </div>
                                        <div className="pm-form-group">
                                          <label className="pm-form-label">Provider</label>
                                          <input
                                            type="text"
                                            className="pm-form-input"
                                            placeholder={`e.g. ${conn.name.toLowerCase()}`}
                                            value={form.provider || ''}
                                            onChange={e => handleConnectorFieldChange(conn.id, 'provider', e.target.value)}
                                          />
                                        </div>
                                        <div className="pm-form-group">
                                          <label className="pm-form-label">Header Type</label>
                                          <input
                                            type="text"
                                            className="pm-form-input"
                                            placeholder="e.g. Bearer"
                                            value={form.header_type || ''}
                                            onChange={e => handleConnectorFieldChange(conn.id, 'header_type', e.target.value)}
                                          />
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>

                                {/* ── API Refer section ── */}
                                <div className="pm-api-refer">
                                  <button className="pm-api-refer-toggle" onClick={() => toggleApiRefer(conn.id)}>
                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2"/>
                                      <path d="M7 4v4M7 10v.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                                    </svg>
                                    API Reference
                                    <svg
                                      className={`pm-api-refer-chevron ${isApiRefOpen ? 'pm-api-refer-chevron-open' : ''}`}
                                      width="12" height="12" viewBox="0 0 12 12" fill="none"
                                    >
                                      <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  </button>
                                  {isApiRefOpen && (
                                    <div className="pm-api-refer-content">
                                      <p>Refer to the official API documentation for authentication details and available endpoints:</p>
                                      <a
                                        href={conn.docsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="pm-api-refer-link"
                                      >
                                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                          <path d="M5.5 2.5H3a1 1 0 00-1 1v7.5a1 1 0 001 1h7.5a1 1 0 001-1V8.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                                          <path d="M8 2h4v4M7 7l5-5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                        {conn.name} API Documentation
                                      </a>
                                      <div className="pm-api-refer-note">
                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                          <path d="M6 1v4l2.5 2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                                          <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.1"/>
                                        </svg>
                                        {conn.type === 'zoho'
                                          ? 'Generate OAuth credentials from the Zoho API Console and paste them above.'
                                          : 'Generate an API key from your provider\'s dashboard and paste it above.'
                                        }
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* ── Save button ── */}
                                <div className="pm-connector-form-actions">
                                  <button
                                    className="pm-btn pm-btn-save pm-btn-sm"
                                    onClick={() => handleConnectorSave(conn.id)}
                                    disabled={conn.type === 'zoho'
                                      ? (!form.client_id?.trim() || !form.client_secret?.trim() || !form.redirect_url?.trim())
                                      : conn.authType === 'header'
                                        ? (!form.api_key?.trim() || !form.header_type?.trim())
                                        : (!form.api_key?.trim())
                                    }
                                  >
                                    {justSaved ? '✓ Connected' : 'Save & Connect'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Account */}
                {settingsTab === 'account' && (
                  <div className="pm-settings-panel">
                    <h3 className="pm-settings-heading">Account</h3>
                    <p className="pm-settings-desc">Manage your Zenith account details and preferences.</p>

                    <div className="pm-account-info">
                      <div className="pm-account-row">
                        <span className="pm-account-label">Email</span>
                        <span className="pm-account-value">{user?.email || 'user@example.com'}</span>
                      </div>
                      <div className="pm-account-row">
                        <span className="pm-account-label">Username</span>
                        <span className="pm-account-value">@{user?.username || 'user'}</span>
                      </div>
                      <div className="pm-account-row">
                        <span className="pm-account-label">Plan</span>
                        <span className="pm-account-value pm-account-plan">Free plan</span>
                      </div>
                    </div>

                    <div className="pm-account-danger">
                      <h4>Danger zone</h4>
                      <p>Permanently delete your account and all associated data. This action cannot be undone.</p>
                      <button className="pm-btn pm-btn-danger">Delete account</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Help Center Modal ── */}
      {activeModal === 'help' && createPortal(
        <div className="pm-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="pm-modal pm-modal-help" onClick={e => e.stopPropagation()}>
            <button className="pm-settings-close" onClick={() => setActiveModal(null)}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>

            <div className="pm-help-content">
              <div className="pm-help-icon">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="20" stroke="var(--brand-primary)" strokeWidth="2.5"/>
                  <path d="M17 20a7 7 0 0114 0c0 4-7 4-7 8" stroke="var(--brand-primary)" strokeWidth="2.5" strokeLinecap="round"/>
                  <circle cx="24" cy="35" r="1.8" fill="var(--brand-primary)"/>
                </svg>
              </div>
              <h2 className="pm-help-title">Help Center</h2>
              <p className="pm-help-subtitle">Get help with Zenith</p>

              <div className="pm-help-cards">
                <div className="pm-help-card">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                  <h4>Getting Started</h4>
                  <p>Learn the basics of using Zenith for your projects.</p>
                </div>
                <div className="pm-help-card">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                  <h4>Chat Features</h4>
                  <p>Upload files, images, and use AI-powered conversations.</p>
                </div>
                <div className="pm-help-card">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                    <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                    <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                    <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                  <h4>Zoho Integrations</h4>
                  <p>Connect Cliq, Meeting, Connect, and Notes.</p>
                </div>
                <div className="pm-help-card">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                  <h4>Privacy & Security</h4>
                  <p>How we keep your data safe and secure.</p>
                </div>
              </div>

              <div className="pm-help-footer">
                <p>Need more help? <a href="mailto:support@zenith.com">Contact support</a></p>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Upgrade Modal (simple placeholder) ── */}
      {activeModal === 'upgrade' && createPortal(
        <div className="pm-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="pm-modal pm-modal-upgrade" onClick={e => e.stopPropagation()}>
            <button className="pm-settings-close" onClick={() => setActiveModal(null)}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            <div className="pm-upgrade-content">
              <div className="pm-upgrade-icon">⭐</div>
              <h2>Upgrade to Pro</h2>
              <p>Get unlimited conversations, priority support, and advanced features.</p>
              <button className="pm-btn pm-btn-save" style={{marginTop: '16px'}}>Coming soon</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
