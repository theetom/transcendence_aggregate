import { authTokenStorageKey } from './siteData'

const base = '/api/me/recipe-data/'
const formats = new Set(['json', 'csv'])
const sha256Pattern = /^[a-f0-9]{64}$/
const requestIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const maxRecipes = 25
const maxFileBytes = 20 * 1024 * 1024

function invalidData(message = 'Your recipe data could not be read. Reload and try again.') {
  return new Error(message)
}

function tokenValue() {
  try { return window.sessionStorage.getItem(authTokenStorageKey) || '' } catch { return '' }
}

function checkAccount(token) {
  if (!token || tokenValue() !== token) {
    throw Object.assign(new Error('Your account changed. Reload your profile before continuing.'), {
      status: 401, code: 'account_changed',
    })
  }
}

function requireUser(data, userId) {
  if (!Number.isSafeInteger(userId) || userId < 1 || data?.user_id !== userId) throw invalidData()
  return data
}

function recipeRows(value, idField = 'id') {
  if (!Array.isArray(value)) throw invalidData()
  const seen = new Set()
  for (const recipe of value) {
    if (!Number.isSafeInteger(recipe?.[idField]) || recipe[idField] < 1
      || typeof recipe.title !== 'string' || !recipe.title.trim()
      || seen.has(recipe[idField])) throw invalidData()
    seen.add(recipe[idField])
  }
  return value
}

function readPreview(data, userId) {
  requireUser(data, userId)
  if (!sha256Pattern.test(data.sha256) || !formats.has(data.format)
    || !Number.isSafeInteger(data.recipe_count) || data.recipe_count < 1 || data.recipe_count > maxRecipes) {
    throw invalidData('The file check could not be confirmed. Check the file again.')
  }
  recipeRows(data.recipes, 'row')
  if (data.recipes.length !== data.recipe_count) throw invalidData()
  return data
}

function readReceipt(data, userId, requestId, sha256) {
  requireUser(data, userId)
  if (data.request_id !== requestId || data.sha256 !== sha256
    || data.pending !== true || typeof data.replayed !== 'boolean'
    || !Number.isSafeInteger(data.recipe_count) || data.recipe_count < 1 || data.recipe_count > maxRecipes) {
    throw invalidData('The import result could not be confirmed. Check its result before importing again.')
  }
  recipeRows(data.recipes)
  if (data.recipes.length !== data.recipe_count) throw invalidData()
  return data
}

async function request(path, { method = 'GET', body, signal, downloadFormat, importing = false } = {}) {
  const token = tokenValue()
  if (!token) throw Object.assign(new Error('Sign in to use recipe export and import.'), { status: 401 })
  const form = body instanceof FormData
  let response
  try {
    response = await fetch(base + path, {
      method, signal, credentials: 'same-origin', cache: 'no-store',
      headers: {
        Authorization: `Token ${token}`,
        ...(body === undefined || form ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }),
    })
  } catch (failure) {
    if (failure.name === 'AbortError') throw failure
    throw Object.assign(new Error(importing
      ? 'The import result could not be reached. Check its result before starting another import.'
      : 'Unable to reach the website. Check your connection and try again.'), { uncertain: importing })
  }
  try { checkAccount(token) } catch (failure) {
    failure.uncertain = importing
    throw failure
  }

  if (downloadFormat && response.ok) {
    const contentType = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()
    const expected = downloadFormat === 'json' ? 'application/json' : 'text/csv'
    if (response.status !== 200 || contentType !== expected) throw invalidData('The recipe download could not be read. Try downloading it again.')
    const blob = await response.blob()
    checkAccount(token)
    if (blob.size === 0 || blob.size > maxFileBytes) throw invalidData('The recipe download has an unexpected size. Choose fewer recipes and try again.')
    return { blob, filename: `recipes.${downloadFormat}` }
  }

  const data = await response.json().catch(() => null)
  try { checkAccount(token) } catch (failure) {
    failure.uncertain = importing
    throw failure
  }
  if (!response.ok) {
    const fallback = {
      400: 'The file contains data that could not be accepted. Check the details below.',
      401: 'Your login has expired. Sign in again to continue.',
      403: 'You do not have permission to use this recipe data.',
      404: 'No completed import result is available yet. Check again before starting another import.',
      409: 'This import could not be confirmed yet. Check its result before continuing.',
      413: 'This file is too large. Choose a file no larger than 20 MiB.',
    }
    throw Object.assign(new Error(typeof data?.error === 'string' ? data.error : fallback[response.status] || 'Unable to complete the recipe-data request.'), {
      status: response.status,
      rows: Array.isArray(data?.rows)
        ? data.rows.filter(row => row && typeof row === 'object' && !Array.isArray(row))
        : [],
      uncertain: importing && response.status !== 400,
    })
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || !(response.status === 200 || importing && response.status === 201)) {
    throw Object.assign(invalidData(importing
      ? 'The import result could not be read. Check its result before importing again.'
      : undefined), { uncertain: importing })
  }
  return data
}

