import { requestRecipeApi } from './recipeApi'
import { authTokenStorageKey } from './siteData'

const endpoint = '/api/me/api-key/'
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const secretPattern = /^rpk_([a-f0-9]{32})\.[A-Za-z0-9_-]{43}$/
const invalidResponse = 'Your API key details could not be confirmed. Reload the key status before continuing.'

// Newly issued secrets live only in this tab's memory until the profile consumes
// them. Never put API secrets in storage, a URL, router state or a console log.
let pendingSecret = null
let ensureRequest = null
let sessionEpoch = 0
let panelCount = 0

function currentToken() {
  return window.sessionStorage.getItem(authTokenStorageKey)
}

function validDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function readPayload(data, expectedUserId, allowMissingKey = false) {
  const key = data?.key
  if (!Number.isSafeInteger(data?.user_id) || data.user_id < 1
    || (expectedUserId !== undefined && data.user_id !== expectedUserId)) {
    throw new Error(invalidResponse)
  }
  if (allowMissingKey && key === null && data.api_key === undefined) {
    return { user_id: data.user_id, key: null }
  }
  if (!uuidPattern.test(key?.id ?? '')
    || typeof key.name !== 'string' || !key.name.trim()
    || !['read-only', 'read-write'].includes(key.scope)
    || !validDate(key.created_at) || !validDate(key.expires_at)
    || Date.parse(key.expires_at) <= Date.parse(key.created_at)
    || (key.revoked_at !== null && !validDate(key.revoked_at))
    || typeof key.active !== 'boolean'
    || (key.revoked_at !== null && key.active)) {
    throw new Error(invalidResponse)
  }
  if (data.api_key !== undefined) {
    const match = typeof data.api_key === 'string' ? secretPattern.exec(data.api_key) : null
    if (!match || match[1] !== key.id.replaceAll('-', '') || !key.active) {
      throw new Error(invalidResponse)
    }
  }
  return { user_id: data.user_id, key, ...(data.api_key === undefined ? {} : { api_key: data.api_key }) }
}

export function clearPendingAccountAPIKey() {
  pendingSecret = null
}

export function clearAccountAPIKeyState() {
  pendingSecret = null
  ensureRequest = null
  sessionEpoch += 1
}

export function rememberAccountAPIKey(data, token = currentToken()) {
  try {
    const payload = readPayload(data)
    if (!token || currentToken() !== token || !payload.api_key) return false
    pendingSecret = { userId: payload.user_id, keyId: payload.key.id, value: payload.api_key, token }
    return true
  } catch {
    // A malformed optional login addition must not break normal website login.
    return false
  }
}

export function consumeAccountAPIKey(userId, key) {
  const pending = pendingSecret
  if (!pending) return ''
  pendingSecret = null
  return key.active && pending.userId === userId && pending.keyId === key.id
    && pending.token === currentToken() ? pending.value : ''
}

export function retainAccountAPIKeyPanel(userId) {
  if (pendingSecret && (pendingSecret.userId !== userId || pendingSecret.token !== currentToken())) {
    clearAccountAPIKeyState()
  }
  panelCount += 1
  return () => {
    panelCount -= 1
    // StrictMode immediately remounts effects; a real departure clears memory.
    queueMicrotask(() => {
      if (panelCount === 0) clearAccountAPIKeyState()
    })
  }
}

async function requestAccountKey(userId, method, body) {
  const token = currentToken()
  const epoch = sessionEpoch
  if (!token) throw Object.assign(new Error('Sign in again to manage your API key.'), { status: 401 })
  try {
    const data = await requestRecipeApi(endpoint, { method, body, requiresAuth: true, expectedStatus: 200 })
    if (epoch !== sessionEpoch || token !== currentToken()) {
      throw Object.assign(new Error('Your signed-in account changed. Reload this page.'), { status: 401 })
    }
    const payload = readPayload(data, userId, method === 'GET')
    if (method === 'GET' && payload.api_key !== undefined) throw new Error(invalidResponse)
    if (method === 'PUT' && (payload.key.id === body.expected_key_id || !payload.api_key || !payload.key.active)) {
      throw new Error(invalidResponse)
    }
    if (method === 'DELETE' && (payload.key.id !== body.expected_key_id || payload.api_key !== undefined
      || payload.key.revoked_at === null || payload.key.active)) {
      throw new Error(invalidResponse)
    }
    if (method !== 'GET') rememberAccountAPIKey(payload, token)
    return payload
  } catch (error) {
    if ([401, 403].includes(error.status) && epoch === sessionEpoch && token === currentToken()) {
      clearAccountAPIKeyState()
    }
    if (method !== 'GET' && ![400, 401, 403, 404, 405, 409, 429].includes(error.status)) {
      error.uncertain = true
      error.message = 'The key change could not be confirmed. Reload its status before trying another change.'
    }
    if (error.status === 409) {
      error.requiresReload = true
      error.message = 'Your API key changed elsewhere. Reload its status before continuing.'
    }
    throw error
  }
}

export function ensureAccountAPIKey(userId) {
  const token = currentToken()
  if (ensureRequest?.userId === userId && ensureRequest.token === token && ensureRequest.epoch === sessionEpoch) {
    return ensureRequest.promise
  }
  const entry = { userId, token, epoch: sessionEpoch, promise: null }
  entry.promise = requestAccountKey(userId, 'POST', {}).finally(() => {
    if (ensureRequest === entry) ensureRequest = null
  })
  ensureRequest = entry
  return entry.promise
}

export function getAccountAPIKey(userId) {
  return requestAccountKey(userId, 'GET')
}

export function replaceAccountAPIKey(userId, keyId) {
  clearPendingAccountAPIKey()
  return requestAccountKey(userId, 'PUT', { expected_key_id: keyId })
}

export function revokeAccountAPIKey(userId, keyId) {
  clearPendingAccountAPIKey()
  return requestAccountKey(userId, 'DELETE', { expected_key_id: keyId })
}
