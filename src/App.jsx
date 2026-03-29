import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { ProjectStatusProvider } from './context/ProjectStatusContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import GlobalThemeToggle from './components/GlobalThemeToggle.jsx'
import LandingPage from './pages/LandingPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import ChatPage from './pages/ChatPage.jsx'
import ExplorerPage from './pages/ExplorerPage.jsx'
import TaskManager from './components/tasks/TaskManager.jsx'
import { setRouterNavigate } from './utils/api.js'

/**
 * Bridge component that registers React Router's navigate function
 * with the API module so that 401 redirects use client-side routing
 * instead of a full page refresh (window.location.href).
 */
function NavigateSetter() {
  const navigate = useNavigate()
  useEffect(() => {
    setRouterNavigate(navigate)
  }, [navigate])
  return null
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ProjectStatusProvider>
          <NavigateSetter />
          {/* Global floating theme toggle — visible on pages without an embedded toggle */}
          <GlobalThemeToggle />
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <ChatPage />
                </ProtectedRoute>
              }
            />
            {/* /workspace — fully separate standalone Explorer page */}
            <Route
              path="/workspace"
              element={
                <ProtectedRoute>
                  <ExplorerPage />
                </ProtectedRoute>
              }
            />
            {/* /tasks — full-screen Scheduled Tasks manager */}
            <Route
              path="/tasks"
              element={
                <ProtectedRoute>
                  <div style={{ height: '100vh' }}>
                    <TaskManager />
                  </div>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ProjectStatusProvider>
      </ThemeProvider>
    </AuthProvider>
  )
}
