import { Link } from 'react-router-dom'
import PageHero from '../components/PageHero'

function ConnectPage() {
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
              Log in to access backend features that require authentication.
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
              Create an account, then log in before using authenticated backend features.
            </p>
            <div className="connect-grid__actions" style={{ marginTop: '20px' }}>
              <Link className="button button--ghost" to="/signup">
                Create account
              </Link>
            </div>
          </article>
        </section>
      </div>
    </div>
  )
}

export default ConnectPage
