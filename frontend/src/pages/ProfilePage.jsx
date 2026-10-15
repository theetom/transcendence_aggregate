import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCurrentProfile, getRecipeDetails, getRecipePath, readRecipeSummary, requestRecipeApi } from '../data/recipeApi'
import { formatDate } from '../data/siteData'

const recipePreviewLimit = 3

function ProfileRecipeCard({ recipe }) {
  const [failedImage, setFailedImage] = useState('')
  const imageSource = Array.isArray(recipe.images)
    ? recipe.images.find((image) => typeof image?.image === 'string' && image.image.trim())?.image
    : null
  const hasImage = Boolean(imageSource) && failedImage !== imageSource
  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.map((ingredient) => ingredient.name).join(', ')
    : ''
  const categories = Array.isArray(recipe.categories)
    ? recipe.categories.map((category) => category.name).join(', ')
    : ''

  return (
    <Link
      to={getRecipePath(recipe.title)}
      className="landing-plain__popular-card landing-plain__card-button"
    >
      <div className="landing-plain__image-placeholder profile-page__recipe-image" aria-hidden="true">
        {hasImage ? (
          <img
            className="profile-page__recipe-thumbnail"
            src={imageSource}
            alt=""
            loading="lazy"
            onError={() => setFailedImage(imageSource)}
          />
        ) : (categories || 'No image available.')}
      </div>
      <div className="landing-plain__caption">{recipe.title}</div>
      {hasImage && categories ? (
        <div className="landing-plain__caption profile-page__recipe-meta">
          {categories}
        </div>
      ) : null}
      {ingredients ? (
        <div className="landing-plain__caption profile-page__recipe-meta">
          {ingredients}
        </div>
      ) : null}
      <div className="landing-plain__caption profile-page__recipe-meta">
        {typeof recipe.average_score === 'number'
          ? `Avg: ${recipe.average_score.toFixed(1)}`
          : 'Avg: n/a'}
        {' · '}
        {typeof recipe.number_of_reviews === 'number'
          ? `${recipe.number_of_reviews} reviews`
          : 'Review count unavailable'}
      </div>
    </Link>
  )
}

function ProfileRecipeList({ recipes, status, emptyMessage, compact = false }) {
  if (!recipes) {
    return (
      <p className="status-banner" role="status" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {status}
      </p>
    )
  }

  return (
    <>
      {recipes.length > 0 ? (
        <div className={`landing-plain__popular-grid profile-page__recipe-grid${compact ? ' profile-page__recipe-grid--pending' : ''}`}>
          {recipes.map((recipe) => <ProfileRecipeCard key={recipe.id} recipe={recipe} />)}
        </div>
      ) : (
        <p className="profile-page__section-note">{status || emptyMessage}</p>
      )}
      {recipes.length > 0 && status ? (
        <p className="profile-page__section-note" role="status">{status}</p>
      ) : null}
    </>
  )
}

function readProfileRecipes(data) {
  if (!Array.isArray(data)) {
    throw new Error('Your recipe list could not be read. Reload to try again.')
  }

  const recipes = data.map(readRecipeSummary)
  if (new Set(recipes.map((recipe) => recipe.id)).size !== recipes.length
    || recipes.some((recipe) =>
      ['ingredients', 'categories'].some((field) =>
        recipe[field] !== undefined && (
          !Array.isArray(recipe[field])
          || recipe[field].some((item) => typeof item?.name !== 'string')
        ),
      ),
    )) {
    throw new Error('Your recipe list could not be read. Reload to try again.')
  }

  return recipes
}

