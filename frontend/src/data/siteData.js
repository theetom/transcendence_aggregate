export const viewer = {
  isAuthenticated: false,
  name: '',
}

// Temporary development-only auth preview helper.
// Remove this session-based preview path once Django-backed auth is connected.
const devAuthPreviewStorageKey = 'recipe-site-dev-auth-preview'

export function isDevAuthPreviewEnabled() {
  if (typeof window === 'undefined') {
    return false
  }

  return window.sessionStorage.getItem(devAuthPreviewStorageKey) === 'true'
}

export function isViewerAuthenticated() {
  if (viewer.isAuthenticated) {
    return true
  }

  return isDevAuthPreviewEnabled()
}

export function enableDevAuthPreview() {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(devAuthPreviewStorageKey, 'true')
}

export function disableDevAuthPreview() {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.removeItem(devAuthPreviewStorageKey)
}

export const sampleRecipeSlug = 'sample-recipe'
export const sampleRecipePath = `/recipe/${sampleRecipeSlug}`

export const menuRecipeTypeLabels = [
  'Starter',
  'Main',
  'Dessert',
  'Drinks',
  'Soups',
  'Etc.',
]

export const menuThemeLabels = [
  'Cheap',
  'Easy and fast',
  'Top Recipes',
]

function createCategoryId(prefix, label) {
  return `${prefix}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function createCategorySlug(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const recipeCategories = menuRecipeTypeLabels.map((label) => ({
  id: createCategoryId('recipe-type', label),
  slug: createCategorySlug(label),
  label: 'Recipe type',
  name: label,
}))

export const landingRecipeCategories = recipeCategories.filter(
  (category) => category.name !== 'Etc.',
)

export const recipes = []

export const profilePreview = {
  name: 'Sample profile',
  role: 'Profile preview',
  bio: 'This is a sample profile preview until account data is connected.',
  yourRecipeSlugs: [],
  favoriteRecipeSlugs: [],
  isAdmin: false,
}

export const pendingRecipes = []

export function getCategoryBySlug(slug) {
  return recipeCategories.find((category) => category.slug === slug) ?? null
}

export function getCategoryPath(slug) {
  return slug ? `/category/${slug}` : '/category'
}

export function getRecipeBySlug(slug) {
  return recipes.find((recipe) => recipe.slug === slug) ?? null
}

export function getPendingRecipeBySlug(slug) {
  return pendingRecipes.find((recipe) => recipe.slug === slug) ?? null
}

export function sortByPopularity(items) {
  return [...items].sort((left, right) => right.popularity - left.popularity)
}

export function sortByDate(items) {
  return [...items].sort(
    (left, right) =>
      new Date(`${right.addedOn}T12:00:00`) -
      new Date(`${left.addedOn}T12:00:00`),
  )
}

export function getTopRecipes(limit = 3) {
  return sortByPopularity(recipes).slice(0, limit)
}

export function getLatestRecipes(limit = 4) {
  return sortByDate(recipes).slice(0, limit)
}

export function getRecipesByCategory(slug) {
  const category = getCategoryBySlug(slug)

  if (!category) {
    return []
  }

  return sortByDate(
    recipes.filter((recipe) => createCategorySlug(recipe.type) === category.slug),
  )
}

export function getSuggestedRecipes(recipe, limit = 3) {
  const recipeThemes = Array.isArray(recipe?.themes) ? recipe.themes : []
  const recipeTags = Array.isArray(recipe?.tags) ? recipe.tags : []

  const ranked = recipes
    .filter((candidate) => candidate.slug !== recipe.slug)
    .map((candidate) => {
      const candidateThemes = Array.isArray(candidate.themes) ? candidate.themes : []
      const candidateTags = Array.isArray(candidate.tags) ? candidate.tags : []
      let score = 0

      if (candidate.type === recipe.type) {
        score += 3
      }

      score += candidateThemes.filter((theme) => recipeThemes.includes(theme)).length * 2
      score += candidateTags.filter((tag) => recipeTags.includes(tag)).length
      score += (typeof candidate.popularity === 'number' ? candidate.popularity : 0) / 100

      return { recipe: candidate, score }
    })
    .sort((left, right) => right.score - left.score)

  return ranked.slice(0, limit).map((entry) => entry.recipe)
}

export function searchRecipes(query) {
  const normalized = query.trim().toLowerCase()

  if (!normalized) {
    return recipes
  }

  return recipes.filter((recipe) => {
    const searchableBits = [
      recipe.title,
      recipe.summary,
      recipe.author,
      recipe.type,
      ...(Array.isArray(recipe.themes) ? recipe.themes : []),
      ...(Array.isArray(recipe.tags) ? recipe.tags : []),
      ...(Array.isArray(recipe.ingredients) ? recipe.ingredients : []),
    ]

    return searchableBits.some(
      (bit) => typeof bit === 'string' && bit.toLowerCase().includes(normalized),
    )
  })
}

export function getProfileRecipes() {
  return profilePreview.yourRecipeSlugs
    .map((slug) => getRecipeBySlug(slug))
    .filter(Boolean)
}

export function getFavoriteRecipes() {
  return profilePreview.favoriteRecipeSlugs
    .map((slug) => getRecipeBySlug(slug))
    .filter(Boolean)
}

export function formatDate(dateString) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${dateString}T12:00:00`))
}
