import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import RecipePreviewCard from '../components/RecipePreviewCard'
import { getPublicProfile } from '../data/userApi'

function PublicUserProfile({ userId }) {
  const location = useLocation()
  const [loadState, setLoadState] = useState({ status: 'loading', profile: null, error: '' })
  const [reloadKey, setReloadKey] = useState(0)
  const [failedPicture, setFailedPicture] = useState('')
  const searchQuery = typeof location.state?.searchQuery === 'string' ? location.state.searchQuery : ''
  const searchPath = searchQuery ? `/results/search?q=${encodeURIComponent(searchQuery)}` : '/results/search'

  useEffect(() => {
    const controller = new AbortController()

    async function loadProfile() {
      try {
        const profile = await getPublicProfile(userId, controller.signal)
        if (!controller.signal.aborted) setLoadState({ status: 'ready', profile, error: '' })
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadState({ status: 'error', profile: null, error: error.message })
        }
      }
    }

    loadProfile()
    return () => controller.abort()
  }, [userId, reloadKey])

  function handleRetry() {
    setLoadState({ status: 'loading', profile: null, error: '' })
    setFailedPicture('')
    setReloadKey((current) => current + 1)
  }

  const profile = loadState.profile

  return (
    <div className="profile-page">
      <div className="content-frame">
        <section className="page-hero">
          <h1>{profile ? `${profile.user.username}'s profile` : 'Public profile'}</h1>
        </section>

        <div className="profile-page__add-recipe-row">
          <Link className="button button--ghost" to={searchPath}>Back to search</Link>
        </div>

        {profile ? (
          <>
            <section className="page-section">
              <article className="detail-panel detail-panel--profile-section">
                <div className="profile-page__information">
                  <div className="detail-panel__stack profile-page__details">
                    <h2 className="profile-page__section-title">General information</h2>
                    <p className="profile-page__section-note"><strong>Username:</strong> {profile.user.username}</p>
                    <p className="profile-page__section-note"><strong>First name:</strong> {profile.user.first_name || 'Not provided'}</p>
                    <p className="profile-page__section-note"><strong>Last name:</strong> {profile.user.last_name || 'Not provided'}</p>
                    <p className="profile-page__section-note profile-page__bio"><strong>Bio:</strong> {profile.bio || 'Not provided'}</p>
                    <p className="profile-page__section-note"><strong>Email:</strong> {profile.user.email || 'Not provided'}</p>
                  </div>
                  <div className="profile-page__picture-controls">
                    <div className="profile-page__picture-box">
                      {profile.profile_picture && failedPicture !== profile.profile_picture ? (
                        <img
                          src={profile.profile_picture}
                          alt={`${profile.user.username}'s profile picture`}
                          onError={() => setFailedPicture(profile.profile_picture)}
                        />
                      ) : (
                        <p className="profile-page__section-note profile-page__picture-empty">
                          {failedPicture ? 'Profile picture could not be loaded.' : 'No profile picture added yet.'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            </section>

            <section className="page-section">
              <article className="detail-panel detail-panel--profile-section">
                <h2 className="profile-page__section-title">Approved recipes ({profile.approved_recipes.length})</h2>
                {profile.approved_recipes.length > 0 ? (
                  <div className="recipe-preview-grid recipe-preview-grid--compact recipe-preview-grid--large-photos">
                    {profile.approved_recipes.map((recipe) => <RecipePreviewCard key={recipe.id} recipe={recipe} />)}
                  </div>
                ) : <p className="profile-page__section-note">No approved recipes yet.</p>}
              </article>
            </section>
          </>
        ) : (
          <section className="page-section" aria-busy={loadState.status === 'loading'}>
            <article className="detail-panel detail-panel--profile-section">
              <p className="status-banner" role={loadState.status === 'error' ? 'alert' : 'status'}>
                {loadState.status === 'loading' ? 'Loading profile...' : loadState.error}
              </p>
              {loadState.status === 'error' ? (
                <button type="button" className="button button--ghost" onClick={handleRetry}>Try again</button>
              ) : null}
            </article>
          </section>
        )}
      </div>
    </div>
  )
}

function PublicUserProfilePage() {
  const { userId } = useParams()
  return <PublicUserProfile key={userId} userId={userId} />
}

export default PublicUserProfilePage
