import { Link, useParams } from 'react-router-dom'
import {
  formatDate,
  getRecipeBySlug,
  getSuggestedRecipes,
  sampleRecipeSlug,
} from '../data/siteData'

const suggestionPlaceholderCards = Array.from({ length: 3 }, (_, index) => ({
  id: `recipe-suggestion-slot-${index + 1}`,
  slug: sampleRecipeSlug,
  title: 'Recipe name',
}))

function getImageSource(imageRecord) {
  const candidates = [imageRecord?.src, imageRecord?.url, imageRecord?.imageUrl]

  return candidates.find((value) => typeof value === 'string' && value.trim()) ?? ''
}

function getAuthorName(recipe) {
  if (!recipe) {
    return 'Author name'
  }

  if (typeof recipe.author === 'string' && recipe.author.trim()) {
    return recipe.author
  }

  if (recipe.author && typeof recipe.author.name === 'string' && recipe.author.name.trim()) {
    return recipe.author.name
  }

  return 'Author name'
}

function getAuthorSummary(recipe) {
  if (recipe?.authorNote) {
    return recipe.authorNote
  }

  if (recipe?.author && typeof recipe.author.bio === 'string' && recipe.author.bio.trim()) {
    return recipe.author.bio
  }

  return 'Author profile text from the recipe record will appear here.'
}

function getRatingValue(recipe) {
  if (typeof recipe?.ratingAverage === 'number') {
    return recipe.ratingAverage.toFixed(1)
  }

  if (typeof recipe?.rating === 'number') {
    return recipe.rating.toFixed(1)
  }

  return 'Pending'
}

function getReviewCountLabel(recipe, comments) {
  if (typeof recipe?.ratingCount === 'number') {
    return `${recipe.ratingCount} rating${recipe.ratingCount === 1 ? '' : 's'}`
  }

  if (comments.length > 0) {
    return `${comments.length} comment${comments.length === 1 ? '' : 's'}`
  }

  return 'Pending'
}

function RecipePage() {
  const { slug = '' } = useParams()
  const recipe = getRecipeBySlug(slug)
  const gallery = Array.isArray(recipe?.gallery) ? recipe.gallery : []
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : []
  const steps = Array.isArray(recipe?.steps) ? recipe.steps : []
  const comments = Array.isArray(recipe?.comments) ? recipe.comments : []
  const suggestions = recipe ? getSuggestedRecipes(recipe, 3) : []
  const visibleSuggestionCards = suggestions.length > 0 ? suggestions : suggestionPlaceholderCards
  const suggestionGridClassName = `recipe-shell__suggestion-grid recipe-shell__suggestion-grid--${visibleSuggestionCards.length}`
  const previewImages = gallery.slice(0, 6)
  const hasPreviewImages = previewImages.length > 0
  const visibleImageCards = previewImages.length > 0 ? previewImages : [null]
  const imageGridClassName = hasPreviewImages
    ? `recipe-shell__image-grid recipe-shell__image-grid--${visibleImageCards.length}`
    : 'recipe-shell__image-grid recipe-shell__image-grid--empty'
  const isSampleRecipePage = slug === sampleRecipeSlug && !recipe
  const authorName = getAuthorName(recipe)
  const authorSummary = getAuthorSummary(recipe)
  const title = recipe?.title ?? (isSampleRecipePage ? 'Sample recipe' : 'Recipe title')
  const lead =
    recipe?.summary ??
    (isSampleRecipePage
      ? 'This sample recipe page shows the structure that later recipe records will use.'
      : 'This route now holds the full recipe-page structure so Django-backed recipe content can be dropped in without another layout rewrite.')
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
              {visibleImageCards.map((item, index) => {
                const imageSource = getImageSource(item)
                const imageKey = item?.id ?? item?.title ?? `recipe-image-slot-${index + 1}`
                const altBase = title === 'Recipe title' ? 'Recipe image' : title
                const altText =
                  visibleImageCards.length > 1 ? `${altBase} ${index + 1}` : altBase

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
            <div className="recipe-shell__author-mark" aria-hidden="true">
              AU
            </div>
            <div className="recipe-shell__author-copy">
              <h3>{authorName}</h3>
              <p>{authorSummary}</p>
            </div>
          </div>

          <div className="card-meta-strip">
            {publishedOn ? <span>{`Published ${publishedOn}`}</span> : <span>Publish date pending</span>}
            <span>Author profile link pending</span>
          </div>
        </article>

        <div className="recipe-detail__actions recipe-shell__actions">
          <button type="button" className="button button--ghost">
            Share recipe
          </button>
          <button type="button" className="button button--ghost">
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
            {suggestions.length > 0 ? (
              visibleSuggestionCards.map((suggestedRecipe) => (
                <Link
                  key={suggestedRecipe.slug}
                  className="landing-plain__popular-card landing-plain__card-button recipe-shell__suggestion-card"
                  to={`/recipe/${suggestedRecipe.slug}`}
                >
                  <div className="landing-plain__image-placeholder" aria-hidden="true">
                    Recipe image
                  </div>
                  <div className="landing-plain__caption">{suggestedRecipe.title}</div>
                </Link>
              ))
            ) : (
              visibleSuggestionCards.map((item) => (
                <Link
                  key={item.id}
                  className="landing-plain__popular-card landing-plain__card-button recipe-shell__suggestion-card"
                  to={`/recipe/${item.slug}`}
                >
                  <div className="landing-plain__image-placeholder" aria-hidden="true">
                    Recipe image
                  </div>
                  <div className="landing-plain__caption">{item.title}</div>
                </Link>
              ))
            )}
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
