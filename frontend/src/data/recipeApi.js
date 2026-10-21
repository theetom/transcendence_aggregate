import { authTokenStorageKey } from './siteData'

const invalidDataMessage = 'Recipe data could not be read. Reload and try again.'

export async function requestRecipeApi(path, { signal, method = 'GET', requiresAuth = false, body, expectedStatus } = {}) {
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

  if (expectedStatus !== undefined && response.status !== expectedStatus) {
    throw new Error('The saved change could not be confirmed. Reload before trying again.')
  }
  if (response.status === 204) return null

  return response.json().catch(() => {
    throw Object.assign(new Error(invalidDataMessage), { status: response.status })
  })
}

function readRecipeId(value) {
  const id = typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error('Choose a valid recipe to open.')
  }
  return id
}

export function getRecipePath(recipeId) {
  return `/recipe/${readRecipeId(recipeId)}`
}

export function getRecipeEditPath(recipeId) {
  return `${getRecipePath(recipeId)}/edit`
}

export function readRecipeSummary(data) {
  if (!Number.isSafeInteger(data?.id) || data.id < 1
    || typeof data.title !== 'string' || !data.title.trim()
    || typeof data.approved !== 'boolean'
    || typeof data.rejected !== 'boolean'
    || typeof data.rejection_reason !== 'string'
    || typeof data.deletion_requested !== 'boolean'
    || (data.rejected
      ? data.approved || !data.rejection_reason.trim()
      : data.rejection_reason !== '')) {
    throw new Error(invalidDataMessage)
  }
  return data
}

export async function getApprovedRecipes(signal) {
  const data = await requestRecipeApi('/api/recipes/all_recipes/', { signal })
  if (!Array.isArray(data)) throw new Error(invalidDataMessage)
  const recipes = data.map(readRecipeSummary)
  if (recipes.some((recipe) => recipe.approved !== true)
    || new Set(recipes.map((recipe) => recipe.id)).size !== recipes.length) {
    throw new Error(invalidDataMessage)
  }
  return recipes
}

export async function getManagedRecipes(signal) {
  const data = await requestRecipeApi('/api/recipes/manage/', { signal, requiresAuth: true })
  if (!Array.isArray(data)) throw new Error(invalidDataMessage)
  const recipes = data.map(readRecipeSummary)
  if (new Set(recipes.map((recipe) => recipe.id)).size !== recipes.length) {
    throw new Error(invalidDataMessage)
  }
  return recipes
}

export async function getCurrentProfile(signal) {
  const profile = await requestRecipeApi('/api/me/', { signal, requiresAuth: true })
  if (!Number.isSafeInteger(profile?.user?.id) || profile.user.id < 1
    || typeof profile.user.username !== 'string' || typeof profile.user.is_staff !== 'boolean') {
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

function readRecipeDetails(data, id) {
  const recipe = readRecipeSummary(data)
  if (recipe.id !== id
    || !Number.isSafeInteger(recipe.user) || recipe.user < 1
    || typeof recipe.description !== 'string' || typeof recipe.date_created !== 'string'
    || !Array.isArray(recipe.ingredients) || !Array.isArray(recipe.steps) || !Array.isArray(recipe.reviews)
    || !Array.isArray(recipe.categories) || !Array.isArray(recipe.images)
    || recipe.categories.some((item) => typeof item?.name !== 'string')
    || recipe.images.some((item) => !Number.isSafeInteger(item?.id) || item.id < 1
      || typeof item.image !== 'string')
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

export async function getRecipeDetails(recipeId, signal) {
  const id = readRecipeId(recipeId)
  return readRecipeDetails(await requestRecipeApi(`/api/recipes/${id}/`, { signal }), id)
}

export async function updateRecipe(recipeId, payload, signal) {
  const id = readRecipeId(recipeId)
  try {
    const data = await requestRecipeApi(`/api/recipes/${id}/`, {
      method: 'PUT', requiresAuth: true, body: payload, signal,
    })
    return readRecipeDetails(data, id)
  } catch (error) {
    if ([400, 401, 403, 404, 405, 413].includes(error.status)) {
      if (error.status === 400) error.message = 'Check the recipe fields and try again.'
      if (error.status === 413) error.message = 'The upload is too large. Choose smaller photos.'
      throw error
    }
    throw Object.assign(new Error('The save could not be confirmed. Reload the recipe before editing again.'), {
      requiresReload: true, status: error.status,
    })
  }
}

export async function deleteRecipe(recipeId, signal) {
  const id = readRecipeId(recipeId)
  try {
    await requestRecipeApi(`/api/recipes/${id}/`, {
      method: 'DELETE', requiresAuth: true, signal, expectedStatus: 204,
    })
  } catch (error) {
    if ([400, 401, 403, 405].includes(error.status)) throw error
    throw Object.assign(new Error('Deletion could not be confirmed. Reload the recipe before trying again.'), {
      requiresReload: true, status: error.status,
    })
  }
}

export async function requestRecipeDeletion(recipeId, signal) {
  const id = readRecipeId(recipeId)
  let responseReceived = false

  try {
    const data = await requestRecipeApi(`/api/recipes/${id}/`, {
      method: 'DELETE', requiresAuth: true, signal, expectedStatus: 202,
    })
    responseReceived = true
    const savedRecipe = readRecipeSummary(data)
    if (savedRecipe.id !== id || !savedRecipe.deletion_requested) {
      throw new Error('The deletion request could not be confirmed.')
    }

    const details = await getRecipeDetails(id, signal)
    if (!details.deletion_requested) {
      throw new Error('The deletion request has changed. Reload to see its current status.')
    }
    return details
  } catch (error) {
    if (!responseReceived && [400, 401, 403, 405].includes(error.status)) throw error
    throw Object.assign(new Error('The deletion request could not be confirmed. Reload the recipe before trying again.'), {
      requiresReload: true, status: error.status,
    })
  }
}
