import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import RecipePreviewCard from '../components/RecipePreviewCard'
import { approveRecipe, rejectRecipe } from '../data/moderationApi'
import { getCurrentProfile, getRecipeDetails } from '../data/recipeApi'
import { authTokenStorageKey, formatDate } from '../data/siteData'

function getImageSource(imageRecord) {
  const candidates = [imageRecord?.image, imageRecord?.src, imageRecord?.url, imageRecord?.imageUrl]

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
  if (recipe.number_of_reviews > 0 && typeof recipe.average_score === 'number') {
    return recipe.average_score.toFixed(1)
  }

  return 'No ratings yet'
}

function getReviewCountLabel(recipe) {
  if (typeof recipe.number_of_reviews === 'number') {
    return `${recipe.number_of_reviews} rating${recipe.number_of_reviews === 1 ? '' : 's'}`
  }

  return 'No ratings yet'
}

function getRecordDate(value) {
  const date = typeof value === 'string' ? value.split('T')[0] : ''
  return date && !Number.isNaN(Date.parse(`${date}T12:00:00`)) ? formatDate(date) : null
}

function RejectionForm({ disabled, onReject, onCancel }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    if (disabled) return

    const trimmedReason = reason.trim()
    if (!trimmedReason) {
      setError('Enter a reason for rejecting this recipe.')
      return
    }
    if (trimmedReason.length > 1000) {
      setError('Keep the reason within 1,000 characters.')
      return
    }

    setError('')
    onReject(trimmedReason)
  }

  return (
    <form className="field-list" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="recipe-rejection-reason">Reason for rejection</label>
        <p id="recipe-rejection-help">The author will see this reason. The recipe will stay saved privately.</p>
        <textarea
          id="recipe-rejection-reason"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
            setError('')
          }}
          rows={4}
          maxLength={1000}
          disabled={disabled}
          required
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'recipe-rejection-help recipe-rejection-error' : 'recipe-rejection-help'}
        />
        {error ? <p id="recipe-rejection-error" className="status-banner" role="alert">{error}</p> : null}
      </div>
      <div className="review-request__actions">
        <button type="submit" className="button button--secondary" disabled={disabled}>
          Confirm rejection
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel} disabled={disabled}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function RecipeContent({ recipe, isStaff, roleStatus, status, isSubmitting, requiresReload, onApprove, onReject, onReload }) {
  const [failedAuthorPhoto, setFailedAuthorPhoto] = useState('')
  const [showRejectionForm, setShowRejectionForm] = useState(false)
  const gallery = Array.isArray(recipe?.images)
    ? recipe.images
    : Array.isArray(recipe?.gallery) ? recipe.gallery : []
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : []
  const steps = Array.isArray(recipe?.steps)
    ? [...recipe.steps].sort((first, second) => first.step_number - second.step_number)
    : []
  const comments = Array.isArray(recipe?.reviews) ? recipe.reviews : []
  const previewImages = gallery.slice(0, 6)
  const hasPreviewImages = previewImages.length > 0
  const imageGridClassName = hasPreviewImages
    ? `recipe-shell__image-grid recipe-shell__image-grid--${previewImages.length}`
    : 'recipe-shell__image-grid recipe-shell__image-grid--empty'
  const authorName = getAuthorName(recipe)
  const authorSummary = getAuthorSummary(recipe)
  const author = recipe.author && typeof recipe.author === 'object' ? recipe.author : null
  const authorPhoto = typeof author?.profile_picture === 'string' ? author.profile_picture : ''
  const authorRecipes = Array.isArray(author?.approved_recipes)
    ? author.approved_recipes.filter((item) => (
      item?.approved === true
      && Number.isSafeInteger(item.id)
      && item.id > 0
      && item.id !== recipe.id
      && typeof item.title === 'string'
      && item.title.trim()
    ))
    : []
  const title = recipe?.title ?? 'Recipe'
  const lead = recipe?.description
  const ratingValue = getRatingValue(recipe)
  const reviewCountLabel = getReviewCountLabel(recipe)
  const submittedOn = getRecordDate(recipe.date_created)

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

      {roleStatus ? <p className="status-banner" role="status">{roleStatus}</p> : null}

      {isStaff || recipe.rejected === true ? (
        <section className="page-section">
          <article className="detail-panel">
            <p className="eyebrow">{isStaff ? 'Recipe review' : 'Recipe status'}</p>
            <h2>{recipe.approved ? 'Recipe approved' : recipe.rejected ? 'Recipe rejected' : 'Pending approval'}</h2>
            {recipe.rejected === true ? (
              <>
                <p>This recipe is kept privately and is not shown to the public.</p>
                <p><strong>Reason for rejection:</strong></p>
                <p className="recipe-review__reason">{recipe.rejection_reason}</p>
              </>
            ) : null}
            {isStaff && recipe.approved === false && recipe.rejected === false ? (
              <>
                <div className="review-request__actions">
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={onApprove}
                    disabled={isSubmitting || requiresReload}
                  >
                    {isSubmitting ? 'Saving...' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => setShowRejectionForm(true)}
                    disabled={isSubmitting || requiresReload || showRejectionForm}
                    aria-expanded={showRejectionForm}
                    aria-controls="recipe-rejection-form"
                  >
                    Reject
                  </button>
                  {requiresReload ? (
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={onReload}
                      disabled={isSubmitting}
                    >
                      Reload recipe
                    </button>
                  ) : null}
                </div>
                {showRejectionForm ? (
                  <div id="recipe-rejection-form">
                    <RejectionForm
                      disabled={isSubmitting || requiresReload}
                      onReject={onReject}
                      onCancel={() => setShowRejectionForm(false)}
                    />
                  </div>
                ) : null}
              </>
            ) : null}
            {status ? <p className="status-banner" role="status">{status}</p> : null}
            {isStaff ? (
              <Link className="button button--ghost" to="/staff">
                Back to pending recipes
              </Link>
            ) : null}
          </article>
        </section>
      ) : null}

      <section className="page-section recipe-shell__media-section" aria-labelledby="recipe-media-title">
        <h2 id="recipe-media-title" className="sr-only">
          Recipe pictures
        </h2>

        <div className="recipe-shell__media-stack">
          <article className="detail-panel recipe-shell__carousel-stage">
            <p className="eyebrow recipe-shell__section-label">Recipe image</p>

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
                  <div className="recipe-shell__image-empty">No image available.</div>
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
              {ingredients.map((ingredient, index) => (
                <li key={`${ingredient.name}-${index}`}>
                  {ingredient.quantity} {ingredient.unit} {ingredient.name}
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              No ingredients listed.
            </div>
          )}
        </article>
      </section>

      <section className="page-section">
        <article className="detail-panel">
          <p className="eyebrow recipe-shell__section-label">Steps</p>
          {steps.length > 0 ? (
            <ol className="step-list">
              {steps.map((step, index) => (
                <li key={`${step.step_number}-${index}`}>{step.instruction}</li>
              ))}
            </ol>
          ) : (
            <div className="empty-state">
              No preparation steps listed.
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
              {authorPhoto && failedAuthorPhoto !== authorPhoto ? (
                <img src={authorPhoto} alt="" onError={() => setFailedAuthorPhoto(authorPhoto)} />
              ) : (authorName.charAt(0).toUpperCase() || '?')}
            </div>
            <div className="recipe-shell__author-copy">
              <h3>{authorName || 'Author information is unavailable.'}</h3>
              {author?.username ? <p>@{author.username}</p> : null}
              {author ? <p><strong>Email:</strong> {author.email || 'Not provided'}</p> : null}
              {authorSummary ? <p>{authorSummary}</p> : null}
            </div>
          </div>

          <div className="card-meta-strip">
            {submittedOn ? <span>{`Submitted ${submittedOn}`}</span> : null}
          </div>
          {author ? (
            <div className="recipe-shell__author-recipes">
              <h3>Other recipes by this author</h3>
              {authorRecipes.length > 0 ? (
                <div className="recipe-preview-grid recipe-preview-grid--compact recipe-preview-grid--large-photos">
                  {authorRecipes.map((item) => (
                    <RecipePreviewCard key={item.id} recipe={item} />
                  ))}
                </div>
              ) : <p>No other approved recipes yet.</p>}
            </div>
          ) : null}
        </article>

        <div className="recipe-detail__actions recipe-shell__actions">
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

          <p>No related recipes available.</p>
        </article>
      </section>

      <section id="recipe-comments" className="page-section recipe-shell__comments-section">
        <article className="detail-panel recipe-shell__comments-panel">
          <p className="eyebrow recipe-shell__comments-label">Comments</p>

          {comments.length > 0 ? (
            <div className="feature-grid">
              {comments.map((comment) => (
                <article key={comment.id} className="comment-card">
                  <div className="comment-card__meta">
                    <strong>Review</strong>
                    <span>{getRecordDate(comment.timestamp)}</span>
                  </div>
                  <p>{comment.comment}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="recipe-shell__comments-empty">
              No comments yet.
            </p>
          )}
        </article>
      </section>
    </div>
  )
}

function RecipeDetails({ recipeId }) {
  const [recipe, setRecipe] = useState(null)
  const [loadStatus, setLoadStatus] = useState('Loading recipe...')
  const [isStaff, setIsStaff] = useState(false)
  const [roleStatus, setRoleStatus] = useState('')
  const [status, setStatus] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [requiresReload, setRequiresReload] = useState(false)
  const actionInFlight = useRef(false)
  const isMounted = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    isMounted.current = true

    async function loadRecipe() {
      try {
        const details = await getRecipeDetails(recipeId, controller.signal)
        if (!controller.signal.aborted) setRecipe(details)
      } catch (error) {
        if (!controller.signal.aborted) setLoadStatus(error.message)
      }
    }

    async function loadRole() {
      try {
        const profile = await getCurrentProfile(controller.signal)
        if (!controller.signal.aborted) setIsStaff(profile.user.is_staff === true)
      } catch {
        if (!controller.signal.aborted) {
          setRoleStatus('Unable to check whether this account can review recipes. Reload to try again.')
        }
      }
    }

    loadRecipe()
    if (window.sessionStorage.getItem(authTokenStorageKey)) loadRole()

    return () => {
      isMounted.current = false
      controller.abort()
    }
  }, [recipeId])

  async function handleDecision(decision, reason) {
    if (actionInFlight.current || requiresReload || !isStaff
      || recipe?.approved !== false || recipe?.rejected !== false) return
    actionInFlight.current = true
    setIsSubmitting(true)
    setStatus(decision === 'approve' ? 'Saving approval...' : 'Saving rejection...')

    try {
      const savedRecipe = decision === 'approve'
        ? await approveRecipe(recipe)
        : await rejectRecipe(recipe, reason)
      if (isMounted.current) {
        setRecipe(savedRecipe)
        setStatus(decision === 'approve' ? 'Recipe approved.' : 'Recipe rejected.')
      }
    } catch (error) {
      if (isMounted.current) {
        setStatus(error.message)
        if (error.requiresReload) setRequiresReload(true)
      }
    } finally {
      actionInFlight.current = false
      if (isMounted.current) setIsSubmitting(false)
    }
  }

  async function handleReload() {
    if (actionInFlight.current || !requiresReload) return
    actionInFlight.current = true
    setIsSubmitting(true)
    setStatus('Checking recipe status...')

    try {
      const latestRecipe = await getRecipeDetails(recipeId)
      if (latestRecipe.id !== recipe.id) {
        throw new Error('This recipe has changed. Return to the pending list and open it again.')
      }
      if (isMounted.current) {
        setRecipe(latestRecipe)
        setRequiresReload(false)
        setStatus(latestRecipe.approved
          ? 'Recipe approved.'
          : latestRecipe.rejected ? 'Recipe rejected.' : 'This recipe is still pending approval.')
      }
    } catch (error) {
      if (isMounted.current) setStatus(error.message)
    } finally {
      actionInFlight.current = false
      if (isMounted.current) setIsSubmitting(false)
    }
  }

  if (!recipe) {
    return (
      <div className="content-frame">
        <section className="page-hero">
          <p className="eyebrow">Recipe page</p>
          <h1>Recipe</h1>
          <p className="page-hero__lead" role="status">{loadStatus}</p>
          {isStaff ? (
            <Link className="button button--ghost" to="/staff">
              Back to pending recipes
            </Link>
          ) : (
            <Link className="button button--ghost" to="/">
              Back to home
            </Link>
          )}
          {roleStatus ? <p className="status-banner" role="status">{roleStatus}</p> : null}
        </section>
      </div>
    )
  }

  return (
    <RecipeContent
      recipe={recipe}
      isStaff={isStaff}
      roleStatus={roleStatus}
      status={status}
      isSubmitting={isSubmitting}
      requiresReload={requiresReload}
      onApprove={() => handleDecision('approve')}
      onReject={(reason) => handleDecision('reject', reason)}
      onReload={handleReload}
    />
  )
}

function RecipePage() {
  const { recipeId } = useParams()
  return <RecipeDetails key={recipeId} recipeId={recipeId} />
}

export default RecipePage
