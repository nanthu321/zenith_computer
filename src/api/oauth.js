/**
 * oauth.js — Centralized OAuth API Layer
 *
 * All OAuth-related API calls in one place.
 * Uses the centralized apiFetch() for auth, error handling, and mock support.
 *
 * Backend API Endpoints:
 *   1. GET    /api/auth/oauth/link              — List linked OAuth providers for the user
 *   2. POST   /api/auth/oauth/link              — Save provider credentials & optionally build auth URL
 *   3. PUT    /api/auth/oauth/link              — Refresh access token for a provider
 *   4. DELETE /api/auth/oauth/link?provider=...  — Unlink (disconnect) a provider
 *   5. GET    /api/auth/oauth/callback           — Browser OAuth callback (exchanges code for tokens)
 *   6. POST   /api/auth/oauth/callback           — Manual/programmatic token exchange
 *   7. POST   /api/auth/oauth/zoho/init          — Zoho-specific: first-time auth URL or silent refresh
 */

import { apiFetch } from '../utils/api.js'

export const oauthApi = {
  /**
   * List all linked OAuth providers for the authenticated user.
   * GET /api/auth/oauth/link
   *
   * @returns {Promise<Array>} Array of linked provider objects, e.g.:
   *   [{ provider: 'zoho', status: 'connected', linked_at: '...', scopes: [...] }, ...]
   */
  listLinkedProviders: () =>
    apiFetch('/api/auth/oauth/link'),

  /**
   * Save provider credentials and optionally build an OAuth authorization URL.
   * POST /api/auth/oauth/link
   *
   * For OAuth providers (e.g. Zoho): sends client_id, client_secret, redirect_uri
   *   → backend returns { auth_url, provider, status } so frontend can redirect.
   * For API-key providers (e.g. GitHub): sends api_key, header_type, provider
   *   → backend saves credentials and returns { provider, status: 'connected' }.
   *
   * @param {Object} credentials - Provider credentials
   * @param {string} credentials.provider - Provider ID (e.g. 'zoho', 'github')
   * @param {string} [credentials.client_id] - OAuth client ID (OAuth providers)
   * @param {string} [credentials.client_secret] - OAuth client secret (OAuth providers)
   * @param {string} [credentials.redirect_uri] - OAuth redirect URI (OAuth providers)
   * @param {string} [credentials.api_key] - API key (API-key providers)
   * @param {string} [credentials.header_type] - Auth header type, e.g. 'Bearer' (API-key providers)
   * @returns {Promise<Object>} { provider, status, auth_url? }
   */
  linkProvider: (credentials) =>
    apiFetch('/api/auth/oauth/link', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  /**
   * Refresh the access token for a linked provider.
   * PUT /api/auth/oauth/link
   *
   * Used to re-authenticate or refresh an expired integration token
   * without re-entering credentials.
   *
   * @param {Object} params
   * @param {string} params.provider - Provider ID to refresh
   * @returns {Promise<Object>} { provider, status, message }
   */
  refreshProvider: (params) =>
    apiFetch('/api/auth/oauth/link', {
      method: 'PUT',
      body: JSON.stringify(params),
    }),

  /**
   * Unlink (disconnect) a provider.
   * DELETE /api/auth/oauth/link?provider=...
   *
   * Removes the provider's credentials and tokens from the backend.
   *
   * @param {string} provider - Provider ID to unlink (e.g. 'zoho', 'github')
   * @returns {Promise<Object|null>} Success confirmation or null
   */
  unlinkProvider: (provider) =>
    apiFetch(`/api/auth/oauth/link?provider=${encodeURIComponent(provider)}`, {
      method: 'DELETE',
    }),

  /**
   * Handle OAuth callback — browser redirect from provider.
   * GET /api/auth/oauth/callback
   *
   * Called when the browser is redirected back from the OAuth provider
   * with an authorization code. The backend exchanges the code for tokens.
   *
   * Note: This is typically handled by the backend directly (browser redirect),
   * but can be called from the frontend if needed for SPA-style handling.
   *
   * @param {Object} params - Query parameters from the OAuth redirect
   * @param {string} params.code - Authorization code from provider
   * @param {string} [params.state] - CSRF state parameter
   * @param {string} [params.provider] - Provider identifier
   * @returns {Promise<Object>} { provider, status, message }
   */
  handleCallback: (params) => {
    const query = new URLSearchParams(params).toString()
    return apiFetch(`/api/auth/oauth/callback?${query}`)
  },

  /**
   * Programmatic token exchange — manual OAuth code exchange.
   * POST /api/auth/oauth/callback
   *
   * Used when the frontend needs to exchange an authorization code
   * programmatically instead of relying on browser redirect.
   *
   * @param {Object} body
   * @param {string} body.code - Authorization code
   * @param {string} body.provider - Provider ID
   * @param {string} [body.redirect_uri] - Redirect URI used during authorization
   * @returns {Promise<Object>} { provider, status, access_token?, message }
   */
  exchangeCode: (body) =>
    apiFetch('/api/auth/oauth/callback', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /**
   * Zoho-specific initialization — first-time auth URL or silent refresh.
   * POST /api/auth/oauth/zoho/init
   *
   * If the user has not linked Zoho yet, returns an auth_url for the
   * consent screen. If already linked, performs a silent token refresh.
   *
   * @param {Object} [body] - Optional parameters
   * @param {string} [body.client_id] - Zoho client ID
   * @param {string} [body.client_secret] - Zoho client secret
   * @param {string} [body.redirect_uri] - Zoho redirect URI
   * @returns {Promise<Object>} { auth_url?, status, provider: 'zoho', message? }
   */
  initZoho: (body = {}) =>
    apiFetch('/api/auth/oauth/zoho/init', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}
