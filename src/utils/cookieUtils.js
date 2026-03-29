// ─────────────────────────────────────────────────────────────
//  Cookie Utilities — Secure cookie management for auth data
//
//  Replaces localStorage for zenith_token and zenith_user.
//  Cookies are:
//    • Secure      — only sent over HTTPS (auto-disabled on localhost)
//    • SameSite    — Lax (works in iframes & cross-site navigations)
//    • Path=/      — available across the entire app
//    • Max-Age     — 7 days default (configurable)
// ─────────────────────────────────────────────────────────────

const DEFAULT_MAX_AGE = 7 * 24 * 60 * 60 // 7 days in seconds

/**
 * Determine if the current environment supports Secure cookies.
 * Localhost/127.0.0.1 don't require Secure flag.
 */
function isSecureContext() {
  return location.protocol === 'https:'
}

/**
 * Set a cookie with secure defaults.
 *
 * @param {string} name    — Cookie name
 * @param {string} value   — Cookie value (will be URI-encoded)
 * @param {object} options — Optional overrides
 * @param {number} options.maxAge   — Max age in seconds (default: 7 days)
 * @param {string} options.path     — Cookie path (default: '/')
 * @param {string} options.sameSite — SameSite policy (default: 'Lax')
 */
export function setCookie(name, value, options = {}) {
  const {
    maxAge = DEFAULT_MAX_AGE,
    path = '/',
    sameSite = 'Lax',
  } = options

  let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`
  cookie += `; path=${path}`
  cookie += `; max-age=${maxAge}`
  cookie += `; SameSite=${sameSite}`

  if (isSecureContext()) {
    cookie += '; Secure'
  }

  document.cookie = cookie
}

/**
 * Get a cookie value by name.
 * Returns null if the cookie doesn't exist.
 *
 * @param {string} name — Cookie name
 * @returns {string|null}
 */
export function getCookie(name) {
  const encoded = encodeURIComponent(name)
  const cookies = document.cookie.split(';')

  for (const c of cookies) {
    const trimmed = c.trim()
    if (trimmed.startsWith(encoded + '=')) {
      return decodeURIComponent(trimmed.substring(encoded.length + 1))
    }
  }

  return null
}

/**
 * Remove a cookie by name.
 * Sets max-age to 0 to immediately expire it.
 *
 * @param {string} name — Cookie name
 * @param {string} path — Cookie path (must match the path used when setting)
 */
export function removeCookie(name, path = '/') {
  // Clear with both SameSite values to ensure removal regardless of how it was set
  document.cookie = `${encodeURIComponent(name)}=; path=${path}; max-age=0; SameSite=Lax`
  document.cookie = `${encodeURIComponent(name)}=; path=${path}; max-age=0; SameSite=Strict`
}

/**
 * Remove all zenith_* cookies.
 * Used during logout and auth failure cleanup.
 */
export function clearAllZenithCookies() {
  const cookies = document.cookie.split(';')
  for (const c of cookies) {
    const name = c.split('=')[0].trim()
    try {
      const decoded = decodeURIComponent(name)
      if (decoded.startsWith('zenith_')) {
        removeCookie(decoded)
      }
    } catch (_) {
      // Skip cookies with invalid encoding
    }
  }
}
