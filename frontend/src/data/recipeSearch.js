export const recipeSearchSortOptions = [
  { value: 'title-asc', label: 'Title: A–Z' },
  { value: 'title-desc', label: 'Title: Z–A' },
  { value: 'rating-desc', label: 'Highest rated' },
  { value: 'reviews-desc', label: 'Most reviewed' },
]

export const recipeSearchPageSizes = [6, 12, 24]

function trimmedText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizedText(value) {
  return trimmedText(value).toLowerCase()
}

function readPositiveInteger(value, fallback = 1) {
  if (typeof value === 'string' && !/^[1-9]\d*$/.test(value)) return fallback
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : fallback
}

function readPageSize(value) {
  const size = Number(value)
  return recipeSearchPageSizes.includes(size) ? size : recipeSearchPageSizes[0]
}

function readMinimumRating(value) {
  const rating = Number(value)
  return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : 0
}

export function readRecipeSearchParams(searchParams) {
  const get = (name) => typeof searchParams?.get === 'function' ? searchParams.get(name) : null
  const requestedSort = get('sort')

  return {
    query: trimmedText(get('q')),
    category: normalizedText(get('category')),
    ingredient: trimmedText(get('ingredient')),
    minRating: readMinimumRating(get('rating')),
    sort: recipeSearchSortOptions.some(({ value }) => value === requestedSort)
      ? requestedSort : 'title-asc',
    pageSize: readPageSize(get('size')),
    page: readPositiveInteger(get('page')),
  }
}

export function getRecipeCategoryOptions(recipes) {
  const categories = new Map()
  for (const recipe of Array.isArray(recipes) ? recipes : []) {
    for (const category of Array.isArray(recipe?.categories) ? recipe.categories : []) {
      const label = trimmedText(category?.name)
      const value = normalizedText(label)
      if (value && !categories.has(value)) categories.set(value, { value, label })
    }
  }

  return [...categories.values()].sort((left, right) => left.value.localeCompare(right.value))
}

function getRecipeMetrics(recipe) {
  const reviewCount = Number.isSafeInteger(recipe?.number_of_reviews) && recipe.number_of_reviews >= 0
    ? recipe.number_of_reviews : 0
  const average = Number.isFinite(recipe?.average_score)
    && recipe.average_score >= 1 && recipe.average_score <= 5
    ? recipe.average_score : 0

  return { reviewCount, average, isRated: reviewCount > 0 && average > 0 }
}

function compareTitles(left, right) {
  const titleOrder = normalizedText(left?.title).localeCompare(normalizedText(right?.title))
  if (titleOrder) return titleOrder
  const leftId = Number.isSafeInteger(left?.id) ? left.id : 0
  const rightId = Number.isSafeInteger(right?.id) ? right.id : 0
  return leftId - rightId
}

export function searchRecipes(recipes, settings = {}) {
  const query = normalizedText(settings?.query)
  const category = normalizedText(settings?.category)
  const ingredient = normalizedText(settings?.ingredient)
  const minRating = readMinimumRating(settings?.minRating)

  const results = (Array.isArray(recipes) ? recipes : []).filter((recipe) => {
    if (!trimmedText(recipe?.title) || !normalizedText(recipe.title).includes(query)) return false
    if (category && !(Array.isArray(recipe.categories) && recipe.categories.some(
      (item) => normalizedText(item?.name) === category,
    ))) return false
    if (ingredient && !(Array.isArray(recipe.ingredients) && recipe.ingredients.some(
      (item) => normalizedText(item?.name).includes(ingredient),
    ))) return false
    if (minRating) {
      const metrics = getRecipeMetrics(recipe)
      if (!metrics.isRated || metrics.average < minRating) return false
    }
    return true
  })

  return results.sort((left, right) => {
    if (settings?.sort === 'title-desc') {
      const titleOrder = normalizedText(right.title).localeCompare(normalizedText(left.title))
      return titleOrder || compareTitles(left, right)
    }
    if (settings?.sort === 'rating-desc') {
      const leftMetrics = getRecipeMetrics(left)
      const rightMetrics = getRecipeMetrics(right)
      return Number(rightMetrics.isRated) - Number(leftMetrics.isRated)
        || rightMetrics.average - leftMetrics.average
        || compareTitles(left, right)
    }
    if (settings?.sort === 'reviews-desc') {
      return getRecipeMetrics(right).reviewCount - getRecipeMetrics(left).reviewCount
        || compareTitles(left, right)
    }
    return compareTitles(left, right)
  })
}

export function paginateRecipeResults(results, requestedPage, requestedPageSize) {
  const recipes = Array.isArray(results) ? results : []
  const pageSize = readPageSize(requestedPageSize)
  const total = recipes.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(readPositiveInteger(requestedPage), pageCount)
  const offset = (page - 1) * pageSize

  return {
    page,
    pageCount,
    total,
    start: total ? offset + 1 : 0,
    end: Math.min(offset + pageSize, total),
    recipes: recipes.slice(offset, offset + pageSize),
  }
}
