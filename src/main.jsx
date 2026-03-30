import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './App.css'
import { registerStreamWorker } from './utils/streamWorkerManager.js'

// Register the stream Service Worker early so it's ready before any chat starts.
// This runs once on page load (including after a refresh).
registerStreamWorker().then((reg) => {
  if (reg) {
    console.log('[main] Stream Service Worker ready')
  } else {
    console.log('[main] Stream Service Worker not available — fallback to direct streaming')
  }
}).catch(() => {
  // SW registration failed — app will fall back to direct fetch streaming
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
