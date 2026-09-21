import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { authTokenStorageKey } from '../data/siteData'

/*
function ProfileRecipeCard({ title, to = '' }) {
  const cardClassNames = ['landing-plain__popular-card', 'profile-preview-card']

  const cardContent = (
    <>
      <div className="landing-plain__image-placeholder profile-preview-card__image" />
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
*/

function ProfilePage() {
  const [status, setStatus] = useState('Loading profile...')

  useEffect(() => {
    const token = window.sessionStorage.getItem(authTokenStorageKey)
    let responseDetails = 'GET /api/me/'

    if (!token) {
      setStatus(`${responseDetails}\n\nFrontend: No saved login token was found.`)
      return undefined
    }

    async function loadProfile() {
      try {
        const response = await fetch('/api/me/', {
          headers: {
            Authorization: `Token ${token}`,
          },
        })

        responseDetails += `\nHTTP ${response.status} ${response.statusText}`
        const body = await response.text()
        responseDetails += `\n\n${body}`
        setStatus(responseDetails)
      } catch (error) {
        setStatus(`${responseDetails}\n\n${error.name}: ${error.message}`)
      }
    }

    loadProfile()

    return undefined
  }, [])

  return (
    <div className="profile-page">
      <div className="content-frame">
        <section className="page-hero">
          <p className="eyebrow">Profile page</p>
          <h1>Profile</h1>
          <p className="page-hero__lead">
            The profile response from the backend is shown below.
          </p>
        </section>

        <section className="page-section">
          <article className="detail-panel detail-panel--profile-section">
            <p className="profile-page__section-title">Backend response</p>
            <p className="status-banner" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {status}
            </p>
          </article>
        </section>

        <div className="profile-page__add-recipe-row">
          <Link className="button button--ghost" to="/add-recipe">
            Add recipe
          </Link>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage
