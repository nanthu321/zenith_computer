import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import ThemeToggle from '../components/ThemeToggle.jsx'
import MouseGlow from '../components/MouseGlow.jsx'
import zenithLogo from '../assets/zenith.png'
import powerLogo from '../assets/power.png'

import './LandingPage.css'

const FEATURES = [
  {
    icon: 'fa-solid fa-bolt',
    title: 'Live Code Execution',
    desc: 'Run Python, JavaScript, and Bash directly in the cloud. See results in real time.',
    color: '#f59e0b',
  },
  {
    icon: 'fa-solid fa-folder-open',
    title: 'Project Generation',
    desc: 'Ask Zenith to build complete multi-file projects. Download as ZIP instantly.',
    color: '#10b981',
  },
  {
    icon: 'fa-solid fa-globe',
    title: 'Web Intelligence',
    desc: 'Search the internet for live data — prices, news, stocks — and process it instantly.',
    color: '#3b82f6',
  },
  {
    icon: 'fa-solid fa-clock',
    title: 'Autonomous Scheduling',
    desc: 'Schedule recurring tasks that run 24/7 even when you\'re offline. Excel reports included.',
    color: '#226DB4',
  },
  {
    icon: 'fa-solid fa-brain',
    title: 'Claude AI Powered',
    desc: 'Backed by Anthropic\'s Claude — the most capable AI model for complex reasoning.',
    color: '#ec4899',
  },
  {
    icon: 'fa-solid fa-shield-halved',
    title: 'Secure & Isolated',
    desc: 'Every user gets a sandboxed workspace. Your data and code never cross boundaries.',
    color: '#06b6d4',
  },
]

const DEMO_MESSAGES = [
  { role: 'user',      text: 'Build me a gold price tracker that runs every 3 hours and logs to Excel' },
  { role: 'assistant', text: 'I\'ll create that for you! Setting up a web search → extract → Excel pipeline...' },
  { role: 'tool',      tool: 'schedule_task', status: '✅ Scheduled — runs every 3h for 30 days' },
  { role: 'assistant', text: 'Done! Your gold tracker is live. It will search, extract the current rate, and append it to gold_prices.xlsx every 3 hours. Check the Tasks tab to monitor progress.' },
]

