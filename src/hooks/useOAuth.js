/**
 * useOAuth — React hook for managing OAuth integrations.
 *
 * Wraps the oauthApi layer with React state management for:
 *   - Loading linked providers on mount
 *   - Connecting (linking) new providers
 *   - Refreshing provider tokens
 *   - Disconnecting (unlinking) providers
 *   - Handling OAuth callbacks
 *   - Zoho-specific initialization
 *
 * Usage:
 *   const {
 *     providers, loading, error,
 *     linkProvider, unlinkProvider, refreshProvider,
 *     initZoho, handleOAuthCallback,
 *     isConnected, getProvider,
 *   } = useOAuth()
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { oauthApi } from '../api/oauth.js'
import { isMockMode } from '../utils/api.js'

export function useOAuth() {
  // Array of linked provider objects from the server
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Track per-provider operation state: { [providerId]: 'linking' | 'refreshing' | 'unlinking' }
  const [operationState, setOperationState] = useState({})
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  /**
   * Fetch linked providers from the backend.
   * Called on mount and after link/unlink operations.
   */
  const fetchProviders = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await oauthApi.listLinkedProviders()
      if (mountedRef.current) {
        setProviders(Array.isArray(data) ? data : [])
      }
    } catch (err) {
      if (mountedRef.current) {
        console.warn('[useOAuth] Failed to fetch providers:', err.message)
        setError(err.message)
        // On error, keep existing providers in state (don't clear)
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  // Load on mount
  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  /**
   * Check if a specific provider is connected.
   * @param {string} providerId - e.g. 'zoho', 'github'
   * @returns {boolean}
   */
  const isConnected = useCallback((providerId) => {
    return providers.some(
      p => (p.provider === providerId || p.id === providerId) &&
           (p.status === 'connected' || p.status === 'active')
    )
  }, [providers])

  /**
   * Get the full provider object for a given provider ID.
   * @param {string} providerId
   * @returns {Object|null}
   */
  const getProvider = useCallback((providerId) => {
    return providers.find(
      p => p.provider === providerId || p.id === providerId
    ) || null
  }, [providers])

  /**
   * Link (connect) a new provider.
   * For OAuth providers (Zoho) this may return an auth_url for redirect.
   * For API-key providers (GitHub, Slack) this saves the credentials directly.
   *
   * @param {Object} credentials - { provider, client_id?, client_secret?, redirect_uri?, api_key?, header_type? }
   * @returns {Promise<Object>} Result with status and optionally auth_url
   */
  const linkProvider = useCallback(async (credentials) => {
    const providerId = credentials.provider
    setOperationState(prev => ({ ...prev, [providerId]: 'linking' }))
    setError(null)

    try {
      const result = await oauthApi.linkProvider(credentials)

      // If backend returned an auth_url, the frontend should redirect to it
      if (result?.auth_url) {
        console.log(`[useOAuth] Provider "${providerId}" requires OAuth redirect:`, result.auth_url)
        // Don't refresh providers yet — the callback will complete the link
        return result
      }

      // Otherwise, the provider is now connected — refresh the list
      await fetchProviders()
      return result
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message)
      }
      throw err
    } finally {
      if (mountedRef.current) {
        setOperationState(prev => { const n = { ...prev }; delete n[providerId]; return n })
      }
    }
  }, [fetchProviders])

  /**
   * Refresh the access token for a linked provider.
   * @param {string} providerId
   * @returns {Promise<Object>}
   */
  const refreshProvider = useCallback(async (providerId) => {
    setOperationState(prev => ({ ...prev, [providerId]: 'refreshing' }))
    setError(null)

    try {
      const result = await oauthApi.refreshProvider({ provider: providerId })
      await fetchProviders()
      return result
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message)
      }
      throw err
    } finally {
      if (mountedRef.current) {
        setOperationState(prev => { const n = { ...prev }; delete n[providerId]; return n })
      }
    }
  }, [fetchProviders])

  /**
   * Unlink (disconnect) a provider.
   * @param {string} providerId
   * @returns {Promise<void>}
   */
  const unlinkProvider = useCallback(async (providerId) => {
    setOperationState(prev => ({ ...prev, [providerId]: 'unlinking' }))
    setError(null)

    try {
      await oauthApi.unlinkProvider(providerId)
      // Optimistically remove from local state
      if (mountedRef.current) {
        setProviders(prev =>
          prev.filter(p => p.provider !== providerId && p.id !== providerId)
        )
      }
      // Then refresh from server for consistency
      await fetchProviders()
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message)
      }
      throw err
    } finally {
      if (mountedRef.current) {
        setOperationState(prev => { const n = { ...prev }; delete n[providerId]; return n })
      }
    }
  }, [fetchProviders])

  /**
   * Initialize Zoho OAuth — get auth URL or perform silent refresh.
   * @param {Object} [credentials] - { client_id, client_secret, redirect_uri }
   * @returns {Promise<Object>} { auth_url?, status, provider }
   */
  const initZoho = useCallback(async (credentials = {}) => {
    setOperationState(prev => ({ ...prev, zoho: 'linking' }))
    setError(null)

    try {
      const result = await oauthApi.initZoho(credentials)

      // If an auth_url is returned, the UI should redirect the user
      if (result?.auth_url) {
        console.log('[useOAuth] Zoho init returned auth URL:', result.auth_url)
        return result
      }

      // Silent refresh succeeded — refresh provider list
      await fetchProviders()
      return result
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message)
      }
      throw err
    } finally {
      if (mountedRef.current) {
        setOperationState(prev => { const n = { ...prev }; delete n.zoho; return n })
      }
    }
  }, [fetchProviders])

  /**
   * Handle OAuth callback — exchange authorization code for tokens.
   * Called after the user is redirected back from the OAuth provider.
   *
   * @param {Object} params - { code, state?, provider? }
   * @returns {Promise<Object>}
   */
  const handleOAuthCallback = useCallback(async (params) => {
    setLoading(true)
    setError(null)

    try {
      // Use POST for programmatic exchange (SPA flow)
      const result = await oauthApi.exchangeCode(params)
      await fetchProviders()
      return result
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message)
      }
      throw err
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [fetchProviders])

  /**
   * Get the operation state for a provider.
   * @param {string} providerId
   * @returns {'linking'|'refreshing'|'unlinking'|null}
   */
  const getOperationState = useCallback((providerId) => {
    return operationState[providerId] || null
  }, [operationState])

  return {
    // State
    providers,
    loading,
    error,

    // Actions
    linkProvider,
    unlinkProvider,
    refreshProvider,
    initZoho,
    handleOAuthCallback,
    fetchProviders,

    // Helpers
    isConnected,
    getProvider,
    getOperationState,
  }
}
