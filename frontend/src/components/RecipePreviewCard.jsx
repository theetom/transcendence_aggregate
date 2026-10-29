import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import { getRecipePath } from '../data/recipeApi'
import '../styles/savour-home.css'

function RecipePreviewCard({ recipe, layout = 'vertical' }) {
  const [failedImage, setFailedImage] = useState('')
  const isHorizontal = layout === 'horizontal'
  const imageSource = Array.isArray(recipe.images)
    ? recipe.images.find((image) => typeof image?.image === 'string' && image.image.trim())?.image
    : null
  const hasImage = Boolean(imageSource) && failedImage !== imageSource
  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.map((ingredient) => ingredient?.name)
      .filter((name) => typeof name === 'string' && name.trim()).join(', ')
    : ''
  const categories = Array.isArray(recipe.categories)
    ? recipe.categories.map((category) => category?.name)
      .filter((name) => typeof name === 'string' && name.trim()).join(', ')
    : ''

  const hasRating = recipe.number_of_reviews > 0 && Number.isFinite(recipe.average_score)

  const content = (
    <div className="ss-recipe-card__body">
      {categories ? <p className="ss-recipe-card__categories">{categories}</p> : null}
      <h3 className="ss-recipe-card__title">{recipe.title}</h3>
      {recipe.rejected === true ? (
        <div className="ss-recipe-card__feedback recipe-preview-card__feedback">
          <strong>Rejected</strong>
          {recipe.rejection_reason}
        </div>
      ) : null}
      {ingredients ? (
        <p className="ss-recipe-card__ingredients">{ingredients}</p>
      ) : null}
      <div className="ss-recipe-card__meta">
        <span className="ss-recipe-card__rating">
          <Icon name="star" />
          {hasRating ? <><span className="sr-only">Average rating: </span>{recipe.average_score.toFixed(1)}</> : 'Not rated'}
        </span>
        <span aria-hidden="true">·</span>
        <span>{typeof recipe.number_of_reviews === 'number'
          ? `${recipe.number_of_reviews} review${recipe.number_of_reviews === 1 ? '' : 's'}`
          : 'Review count unavailable'}</span>
      </div>
    </div>
  )

  return (
    <Link
      to={getRecipePath(recipe.id)}
      className={isHorizontal
        ? 'recipe-preview-card ss-recipe-card ss-recipe-card--horizontal recipe-preview-card--horizontal'
        : 'recipe-preview-card ss-recipe-card'}
    >
      <div
        className="ss-recipe-card__image recipe-preview-card__image"
      >
        {hasImage ? (
          <img
            className="recipe-preview-card__thumbnail"
            src={imageSource}
            alt=""
            loading="lazy"
            onError={() => setFailedImage(imageSource)}
          />
        ) : (
          <div className="ss-recipe-card__placeholder">
            <span aria-hidden="true">RS</span>
            <span>No photo yet</span>
          </div>
        )}
      </div>
      {content}
    </Link>
  )
}

export default RecipePreviewCard
