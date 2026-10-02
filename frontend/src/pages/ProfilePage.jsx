import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { authTokenStorageKey, formatDate } from '../data/siteData'

const recipePreviewLimit = 3

function ProfileRecipeCard({ recipe }) {
  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.map((ingredient) => ingredient.name).join(', ')
    : ''
  const categories = Array.isArray(recipe.categories)
    ? recipe.categories.map((category) => category.name).join(', ')
    : ''
  const Card = recipe.slug ? Link : 'article'

  return (
    <Card
      {...(recipe.slug ? { to: `/recipe/${recipe.slug}` } : {})}
      className="landing-plain__popular-card landing-plain__card-button"
    >
      <div className="landing-plain__image-placeholder" aria-hidden="true">
        {categories}
      </div>
      <div className="landing-plain__caption">{recipe.title}</div>
      {ingredients ? (
        <div className="landing-plain__caption" style={{ fontSize: '0.8rem' }}>
          {ingredients}
        </div>
      ) : null}
      <div className="landing-plain__caption" style={{ fontSize: '0.8rem' }}>
        {typeof recipe.average_score === 'number'
          ? `Avg: ${recipe.average_score.toFixed(1)}`
          : 'Avg: n/a'}
        {' · '}
        {typeof recipe.number_of_reviews === 'number'
          ? `${recipe.number_of_reviews} reviews`
          : 'Review count unavailable'}
      </div>
    </Card>
  )
}

async function requestProfileApi(path, token) {
  let details = `GET ${path}`

  try {
    const response = await fetch(path, {
      headers: {
        Authorization: `Token ${token}`,
      },
    })

    details += `\nHTTP ${response.status} ${response.statusText}`
    const body = await response.text()
    details += `\n\n${body}`

    if (!response.ok) {
      return { ok: false, details }
    }

    return { ok: true, data: JSON.parse(body) }
  } catch (error) {
    return { ok: false, details: `${details}\n\n${error.name}: ${error.message}` }
  }
}

function ProfilePage({ showAllRecipes = false }) {
  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('Loading profile...')
  const [recipes, setRecipes] = useState(null)
  const [recipeStatus, setRecipeStatus] = useState('Loading uploaded recipes...')
  const [pictureFailed, setPictureFailed] = useState(false)

  useEffect(() => {
    const token = window.sessionStorage.getItem(authTokenStorageKey)
    let cancelled = false

    if (!token) {
      setStatus('GET /api/me/\n\nFrontend: No saved login token was found.')
      return undefined
    }

    async function loadProfile() {
      const result = await requestProfileApi('/api/me/', token)

      if (cancelled) {
        return
      }

      if (!result.ok) {
        setStatus(result.details)
        return
      }

      if (typeof result.data?.user?.username !== 'string') {
        setStatus('The profile response is missing account details.')
        return
      }

      setProfile(result.data)
      setStatus('')

      const recipeList = await requestProfileApi('/api/recipes/all_recipes/', token)

      if (cancelled) {
        return
      }

      if (!recipeList.ok) {
        setRecipeStatus(recipeList.details)
        return
      }

      if (!Array.isArray(recipeList.data)) {
        setRecipeStatus('The recipe response did not contain a recipe list.')
        return
      }

      if (recipeList.data.some((recipe) => typeof recipe?.title !== 'string')) {
        setRecipeStatus('The recipe list is missing a recipe title.')
        return
      }

      // The summary endpoint omits authors. Read each existing detail response
      // to match saved recipes to this account without displaying account IDs.
      const recipeDetails = await Promise.all(
        recipeList.data.map((recipe) =>
          requestProfileApi(`/api/recipes/${encodeURIComponent(recipe.title)}/`, token),
        ),
      )

      if (cancelled) {
        return
      }

      const failedRequests = recipeDetails.filter((recipe) => !recipe.ok)

      if (failedRequests.length > 0) {
        setRecipeStatus(failedRequests.map((recipe) => recipe.details).join('\n\n'))
        return
      }

      if (
        !Number.isInteger(result.data.user.id) ||
        recipeDetails.some(
          (recipe) => !Number.isInteger(recipe.data?.user) || typeof recipe.data?.title !== 'string',
        )
      ) {
        setRecipeStatus('The recipe responses are missing account or author details.')
        return
      }

      setRecipes(
        recipeDetails
          .map((recipe) => recipe.data)
          .filter((recipe) => recipe.user === result.data.user.id),
      )
      setRecipeStatus('')
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [])

  const joinedDate = profile?.user.date_joined?.split('T')[0]
  const pageLabel = showAllRecipes ? 'recipes' : 'profile'
  const pageTitle = profile
    ? `${profile.user.username}'s ${pageLabel}`
    : showAllRecipes ? 'Uploaded recipes' : 'Profile'
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
                      <button
                        className="button button--ghost"
                        type="button"
                        disabled
                      >
                        {profile.profile_picture ? 'Change profile picture' : 'Upload picture'}
                      </button>
                    </div>

                    <div className="detail-panel__stack profile-page__details">
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
                  </div>
                </article>
              </section>
            ) : null}

            <section
              className={showAllRecipes ? 'page-section' : 'page-section profile-page__recipe-sections'}
            >
              <article className="detail-panel detail-panel--profile-section">
                <h2 className="profile-page__section-title">Uploaded recipes</h2>
                {recipes ? (
                  recipes.length > 0 ? (
                    <div className="landing-plain__popular-grid profile-page__recipe-grid">
                      {visibleRecipes.map((recipe) => (
                        <ProfileRecipeCard key={recipe.id} recipe={recipe} />
                      ))}
                    </div>
                  ) : (
                    <p className="profile-page__section-note">No recipes uploaded yet.</p>
                  )
                ) : (
                  <p
                    className="status-banner"
                    role="status"
                    style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                  >
                    {recipeStatus}
                  </p>
                )}
                {!showAllRecipes && recipes?.length > recipePreviewLimit ? (
                  <div className="profile-page__add-recipe-row">
                    <Link className="button button--ghost" to="/profile/recipes">
                      See more
                    </Link>
                  </div>
                ) : null}
              </article>

              {!showAllRecipes ? (
                <aside className="detail-panel detail-panel--profile-section">
                  <h2 className="profile-page__section-title">Pending recipe submissions</h2>
                  <p className="profile-page__section-note">
                    Recipe approval status is not available yet.
                  </p>
                </aside>
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
              <p
                className="status-banner"
                role="status"
                style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
              >
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
