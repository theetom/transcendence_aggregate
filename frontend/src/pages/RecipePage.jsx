import { Link } from 'react-router-dom'
import { formatDate } from '../data/siteData'

function getImageSource(imageRecord) {
  const candidates = [imageRecord?.src, imageRecord?.url, imageRecord?.imageUrl]

  return candidates.find((value) => typeof value === 'string' && value.trim()) ?? ''
}

function getAuthorName(recipe) {
  if (!recipe) {
    return ''
  }

  if (typeof recipe.author === 'string' && recipe.author.trim()) {
    return recipe.author
  }

  if (recipe.author && typeof recipe.author.name === 'string' && recipe.author.name.trim()) {
    return recipe.author.name
  }

  return ''
}

function getAuthorSummary(recipe) {
  if (recipe?.authorNote) {
    return recipe.authorNote
  }

  if (recipe?.author && typeof recipe.author.bio === 'string' && recipe.author.bio.trim()) {
    return recipe.author.bio
  }

  return ''
}

function getRatingValue(recipe) {
  if (typeof recipe?.ratingAverage === 'number') {
    return recipe.ratingAverage.toFixed(1)
  }

  if (typeof recipe?.rating === 'number') {
    return recipe.rating.toFixed(1)
  }

  return ''
}

function getReviewCountLabel(recipe, comments) {
  if (typeof recipe?.ratingCount === 'number') {
    return `${recipe.ratingCount} rating${recipe.ratingCount === 1 ? '' : 's'}`
  }

  if (comments.length > 0) {
    return `${comments.length} comment${comments.length === 1 ? '' : 's'}`
  }

  return ''
}

