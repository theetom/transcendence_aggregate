import { Link, useNavigate } from 'react-router-dom'
import RecipeCard from '../components/RecipeCard'
import {
  disableDevAuthPreview,
  getFavoriteRecipes,
  getProfileRecipes,
  isDevAuthPreviewEnabled,
  profilePreview,
} from '../data/siteData'

function ProfilePreviewCard({ title, to = '', imageLabel = 'Recipe image' }) {
  const cardClassNames = ['landing-plain__popular-card', 'profile-preview-card']

  const cardContent = (
    <>
      <div className="landing-plain__image-placeholder profile-preview-card__image">
        <span>{imageLabel}</span>
      </div>
      <div className="landing-plain__caption profile-preview-card__caption">{title}</div>
    </>
  )

  if (to) {
    return (
      <Link className={`${cardClassNames.join(' ')} landing-plain__card-button`} to={to}>
        {cardContent}
      </Link>
    )
  }

  return <article className={cardClassNames.join(' ')}>{cardContent}</article>
}

function ProfilePage() {
  const navigate = useNavigate()
  const yourRecipes = getProfileRecipes()
  const favoriteRecipes = getFavoriteRecipes()
  const isDevPreviewEnabled = isDevAuthPreviewEnabled()

  function handleDevLogoutPreviewClick() {
    disableDevAuthPreview()
    navigate('/connect')
  }

  return (
    <div className="profile-page">
      <div className="content-frame">
        <section className="page-hero">
          <p className="eyebrow">Profile page</p>
          <h1>{profilePreview.name}</h1>
          <p className="page-hero__lead">{profilePreview.bio}</p>
          <div className="hero-stats">
            <span className="stat-pill">Sample profile preview</span>
            {profilePreview.isAdmin ? <span className="stat-pill">Admin flag enabled</span> : null}
          </div>
        </section>

        <section className="page-section">
          <article className="detail-panel detail-panel--profile-section">
            <p className="profile-page__section-title">Your recipes</p>
            <p className="profile-page__section-note">
              This is a sample profile preview until account data is connected.
            </p>
            {yourRecipes.length > 0 ? (
              <div className="feature-grid">
                {yourRecipes.map((recipe) => (
                  <RecipeCard key={recipe.slug} recipe={recipe} variant="compact" />
                ))}
              </div>
            ) : (
              <p className="profile-page__empty-copy">
                No recipes linked to this sample profile yet.
              </p>
            )}
          </article>
        </section>

        <section className="page-section">
          <article className="detail-panel detail-panel--profile-section">
            <p className="profile-page__section-title">Favourite Recipes</p>
            {favoriteRecipes.length > 0 ? (
              <div className="landing-plain__popular-grid profile-preview-grid">
                {favoriteRecipes.map((recipe) => (
                  <ProfilePreviewCard
                    key={recipe.slug}
                    title={recipe.title}
                    to={recipe.slug ? `/recipe/${recipe.slug}` : ''}
                  />
                ))}
              </div>
            ) : (
              <p className="profile-page__empty-copy">No favourites chosen yet.</p>
            )}
          </article>
        </section>

        <section className="page-section">
          <article className="detail-panel detail-panel--profile-section">
            <p className="profile-page__section-title">Pending Recipe Addition Requests</p>
            <p className="profile-page__section-note profile-page__section-note--pending">
              Recipe request history will appear here after the database-backed
              submission flow is connected.
            </p>
            <p className="profile-page__empty-copy">
              No recipe requests are shown until database integration is complete.
            </p>
          </article>
        </section>

        <div className="profile-page__add-recipe-row">
          <Link className="button button--ghost" to="/add-recipe">
            Add recipe
          </Link>
        </div>
      </div>

      {isDevPreviewEnabled ? (
        <div className="dev-auth-preview profile-page__dev-preview">
          <button
            type="button"
            className="dev-auth-preview__button"
            onClick={handleDevLogoutPreviewClick}
          >
            Dev logout preview
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default ProfilePage
