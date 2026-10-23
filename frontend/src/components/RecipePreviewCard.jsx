import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getRecipePath } from '../data/recipeApi'

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

  const content = (
    <>
      {isHorizontal ? <h3>{recipe.title}</h3> : <div className="landing-plain__caption">{recipe.title}</div>}
      {recipe.rejected === true ? (
        <div className="landing-plain__caption recipe-preview-card__feedback">
          <strong>Rejected</strong>
          {recipe.rejection_reason}
        </div>
      ) : null}
      {hasImage && categories ? (
        <div className="landing-plain__caption recipe-preview-card__meta">{categories}</div>
      ) : null}
      {ingredients ? (
        <div className="landing-plain__caption recipe-preview-card__meta">{ingredients}</div>
      ) : null}
      <div className="landing-plain__caption recipe-preview-card__meta">
        {recipe.number_of_reviews > 0 && typeof recipe.average_score === 'number'
          ? `Avg: ${recipe.average_score.toFixed(1)}`
          : 'Avg: n/a'}
        {' · '}
        {typeof recipe.number_of_reviews === 'number'
          ? `${recipe.number_of_reviews} review${recipe.number_of_reviews === 1 ? '' : 's'}`
          : 'Review count unavailable'}
      </div>
    </>
  )

  return (
    <Link
      to={getRecipePath(recipe.id)}
      className={isHorizontal
        ? 'landing-plain__latest-card landing-plain__card-button recipe-preview-card recipe-preview-card--horizontal'
        : 'landing-plain__popular-card landing-plain__card-button recipe-preview-card'}
    >
      <div
        className={`${isHorizontal ? 'landing-plain__latest-image' : 'landing-plain__image-placeholder'} recipe-preview-card__image`}
        aria-hidden="true"
      >
        {hasImage ? (
          <img
            className="recipe-preview-card__thumbnail"
            src={imageSource}
            alt=""
            loading="lazy"
            onError={() => setFailedImage(imageSource)}
          />
        ) : (categories || 'No image available.')}
      </div>
      {isHorizontal ? <div className="landing-plain__latest-copy">{content}</div> : content}
    </Link>
  )
}

export default RecipePreviewCard
