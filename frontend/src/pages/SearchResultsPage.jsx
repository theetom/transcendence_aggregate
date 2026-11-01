import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Button from '../components/Button'
import RecipePreviewCard from '../components/RecipePreviewCard'
import SectionTitle from '../components/SectionTitle'
import { getApprovedRecipes } from '../data/recipeApi'
import {
  getRecipeCategoryOptions,
  paginateRecipeResults,
  readRecipeSearchParams,
  recipeSearchPageSizes,
  recipeSearchSortOptions,
  searchRecipes,
} from '../data/recipeSearch'
import { getPublicUsers, getUserProfilePath } from '../data/userApi'
import useLiveRefresh from '../hooks/useLiveRefresh'
import '../styles/recipe-search.css'

function createSearchParams(settings) {
  const params = new URLSearchParams()
  if (settings.query) params.set('q', settings.query)
  if (settings.category) params.set('category', settings.category)
  if (settings.ingredient) params.set('ingredient', settings.ingredient)
  if (settings.minRating) params.set('rating', String(settings.minRating))
  if (settings.sort !== 'title-asc') params.set('sort', settings.sort)
  if (settings.pageSize !== recipeSearchPageSizes[0]) params.set('size', String(settings.pageSize))
  if (settings.page > 1) params.set('page', String(settings.page))
  return params
}

function SearchResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const settings = readRecipeSearchParams(searchParams)
  const { query } = settings
  const [reloadKey, setReloadKey] = useState(0)
  const [searchState, setSearchState] = useState({
    status: 'loading',
    recipes: [],
    users: [],
    recipeError: '',
    userError: '',
  })

  useLiveRefresh(async (signal) => {
    const [recipeResult, userResult] = await Promise.allSettled([
      getApprovedRecipes(signal),
      getPublicUsers(signal),
    ])
    if (signal.aborted) return

    setSearchState((current) => ({
      status: 'ready',
      recipes: recipeResult.status === 'fulfilled'
        ? recipeResult.value
        : ![401, 403, 404].includes(recipeResult.reason.status) ? current.recipes : [],
      users: userResult.status === 'fulfilled'
        ? userResult.value
        : ![401, 403, 404].includes(userResult.reason.status) ? current.users : [],
      recipeError: recipeResult.status === 'rejected'
        ? recipeResult.reason.message || 'Unable to load recipes right now.' : '',
      userError: userResult.status === 'rejected'
        ? userResult.reason.message || 'Unable to load users right now.' : '',
    }))
  }, { immediate: true, refreshKey: reloadKey })

  const isLoading = searchState.status === 'loading'
  const { recipeError, userError } = searchState
  const results = searchRecipes(searchState.recipes, settings)
  const pagination = paginateRecipeResults(results, settings.page, settings.pageSize)
  const searchUser = query.toLowerCase().replace(/^@/, '')
  const users = searchState.users.filter((profile) => (
    [profile.user.username, profile.user.first_name, profile.user.last_name]
      .join(' ').toLowerCase().includes(searchUser)
  ))
  const categories = getRecipeCategoryOptions(searchState.recipes)
  const hasUnknownCategory = settings.category && !categories.some(({ value }) => value === settings.category)
  const categoryOptions = hasUnknownCategory
    ? [{ value: settings.category, label: `${settings.category} (no current recipes)` }, ...categories]
    : categories
  const formKey = createSearchParams({ ...settings, page: 1 }).toString()
  const pageNumbers = [...new Set([
    1, pagination.page - 1, pagination.page, pagination.page + 1, pagination.pageCount,
  ])].filter((page) => page > 0 && page <= pagination.pageCount).sort((left, right) => left - right)

  function handleSearch(event) {
    event.preventDefault()
    const next = readRecipeSearchParams(new URLSearchParams(new FormData(event.currentTarget)))
    setSearchParams(createSearchParams({ ...next, page: 1 }))
  }

  function handleClearFilters(event) {
    event.currentTarget.form.reset()
    setSearchParams(createSearchParams({ ...settings, category: '', ingredient: '', minRating: 0, page: 1 }))
  }

  function pagePath(page) {
    return `/results/search?${createSearchParams({ ...settings, page }).toString()}`
  }

  const resultsTitle = isLoading
    ? 'Searching recipes...'
    : recipeError
      ? 'Recipe search unavailable'
      : `${results.length} recipe${results.length === 1 ? '' : 's'} found`

  const recipeResults = (
    <section key="recipes" className="page-section" aria-busy={isLoading}>
      <SectionTitle
        eyebrow="Recipes"
        title={resultsTitle}
      />
      {isLoading ? (
        <p role="status">Loading recipes...</p>
      ) : recipeError ? (
        <>
          <p role="alert">{recipeError}</p>
          <Button variant="ghost" onClick={() => setReloadKey((current) => current + 1)}>Try again</Button>
        </>
      ) : results.length > 0 ? (
        <>
          <p className="recipe-search__range" role="status">
            Showing {pagination.start}–{pagination.end} of {pagination.total} recipes.
            {' '}Page {pagination.page} of {pagination.pageCount}.
          </p>
          <div className="recipe-preview-grid recipe-preview-grid--compact recipe-preview-grid--large-photos">
            {pagination.recipes.map((recipe) => (
              <RecipePreviewCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
          {pagination.pageCount > 1 ? (
            <nav className="recipe-search__pagination" aria-label="Recipe results pages">
              {pagination.page > 1 ? (
                <Link className="button button--ghost" rel="prev" to={pagePath(pagination.page - 1)}>Previous</Link>
              ) : <span className="button button--ghost" aria-disabled="true">Previous</span>}
              <ol>
                {pageNumbers.map((page, index) => (
                  <li key={page}>
                    {index > 0 && page - pageNumbers[index - 1] > 1 ? <span aria-hidden="true">…</span> : null}
                    <Link
                      className="recipe-search__page"
                      to={pagePath(page)}
                      aria-label={`Page ${page}`}
                      aria-current={page === pagination.page ? 'page' : undefined}
                    >{page}</Link>
                  </li>
                ))}
              </ol>
              {pagination.page < pagination.pageCount ? (
                <Link className="button button--ghost" rel="next" to={pagePath(pagination.page + 1)}>Next</Link>
              ) : <span className="button button--ghost" aria-disabled="true">Next</span>}
            </nav>
          ) : null}
        </>
      ) : null}
    </section>
  )

  const userResults = (
    <section key="users" className="page-section" aria-busy={isLoading}>
      <SectionTitle
        eyebrow="Users"
        title={isLoading ? 'Searching users...' : userError ? 'User search unavailable' : `${users.length} user${users.length === 1 ? '' : 's'} found`}
      />
      {isLoading ? (
        <p role="status">Loading users...</p>
      ) : userError ? (
        <>
          <p role="alert">{userError}</p>
          <Button variant="ghost" onClick={() => setReloadKey((current) => current + 1)}>Try again</Button>
        </>
      ) : users.length > 0 ? (
        <ul className="user-search-results">
          {users.map((profile) => (
            <li key={profile.user.id}>
              <Link to={getUserProfilePath(profile.user.id)} state={{ searchQuery: query }}>
                {[profile.user.first_name, profile.user.last_name].filter(Boolean).join(' ') || profile.user.username}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )

  const usersFirst = !isLoading && results.length === 0 && users.length > 0

  return (
    <div className="content-frame recipe-search">
      <section className="page-hero">
        <p className="eyebrow">Results / search</p>
        <h1>{query ? `Results for "${query}"` : 'Search recipes and users'}</h1>
        <p className="page-hero__lead">
          Find recipes by title, category, ingredient or rating, or people by username or name.
        </p>
      </section>
      <form key={formKey} className="recipe-search__form" onSubmit={handleSearch} aria-label="Search recipes and users" aria-describedby="recipe-filter-help">
        <div className="field recipe-search__query">
          <label htmlFor="results-query">Recipe title or person</label>
          <input id="results-query" name="q" type="search" defaultValue={query} placeholder="Recipe title, username or name" />
        </div>
        <p id="recipe-filter-help" className="recipe-search__help">
          Filters, sorting and pages apply to recipes. People are matched by the search text only.
        </p>
        <div className="recipe-search__filters">
          <div className="field">
            <label htmlFor="recipe-category">Category</label>
            <select id="recipe-category" name="category" defaultValue={settings.category}>
              <option value="">All categories</option>
              {categoryOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="recipe-ingredient">Ingredient contains</label>
            <input id="recipe-ingredient" name="ingredient" type="search" defaultValue={settings.ingredient} placeholder="e.g. tomato" />
          </div>
          <div className="field">
            <label htmlFor="recipe-rating">Minimum average rating</label>
            <select id="recipe-rating" name="rating" defaultValue={settings.minRating}>
              <option value="0">Any rating</option>
              {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}+ stars</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="recipe-sort">Sort recipes</label>
            <select id="recipe-sort" name="sort" defaultValue={settings.sort}>
              {recipeSearchSortOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="recipe-page-size">Recipes per page</label>
            <select id="recipe-page-size" name="size" defaultValue={settings.pageSize}>
              {recipeSearchPageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </div>
        </div>
        <div className="recipe-search__actions">
          <Button type="submit">Apply search</Button>
          <Button variant="ghost" onClick={handleClearFilters}>Clear recipe filters</Button>
        </div>
      </form>
      {usersFirst ? [userResults, recipeResults] : [recipeResults, userResults]}
    </div>
  )
}

export default SearchResultsPage
