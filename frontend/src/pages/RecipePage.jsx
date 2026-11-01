import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/Button'
import Icon from '../components/Icon'
import RecipePreviewCard from '../components/RecipePreviewCard'
import RecipeReviewForm from '../components/RecipeReviewForm'
import { approveRecipe, rejectRecipe, rejectRecipeDeletion } from '../data/moderationApi'
import { deleteRecipe, deleteRecipeReview, getCurrentProfile, getRecipeDetails, getRecipeEditPath, requestRecipeDeletion, setRecipeFavorite, submitRecipeReview } from '../data/recipeApi'
import { authTokenStorageKey, formatDate } from '../data/siteData'
import { getUserProfilePath } from '../data/userApi'
import useTransientMessage from '../hooks/useTransientMessage'
import useLiveRefresh from '../hooks/useLiveRefresh'
import '../styles/savour-recipe.css'

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

function RecipeChangedDialog({ onClose }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    if (!dialogRef.current.open) dialogRef.current.showModal()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="recipe-changed-dialog"
      aria-labelledby="recipe-changed-title"
      aria-describedby="recipe-changed-message"
      onClose={onClose}
    >
      <h2 id="recipe-changed-title">Recipe changed</h2>
      <p id="recipe-changed-message">The recipe's contents changed. Reload and review them again.</p>
      <button type="button" className="button button--primary" onClick={() => dialogRef.current.close()}>
        Got it
      </button>
    </dialog>
  )
}

