import { getRecipeDetails, readRecipeSummary, requestRecipeApi } from './recipeApi'

// Recipe identity is the saved numeric ID, including approval confirmation.
export async function getPendingRecipes(signal) {
  const data = await requestRecipeApi('/api/recipes/all_recipes/pending/', { signal, requiresAuth: true })
  if (!Array.isArray(data)) {
    throw new Error('The pending recipe list could not be read. Try again later.')
  }

  const recipes = data.map(readRecipeSummary)
  if (recipes.some((recipe) => recipe.approved !== false || recipe.rejected !== false)
    || new Set(recipes.map((recipe) => recipe.id)).size !== recipes.length) {
    throw new Error('The pending recipe list could not be read. Try again later.')
  }
  return recipes
}

async function saveRecipeDecision(recipe, action, reason = '') {
  readRecipeSummary(recipe)
  if (recipe.approved || recipe.rejected) {
    throw Object.assign(new Error('This recipe has already been reviewed. Reload to see its current status.'), {
      requiresReload: true,
    })
  }
  const approved = action === 'approve'
  const matchesDecision = (record) => record.id === recipe.id
    && record.approved === approved && record.rejected === !approved
    && record.rejection_reason === reason
  let responseReceived = false

  try {
    const data = await requestRecipeApi(`/api/recipes/${recipe.id}/${action}/`, {
      method: 'POST',
      requiresAuth: true,
      body: approved ? undefined : { reason },
    })
    responseReceived = true
    const savedRecipe = readRecipeSummary(data)
    if (!matchesDecision(savedRecipe)) {
      throw new Error('The saved decision could not be confirmed.')
    }

    const details = await getRecipeDetails(recipe.id)
    if (!matchesDecision(details)) {
      throw new Error('The saved decision could not be confirmed.')
    }
    return details
  } catch (error) {
    if (action === 'reject' && error.status === 400) {
      const reasonErrors = error.fieldErrors?.reason
      error.message = Array.isArray(reasonErrors) ? reasonErrors.join(' ') : 'Enter a reason using 1 to 1,000 characters.'
    }
    if (!responseReceived && [400, 401, 403, 404, 405].includes(error.status)) throw error
    throw Object.assign(new Error('The decision could not be confirmed. Reload the recipe before trying again.'), {
      requiresReload: true,
      status: error.status,
    })
  }
}

export function approveRecipe(recipe) {
  return saveRecipeDecision(recipe, 'approve')
}

export function rejectRecipe(recipe, reason) {
  const trimmedReason = typeof reason === 'string' ? reason.trim() : ''
  if (!trimmedReason || trimmedReason.length > 1000) {
    throw new Error('Enter a reason using 1 to 1,000 characters.')
  }
  return saveRecipeDecision(recipe, 'reject', trimmedReason)
}