function RecipePage({ recipe = null, suggestions = [] }) {
  const gallery = Array.isArray(recipe?.gallery) ? recipe.gallery : []
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : []
  const steps = Array.isArray(recipe?.steps) ? recipe.steps : []
  const comments = Array.isArray(recipe?.comments) ? recipe.comments : []
  const suggestionGridClassName = `recipe-shell__suggestion-grid recipe-shell__suggestion-grid--${suggestions.length}`
  const previewImages = gallery.slice(0, 6)
  const hasPreviewImages = previewImages.length > 0
  const imageGridClassName = hasPreviewImages
    ? `recipe-shell__image-grid recipe-shell__image-grid--${previewImages.length}`
    : 'recipe-shell__image-grid recipe-shell__image-grid--empty'
  const authorName = getAuthorName(recipe)
  const authorSummary = getAuthorSummary(recipe)
  const title = recipe?.title ?? 'Recipe'
  const lead = recipe?.summary
  const ratingValue = getRatingValue(recipe)
  const reviewCountLabel = getReviewCountLabel(recipe, comments)
  const publishedOn = recipe?.addedOn ? formatDate(recipe.addedOn) : null

  return (
    <div className="content-frame">
      <section className="page-hero recipe-shell__hero">
        <p className="eyebrow">Recipe page</p>
        <h1>{title}</h1>
        <p className="page-hero__lead">{lead}</p>

        <div className="recipe-shell__rating-strip" aria-label="Recipe rating summary">
          <div className="stat-pill recipe-shell__rating-pill">
            <span>Rating</span>
            <strong>{ratingValue}</strong>
          </div>

          <div className="stat-pill recipe-shell__rating-pill">
            <span>Feedback</span>
            <strong>{reviewCountLabel}</strong>
          </div>

          <a className="button button--ghost" href="#recipe-comments">
            Go to comments
          </a>
        </div>
      </section>

      <section className="page-section recipe-shell__media-section" aria-labelledby="recipe-media-title">
        <h2 id="recipe-media-title" className="sr-only">
          Pictures carousel
        </h2>

        <div className="recipe-shell__media-stack">
          <article className="gallery-card recipe-shell__carousel-stage">
            <h3 className="recipe-shell__media-title">Recipe image</h3>

            <div className={imageGridClassName}>
              {previewImages.map((item, index) => {
                const imageSource = getImageSource(item)
                const imageKey = item?.id ?? item?.title ?? `recipe-image-slot-${index + 1}`
                const altText =
                  previewImages.length > 1 ? `${title} ${index + 1}` : title

                return (
                  <div
                    key={imageKey}
                    className={
                      imageSource
                        ? 'recipe-shell__image-frame'
                        : 'recipe-shell__image-frame recipe-shell__image-frame--empty'
                    }
                  >
                    {imageSource ? (
                      <img className="recipe-shell__image" src={imageSource} alt={altText} />
                    ) : (
                      <div className="recipe-shell__image-empty">No image available.</div>
                    )}
                  </div>
                )
              })}
              {!hasPreviewImages ? (
                <div className="recipe-shell__image-frame recipe-shell__image-frame--empty">
                  <div className="recipe-shell__image-empty">Images have not been loaded.</div>
                </div>
              ) : null}
            </div>
          </article>
        </div>
      </section>

      <section className="page-section">
        <article className="detail-panel">
          <p className="eyebrow recipe-shell__section-label">Ingredients</p>
          {ingredients.length > 0 ? (
            <ul className="ingredient-list">
              {ingredients.map((ingredient) => (
                <li key={ingredient}>{ingredient}</li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              Ingredient records from the recipe payload will render here.
            </div>
          )}
        </article>
      </section>

      <section className="page-section">
        <article className="detail-panel">
          <p className="eyebrow recipe-shell__section-label">Steps</p>
          {steps.length > 0 ? (
            <ol className="step-list">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : (
            <div className="empty-state">
              Ordered preparation steps from the backend will render here.
            </div>
          )}
        </article>
      </section>

      <section className="page-section">
        <article className="detail-panel recipe-shell__author-panel">
          <div className="recipe-shell__author-intro">
            <p className="eyebrow">Author</p>
            <h3>Recipe author</h3>
          </div>

          <div className="recipe-shell__author-header">
            <div className="recipe-shell__author-mark" aria-hidden="true" />
            <div className="recipe-shell__author-copy">
              <h3>{authorName}</h3>
              <p>{authorSummary}</p>
            </div>
          </div>

          <div className="card-meta-strip">
            {publishedOn ? <span>{`Published ${publishedOn}`}</span> : null}
            <span>Author profile link pending</span>
          </div>
        </article>

        <div className="recipe-detail__actions recipe-shell__actions">
          <button type="button" className="button button--ghost" disabled>
            Share recipe
          </button>
          <button type="button" className="button button--ghost" disabled>
            Add to favorites
          </button>
        </div>
      </section>

      <section className="page-section">
        <article className="detail-panel recipe-shell__suggestion-panel">
          <div className="recipe-shell__suggestion-intro">
            <h3>Related Recipes</h3>
          </div>

          <div className={suggestionGridClassName}>
            {suggestions.map((suggestedRecipe) => (
              <Link
                key={suggestedRecipe.slug}
                className="landing-plain__popular-card landing-plain__card-button recipe-shell__suggestion-card"
                to={`/recipe/${suggestedRecipe.slug}`}
              >
                <div className="landing-plain__image-placeholder" aria-hidden="true" />
                <div className="landing-plain__caption">{suggestedRecipe.title}</div>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <section id="recipe-comments" className="page-section recipe-shell__comments-section">
        <article className="detail-panel recipe-shell__comments-panel">
          <p className="eyebrow recipe-shell__comments-label">Comments</p>

          {comments.length > 0 ? (
            <div className="feature-grid">
              {comments.map((comment) => (
                <article key={`${comment.author}-${comment.date}`} className="comment-card">
                  <div className="comment-card__meta">
                    <strong>{comment.author}</strong>
                    <span>{comment.date}</span>
                  </div>
                  <p>{comment.text}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="recipe-shell__comments-empty">
              Recipe comments will render in this section after public comment data is available.
            </p>
          )}
        </article>
      </section>
    </div>
  )
}

export default RecipePage
