import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import RecipePreviewCard from '../components/RecipePreviewCard'
import { readRecipeSummary } from '../data/recipeApi'
import useLiveRefresh from '../hooks/useLiveRefresh'

function HomePage() {
  const location = useLocation()
  const [bestAverageRecipes, setBestAverageRecipes] = useState([])
  const [mostReviewedRecipes, setMostReviewedRecipes] = useState([])
  const [recentlyAddedRecipes, setRecentlyAddedRecipes] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

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
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [location.hash])

  return (
    <div className="content-frame landing-plain">
      <section className="landing-plain__section" aria-labelledby="popular-section-title">
        <div className="landing-plain__titlebar">
          <h1 id="popular-section-title">Best-rated recipes from the last 30 days</h1>
        </div>

        {isLoading ? (
          <p>Loading recipes...</p>
        ) : error ? (
          <p>{error}</p>
        ) : (
          <div className="landing-plain__popular-grid">
            {bestAverageRecipes.map((recipe) => (
              <RecipePreviewCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        )}

      </section>

      <section className="landing-plain__section" aria-labelledby="latest-section-title">
        <div className="landing-plain__titlebar">
          <h2 id="latest-section-title">Most-reviewed recipes from the last 30 days</h2>
          <p>Ranked by reviews received in the last 30 days.</p>
        </div>

        {isLoading ? (
          <p>Loading recipes...</p>
        ) : error ? (
          <p>{error}</p>
        ) : (
          <div className="landing-plain__latest-grid">
            {mostReviewedRecipes.map((recipe) => (
              <RecipePreviewCard key={recipe.id} recipe={recipe} layout="horizontal" />
            ))}
          </div>
        )}

      </section>

      <section className="landing-plain__section" aria-labelledby="recently-added-section-title">
        <div className="landing-plain__titlebar">
          <h2 id="recently-added-section-title">Recently Added Recipes</h2>
          <p>The five newest approved recipes, including recipes without reviews.</p>
        </div>

        {isLoading ? (
          <p role="status">Loading recently added recipes...</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : recentlyAddedRecipes.length > 0 ? (
          <div className="landing-plain__popular-grid landing-plain__recent-grid">
            {recentlyAddedRecipes.map((recipe) => (
              <RecipePreviewCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        ) : (
          <p>No approved recipes yet.</p>
        )}
      </section>

    </div>
  )
}

export default HomePage
