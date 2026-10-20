import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import RecipePreviewCard from '../components/RecipePreviewCard'
import SectionTitle from '../components/SectionTitle'
import { getApprovedRecipes } from '../data/recipeApi'

function SearchResultsPage() {
  const [searchParams] = useSearchParams()
  const query = (searchParams.get('q') ?? '').trim()
  const [searchState, setSearchState] = useState({
    query: null,
    status: 'loading',
    recipes: [],
    error: '',
  })

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setSearchState({ query, status: 'loading', recipes: [], error: '' })

    async function loadRecipes() {
      try {
        const recipes = await getApprovedRecipes(controller.signal)
        if (!active) return

        const searchTitle = query.toLowerCase()
        const matches = recipes.filter((recipe) => recipe.title.toLowerCase().includes(searchTitle))
        setSearchState({ query, status: 'ready', recipes: matches, error: '' })
      } catch (error) {
        if (!active || error.name === 'AbortError') return
        setSearchState({
          query,
          status: 'error',
          recipes: [],
          error: error.message || 'Unable to load recipes right now. Try again later.',
        })
      }
    }

    loadRecipes()
    return () => {
      active = false
      controller.abort()
    }
  }, [query])

  const isCurrentQuery = searchState.query === query
  const isLoading = !isCurrentQuery || searchState.status === 'loading'
  const error = isCurrentQuery ? searchState.error : ''
  const results = isCurrentQuery && searchState.status === 'ready' ? searchState.recipes : []
  const resultsTitle = isLoading
    ? 'Searching recipes...'
    : error
      ? 'Search unavailable'
      : `${results.length} result${results.length === 1 ? '' : 's'} found`

  return (
    <div className="content-frame">
      <section className="page-hero">
        <p className="eyebrow">Results / search</p>
        <h1>{query ? `Results for "${query}"` : 'Search all recipes'}</h1>
        <p className="page-hero__lead">
          {query ? 'Recipes with matching titles.' : 'Browse all approved recipes or search for a title above.'}
        </p>
      </section>

      <section className="page-section" aria-busy={isLoading}>
        <SectionTitle
          eyebrow="Matches"
          title={resultsTitle}
        />
        {isLoading ? (
          <p role="status">Loading recipes...</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : results.length > 0 ? (
          <div className="recipe-preview-grid recipe-preview-grid--compact recipe-preview-grid--large-photos">
            {results.map((recipe) => (
              <RecipePreviewCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            {query ? 'No approved recipes match this title. Try another search.' : 'No approved recipes are available yet.'}
          </div>
        )}
      </section>
    </div>
  )
}

export default SearchResultsPage