export default function LandingPage() {
  const { user, loading } = useAuth()
  const heroRef           = useRef(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), [])

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 768) setMobileMenuOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileMenuOpen])

  // Parallax effect on hero
  useEffect(() => {
    const el = heroRef.current
    if (!el) return
    const onMouseMove = (e) => {
      const { innerWidth, innerHeight } = window
      const x = (e.clientX - innerWidth  / 2) / innerWidth  * 20
      const y = (e.clientY - innerHeight / 2) / innerHeight * 20
      el.style.setProperty('--hero-x', `${x}px`)
      el.style.setProperty('--hero-y', `${y}px`)
    }
    window.addEventListener('mousemove', onMouseMove)
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [])

  return (
<div className="landing">
      {/* Antigravity confetti background */}
      <MouseGlow />
      {/* ── Navbar ── */}
<nav className="landing-nav">
        <Link to="/" className="nav-brand" onClick={closeMobileMenu}>
          <img src={zenithLogo} alt="Zenith Logo" className="nav-brand-logo" />
          <span className="nav-brand-name">Zenith</span>
        </Link>

        <div className="nav-actions">
          <ThemeToggle size="sm" />
          {!loading && !user && (
            <>
              <Link to="/login"    className="btn btn-ghost">Sign In</Link>
              <Link to="/register" className="btn btn-primary">Get Started</Link>
            </>
          )}
          <button
            className="nav-mobile-toggle"
            onClick={() => setMobileMenuOpen(prev => !prev)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </nav>

      {/* ── Mobile Menu Overlay ── */}
      <div className={`nav-mobile-menu ${mobileMenuOpen ? 'open' : ''}`}>
        <a href="#features" className="mobile-nav-link" onClick={closeMobileMenu}>⚡ Features</a>
        <a href="#demo" className="mobile-nav-link" onClick={closeMobileMenu}>💬 Demo</a>
        <div className="nav-mobile-divider" />
        <div className="nav-mobile-actions">
          {!loading && !user && (
            <>
              <Link to="/login" className="btn btn-ghost" onClick={closeMobileMenu}>Sign In</Link>
              <Link to="/register" className="btn btn-primary" onClick={closeMobileMenu}>Get Started — Free</Link>
            </>
          )}
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="landing-hero" ref={heroRef}>
        <div className="hero-badge">

          <img src={powerLogo} alt="Zenith Logo" className="badge-dot" />
          Powered by Claude AI · Now in Beta
        </div>

        <h1 className="hero-title">
          Your AI Agent That
          <span className="hero-title-gradient"> Actually Executes</span>
        </h1>

        <p className="hero-subtitle">
          Zenith doesn&apos;t just answer questions — it runs your code, creates full projects,
          searches the web, and automates recurring tasks 24/7. All in one chat.
        </p>

        <div className="hero-actions">
          {!loading && !user ? (
            <Link to="/register" className="btn btn-primary btn-xl">
              <span>Start for Free</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          ) : !loading && user ? (
            <Link to="/chat" className="btn btn-primary btn-xl">
              <span>Access Zenith</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          ) : null}
        </div>

        <div className="hero-stats">
          <div className="stat"><span className="stat-number">7</span><span className="stat-label">AI Tools</span></div>
          <div className="stat-divider" />
          <div className="stat"><span className="stat-number">∞</span><span className="stat-label">Scheduled Tasks</span></div>
          <div className="stat-divider" />
          <div className="stat"><span className="stat-number">3</span><span className="stat-label">Languages</span></div>
        </div>
      </section>

      {/* ── Demo Preview ── */}
      <section className="landing-demo" id="demo">
        <div className="demo-window">
          <div className="demo-titlebar">
            <div className="demo-dots">
              <span /><span /><span />
            </div>
            <span className="demo-title">Zenith Chat</span>
          </div>
          <div className="demo-sidebar">
            <div className="demo-nav-item demo-nav-active">
              <span>💬</span> Chats
            </div>
            <div className="demo-nav-item">
              <span>⏰</span> Tasks
            </div>
            <div className="demo-nav-item">
              <span>📁</span> Projects
            </div>
            <div className="demo-session">
              <span className="demo-session-dot" />
              Gold price tracker
            </div>
          </div>
          <div className="demo-chat">
            {DEMO_MESSAGES.map((msg, i) => (
              <div
                key={i}
                className={`demo-msg demo-msg-${msg.role}`}
                style={{ animationDelay: `${i * 0.15}s` }}
              >
                {msg.role === 'tool' ? (
                  <div className="demo-tool-card">
                    <span className="demo-tool-icon">⏰</span>
                    <div>
                      <div className="demo-tool-name">schedule_task</div>
                      <div className="demo-tool-status">{msg.status}</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="demo-msg-avatar">
                      {msg.role === 'user' ? '👤' : '✦'}
                    </div>
                    <div className="demo-msg-bubble">{msg.text}</div>
                  </>
                )}
              </div>
            ))}
            <div className="demo-input-row">
              <div className="demo-input">Ask Zenith anything...</div>
              <button className="demo-send-btn">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M14 2L2 7l5 1.5L8.5 14 14 2z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="landing-features" id="features">
        <div className="section-header">
          <h2 className="section-title">Everything you need in one agent</h2>
          <p className="section-subtitle">
            Zenith combines intelligent conversation with real-world execution capabilities
          </p>
        </div>

        <div className="features-grid">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="feature-card"
              style={{ '--feature-color': f.color, animationDelay: `${i * 0.08}s` }}
            >
              <div className="feature-header">
                <div className="feature-icon" style={{ color: f.color }}>
                  <i className={f.icon}></i>
                </div>
                <h3 className="feature-title">{f.title}</h3>
              </div>
              <p className="feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="landing-cta">
        <div className="cta-inner">
          <img src={zenithLogo} alt="Zenith Logo" className="cta-logo" />
          <h2 className="cta-title">Ready to connect the dots?</h2>
          <p className="cta-subtitle">Start chatting with Zenith and see what your ideas can become.</p>
          {!loading && !user ? (
            <Link to="/register" className="btn btn-primary btn-xl">
              Create Free Account
            </Link>
          ) : !loading && user ? (
            <Link to="/chat" className="btn btn-primary btn-xl">
              Access Zenith →
            </Link>
          ) : null}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <span className="footer-copy">© Copyright 2026 Zenith</span>
      </footer>
    </div>
  )
}
