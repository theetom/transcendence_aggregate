import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import RecipePreviewCard from '../components/RecipePreviewCard'
import { getRecipePath, readRecipeSummary } from '../data/recipeApi'
import useLiveRefresh from '../hooks/useLiveRefresh'

function HomePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [bestAverageRecipes, setBestAverageRecipes] = useState([])
  const [mostReviewedRecipes, setMostReviewedRecipes] = useState([])
  const [recentlyAddedRecipes, setRecentlyAddedRecipes] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [failedHeroImage, setFailedHeroImage] = useState('')

  useLiveRefresh(async (signal) => {
    try {
      const response = await fetch('/api/recipes/', { signal, cache: 'no-store' })

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`)
      }

      const data = await response.json()
      if (signal.aborted) return
      if (!Array.isArray(data.recently_added)) {
        throw new Error('Recently added recipes could not be read.')
      }
      const recentlyAdded = data.recently_added.map(readRecipeSummary)
      if (recentlyAdded.some((recipe) => recipe.approved !== true)) {
        throw new Error('Recently added recipes could not be read.')
      }
      setBestAverageRecipes(Array.isArray(data.best_average) ? data.best_average.map(readRecipeSummary) : [])
      setMostReviewedRecipes(Array.isArray(data.most_reviews) ? data.most_reviews.map(readRecipeSummary) : [])
      setRecentlyAddedRecipes(recentlyAdded)
      setError('')
    } catch (loadError) {
      if (signal.aborted || loadError.name === 'AbortError') return
      setError('Unable to load recipes right now.')
    } finally {
      if (!signal.aborted) setIsLoading(false)
    }
  }, { immediate: true })

  useEffect(() => {
    if (!location.hash) {
      return undefined
    }

    const targetId = location.hash.slice(1)
    const frameId = window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId)
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      target?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [location.hash])

  const featuredRecipe = [...bestAverageRecipes, ...mostReviewedRecipes, ...recentlyAddedRecipes]
    .find((recipe) => recipe.approved === true && Array.isArray(recipe.images)
      && recipe.images.some((image) => typeof image?.image === 'string' && image.image.trim()))
  const featuredImage = featuredRecipe?.images
    .find((image) => typeof image?.image === 'string' && image.image.trim())?.image
  const showFeaturedImage = Boolean(featuredImage) && featuredImage !== failedHeroImage && !error

  function handleSearch(event) {
    event.preventDefault()
    const trimmedQuery = query.trim()
    navigate(trimmedQuery ? `/results/search?q=${encodeURIComponent(trimmedQuery)}` : '/results/search')
  }

  return (
    <div className="content-frame savour-home">
      <section className="savour-home__hero" aria-labelledby="home-heading">
        <div className="savour-home__intro">
          <p className="eyebrow">Good food. Shared.</p>
          <h1 id="home-heading">
            <span className="savour-home__desktop-title">Cook something extraordinary.</span>
            <span className="savour-home__mobile-title">Find your next favourite dish.</span>
          </h1>
          <p className="savour-home__lead">Explore home-cooked favourites and share what you love to cook.</p>
          <form className="savour-home__search" role="search" onSubmit={handleSearch}>
            <label className="sr-only" htmlFor="home-recipe-search">Search recipes or users</label>
            <Icon name="search" />
            <input
              id="home-recipe-search"
              name="q"
              type="search"
              placeholder="Search recipes or users..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit">Search</button>
          </form>
        </div>
        {showFeaturedImage ? (
          <Link className="savour-home__feature" to={getRecipePath(featuredRecipe.id)}>
            <img
              src={featuredImage}
              alt=""
              onError={() => setFailedHeroImage(featuredImage)}
            />
            <div className="savour-home__feature-caption">
              <span>From the community</span>
              <strong>{featuredRecipe.title}</strong>
            </div>
          </Link>
        ) : (
          <div className="savour-home__feature savour-home__feature--empty">
            <span className="savour-home__placeholder-mark" aria-hidden="true">RS</span>
            <p>A little inspiration for your next meal.</p>
          </div>
        )}
      </section>

      <nav className="savour-home__browse" aria-label="Explore recipe sections">
        <span>Explore recipes</span>
        <div>
          <a href="#popular-section-title">Best rated</a>
          <a href="#latest-section-title">Most reviewed</a>
          <a href="#recently-added-section-title">Recently added</a>
        </div>
      </nav>

      <section className="savour-home__section" aria-labelledby="popular-section-title" aria-busy={isLoading}>
        <div className="savour-home__section-heading">
          <div>
            <h2 id="popular-section-title">Best-rated recipes</h2>
            <p>Community favourites from the last 30 days.</p>
          </div>
          <Link className="text-link" to="/results/search">Search recipes</Link>
        </div>

        {isLoading ? (
          <p className="savour-home__empty" role="status">Loading recipes...</p>
        ) : error ? (
          <p className="status-banner" role="alert">{error}</p>
        ) : bestAverageRecipes.length > 0 ? (
          <div className="savour-home__grid">
            {bestAverageRecipes.map((recipe) => (
              <RecipePreviewCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        ) : (
          <p className="savour-home__empty">No rated recipes from the last 30 days yet.</p>
        )}
      </section>

      <section className="savour-home__section" aria-labelledby="latest-section-title" aria-busy={isLoading}>
        <div className="savour-home__section-heading">
          <div>
            <h2 id="latest-section-title">Most-reviewed recipes from the last 30 days</h2>
            <p>Ranked by reviews received in the last 30 days.</p>
          </div>
        </div>

        {isLoading ? (
          <p className="savour-home__empty" role="status">Loading recipes...</p>
        ) : error ? (
          <p className="status-banner" role="alert">{error}</p>
        ) : mostReviewedRecipes.length > 0 ? (
          <div className="savour-home__grid">
            {mostReviewedRecipes.map((recipe) => (
              <RecipePreviewCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        ) : (
          <p className="savour-home__empty">No reviewed recipes from the last 30 days yet.</p>
        )}
      </section>

      <section className="savour-home__section" aria-labelledby="recently-added-section-title" aria-busy={isLoading}>
        <div className="savour-home__section-heading">
          <div>
            <h2 id="recently-added-section-title">Recently Added Recipes</h2>
            <p>The five newest approved recipes, including recipes without reviews.</p>
          </div>
        </div>

        {isLoading ? (
          <p className="savour-home__empty" role="status">Loading recently added recipes...</p>
        ) : error ? (
          <p className="status-banner" role="alert">{error}</p>
        ) : recentlyAddedRecipes.length > 0 ? (
          <div className="savour-home__grid">
            {recentlyAddedRecipes.map((recipe) => (
              <RecipePreviewCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        ) : (
          <p className="savour-home__empty">No approved recipes yet.</p>
        )}
      </section>
    </div>
  )
}

export default HomePage