function RejectionForm({ disabled, reason, onReasonChange, onReject, onCancel }) {
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
            onReasonChange(event.target.value)
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

function RecipeContent({
  recipe, viewer, isCheckingViewer, isStaff, canManage, roleStatus, status,
  isSubmitting, requiresReload, onApprove, onReject, onRejectDeletion, onReload, onDelete,
  isPostingReview, reviewStatus, reviewErrors, reviewNeedsReload, reviewFormKey, onReview, onDeleteReview, onClearReviewError,
  favoriteIds, favoriteStatus, isSavingFavorite, favoriteNeedsReload, onFavorite,
  reviewDraft, onReviewDraftChange, rejectionReason, onRejectionReasonChange,
  liveStatus,
}) {
  const [failedAuthorPhoto, setFailedAuthorPhoto] = useState('')
  const [failedImages, setFailedImages] = useState([])
  const [showRejectionForm, setShowRejectionForm] = useState(false)
  const gallery = Array.isArray(recipe?.images)
    ? recipe.images
    : Array.isArray(recipe?.gallery) ? recipe.gallery : []
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : []
  const steps = Array.isArray(recipe?.steps)
    ? [...recipe.steps].sort((first, second) => first.step_number - second.step_number)
    : []
  const comments = Array.isArray(recipe?.reviews)
    ? [...recipe.reviews].sort((first, second) => second.id - first.id)
    : []
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
  const isPendingReview = isStaff && !recipe.deletion_requested && !recipe.approved && !recipe.rejected
  const isFavorite = favoriteIds.includes(recipe.id)
  const categoryLabel = Array.isArray(recipe.categories)
    ? recipe.categories.map((category) => category?.name)
      .filter((name) => typeof name === 'string' && name.trim()).join(' / ')
    : ''

  return (
    <div className="content-frame savour-recipe">
      <section className="page-hero recipe-shell__hero">
        <Link className="savour-recipe__back" to="/">
          <Icon name="arrow-left" /> Back to recipes
        </Link>
        <p className="eyebrow">Recipes{categoryLabel ? ` / ${categoryLabel}` : ''}</p>
        <h1>{title}</h1>
        {lead ? <p className="page-hero__lead">{lead}</p> : null}

        <div className="recipe-shell__rating-strip" aria-label="Recipe rating summary">
          <div className="stat-pill recipe-shell__rating-pill">
            <span>Rating</span>
            <strong><Icon name="star" /> {ratingValue}</strong>
          </div>

          <div className="stat-pill recipe-shell__rating-pill">
            <span>Feedback</span>
            <strong>{reviewCountLabel}</strong>
          </div>

          <a className="button button--ghost" href="#recipe-comments">
            Go to reviews
          </a>
        </div>
      </section>

      {roleStatus ? <p className="status-banner" role="status">{roleStatus}</p> : null}
      {liveStatus ? <p className="status-banner" role="status">{liveStatus}</p> : null}

      {isStaff || canManage || recipe.rejected === true ? (
        <section className="page-section savour-recipe__moderation">
          <article className="detail-panel">
            <p className="eyebrow">{isStaff ? 'Recipe review' : 'Recipe status'}</p>
            <h2 className="recipe-shell__status-title">{recipe.deletion_requested
              ? 'Deletion pending approval'
              : recipe.approved ? 'Recipe approved' : recipe.rejected ? 'Recipe rejected' : 'Pending approval'}</h2>
            {recipe.deletion_requested ? (
              <>
                <p>{isStaff
                  ? 'The author requested deletion. Approve to permanently remove this recipe and its reviews, or reject to keep it.'
                  : 'Your deletion request is waiting for admin approval. Editing is unavailable until it is reviewed.'}</p>
                {recipe.approved ? <p>This recipe remains public while the deletion request is pending.</p> : null}
              </>
            ) : null}
            {recipe.rejected === true ? (
              <>
                <p>This recipe is kept privately and is not shown to the public.</p>
                <p><strong>Reason for rejection:</strong></p>
                <p className="recipe-review__reason">{recipe.rejection_reason}</p>
              </>
            ) : null}
            <div className="recipe-review__controls">
              {canManage && !isPendingReview && !recipe.deletion_requested ? (
                <>
                  <p>
                    {recipe.rejected
                      ? 'Edit and resubmit this recipe for a new approval decision.'
                      : isStaff
                        ? 'You can edit or delete this recipe. Editing keeps its current approval status.'
                        : 'Saving edits sends this recipe back for admin approval. It will stay private until approved.'}
                  </p>
                  <div className="review-request__actions">
                    {isSubmitting || requiresReload ? (
                      <button type="button" className="button button--secondary" disabled>
                        {recipe.rejected ? 'Edit and resubmit' : 'Edit recipe'}
                      </button>
                    ) : (
                      <Link className="button button--secondary" to={getRecipeEditPath(recipe.id)}>
                        {recipe.rejected ? 'Edit and resubmit' : 'Edit recipe'}
                      </Link>
                    )}
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={onDelete}
                      disabled={isSubmitting || requiresReload}
                    >
                      {isStaff ? 'Delete recipe' : 'Request deletion'}
                    </button>
                  </div>
                </>
              ) : null}
              {isStaff && recipe.deletion_requested ? (
                <div className="review-request__actions">
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={onDelete}
                    disabled={isSubmitting || requiresReload}
                  >
                    Approve deletion
                  </button>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={onRejectDeletion}
                    disabled={isSubmitting || requiresReload}
                  >
                    Reject deletion
                  </button>
                </div>
              ) : null}
              {isPendingReview ? (
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
                  </div>
                  {showRejectionForm ? (
                    <div id="recipe-rejection-form">
                      <RejectionForm
                        disabled={isSubmitting || requiresReload}
                        reason={rejectionReason}
                        onReasonChange={onRejectionReasonChange}
                        onReject={onReject}
                        onCancel={() => {
                          setShowRejectionForm(false)
                          onRejectionReasonChange('')
                        }}
                      />
                    </div>
                  ) : null}
                </>
              ) : null}
              {requiresReload ? (
                <div className="review-request__actions">
                  <button type="button" className="button button--ghost" onClick={onReload} disabled={isSubmitting}>
                    Reload recipe
                  </button>
                </div>
              ) : null}
              {status ? <p className="status-banner" role="status">{status}</p> : null}
              {isStaff ? (
                <Link className="button button--ghost" to="/staff">
                  Back to pending recipes
                </Link>
              ) : null}
            </div>
          </article>
        </section>
      ) : null}

      <div className="savour-recipe__overview">
        <section className="page-section recipe-shell__media-section" aria-labelledby="recipe-media-title">
          <h2 id="recipe-media-title" className="sr-only">
            Recipe pictures
          </h2>

          <div className="recipe-shell__media-stack">
            <article className="detail-panel recipe-shell__carousel-stage">
              <div className={imageGridClassName}>
                {previewImages.map((item, index) => {
                  const imageSource = getImageSource(item)
                  const hasImage = imageSource && !failedImages.includes(imageSource)
                  const imageKey = item?.id ?? item?.title ?? `recipe-image-slot-${index + 1}`
                  const altText =
                    previewImages.length > 1 ? `${title} ${index + 1}` : title

                  return (
                    <div
                      key={imageKey}
                      className={
                        hasImage
                          ? 'recipe-shell__image-frame'
                          : 'recipe-shell__image-frame recipe-shell__image-frame--empty'
                      }
                    >
                      {hasImage ? (
                        <img
                          className="recipe-shell__image"
                          src={imageSource}
                          alt={altText}
                          onError={() => setFailedImages((current) => current.includes(imageSource)
                            ? current : [...current, imageSource])}
                        />
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

        <div className="recipe-shell__favorite-actions recipe-shell__actions">
          {viewer ? (
            recipe.approved || isFavorite ? (
              <Button
                type="button"
                variant={isFavorite ? 'secondary' : 'primary'}
                className="savour-recipe__favorite-button"
                onClick={onFavorite}
                disabled={isSubmitting || requiresReload}
                aria-pressed={isFavorite}
              >
                <Icon name="heart" />
                {isSavingFavorite ? 'Saving...' : isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              </Button>
            ) : null
          ) : isCheckingViewer ? (
            <Button type="button" variant="secondary" disabled>Loading favorites...</Button>
          ) : recipe.approved && !roleStatus ? (
            <Link className="button button--primary" to="/connect"><Icon name="heart" /> Sign in to save this recipe</Link>
          ) : null}
          {favoriteStatus ? <p className="status-banner" role="status">{favoriteStatus}</p> : null}
          {favoriteNeedsReload ? (
            <Button type="button" variant="ghost" onClick={onReload} disabled={isSubmitting}>
              Reload favorites
            </Button>
          ) : null}
        </div>

        <section className="page-section savour-recipe__ingredients-section">
          <article className="detail-panel">
            <h2 className="recipe-shell__section-label">Ingredients</h2>
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
      </div>

      <section className="page-section savour-recipe__method">
        <article className="detail-panel">
          <h2 className="recipe-shell__section-label">Method</h2>
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
            <h2>Recipe author</h2>
          </div>

          <div className="recipe-shell__author-header">
            <div className="recipe-shell__author-mark" aria-hidden="true">
              {authorPhoto && failedAuthorPhoto !== authorPhoto ? (
                <img src={authorPhoto} alt="" onError={() => setFailedAuthorPhoto(authorPhoto)} />
              ) : (authorName.charAt(0).toUpperCase() || '?')}
            </div>
            <div className="recipe-shell__author-copy">
              <h3>
                {Number.isSafeInteger(author?.id) && author.id > 0 ? (
                  <Link to={getUserProfilePath(author.id)}>{authorName || author.username}</Link>
                ) : (authorName || 'Author information is unavailable.')}
              </h3>
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
      </section>

      <section className="page-section">
        <article className="detail-panel recipe-shell__suggestion-panel">
          <div className="recipe-shell__suggestion-intro">
            <h2>Related recipes</h2>
          </div>

          <p>No related recipes available.</p>
        </article>
      </section>

      <section id="recipe-comments" className="page-section recipe-shell__comments-section">
        <article className="detail-panel recipe-shell__comments-panel">
          <h2 className="recipe-shell__comments-label">Ratings and reviews</h2>

          {recipe.approved ? (
            viewer ? (
              <RecipeReviewForm
                key={reviewFormKey}
                draft={reviewDraft}
                onDraftChange={onReviewDraftChange}
                disabled={isSubmitting || requiresReload}
                isSubmitting={isPostingReview}
                fieldErrors={reviewErrors}
                onClearFieldError={onClearReviewError}
                onSubmit={onReview}
              />
            ) : isCheckingViewer ? (
              <p role="status">Loading review form...</p>
            ) : !roleStatus ? (
              <p><Link to="/connect">Sign in</Link> to rate this recipe and write a review.</p>
            ) : null
          ) : null}
          {reviewStatus ? <p className="status-banner" role="status">{reviewStatus}</p> : null}
          {reviewNeedsReload ? (
            <div className="review-request__actions">
              <button type="button" className="button button--ghost" onClick={onReload} disabled={isSubmitting}>
                Reload recipe
              </button>
            </div>
          ) : null}

          {comments.length > 0 ? (
            <div className="feature-grid">
              {comments.map((comment) => (
                <article key={comment.id} className="comment-card">
                  <div className="comment-card__meta">
                    <strong>
                      <Link to={getUserProfilePath(comment.user)}>{comment.author.name}</Link>
                    </strong>
                    <span>{comment.grade} {comment.grade === 1 ? 'star' : 'stars'}</span>
                    <time dateTime={comment.timestamp}>{getRecordDate(comment.timestamp)}</time>
                  </div>
                  <p className="comment-card__text">{comment.comment}</p>
                  {viewer && comment.can_delete ? (
                    <div className="review-request__actions">
                      <button
                        type="button"
                        className="button button--ghost"
                        aria-label={`Delete review by ${comment.author.name}`}
                        onClick={() => onDeleteReview(comment)}
                        disabled={isSubmitting || requiresReload}
                      >
                        Delete review
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="recipe-shell__comments-empty">
              No reviews yet.
            </p>
          )}
        </article>
      </section>
      {isPendingReview ? (
        <section className="page-section recipe-shell__delete-actions" aria-label="Delete recipe">
          <button
            type="button"
            className="button button--ghost"
            onClick={onDelete}
            disabled={isSubmitting || requiresReload}
          >
            Delete recipe
          </button>
        </section>
      ) : null}
    </div>
  )
}

function RecipeDetails({ recipeId }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState(null)
  const [loadStatus, setLoadStatus] = useState('Loading recipe...')
  const [viewer, setViewer] = useState(null)
  const [isCheckingViewer, setIsCheckingViewer] = useState(() => Boolean(window.sessionStorage.getItem(authTokenStorageKey)))
  const [roleStatus, setRoleStatus] = useState('')
  const [status, setStatus] = useState('')
  const [confirmation, setConfirmation] = useTransientMessage(() => location.state?.recipeEditSaved
    ? location.state.submittedForApproval
      ? 'Recipe changes saved and submitted for admin approval.'
      : 'Recipe changes saved.'
    : '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [requiresReload, setRequiresReload] = useState(false)
  const [showRecipeChanged, setShowRecipeChanged] = useState(false)
  const [isPostingReview, setIsPostingReview] = useState(false)
  const [reviewStatus, setReviewStatus] = useState('')
  const [reviewConfirmation, setReviewConfirmation] = useTransientMessage('')
  const [reviewErrors, setReviewErrors] = useState({})
  const [reviewNeedsReload, setReviewNeedsReload] = useState(false)
  const [reviewFormKey, setReviewFormKey] = useState(0)
  const [reviewDraft, setReviewDraft] = useState({ grade: '', comment: '' })
  const [rejectionReason, setRejectionReason] = useState('')
  const [liveStatus, setLiveStatus] = useState('')
  const [favoriteIds, setFavoriteIds] = useState([])
  const [favoriteStatus, setFavoriteStatus] = useState('')
  const [favoriteConfirmation, setFavoriteConfirmation] = useTransientMessage('')
  const [isSavingFavorite, setIsSavingFavorite] = useState(false)
  const [favoriteNeedsReload, setFavoriteNeedsReload] = useState(false)
  const actionInFlight = useRef(false)
  const isMounted = useRef(false)
  const isStaff = viewer?.is_staff === true
  const canManage = isStaff || (viewer !== null && recipe?.user === viewer.id)

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
        if (!controller.signal.aborted) {
          setFavoriteIds(profile.favorites)
          setViewer(profile.user)
        }
      } catch {
        if (!controller.signal.aborted) {
          setRoleStatus('Unable to load your account. Reload to try again.')
        }
      } finally {
        if (!controller.signal.aborted) setIsCheckingViewer(false)
      }
    }

    loadRecipe()
    if (window.sessionStorage.getItem(authTokenStorageKey)) loadRole()

    return () => {
      isMounted.current = false
      controller.abort()
    }
  }, [recipeId])

  const cancelRefresh = useLiveRefresh(async (signal) => {
    if (actionInFlight.current) return
    const token = window.sessionStorage.getItem(authTokenStorageKey)
    try {
      const latestProfile = token ? await getCurrentProfile(signal) : null
      if (signal.aborted || actionInFlight.current) return
      if (window.sessionStorage.getItem(authTokenStorageKey) !== token
        || (viewer && latestProfile?.user.id !== viewer.id)) {
        throw Object.assign(new Error('Your signed-in account changed. Reload this page to continue.'), { status: 401 })
      }
      setViewer(latestProfile?.user ?? null)
      setFavoriteIds(latestProfile?.favorites ?? [])
      setRoleStatus('')
      if (!recipe.approved && latestProfile?.user.is_staff !== true
        && recipe.user !== latestProfile?.user.id) {
        setRecipe(null)
        setLoadStatus('This recipe is no longer available to your account.')
        return
      }
      const latestRecipe = await getRecipeDetails(recipeId, signal)
      if (signal.aborted || actionInFlight.current
        || window.sessionStorage.getItem(authTokenStorageKey) !== token) return
      setLiveStatus(latestRecipe.content_revision !== recipe.content_revision
        ? 'This recipe was updated by another user. Review the current contents before taking action.'
        : '')
      setRecipe(latestRecipe)
    } catch (error) {
      if (signal.aborted || actionInFlight.current) return
      if ([401, 403, 404].includes(error.status)) {
        setRecipe(null)
        setLoadStatus(error.message)
        if (error.status === 401) {
          setViewer(null)
          setFavoriteIds([])
        }
      } else {
        setLiveStatus('Unable to refresh this recipe. Showing the last loaded version.')
      }
    }
  }, { enabled: Boolean(recipe) && !isCheckingViewer && !isSubmitting && !requiresReload, refreshKey: recipeId })

  async function handleFavorite() {
    if (actionInFlight.current || requiresReload || !viewer || !recipe) return
    const desiredFavorite = !favoriteIds.includes(recipe.id)
    if (desiredFavorite && !recipe.approved) return
    cancelRefresh()
    actionInFlight.current = true
    setIsSubmitting(true)
    setIsSavingFavorite(true)
    setFavoriteConfirmation('')
    setFavoriteStatus('Saving favorites...')

    try {
      const savedIds = await setRecipeFavorite(recipe.id, desiredFavorite, viewer.id)
      if (isMounted.current) {
        setFavoriteIds(savedIds)
        setFavoriteStatus('')
        setFavoriteConfirmation(desiredFavorite ? 'Added to favorites.' : 'Removed from favorites.')
      }
    } catch (error) {
      if (isMounted.current) {
        setFavoriteStatus(error.message)
        if (error.requiresReload) {
          setRequiresReload(true)
          setFavoriteNeedsReload(true)
        }
      }
    } finally {
      actionInFlight.current = false
      if (isMounted.current) {
        setIsSubmitting(false)
        setIsSavingFavorite(false)
      }
    }
  }

  async function handleReview(payload) {
    if (actionInFlight.current || requiresReload || !viewer || !recipe?.approved) return false
    cancelRefresh()
    actionInFlight.current = true
    setIsSubmitting(true)
    setIsPostingReview(true)
    setReviewErrors({})
    setReviewConfirmation('')
    setReviewStatus('Posting review...')

    try {
      const savedRecipe = await submitRecipeReview(recipe.id, payload, viewer.id)
      if (!isMounted.current) return false
      setRecipe(savedRecipe)
      setReviewStatus('')
      setReviewConfirmation('Review posted.')
      return true
    } catch (error) {
      if (isMounted.current) {
        setReviewErrors(error.fieldErrors || {})
        setReviewStatus(error.message)
        if (error.requiresReload) {
          setRequiresReload(true)
          setReviewNeedsReload(true)
        }
      }
      return false
    } finally {
      actionInFlight.current = false
      if (isMounted.current) {
        setIsSubmitting(false)
        setIsPostingReview(false)
      }
    }
  }

  async function handleDeleteReview(review) {
    if (actionInFlight.current || requiresReload || !viewer || !recipe
      || review.can_delete !== true || !recipe.reviews.some((item) => item.id === review.id)) return
    if (!window.confirm('Delete this review and its star rating? This cannot be undone.')) return
    cancelRefresh()
    actionInFlight.current = true
    setIsSubmitting(true)
    setReviewConfirmation('')
    setReviewStatus('Deleting review...')

    try {
      const savedRecipe = await deleteRecipeReview(recipe.id, review.id)
      if (isMounted.current) {
        setRecipe(savedRecipe)
        setReviewStatus('')
        setReviewConfirmation('Review deleted.')
      }
    } catch (error) {
      if (isMounted.current) {
        setReviewStatus(error.message)
        if (error.requiresReload) {
          setRequiresReload(true)
          setReviewNeedsReload(true)
        }
      }
    } finally {
      actionInFlight.current = false
      if (isMounted.current) setIsSubmitting(false)
    }
  }

  function handleClearReviewError(field) {
    setReviewErrors((current) => ({ ...current, [field]: undefined }))
    if (!requiresReload && !actionInFlight.current) {
      setReviewStatus('')
      setReviewConfirmation('')
    }
  }

  async function handleDelete() {
    if (actionInFlight.current || requiresReload || !canManage || !recipe
      || (!isStaff && recipe.deletion_requested)) return
    const prompt = isStaff
      ? `${recipe.deletion_requested ? 'Approve deletion of' : 'Delete'} "${recipe.title}"? This permanently removes the recipe and its reviews.`
      : `Request deletion of "${recipe.title}"? An admin must approve before the recipe is removed.`
    if (!window.confirm(prompt)) return
    cancelRefresh()
    actionInFlight.current = true
    setIsSubmitting(true)
    setConfirmation('')
    setStatus(isStaff ? 'Deleting recipe...' : 'Sending deletion request...')

    try {
      if (isStaff) {
        await deleteRecipe(recipe.id)
        if (isMounted.current) {
          navigate('/staff', { replace: true, state: { recipeDeleted: true } })
        }
      } else {
        const savedRecipe = await requestRecipeDeletion(recipe.id)
        if (isMounted.current) {
          setRecipe(savedRecipe)
          setStatus('')
          setConfirmation('Deletion requested. Waiting for admin approval.')
        }
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

  async function handleDecision(decision, reason) {
    if (actionInFlight.current || requiresReload || !isStaff
      || recipe?.approved !== false || recipe?.rejected !== false || recipe.deletion_requested) return
    cancelRefresh()
    actionInFlight.current = true
    setIsSubmitting(true)
    setConfirmation('')
    setStatus(decision === 'approve' ? 'Saving approval...' : 'Saving rejection...')

    try {
      const savedRecipe = decision === 'approve'
        ? await approveRecipe(recipe)
        : await rejectRecipe(recipe, reason)
      if (isMounted.current) {
        setRecipe(savedRecipe)
        setStatus('')
        setConfirmation(decision === 'approve' ? 'Recipe approved.' : 'Recipe rejected.')
        setRejectionReason('')
      }
    } catch (error) {
      if (isMounted.current) {
        setStatus(error.message)
        if (error.requiresReload) setRequiresReload(true)
        if (error.recipeChanged) setShowRecipeChanged(true)
      }
    } finally {
      actionInFlight.current = false
      if (isMounted.current) setIsSubmitting(false)
    }
  }

  async function handleDeletionRejection() {
    if (actionInFlight.current || requiresReload || !isStaff || !recipe?.deletion_requested) return
    cancelRefresh()
    actionInFlight.current = true
    setIsSubmitting(true)
    setConfirmation('')
    setStatus('Rejecting deletion request...')

    try {
      const savedRecipe = await rejectRecipeDeletion(recipe)
      if (isMounted.current) {
        setRecipe(savedRecipe)
        setStatus('')
        setConfirmation('Deletion request rejected. Recipe kept.')
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
    cancelRefresh()
    actionInFlight.current = true
    setIsSubmitting(true)
    setShowRecipeChanged(false)
    setConfirmation('')
    if (reviewNeedsReload) {
      setReviewConfirmation('')
      setReviewStatus('Refreshing reviews...')
    } else if (favoriteNeedsReload) {
      setFavoriteConfirmation('')
      setFavoriteStatus('Refreshing favorites...')
    } else {
      setStatus('Checking recipe status...')
    }

    try {
      const latestProfile = favoriteNeedsReload ? await getCurrentProfile() : null
      if (latestProfile && latestProfile.user.id !== viewer.id) {
        throw new Error('Your signed-in account changed. Reload this page to continue.')
      }
      let latestRecipe
      try {
        latestRecipe = await getRecipeDetails(recipeId)
      } catch (error) {
        if (!latestProfile || ![403, 404].includes(error.status)) throw error
        if (isMounted.current) {
          setFavoriteIds(latestProfile.favorites)
          setViewer(latestProfile.user)
          setFavoriteNeedsReload(false)
          setRequiresReload(false)
          setFavoriteStatus('')
          setRecipe(null)
          setLoadStatus('This recipe is no longer available. Your favorites were refreshed; you can manage them from your profile.')
        }
        return
      }
      if (latestRecipe.id !== recipe.id) {
        throw new Error('This recipe has changed. Return to the pending list and open it again.')
      }
      if (isMounted.current) {
        setRecipe(latestRecipe)
        setRequiresReload(false)
        setStatus('')
        if (reviewNeedsReload) {
          setReviewNeedsReload(false)
          setReviewErrors({})
          setReviewFormKey((current) => current + 1)
          setReviewStatus('')
          setReviewConfirmation('Reviews refreshed. Check the list before trying again.')
        } else if (favoriteNeedsReload) {
          setFavoriteIds(latestProfile.favorites)
          setViewer(latestProfile.user)
          setFavoriteNeedsReload(false)
          setFavoriteStatus('')
          setFavoriteConfirmation('Favorites refreshed.')
        } else {
          setConfirmation(latestRecipe.deletion_requested
            ? 'Deletion is waiting for admin approval.'
            : latestRecipe.approved
              ? 'Recipe approved.'
              : latestRecipe.rejected ? 'Recipe rejected.' : 'This recipe is still pending approval.')
        }
      }
    } catch (error) {
      if (isMounted.current) {
        if (reviewNeedsReload) setReviewStatus(error.message)
        else if (favoriteNeedsReload) setFavoriteStatus(error.message)
        else setStatus(error.message)
      }
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
          {viewer ? <Link className="button button--ghost" to="/profile">Your profile</Link> : null}
        </section>
      </div>
    )
  }

  return (
    <>
      {showRecipeChanged ? <RecipeChangedDialog onClose={() => setShowRecipeChanged(false)} /> : null}
      <RecipeContent
        key={recipe.id}
        recipe={recipe}
        viewer={viewer}
        isCheckingViewer={isCheckingViewer}
        isStaff={isStaff}
        canManage={canManage}
        roleStatus={roleStatus}
        status={status || confirmation}
        liveStatus={liveStatus}
        isSubmitting={isSubmitting}
        requiresReload={requiresReload}
        onApprove={() => handleDecision('approve')}
        onReject={(reason) => handleDecision('reject', reason)}
        onRejectDeletion={handleDeletionRejection}
        onReload={handleReload}
        onDelete={handleDelete}
        isPostingReview={isPostingReview}
        reviewStatus={reviewStatus || reviewConfirmation}
        reviewErrors={reviewErrors}
        reviewNeedsReload={reviewNeedsReload}
        reviewFormKey={reviewFormKey}
        reviewDraft={reviewDraft}
        onReviewDraftChange={setReviewDraft}
        rejectionReason={rejectionReason}
        onRejectionReasonChange={setRejectionReason}
        onReview={handleReview}
        onDeleteReview={handleDeleteReview}
        onClearReviewError={handleClearReviewError}
        favoriteIds={favoriteIds}
        favoriteStatus={favoriteStatus || favoriteConfirmation}
        isSavingFavorite={isSavingFavorite}
        favoriteNeedsReload={favoriteNeedsReload}
        onFavorite={handleFavorite}
      />
    </>
  )
}

function RecipePage() {
  const { recipeId } = useParams()
  return <RecipeDetails key={recipeId} recipeId={recipeId} />
}

export default RecipePage
