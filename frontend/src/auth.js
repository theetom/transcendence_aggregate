const tokenKey = 'recipe-site-auth-token'

export function isAuthenticated() {
  return typeof window !== 'undefined' && Boolean(window.localStorage.getItem(tokenKey))
}

export function saveAuthSession({ token }) {
  if (!token || typeof window === 'undefined') return
  window.localStorage.setItem(tokenKey, token)
}

export function getAuthToken() {
  return typeof window === 'undefined' ? null : window.localStorage.getItem(tokenKey)
}
