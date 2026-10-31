const dayMilliseconds = 24 * 60 * 60 * 1000
const maxDays = 366
const endpoint = '/api/analytics/'

function invalidData() {
  return new Error('The analytics data could not be read. Refresh the dashboard and try again.')
}

function count(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw invalidData()
  return value
}

function average(value, reviews) {
  if (reviews === 0 ? value !== null : !Number.isFinite(value) || value < 1 || value > 5) throw invalidData()
  return value
}

function identifier(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw invalidData()
  return value
}

function publicName(value) {
  if (typeof value !== 'string' || !value.trim() || [...value].length > 100) throw invalidData()
  return value
}

export function isAnalyticsDate(value) {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return false
  const parsed = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
}

export function analyticsDateRange(days = 30) {
  const end = new Date().toISOString().slice(0, 10)
  const start = new Date(Date.parse(`${end}T00:00:00Z`) - (days - 1) * dayMilliseconds).toISOString().slice(0, 10)
  return { start, end }
}

export function readAnalyticsParams(params) {
  const defaults = analyticsDateRange()
  const hasDate = params.has('start') || params.has('end')
  return {
    start: hasDate ? params.get('start') || '' : defaults.start,
    end: hasDate ? params.get('end') || '' : defaults.end,
    category: params.get('category') || '',
    q: (params.get('q') || '').trim(),
    rating: params.get('rating') || '',
  }
}

export function analyticsFilterError(filters) {
  if (!isAnalyticsDate(filters.start) || !isAnalyticsDate(filters.end)) return 'Choose a valid start date and end date.'
  const days = (Date.parse(`${filters.end}T00:00:00Z`) - Date.parse(`${filters.start}T00:00:00Z`)) / dayMilliseconds + 1
  if (days < 1) return 'The end date must be on or after the start date.'
  if (days > maxDays) return 'Choose a range of no more than 366 days.'
  if (filters.category && (!/^[1-9][0-9]*$/.test(filters.category) || !Number.isSafeInteger(Number(filters.category)))) return 'Choose a valid recipe category or clear the filters.'
  if (filters.rating && !/^[1-5]$/.test(filters.rating)) return 'Choose a rating from 1 to 5 or show all ratings.'
  if (filters.q.includes('\u0000')) return 'Remove the invalid character from the recipe title search.'
  if ([...filters.q].length > 100) return 'Use no more than 100 characters for the recipe title.'
  return ''
}

export function analyticsSearchParams(filters) {
  const params = new URLSearchParams()
  if (filters.start) params.set('start', filters.start)
  if (filters.end) params.set('end', filters.end)
  if (filters.category) params.set('category', filters.category)
  if (filters.q) params.set('q', filters.q.trim())
  if (filters.rating) params.set('rating', filters.rating)
  return params
}

export function analyticsFilterKey(filters) {
  return analyticsSearchParams(filters).toString()
}

function expectedFilters(filters) {
  return {
    start: filters.start, end: filters.end,
    category: filters.category ? Number(filters.category) : null,
    q: filters.q.trim(), rating: filters.rating ? Number(filters.rating) : null,
  }
}

function readAnalytics(data, filters) {
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || data.timezone !== 'UTC' || typeof data.generated_at !== 'string'
    || !Number.isFinite(Date.parse(data.generated_at)) || data.limits?.max_days !== maxDays) throw invalidData()
  const wanted = expectedFilters(filters)
  if (!data.filters || Object.entries(wanted).some(([name, value]) => data.filters[name] !== value)) throw invalidData()
  const seenCategories = new Set()
  if (!Array.isArray(data.categories)) throw invalidData()
  const categories = data.categories.map(item => {
    const id = identifier(item?.id)
    if (seenCategories.has(id)) throw invalidData()
    seenCategories.add(id)
    return { id, name: publicName(item.name) }
  })
  if (!data.summary || typeof data.summary !== 'object') throw invalidData()
  const summary = {
    matching_recipes: count(data.summary.matching_recipes),
    recipes_created: count(data.summary.recipes_created),
    reviews: count(data.summary.reviews),
    reviewed_recipes: count(data.summary.reviewed_recipes),
  }
  summary.average_rating = average(data.summary.average_rating, summary.reviews)
  if (summary.recipes_created > summary.matching_recipes
    || summary.reviewed_recipes > Math.min(summary.matching_recipes, summary.reviews)) throw invalidData()
  const numberOfDays = (Date.parse(`${wanted.end}T00:00:00Z`) - Date.parse(`${wanted.start}T00:00:00Z`)) / dayMilliseconds + 1
  if (!Array.isArray(data.daily) || data.daily.length !== numberOfDays) throw invalidData()
  const daily = data.daily.map((item, index) => {
    const expectedDate = new Date(Date.parse(`${wanted.start}T00:00:00Z`) + index * dayMilliseconds).toISOString().slice(0, 10)
    if (item?.date !== expectedDate) throw invalidData()
    const reviews = count(item.reviews)
    return { date: item.date, recipes_created: count(item.recipes_created), reviews, average_rating: average(item.average_rating, reviews) }
  })
  if (daily.reduce((total, item) => total + item.recipes_created, 0) !== summary.recipes_created
    || daily.reduce((total, item) => total + item.reviews, 0) !== summary.reviews) throw invalidData()
  if (!Array.isArray(data.rating_distribution) || data.rating_distribution.length !== 5) throw invalidData()
  const ratingDistribution = data.rating_distribution.map((item, index) => {
    if (item?.rating !== index + 1) throw invalidData()
    return { rating: item.rating, review_count: count(item.review_count) }
  })
  const allReviewCount = ratingDistribution.reduce((total, item) => total + item.review_count, 0)
  if (wanted.rating === null ? allReviewCount !== summary.reviews : ratingDistribution[wanted.rating - 1].review_count !== summary.reviews) throw invalidData()
  if (!Array.isArray(data.top_recipes) || data.top_recipes.length > 10) throw invalidData()
  const seenRecipes = new Set()
  const topRecipes = data.top_recipes.map(item => {
    const id = identifier(item?.id)
    const reviews = count(item.review_count)
    if (seenRecipes.has(id) || reviews < 1 || reviews > summary.reviews) throw invalidData()
    seenRecipes.add(id)
    return { id, title: publicName(item.title), review_count: reviews, average_rating: average(item.average_rating, reviews) }
  })
  return {
    generated_at: data.generated_at, timezone: 'UTC', filters: wanted, limits: { max_days: maxDays },
    categories, summary, daily, rating_distribution: ratingDistribution, top_recipes: topRecipes,
  }
}

