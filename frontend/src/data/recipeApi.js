import { authTokenStorageKey } from './siteData'

const invalidDataMessage = 'Recipe data could not be read. Reload and try again.'

export async function requestRecipeApi(path, { signal, method = 'GET', requiresAuth = false, body } = {}) {
  const token = window.sessionStorage.getItem(authTokenStorageKey)
  if (requiresAuth && !token) {
    throw Object.assign(new Error('Sign in to continue.'), { status: 401 })
  }

  const headers = token ? { Authorization: `Token ${token}` } : {}
  const isFormData = body instanceof FormData
  if (body !== undefined && !isFormData) {
    headers['Content-Type'] = 'application/json'
  }

  let response
  try {
    response = await fetch(path, {
      method,
      signal,
      headers,
      body: body === undefined || isFormData ? body : JSON.stringify(body),
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('Unable to reach the website. Check your connection and try again.')
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    const messages = {
      400: 'The request could not be saved. Reload and try again.',
      401: 'Your login has expired. Sign in again to continue.',
      403: 'You do not have permission to view or change this recipe.',
      404: 'The requested recipe or page is unavailable right now.',
      405: 'This action is unavailable right now.',
      409: 'This recipe has changed. Reload before trying again.',
    }
    throw Object.assign(new Error(messages[response.status] || 'Unable to complete the request. Try again later.'), {
      status: response.status,
      fieldErrors: response.status === 400 && errorData
        && typeof errorData === 'object' && !Array.isArray(errorData)
        ? errorData
        : null,
    })
  }

  return response.json().catch(() => {
    throw Object.assign(new Error(invalidDataMessage), { status: response.status })
  })
}

export function getRecipePath(title) {
  return `/recipe/${encodeURIComponent(title)}`
}

export function readRecipeSummary(data) {
  if (!Number.isInteger(data?.id) || data.id < 1
    || typeof data.title !== 'string' || !data.title.trim()
    || typeof data.approved !== 'boolean') {
    throw new Error(invalidDataMessage)
  }
  return data
}

export async function getCurrentProfile(signal) {
  const profile = await requestRecipeApi('/api/me/', { signal, requiresAuth: true })
  if (typeof profile?.user?.username !== 'string' || typeof profile.user.is_staff !== 'boolean') {
    throw new Error('Your account details could not be read. Sign in again to continue.')
  }
  return profile
}

export async function updateCurrentProfile(payload, signal) {
  let profile
  try {
    profile = await requestRecipeApi('/api/me/', {
      method: 'PATCH',
      requiresAuth: true,
      body: payload,
      signal,
    })
  } catch (error) {
    if (error.status === 400 && error.fieldErrors) {
      error.message = 'Check the profile fields and try again.'
    } else if (error.status === 403) {
      error.message = 'Your account cannot update this profile. Sign in again to continue.'
    } else if (error.status === 413) {
      error.message = 'The upload is too large. Choose a smaller photo.'
    }
    throw error
  }

  if (!Number.isInteger(profile?.user?.id) || profile.user.id < 1
    || typeof profile.user.username !== 'string'
    || typeof profile.user.is_staff !== 'boolean'
    || typeof profile.user.first_name !== 'string'
    || typeof profile.user.last_name !== 'string'
    || typeof profile.bio !== 'string'
    || (profile.profile_picture !== null && typeof profile.profile_picture !== 'string')) {
    throw new Error('The saved profile could not be confirmed. Reload your profile before trying again.')
  }
  return profile
}

export async function getRecipeDetails(recipeName, signal) {
  if (typeof recipeName !== 'string' || !recipeName.trim()) {
    throw new Error('Choose a recipe to open.')
  }

  const recipe = readRecipeSummary(await requestRecipeApi(`/api/recipes/${encodeURIComponent(recipeName)}/`, { signal }))
  if (recipe.title !== recipeName
    || typeof recipe.description !== 'string' || typeof recipe.date_created !== 'string'
    || !Array.isArray(recipe.ingredients) || !Array.isArray(recipe.steps) || !Array.isArray(recipe.reviews)
    || recipe.ingredients.some((item) => typeof item?.name !== 'string'
      || typeof item.quantity !== 'string' || typeof item.unit !== 'string')
    || recipe.steps.some((item) => !Number.isInteger(item?.step_number)
      || item.step_number < 1 || typeof item.instruction !== 'string')
    || recipe.reviews.some((item) => !Number.isInteger(item?.id)
      || typeof item.comment !== 'string' || typeof item.timestamp !== 'string')) {
    throw new Error(invalidDataMessage)
  }
  return recipe
}
