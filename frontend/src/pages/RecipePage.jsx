import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { requestJson } from '../api'
import BackendResponse, { BackendError } from '../components/BackendResponse'

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleDateString()
}

function RecipePage() {
  const { title = '' } = useParams()
  return <RecipeDetails key={title} title={title} />
}

function RecipeDetails({ title }) {
  const [recipe, setRecipe] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    requestJson(`/api/recipes/${encodeURIComponent(title)}/`)
      .then((data) => { if (active) setRecipe(data) })
      .catch((requestError) => { if (active) setError(requestError) })
    return () => { active = false }
  }, [title])

  if (error) return <div className="content-frame"><BackendError error={error} /></div>
  if (!recipe) return <div className="content-frame"><section className="page-hero recipe-shell__hero"><p className="eyebrow">Recipe page</p><h1>Loading recipe…</h1></section></div>

  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : []
  const steps = Array.isArray(recipe.steps) ? recipe.steps : []
  const reviews = Array.isArray(recipe.reviews) ? recipe.reviews : []
  return <div className="content-frame">
    <section className="page-hero recipe-shell__hero"><p className="eyebrow">Recipe page</p><h1>{recipe.title}</h1><p className="page-hero__lead">{recipe.description}</p><div className="recipe-shell__rating-strip"><div className="stat-pill recipe-shell__rating-pill"><span>Rating</span><strong>{recipe.average_score}</strong></div><div className="stat-pill recipe-shell__rating-pill"><span>Feedback</span><strong>{recipe.number_of_reviews} review{recipe.number_of_reviews === 1 ? '' : 's'}</strong></div><a className="button button--ghost" href="#recipe-comments">Go to comments</a></div></section>
    <section className="page-section recipe-shell__media-section"><article className="gallery-card recipe-shell__carousel-stage"><h3 className="recipe-shell__media-title">Recipe image</h3><div className="recipe-shell__image-grid recipe-shell__image-grid--empty"><div className="recipe-shell__image-frame recipe-shell__image-frame--empty"><div className="recipe-shell__image-empty"><BackendResponse url={`/api/recipes/${encodeURIComponent(title)}/images/`} /></div></div></div></article></section>
    <section className="page-section"><article className="detail-panel"><p className="eyebrow recipe-shell__section-label">Ingredients</p>{ingredients.length ? <ul className="ingredient-list">{ingredients.map((ingredient, index) => <li key={`${ingredient.name}-${index}`}>{`${ingredient.quantity} ${ingredient.unit} ${ingredient.name}`}</li>)}</ul> : <div className="empty-state">No ingredient records were returned by the backend.</div>}</article></section>
    <section className="page-section"><article className="detail-panel"><p className="eyebrow recipe-shell__section-label">Steps</p>{steps.length ? <ol className="step-list">{steps.map((step) => <li key={step.step_number}>{step.instruction}</li>)}</ol> : <div className="empty-state">No step records were returned by the backend.</div>}</article></section>
    <section className="page-section"><article className="detail-panel recipe-shell__author-panel"><div className="recipe-shell__author-intro"><p className="eyebrow">Author</p><h3>Recipe author</h3></div><div className="recipe-shell__author-header"><div className="recipe-shell__author-mark" aria-hidden="true">AU</div><div className="recipe-shell__author-copy"><h3>User {recipe.user}</h3><BackendResponse url={`/api/users/${recipe.user}/`} /></div></div><div className="card-meta-strip"><span>{recipe.date_created ? `Published ${formatDate(recipe.date_created)}` : 'No publication date returned'}</span></div></article><div className="recipe-detail__actions recipe-shell__actions"><BackendResponse url="/api/me/favourites/" /></div></section>
    <section className="page-section"><article className="detail-panel recipe-shell__suggestion-panel"><div className="recipe-shell__suggestion-intro"><h3>Related Recipes</h3></div><BackendResponse url={`/api/recipes/${encodeURIComponent(title)}/related/`} /></article></section>
    <section id="recipe-comments" className="page-section recipe-shell__comments-section"><article className="detail-panel recipe-shell__comments-panel"><p className="eyebrow recipe-shell__comments-label">Comments</p>{reviews.length ? <div className="feature-grid">{reviews.map((review) => <article key={review.id} className="comment-card"><div className="comment-card__meta"><strong>User {review.user}</strong><span>{formatDate(review.timestamp)}</span></div><p>{review.comment}</p><p>Grade: {review.grade}</p></article>)}</div> : <p className="recipe-shell__comments-empty">No review records were returned by the backend.</p>}</article></section>
  </div>
}

export default RecipePage
