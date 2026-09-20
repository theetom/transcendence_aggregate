import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { requestJson } from '../api'
import { BackendError } from '../components/BackendResponse'

function HomePage() {
  const location = useLocation()
  const [landingData, setLandingData] = useState(null)
  const [categories, setCategories] = useState(null)
  const [error, setError] = useState('')
  const [categoryError, setCategoryError] = useState('')

  useEffect(() => {
    let active = true
    requestJson('/api/recipes/')
      .then((data) => {
        if (!Array.isArray(data.best_average) || !Array.isArray(data.most_reviews)) {
          throw new Error('The recipe response is missing the best_average or most_reviews array.')
        }
        if (active) setLandingData(data)
      })
      .catch((requestError) => { if (active) setError(requestError) })
    requestJson('/api/recipes/add_recipe/')
      .then((data) => {
        if (!Array.isArray(data.categories)) {
          throw new Error('The recipe options response is missing the categories array.')
        }
        if (active) setCategories(data.categories)
      })
      .catch((requestError) => { if (active) setCategoryError(requestError) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!location.hash) return undefined
    const frameId = window.requestAnimationFrame(() => {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [location.hash])

  const bestAverage = Array.isArray(landingData?.best_average) ? landingData.best_average : []
  const mostReviews = Array.isArray(landingData?.most_reviews) ? landingData.most_reviews : []

  return (
    <div className="content-frame landing-plain">
      <section className="landing-plain__section" aria-labelledby="popular-section-title">
        <div className="landing-plain__titlebar"><h1 id="popular-section-title">Best average ratings</h1></div>
        {error ? <BackendError error={error} /> : null}
        {!landingData && !error ? <p>Loading recipes…</p> : null}
        {landingData && bestAverage.length === 0 ? <p className="empty-state">No recipe records were returned by the backend.</p> : null}
        <div className="landing-plain__popular-grid">
          {bestAverage.map((recipe) => <Link key={recipe.id} to={`/recipe/${encodeURIComponent(recipe.title)}`} className="landing-plain__popular-card landing-plain__card-button"><div className="landing-plain__image-placeholder" aria-hidden="true">Recipe image</div><div className="landing-plain__caption">{recipe.title}</div></Link>)}
        </div>
      </section>
      <section className="landing-plain__section" aria-labelledby="latest-section-title">
        <div className="landing-plain__titlebar"><h2 id="latest-section-title">Most reviewed recipes</h2></div>
        {landingData && mostReviews.length === 0 ? <p className="empty-state">No recipe records were returned by the backend.</p> : null}
        <div className="landing-plain__latest-grid">
          {mostReviews.map((recipe) => <Link key={recipe.id} to={`/recipe/${encodeURIComponent(recipe.title)}`} className="landing-plain__latest-card landing-plain__card-button"><div className="landing-plain__latest-image" aria-hidden="true">Recipe image</div><div className="landing-plain__latest-copy"><h3>{recipe.title}</h3></div></Link>)}
        </div>
      </section>
      <section id="categories" className="landing-plain__section landing-plain__section--categories" aria-labelledby="landing-top-categories-title">
        <div className="landing-plain__titlebar"><h2 id="landing-top-categories-title">Categories</h2></div>
        {categoryError ? <BackendError error={categoryError} /> : null}
        {!categories && !categoryError ? <p>Loading categories…</p> : null}
        {categories?.length === 0 ? <p className="empty-state">No categories were returned by the backend.</p> : null}
        <div className="category-browser__top-grid">
          {categories?.map((category) => <Link key={category.id} id={`category-${category.id}`} to={`/category/${category.id}`} className="landing-plain__popular-card landing-plain__card-button category-browser__tile category-browser__tile--top"><div className="landing-plain__image-placeholder category-browser__image" aria-hidden="true">Category</div><div className="landing-plain__caption">{category.name}</div></Link>)}
        </div>
      </section>
    </div>
  )
}

export default HomePage
