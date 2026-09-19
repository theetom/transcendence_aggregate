import { Link, useNavigate } from 'react-router-dom'
import PageHero from '../components/PageHero'
import { enableDevAuthPreview, isViewerAuthenticated } from '../data/siteData'

function ConnectPage() {
  const navigate = useNavigate()
  const isAuthenticated = isViewerAuthenticated()

  function handleDevPreviewClick() {
    enableDevAuthPreview()
    navigate('/')
  }

  return (
    <div className="connect-page">
      <div className="content-frame">
        <PageHero
          eyebrow="Connect"
          title="Choose how you want to enter the recipe site."
          lead="The header Connect button points here. From this screen, the visitor can move to login or registration without losing the new site context."
        />

        <section className="page-section connect-grid">
          <article className="connect-card">
            <p className="eyebrow">Login</p>
            <h3>Already have an account?</h3>
            <p>
              Jump into saved recipes, profile history, and future moderation updates.
            </p>
            <div className="connect-grid__actions" style={{ marginTop: '20px' }}>
              <Link className="button button--ghost" to="/login">
                Log in
              </Link>
            </div>
          </article>

          <article className="connect-card">
            <p className="eyebrow">Registration</p>
            <h3>Need to create one first?</h3>
            <p>
              Start with the signup flow, then come back to propose recipes and build favorites.
            </p>
            <div className="connect-grid__actions" style={{ marginTop: '20px' }}>
              <Link className="button button--ghost" to="/signup">
                Create account
              </Link>
            </div>
          </article>
        </section>
      </div>

      {!isAuthenticated ? (
        <div className="dev-auth-preview">
          <button
            type="button"
            className="dev-auth-preview__button"
            onClick={handleDevPreviewClick}
          >
            Dev login preview
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default ConnectPage
