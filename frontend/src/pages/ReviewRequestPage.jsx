import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDate } from '../data/siteData'

function ReviewRequestPage({ request = null }) {
  const [moderatorReply, setModeratorReply] = useState('')

  if (!request) {
    return (
      <div className="content-frame">
        <section className="page-hero not-found">
          <p className="eyebrow">Review request</p>
          <h1>Review request</h1>
          <p className="page-hero__lead">Submission details have not been loaded.</p>
          <Link className="button button--primary" to="/admin">
            Back to admin page
          </Link>
        </section>
      </div>
    )
  }

  return (
    <div className="content-frame">
      <section className="page-hero">
        <p className="eyebrow">Moderation detail</p>
        <h1>{request.title}</h1>
        <p className="page-hero__lead">{request.summary}</p>
        <div className="hero-stats">
          <span className="stat-pill">{request.author}</span>
          <span className="stat-pill">{formatDate(request.submittedOn)}</span>
        </div>
      </section>

      <section className="page-section review-request__grid">
        <article className="review-card">
          <p className="eyebrow">Ingredients</p>
          <h3>Submitted ingredient records</h3>
          <ul className="ingredient-list">
            {request.ingredients.map((ingredient) => (
              <li key={ingredient}>{ingredient}</li>
            ))}
          </ul>
        </article>

        <article className="review-card">
          <p className="eyebrow">Steps</p>
          <h3>Submitted step records</h3>
          <ol className="step-list">
            {request.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </article>
      </section>

      <section className="page-section moderation-grid">
        <article className="review-card">
          <p className="eyebrow">Moderator reply</p>
          <h3>Moderator reply field</h3>
          <div className="field" style={{ marginTop: '18px' }}>
            <label htmlFor="moderator-reply">Reply to user</label>
            <textarea
              id="moderator-reply"
              rows="7"
              value={moderatorReply}
              onChange={(event) => setModeratorReply(event.target.value)}
              placeholder="Write a reply to the user"
            />
          </div>
          <div className="review-request__actions" style={{ marginTop: '18px' }}>
            <button
              type="button"
              className="button button--primary"
              disabled
            >
              Approve
            </button>
            <button
              type="button"
              className="button button--secondary"
              disabled
            >
              Deny
            </button>
          </div>
        </article>

        <article className="review-card">
          <p className="eyebrow">Current state</p>
          <h3>Moderation status message</h3>
          <p className="status-banner" style={{ marginTop: '18px' }}>
            Moderation is not connected yet.
          </p>
          <div style={{ marginTop: '18px' }}>
            <Link className="button button--ghost" to="/admin">
              Back to dashboard
            </Link>
          </div>
        </article>
      </section>
    </div>
  )
}

export default ReviewRequestPage