export async function getRecipeTransferData(userId, signal) {
  const data = requireUser(await request('', { signal }), userId)
  recipeRows(data.recipes)
  if (!Number.isSafeInteger(data.limits?.max_recipes) || data.limits.max_recipes < 1 || data.limits.max_recipes > maxRecipes
    || !Number.isSafeInteger(data.limits?.max_file_bytes) || data.limits.max_file_bytes < 1 || data.limits.max_file_bytes > maxFileBytes) {
    throw invalidData()
  }
  return data
}

export function getRecipeTransferDownload(recipeIds, format, signal) {
  if (!formats.has(format) || !Array.isArray(recipeIds) || recipeIds.length < 1 || recipeIds.length > maxRecipes
    || recipeIds.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(recipeIds).size !== recipeIds.length) {
    throw invalidData('Select between 1 and 25 recipes to download.')
  }
  return request('export/', { method: 'POST', body: { format, recipe_ids: recipeIds }, signal, downloadFormat: format })
}

export async function checkRecipeTransferFile(userId, file, signal) {
  const body = new FormData()
  body.append('file', file)
  return readPreview(await request('validate/', { method: 'POST', body, signal }), userId)
}

export async function importRecipeTransferFile(userId, file, sha256, requestId) {
  if (!sha256Pattern.test(sha256) || !requestIdPattern.test(requestId)) throw invalidData()
  const body = new FormData()
  body.append('file', file)
  body.append('sha256', sha256)
  body.append('request_id', requestId)
  const data = await request('import/', { method: 'POST', body, importing: true })
  try { return readReceipt(data, userId, requestId, sha256) } catch (failure) {
    failure.uncertain = true
    throw failure
  }
}

export async function getRecipeImportResult(userId, requestId, sha256, signal) {
  if (!requestIdPattern.test(requestId) || !sha256Pattern.test(sha256)) throw invalidData()
  return readReceipt(await request(`imports/${encodeURIComponent(requestId)}/`, { signal }), userId, requestId, sha256)
}

function markerKey(userId) {
  if (!Number.isSafeInteger(userId) || userId < 1) throw invalidData()
  return `recipe-data-import-${userId}`
}

export function readPendingRecipeImport(userId) {
  let raw
  try { raw = window.sessionStorage.getItem(markerKey(userId)) } catch {
    return { pending: null, storageAvailable: false }
  }
  if (!raw) return { pending: null, storageAvailable: true }
  let pending
  try { pending = JSON.parse(raw) } catch { throw invalidData('Saved import details could not be read. Check your recipes before starting another import.') }
  if (!pending || !requestIdPattern.test(pending.request_id) || !sha256Pattern.test(pending.sha256)
    || Object.keys(pending).some(name => !['request_id', 'sha256'].includes(name))) {
    throw invalidData('Saved import details could not be read. Check your recipes before starting another import.')
  }
  return { pending, storageAvailable: true }
}

export function storePendingRecipeImport(userId, pending) {
  if (!requestIdPattern.test(pending?.request_id) || !sha256Pattern.test(pending?.sha256)) throw invalidData()
  try {
    window.sessionStorage.setItem(markerKey(userId), JSON.stringify({ request_id: pending.request_id, sha256: pending.sha256 }))
    return true
  } catch { return false }
}

export function clearPendingRecipeImport(userId, requestId) {
  try {
    const raw = window.sessionStorage.getItem(markerKey(userId))
    if (!raw) return true
    const saved = JSON.parse(raw)
    if (saved.request_id !== requestId) return false
    window.sessionStorage.removeItem(markerKey(userId))
    return true
  } catch { return false }
}
