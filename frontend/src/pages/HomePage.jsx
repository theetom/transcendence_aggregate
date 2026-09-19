import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  getCategoryPath,
  landingRecipeCategories,
  sampleRecipePath,
  sampleRecipeSlug,
} from '../data/siteData'

const placeholderPopular = Array.from({ length: 5 }, (_, index) => ({
  id: `popular-${index + 1}`,
  slug: sampleRecipeSlug,
  title: 'Recipe name',
  ingredients: [],
  categories: [],
  average_score: 0,
  number_of_reviews: 0,
}))

const placeholderLatest = Array.from({ length: 4 }, (_, index) => ({
  id: `latest-${index + 1}`,
  slug: sampleRecipeSlug,
  title: 'Recipe name',
  ingredients: [],
  categories: [],
  average_score: 0,
  number_of_reviews: 0,
}))

function HomePage() {
  const location = useLocation()
  const [bestAverageRecipes, setBestAverageRecipes] = useState([])
  const [mostReviewedRecipes, setMostReviewedRecipes] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadHomePageData() {
      try {
        const response = await fetch('/api/recipes/')

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`)
        }

        const data = await response.json()
        setBestAverageRecipes(Array.isArray(data.best_average) ? data.best_average : [])
        setMostReviewedRecipes(Array.isArray(data.most_reviews) ? data.most_reviews : [])
      } catch (loadError) {
        console.error('Failed to load homepage data:', loadError)
        setError('Unable to load recipes right now.')
      } finally {
        setIsLoading(false)
      }
    }

    loadHomePageData()
  }, [])

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

  function handlePlaceholderClick() {}

  const popularRecipes = bestAverageRecipes.length > 0 ? bestAverageRecipes : placeholderPopular
  const latestRecipes = mostReviewedRecipes.length > 0 ? mostReviewedRecipes : placeholderLatest

  return (
    <div className="content-frame landing-plain">
      <section className="landing-plain__section" aria-labelledby="popular-section-title">
        <div className="landing-plain__titlebar">
          <h1 id="popular-section-title">Best average ratings</h1>
        </div>

        {isLoading ? (
          <p>Loading recipes...</p>
        ) : error ? (
          <p>{error}</p>
        ) : (
          <div className="landing-plain__popular-grid">
            {popularRecipes.map((item) => {
              const recipeTitle = item.title ?? item.name ?? 'Recipe name'
              const ingredients = Array.isArray(item.ingredients) ? item.ingredients.map((entry) => entry.name).join(', ') : ''
              const categories = Array.isArray(item.categories) ? item.categories.map((entry) => entry.name).join(', ') : 'General'
              const recipePath = item.slug ? `/recipe/${item.slug}` : item.id ? `/recipe/${item.id}` : sampleRecipePath

              return (
                <Link
                  key={item.id ?? recipeTitle}
                  to={recipePath}
                  className="landing-plain__popular-card landing-plain__card-button"
                  data-recipe-slug={item.slug ?? item.id}
                >
                  <div className="landing-plain__image-placeholder" aria-hidden="true">
                    {categories}
                  </div>
                  <div className="landing-plain__caption">{recipeTitle}</div>
                  {ingredients ? <div className="landing-plain__caption" style={{ fontSize: '0.8rem' }}>{ingredients}</div> : null}
                  <div className="landing-plain__caption" style={{ fontSize: '0.8rem' }}>
                    {typeof item.average_score === 'number' ? `Avg: ${item.average_score.toFixed(1)}` : 'Avg: n/a'}
                    {' · '}
                    {typeof item.number_of_reviews === 'number' ? `${item.number_of_reviews} reviews` : '0 reviews'}
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        <button
          type="button"
          className="header-button landing-plain__action"
          onClick={handlePlaceholderClick}
        >
          See more
        </button>
      </section>

      <section className="landing-plain__section" aria-labelledby="latest-section-title">
        <div className="landing-plain__titlebar">
          <h2 id="latest-section-title">Most reviewed recipes</h2>
          <p>Ordered by review count from the backend.</p>
        </div>

        {isLoading ? (
          <p>Loading recipes...</p>
        ) : error ? (
          <p>{error}</p>
        ) : (
          <div className="landing-plain__latest-grid">
            {latestRecipes.map((item) => {
              const recipeTitle = item.title ?? item.name ?? 'Recipe name'
              const ingredients = Array.isArray(item.ingredients) ? item.ingredients.map((entry) => entry.name).join(', ') : ''
              const recipePath = item.slug ? `/recipe/${item.slug}` : item.id ? `/recipe/${item.id}` : sampleRecipePath

              return (
                <Link
                  key={item.id ?? recipeTitle}
                  to={recipePath}
                  className="landing-plain__latest-card landing-plain__card-button"
                  data-recipe-slug={item.slug ?? item.id}
                >
                  <div className="landing-plain__latest-image" aria-hidden="true">
                    Recipe image
                  </div>

                  <div className="landing-plain__latest-copy">
                    <h3>{recipeTitle}</h3>
                    {ingredients ? <p>{ingredients}</p> : null}
                    <p>
                      {typeof item.average_score === 'number' ? `Avg: ${item.average_score.toFixed(1)}` : 'Avg: n/a'}
                      {' · '}
                      {typeof item.number_of_reviews === 'number' ? `${item.number_of_reviews} reviews` : '0 reviews'}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        <button
          type="button"
          className="header-button landing-plain__action"
          onClick={handlePlaceholderClick}
        >
          See more
        </button>
      </section>

      <section
        id="categories"
        className="landing-plain__section landing-plain__section--categories"
        aria-labelledby="landing-top-categories-title"
      >
        <div className="landing-plain__titlebar">
          <h2 id="landing-top-categories-title">Categories</h2>
        </div>

        <div className="category-browser__top-grid">
          {landingRecipeCategories.map((category) => (
            <Link
              key={category.id}
              id={category.id}
              to={getCategoryPath(category.slug)}
              className="landing-plain__popular-card landing-plain__card-button category-browser__tile category-browser__tile--top"
            >
              <div
                className="landing-plain__image-placeholder category-browser__image"
                aria-hidden="true"
              >
                {category.label}
              </div>
              <div className="landing-plain__caption">{category.name}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

export default HomePage
