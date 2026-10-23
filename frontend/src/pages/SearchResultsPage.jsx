import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import RecipePreviewCard from '../components/RecipePreviewCard'
import SectionTitle from '../components/SectionTitle'
import { getApprovedRecipes } from '../data/recipeApi'
import { getPublicUsers, getUserProfilePath } from '../data/userApi'
import useLiveRefresh from '../hooks/useLiveRefresh'

function SearchResultsPage() {
  const [searchParams] = useSearchParams()
  const query = (searchParams.get('q') ?? '').trim()
  const [reloadKey, setReloadKey] = useState(0)
  const [searchState, setSearchState] = useState({
    query: null,
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

    const searchTitle = query.toLowerCase()
    const searchUser = searchTitle.replace(/^@/, '')
    setSearchState((current) => ({
      query,
      status: 'ready',
      recipes: recipeResult.status === 'fulfilled'
        ? recipeResult.value.filter((recipe) => recipe.title.toLowerCase().includes(searchTitle))
        : current.query === query && ![401, 403, 404].includes(recipeResult.reason.status) ? current.recipes : [],
      users: userResult.status === 'fulfilled'
        ? userResult.value.filter((profile) => (
          [profile.user.username, profile.user.first_name, profile.user.last_name]
            .join(' ').toLowerCase().includes(searchUser)
        )) : current.query === query && ![401, 403, 404].includes(userResult.reason.status) ? current.users : [],
      recipeError: recipeResult.status === 'rejected'
        ? recipeResult.reason.message || 'Unable to load recipes right now.' : '',
      userError: userResult.status === 'rejected'
        ? userResult.reason.message || 'Unable to load users right now.' : '',
    }))
  }, { immediate: true, refreshKey: `${query}:${reloadKey}` })

  const isCurrentQuery = searchState.query === query
  const isLoading = !isCurrentQuery || searchState.status === 'loading'
  const recipeError = isCurrentQuery ? searchState.recipeError : ''
  const userError = isCurrentQuery ? searchState.userError : ''
  const results = isCurrentQuery && searchState.status === 'ready' ? searchState.recipes : []
  const users = isCurrentQuery && searchState.status === 'ready' ? searchState.users : []
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
          <button type="button" className="button button--ghost" onClick={() => setReloadKey((current) => current + 1)}>Try again</button>
        </>
      ) : results.length > 0 ? (
        <div className="recipe-preview-grid recipe-preview-grid--compact recipe-preview-grid--large-photos">
          {results.map((recipe) => (
            <RecipePreviewCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
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
          <button type="button" className="button button--ghost" onClick={() => setReloadKey((current) => current + 1)}>Try again</button>
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
    <div className="content-frame">
      <section className="page-hero">
        <p className="eyebrow">Results / search</p>
        <h1>{query ? `Results for "${query}"` : 'Search recipes and users'}</h1>
        <p className="page-hero__lead">
          Find recipes by title, or people by username or name.
        </p>
      </section>
      {usersFirst ? [userResults, recipeResults] : [recipeResults, userResults]}
    </div>
  )
}

export default SearchResultsPage
