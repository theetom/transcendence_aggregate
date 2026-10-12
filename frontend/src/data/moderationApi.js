import { getRecipeDetails, readRecipeSummary, requestRecipeApi } from './recipeApi'

// These requests follow the imported backend_admin_logic recipe endpoints.
export async function getPendingRecipes(signal) {
  const data = await requestRecipeApi('/api/recipes/all_recipes/pending/', { signal, requiresAuth: true })
  if (!Array.isArray(data)) {
    throw new Error('The pending recipe list could not be read. Try again later.')
  }

  const recipes = data.map(readRecipeSummary)
  if (recipes.some((recipe) => recipe.approved !== false)
    || new Set(recipes.map((recipe) => recipe.id)).size !== recipes.length) {
    throw new Error('The pending recipe list could not be read. Try again later.')
  }
  return recipes
}

export async function approveRecipe(recipe) {
  readRecipeSummary(recipe)
  let responseReceived = false

  try {
    const data = await requestRecipeApi(`/api/recipes/${encodeURIComponent(recipe.title)}/approve/`, {
      method: 'POST',
      requiresAuth: true,
    })
    responseReceived = true
    const savedRecipe = readRecipeSummary(data)
    if (savedRecipe.id !== recipe.id || savedRecipe.title !== recipe.title || savedRecipe.approved !== true) {
      throw new Error('The saved approval could not be confirmed.')
    }

    const details = await getRecipeDetails(recipe.title)
    if (details.id !== recipe.id || details.approved !== true) {
      throw new Error('The saved approval could not be confirmed.')
    }
    return details
  } catch (error) {
    if (!responseReceived && [400, 401, 403, 404, 405].includes(error.status)) throw error
    throw Object.assign(new Error('Approval could not be confirmed. Reload the recipe before trying again.'), {
      requiresReload: true,
      status: error.status,
    })
  }
}