function ProfilePage({ showAllRecipes = false }) {
  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('Loading profile...')
  const [recipes, setRecipes] = useState(null)
  const [recipeStatus, setRecipeStatus] = useState('Loading approved recipes...')
  const [favorites, setFavorites] = useState(null)
  const [favoriteStatus, setFavoriteStatus] = useState('Loading favorites...')
  const [pendingRecipes, setPendingRecipes] = useState(null)
  const [pendingStatus, setPendingStatus] = useState('Loading pending recipes...')
  const [pictureFailed, setPictureFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    async function loadProfile() {
      let currentProfile
      try {
        currentProfile = await getCurrentProfile(controller.signal)
      } catch (error) {
        if (!controller.signal.aborted) setStatus(error.message)
        return
      }

      if (controller.signal.aborted) return
      setProfile(currentProfile)
      setStatus('')

      const needsApprovedLookup = currentProfile.submitted_recipes === undefined
      if (!needsApprovedLookup) {
        try {
          const submitted = readProfileRecipes(currentProfile.submitted_recipes)
          setRecipes(submitted.filter((recipe) => recipe.approved === true))
          setPendingRecipes(submitted.filter((recipe) => recipe.approved === false))
          setRecipeStatus('')
          setPendingStatus('')
        } catch (error) {
          setRecipeStatus(error.message)
          setPendingStatus(error.message)
        }
      } else {
        setPendingStatus('Your pending recipes are not available yet.')
      }

      let favoriteIds = null
      if (currentProfile.favorite_recipes !== undefined) {
        try {
          setFavorites(readProfileRecipes(currentProfile.favorite_recipes))
          setFavoriteStatus('')
        } catch (error) {
          setFavoriteStatus(error.message)
        }
      } else if (Array.isArray(currentProfile.favorites)
        && currentProfile.favorites.every((id) => Number.isInteger(id) && id > 0)) {
        if (currentProfile.favorites.length === 0) {
          setFavorites([])
          setFavoriteStatus('')
        } else {
          favoriteIds = currentProfile.favorites
        }
      } else {
        setFavoriteStatus('Your saved favorites are not available yet.')
      }

      if (!needsApprovedLookup && !favoriteIds) return

      let approvedSummaries
      try {
        approvedSummaries = readProfileRecipes(await requestRecipeApi('/api/recipes/all_recipes/', {
          signal: controller.signal,
          requiresAuth: true,
        }))
        if (approvedSummaries.some((recipe) => recipe.approved !== true)) {
          throw new Error('The approved recipe list could not be read. Reload to try again.')
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          if (needsApprovedLookup) setRecipeStatus(error.message)
          if (favoriteIds) setFavoriteStatus(error.message)
        }
        return
      }

      if (controller.signal.aborted) return
      if (favoriteIds) {
        const savedIds = new Set(favoriteIds)
        const availableFavorites = approvedSummaries.filter((recipe) => savedIds.has(recipe.id))
        setFavorites(availableFavorites)
        setFavoriteStatus(availableFavorites.length === savedIds.size
          ? ''
          : 'Some saved favorites are unavailable here.')
      }

      if (!needsApprovedLookup) return
      if (!Number.isInteger(currentProfile.user.id) || currentProfile.user.id < 1) {
        setRecipeStatus('Your account details could not be read. Reload to try again.')
        return
      }

      // Older profile responses omit submissions. Details identify the author
      // of each approved recipe; never use the admin pending list for this view.
      try {
        const details = await Promise.all(approvedSummaries.map(async (summary) => {
          const recipe = await getRecipeDetails(summary.title, controller.signal)
          if (recipe.id !== summary.id || !Number.isInteger(recipe.user) || recipe.user < 1) {
            throw new Error('Recipe ownership could not be confirmed. Reload to try again.')
          }
          return recipe
        }))
        if (controller.signal.aborted) return
        setRecipes(details.filter((recipe) =>
          recipe.user === currentProfile.user.id && recipe.approved === true,
        ))
        setRecipeStatus('')
      } catch (error) {
        if (!controller.signal.aborted) setRecipeStatus(error.message)
      }
    }

    loadProfile()
    return () => controller.abort()
  }, [])

  const joinedDate = typeof profile?.user.date_joined === 'string'
    ? profile.user.date_joined.split('T')[0]
    : null
  const pageLabel = showAllRecipes ? 'approved recipes' : 'profile'
  const pageTitle = profile
    ? `${profile.user.username}'s ${pageLabel}`
    : showAllRecipes ? 'Approved recipes' : 'Profile'
  const visibleRecipes = showAllRecipes ? recipes : recipes?.slice(0, recipePreviewLimit)

  return (
    <div className="profile-page">
      <div className="content-frame">
        <section className="page-hero">
          <h1>{pageTitle}</h1>
        </section>

        {showAllRecipes ? (
          <div className="profile-page__add-recipe-row">
            <Link className="button button--ghost" to="/profile">
              Back to profile
            </Link>
          </div>
        ) : null}

        {profile ? (
          <>
            {!showAllRecipes ? (
              <section className="page-section">
                <article className="detail-panel detail-panel--profile-section">
                  <div className="profile-page__information">
                    <div className="detail-panel__stack profile-page__details">
                      <h2 className="profile-page__section-title">General information</h2>
                      <p className="profile-page__section-note">
                        <strong>First name:</strong> {profile.user.first_name || 'Not provided'}
                      </p>
                      <p className="profile-page__section-note">
                        <strong>Last name:</strong> {profile.user.last_name || 'Not provided'}
                      </p>
                      <p className="profile-page__section-note">
                        <strong>Email:</strong> {profile.user.email || 'Not provided'}
                      </p>
                      <p className="profile-page__section-note">
                        <strong>Date joined:</strong>{' '}
                        {joinedDate ? (
                          <time dateTime={joinedDate}>{formatDate(joinedDate)}</time>
                        ) : (
                          'Not provided'
                        )}
                      </p>
                    </div>

                    <div className="profile-page__picture-controls">
                      <div className="profile-page__picture-box">
                        {profile.profile_picture && !pictureFailed ? (
                          <img
                            src={profile.profile_picture}
                            alt={`${profile.user.username}'s profile picture`}
                            onError={() => setPictureFailed(true)}
                          />
                        ) : (
                          <p className="profile-page__section-note profile-page__picture-empty">
                            {pictureFailed
                              ? 'Profile picture could not be loaded.'
                              : 'No profile picture added yet.'}
                          </p>
                        )}
                      </div>
                      <button className="button button--ghost" type="button" disabled>
                        {profile.profile_picture ? 'Change profile picture' : 'Upload picture'}
                      </button>
                    </div>
                  </div>
                </article>
              </section>
            ) : null}

            <section
              className={showAllRecipes ? 'page-section' : 'page-section profile-page__recipe-sections'}
            >
              {!showAllRecipes ? (
                <article className="detail-panel detail-panel--profile-section">
                  <h2 className="profile-page__section-title">Favorites</h2>
                  <ProfileRecipeList
                    recipes={favorites}
                    status={favoriteStatus}
                    emptyMessage="No saved favorites yet."
                  />
                </article>
              ) : null}

              <article className="detail-panel detail-panel--profile-section">
                <h2 className="profile-page__section-title">Approved recipes</h2>
                <ProfileRecipeList
                  recipes={visibleRecipes}
                  status={recipeStatus}
                  emptyMessage="No approved recipes yet."
                />
                {!showAllRecipes && recipes?.length > recipePreviewLimit ? (
                  <div className="profile-page__add-recipe-row">
                    <Link className="button button--ghost" to="/profile/recipes">
                      See more
                    </Link>
                  </div>
                ) : null}
              </article>

              {!showAllRecipes ? (
                profile.user.is_staff === true ? (
                  <Link
                    className="button button--ghost profile-page__section-title profile-page__pending-button"
                    to="/staff"
                  >
                    Pending Approval
                  </Link>
                ) : (
                  <aside className="detail-panel detail-panel--profile-section">
                    <h2 className="profile-page__section-title">
                      Pending Approval{pendingRecipes ? ` (${pendingRecipes.length})` : ''}
                    </h2>
                    <ProfileRecipeList
                      recipes={pendingRecipes}
                      status={pendingStatus}
                      emptyMessage="No recipes waiting for approval."
                      compact
                    />
                  </aside>
                )
              ) : null}
            </section>

            <div className="profile-page__add-recipe-row">
              <Link className="button button--ghost" to="/add-recipe">
                Add recipe
              </Link>
            </div>
          </>
        ) : (
          <section className="page-section">
            <article className="detail-panel detail-panel--profile-section">
              <p className="status-banner" role="status" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {status}
              </p>
            </article>
          </section>
        )}
      </div>
    </div>
  )
}

export default ProfilePage