export async function getRecipeAnalytics(filters, signal) {
  const filterError = analyticsFilterError(filters)
  if (filterError) throw new Error(filterError)
  if (signal?.aborted) throw new DOMException('The request was cancelled.', 'AbortError')
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  let timedOut = false
  const timeout = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, 15000)
  try {
    const response = await fetch(`${endpoint}?${analyticsSearchParams(filters)}`, {
      method: 'GET', credentials: 'omit', cache: 'no-store',
      headers: { Accept: 'application/json' }, signal: controller.signal,
    })
    const data = await response.json().catch(() => null)
    if (controller.signal.aborted) {
      if (timedOut) throw new Error('The analytics request took too long. Refresh and try again.')
      throw new DOMException('The request was cancelled.', 'AbortError')
    }
    if (!response.ok) throw Object.assign(new Error(typeof data?.error === 'string'
      ? data.error : 'Analytics is unavailable right now. Refresh and try again.'), { status: response.status })
    return readAnalytics(data, filters)
  } catch (error) {
    if (signal?.aborted) throw new DOMException('The request was cancelled.', 'AbortError')
    if (timedOut) throw new Error('The analytics request took too long. Refresh and try again.')
    if (error instanceof TypeError) throw new Error('Unable to reach the website. Check your connection and refresh analytics.')
    throw error
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value)
  if (text.trimStart().startsWith('=') || /^[+\-@]/.test(text.trimStart()) || /^[\t\r\n]/.test(text)) text = "'" + text
  return `"${text.replaceAll('"', '""')}"`
}

function exportSnapshot(data) {
  const categoryName = data.categories.find(category => category.id === data.filters.category)?.name || null
  return {
    format: 'recipe-analytics', format_version: 1, generated_at: data.generated_at, timezone: data.timezone,
    filters: { ...data.filters, category_name: categoryName },
    summary: data.summary, daily: data.daily,
    rating_distribution: data.rating_distribution, top_recipes: data.top_recipes,
  }
}

export function createAnalyticsDownload(data, format) {
  if (!['json', 'csv'].includes(format)) throw new Error('Choose a JSON or CSV analytics download.')
  const snapshot = exportSnapshot(data)
  let content
  if (format === 'json') content = JSON.stringify(snapshot, null, 2) + '\n'
  else {
    const fields = ['section', 'date', 'recipe_id', 'title', 'rating', 'matching_recipes', 'recipes_created', 'reviews', 'reviewed_recipes', 'average_rating', 'start', 'end', 'category_id', 'category_name', 'query', 'selected_rating', 'generated_at', 'timezone']
    const context = {
      start: snapshot.filters.start, end: snapshot.filters.end, category_id: snapshot.filters.category,
      category_name: snapshot.filters.category_name, query: snapshot.filters.q,
      selected_rating: snapshot.filters.rating, generated_at: snapshot.generated_at, timezone: snapshot.timezone,
    }
    const rows = [
      { section: 'summary', ...snapshot.summary },
      ...snapshot.daily.map(row => ({ section: 'daily', ...row })),
      ...snapshot.rating_distribution.map(row => ({ section: 'rating_distribution_all_grades', rating: row.rating, reviews: row.review_count })),
      ...snapshot.top_recipes.map(row => ({ section: 'top_recipe', recipe_id: row.id, title: row.title, reviews: row.review_count, average_rating: row.average_rating })),
    ]
    content = [fields, ...rows.map(row => fields.map(field => ({ ...context, ...row })[field]))]
      .map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
  }
  return { blob: new Blob([content], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8' }), filename: `analytics.${format}` }
}
