/* eslint-env node */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import https from 'https'
import { URL } from 'url'

// Backend server
const BACKEND = 'https://backend-computer.onrender.com'

const BACKEND = 'https://frederic-dicephalous-corresponsively.ngrok-free.dev/backend1'

/**
 * Helper: decode the user_id from a JWT Bearer token (no verification).
 * Returns the user_id string or null.
 */
function extractUserIdFromJwt(authHeader) {
  if (!authHeader) return null
  const token = authHeader.replace(/^Bearer\s+/i, '')
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return String(payload.user_id || payload.sub || payload.id || '')
  } catch {
    return null
  }
}

//
// Custom middleware plugin to handle:
//   1. /api/workspace/* -- raw proxy (bypasses CORS header stripping)
//   2. /api/chat/<id>/send -- SSE streaming proxy (disables buffering for live events)
//
// Problem 1 (workspace): The backend requires an X-User-Id header, but the hosting
//           infrastructure (Cloudflare + Render) strips it before the
//           request reaches the Tomcat application.
//
// Problem 2 (SSE): Vite's built-in http-proxy buffers SSE (text/event-stream)
//           responses, which means all events arrive at once when the stream
//           closes instead of being delivered live as they are emitted.
//
// Solution: Both routes use Node.js's built-in 'https' module for raw
//           proxying with no buffering.  We explicitly set ONLY the headers
//           the backend needs: Authorization, X-User-Id, Content-Type.
//
function workspaceProxyPlugin() {
  return {
    name: 'workspace-proxy',
    configureServer(server) {
      // ── SSE Chat Proxy (MUST be registered before the generic /api proxy) ──
      // Matches: POST /api/chat/<sessionId>/send
      server.middlewares.use((req, res, next) => {
        // Only intercept POST /api/chat/*/send
        if (req.method !== 'POST' || !/^\/api\/chat\/[^/]+\/send/.test(req.url)) {
          return next()
        }

        const backendUrl = new URL(req.url, BACKEND)

        const auth = req.headers['authorization'] || ''
        const uid = extractUserIdFromJwt(auth) ||
                    req.headers['x-user-id'] || ''

        const proxyHeaders = {
          'Authorization': auth,
          'Content-Type': req.headers['content-type'] || 'application/json',
          'Accept': 'text/event-stream',
          'X-User-Id': uid,
          'ngrok-skip-browser-warning': 'true',
        }

        // Remove empty headers
        Object.keys(proxyHeaders).forEach(k => {
          if (!proxyHeaders[k]) delete proxyHeaders[k]
        })

        const options = {
          hostname: backendUrl.hostname,
          port: 443,
          path: backendUrl.pathname + backendUrl.search,
          method: 'POST',
          headers: proxyHeaders,
          rejectUnauthorized: false,
        }

        console.log(`[SSE-PROXY] POST ${options.path} | X-User-Id: ${uid || 'NONE'}`)

        const proxyReq = https.request(options, (proxyRes) => {
          // Forward ALL headers including content-type: text/event-stream
          // Add headers that prevent any intermediate buffering
          const headers = { ...proxyRes.headers }
          headers['cache-control'] = 'no-cache, no-transform'
          headers['x-accel-buffering'] = 'no'
          headers['connection'] = 'keep-alive'

          res.writeHead(proxyRes.statusCode, headers)

          // Stream data chunks to the browser immediately as they arrive
          proxyRes.on('data', (chunk) => {
            res.write(chunk)
            // Force flush — critical for SSE live delivery
            if (typeof res.flush === 'function') res.flush()
          })

          proxyRes.on('end', () => {
            res.end()
          })

          proxyRes.on('error', (err) => {
            console.error('[SSE-PROXY] Response stream error:', err.message)
            res.end()
          })
        })

        proxyReq.on('error', (err) => {
          console.error('[SSE-PROXY] Request error:', err.message)
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' })
          }
          res.end(JSON.stringify({ success: false, error: 'SSE Proxy error: ' + err.message }))
        })

        // Pipe the request body (message JSON) to the backend
        req.pipe(proxyReq, { end: true })
      })

      // ── Workspace Proxy (existing) ──
      server.middlewares.use('/api/workspace', (req, res) => {
        const backendUrl = new URL(req.url, BACKEND)
        backendUrl.pathname = '/api/workspace' + (req.url.split('?')[0] || '')
        backendUrl.search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''

        const auth = req.headers['authorization'] || ''
        const uid = extractUserIdFromJwt(auth) ||
                    req.headers['x-user-id'] || ''

        // Build minimal headers — only what the backend needs
        const proxyHeaders = {
          'Authorization': auth,
          'Content-Type': req.headers['content-type'] || 'application/json',
          'X-User-Id': uid,
          'ngrok-skip-browser-warning': 'true',
        }

        // Remove any empty headers
        Object.keys(proxyHeaders).forEach(k => {
          if (!proxyHeaders[k]) delete proxyHeaders[k]
        })

        const options = {
          hostname: backendUrl.hostname,
          port: 443,
          path: backendUrl.pathname + backendUrl.search,
          method: req.method,
          headers: proxyHeaders,
          // Don't reject self-signed certs
          rejectUnauthorized: false,
        }

        console.log(`[WS-PROXY] ${req.method} ${options.path} | X-User-Id: ${uid || 'NONE'}`)

        const proxyReq = https.request(options, (proxyRes) => {
          // Forward status and headers to the browser
          res.writeHead(proxyRes.statusCode, proxyRes.headers)
          proxyRes.pipe(res, { end: true })
        })

        proxyReq.on('error', (err) => {
          console.error('[WS-PROXY] Error:', err.message)
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' })
          }
          res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }))
        })

        // Forward request body for POST/PUT/DELETE
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          req.pipe(proxyReq, { end: true })
        } else {
          proxyReq.end()
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [
    workspaceProxyPlugin(),
    react(),
  ],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.mjs', 'src/**/*.test.js'],
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      // ── All /api/* routes ──
      // /api/workspace/* is intercepted first by workspaceProxyPlugin() middleware
      // which runs before the Vite proxy. Other routes go through this proxy.
      '/api': {
        target: BACKEND,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => `${path}`,
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Remove Origin/Referer to avoid triggering CORS filter
            proxyReq.removeHeader('origin')
            proxyReq.removeHeader('referer')

            // Inject X-User-Id from JWT for non-workspace routes too
            const auth = proxyReq.getHeader('authorization') || req.headers['authorization']
            const uid = extractUserIdFromJwt(auth)
            if (uid) {
              proxyReq.setHeader('X-User-Id', uid)
            }
          })
        },
      },
    },
  },
})