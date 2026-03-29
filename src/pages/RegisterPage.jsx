import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import zenithLogo from '../assets/zenith.png'
import ThemeToggle from '../components/ThemeToggle.jsx'
import './AuthPages.css'

export default function RegisterPage() {
  const { register, user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [form, setForm]           = useState({ username: '', email: '', password: '' })
  const [errors, setErrors]       = useState({})
  const [loading, setLoading]     = useState(false)
  const [serverErr, setServerErr] = useState('')
  const [showPwd, setShowPwd]     = useState(false)
  const [pwdStrength, setPwdStrength] = useState(0)

  useEffect(() => {
    if (!authLoading && user) navigate('/chat', { replace: true })
  }, [user, authLoading, navigate])

  // Password strength
  useEffect(() => {
    const p = form.password
    let s = 0
    if (p.length >= 6)  s++
    if (p.length >= 10) s++
    if (/[A-Z]/.test(p)) s++
    if (/[0-9]/.test(p)) s++
    if (/[^A-Za-z0-9]/.test(p)) s++
    setPwdStrength(s)
  }, [form.password])

  const validate = () => {
    const errs = {}
    if (!form.username.trim())         errs.username = 'Username is required'
    else if (form.username.length < 3) errs.username = 'Username must be at least 3 characters'
    if (!form.email.trim())            errs.email    = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Enter a valid email'
    if (!form.password.trim())         errs.password = 'Password is required'
    else if (form.password.length < 6) errs.password = 'Password must be at least 6 characters'
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setServerErr('')
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setLoading(true)
    try {
      await register(form.username.trim(), form.email.trim(), form.password)
      navigate('/chat', { replace: true })
    } catch (err) {
      setServerErr(err.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const onChange = (field) => (e) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
    if (serverErr) setServerErr('')
  }

  const strengthLabel  = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'][pwdStrength]
  const strengthColor  = ['', '#ef4444', '#f59e0b', '#eab308', '#10b981', '#10b981'][pwdStrength]

  return (
    <div className="auth-page">
      <div className="auth-bg">
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-grid" />
      </div>

      <div className="auth-card">
        <div className="auth-logo">
          <img src={zenithLogo} alt="Zenith Logo" className="auth-brand-logo" />
          <div>
            <h1 className="auth-brand">Zenith</h1>
            <p className="auth-brand-sub">Intelligent Task Agent</p>
          </div>
        </div>

        <h2 className="auth-title">Create your account</h2>
        <p className="auth-subtitle">Start building with AI-powered task execution</p>

        {serverErr && (
          <div className="auth-alert auth-alert-error" role="alert">
            <span className="alert-icon">⚠️</span>
            {serverErr}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {/* Username */}
          <div className="form-field">
            <label className="form-label" htmlFor="username">Username</label>
            <div className={`input-wrapper ${errors.username ? 'input-error' : ''}`}>
              <span className="input-icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </span>
              <input
                id="username"
                type="text"
                className="form-input"
                placeholder="johndoe"
                value={form.username}
                onChange={onChange('username')}
                autoComplete="username"
                autoFocus
              />
            </div>
            {errors.username && <span className="form-error">{errors.username}</span>}
          </div>

          {/* Email */}
          <div className="form-field">
            <label className="form-label" htmlFor="email">Email</label>
            <div className={`input-wrapper ${errors.email ? 'input-error' : ''}`}>
              <span className="input-icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4h12v8H2V4zm0 0l6 5 6-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              <input
                id="email"
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={form.email}
                onChange={onChange('email')}
                autoComplete="email"
              />
            </div>
            {errors.email && <span className="form-error">{errors.email}</span>}
          </div>

          {/* Password */}
          <div className="form-field">
            <label className="form-label" htmlFor="reg-password">Password</label>
            <div className={`input-wrapper ${errors.password ? 'input-error' : ''}`}>
              <span className="input-icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </span>
              <input
                id="reg-password"
                type={showPwd ? 'text' : 'password'}
                className="form-input"
                placeholder="At least 6 characters"
                value={form.password}
                onChange={onChange('password')}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="input-toggle"
                onClick={() => setShowPwd(v => !v)}
                aria-label={showPwd ? 'Hide password' : 'Show password'}
              >
                {showPwd ? (
                  /* Eye icon (password visible) */
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                ) : (
                  /* Eye-slash icon (password hidden) */
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                )}
              </button>
            </div>
            {errors.password && <span className="form-error">{errors.password}</span>}

            {/* Strength meter */}
            {form.password && (
              <div className="pwd-strength">
                <div className="pwd-bars">
                  {[1, 2, 3, 4, 5].map(n => (
                    <div
                      key={n}
                      className="pwd-bar"
                      style={{ background: n <= pwdStrength ? strengthColor : 'var(--border-default)' }}
                    />
                  ))}
                </div>
                <span className="pwd-label" style={{ color: strengthColor }}>
                  {strengthLabel}
                </span>
              </div>
            )}
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? (
              <span className="btn-loading">
                <span className="btn-spinner" />
                Creating account...
              </span>
            ) : (
              <>
                Create Account
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </>
            )}
          </button>
        </form>

        <p className="auth-footer-text">
          Already have an account?{' '}
          <Link to="/login" className="auth-link">Sign in</Link>
        </p>

        <Link to="/" className="auth-back-link">← Back to home</Link>

        <div className="auth-theme-toggle">
          <ThemeToggle showLabel size="sm" />
        </div>
      </div>
    </div>
  )
}
