export const authTokenStorageKey = 'recipe-site-auth-token'

export function isViewerAuthenticated() {
  return Boolean(window.sessionStorage.getItem(authTokenStorageKey))
}

// These lists stay empty until backend data is connected.
export const menuRecipeTypeLabels = []
export const menuThemeLabels = []
export const recipeCategories = []
export const landingRecipeCategories = []

export function getCategoryPath(slug) {
  return slug ? `/category/${slug}` : '/category'
}

export function formatDate(dateString) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${dateString}T12:00:00`))
}
