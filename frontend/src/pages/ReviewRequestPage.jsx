import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getSubmission, saveSubmissionDecision } from '../data/moderationApi'
import { formatDate } from '../data/siteData'

function SubmissionReview({ submissionId }) {
  const [request, setRequest] = useState(null)
  const [loadStatus, setLoadStatus] = useState('Loading submission...')
  const [moderatorReply, setModeratorReply] = useState('')
  const [status, setStatus] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [requiresReload, setRequiresReload] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    async function loadSubmission() {
      try {
        const submission = await getSubmission(submissionId, controller.signal)
        if (!controller.signal.aborted) {
          setRequest(submission)
          setModeratorReply(submission.feedback)
        }
      } catch (error) {
        if (!controller.signal.aborted) setLoadStatus(error.message)
      }
    }

    loadSubmission()
    return () => controller.abort()
  }, [submissionId])

  async function handleDecision(decision) {
    if (isSubmitting || requiresReload || request.status !== 'pending') return
    const feedback = moderatorReply.trim()
    if (decision === 'rejected' && !feedback) {
      setStatus('Write feedback before rejecting this submission.')
      return
    }

    setIsSubmitting(true)
    setStatus('Saving decision...')
    try {
      const updatedSubmission = await saveSubmissionDecision(submissionId, decision, feedback)
      setRequest(updatedSubmission)
      setModeratorReply(updatedSubmission.feedback)
      setStatus(decision === 'approved' ? 'Submission approved.' : 'Submission rejected.')
    } catch (error) {
      setStatus(error.message)
      if (error.status === 409) {
        setRequiresReload(true)
        try {
          const latestSubmission = await getSubmission(submissionId)
          setRequest(latestSubmission)
          setModeratorReply(latestSubmission.feedback)
        } catch {
          setStatus('This submission has already been reviewed. Reload to see its latest status.')
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!request) {
    return (
      <div className="content-frame">
        <section className="page-hero not-found">
          <p className="eyebrow">Review request</p>
          <h1>Review request</h1>
          <p className="page-hero__lead" role="status">{loadStatus}</p>
          <Link className="button button--primary" to="/staff">
            Back to staff page
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
        <p className="page-hero__lead">{request.description}</p>
        <div className="hero-stats">
          <span className="stat-pill">{request.author}</span>
          <span className="stat-pill">{formatDate(request.date_created.split('T')[0])}</span>
        </div>
      </section>

      <section className="page-section review-request__grid">
        <article className="review-card">
          <p className="eyebrow">Ingredients</p>
          <h3>Submitted ingredient records</h3>
          <ul className="ingredient-list">
            {request.ingredients.map((ingredient, index) => (
              <li key={index}>{ingredient.quantity} {ingredient.unit} {ingredient.name}</li>
            ))}
          </ul>
        </article>

        <article className="review-card">
          <p className="eyebrow">Steps</p>
          <h3>Submitted step records</h3>
          <ol className="step-list">
            {[...request.steps].sort((first, second) => first.step_number - second.step_number).map((step, index) => (
              <li key={index}>{step.instruction}</li>
            ))}
          </ol>
        </article>
      </section>

      <section className="page-section moderation-grid">
        <article className="review-card">
          <p className="eyebrow">Moderator reply</p>
          <h3>Feedback for the author</h3>
          <div className="field" style={{ marginTop: '18px' }}>
            <label htmlFor="moderator-reply">Reply to user</label>
            <textarea
              id="moderator-reply"
              rows="7"
              value={moderatorReply}
              disabled={isSubmitting || requiresReload || request.status !== 'pending'}
              onChange={(event) => setModeratorReply(event.target.value)}
              placeholder="Write a reply to the user"
            />
          </div>
          <div className="review-request__actions" style={{ marginTop: '18px' }}>
            <button
              type="button"
              className="button button--primary"
              onClick={() => handleDecision('approved')}
              disabled={isSubmitting || requiresReload || request.status !== 'pending'}
            >
              Approve
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => handleDecision('rejected')}
              disabled={isSubmitting || requiresReload || request.status !== 'pending'}
            >
              Reject
            </button>
          </div>
        </article>

        <article className="review-card">
          <p className="eyebrow">Current state</p>
          <h3>Moderation status</h3>
          <p className="status-banner" role="status" style={{ marginTop: '18px' }}>
            Status: {request.status}
          </p>
          {request.feedback ? <p>Saved feedback: {request.feedback}</p> : null}
          {status ? <p role="status">{status}</p> : null}
          <div style={{ marginTop: '18px' }}>
            <Link className="button button--ghost" to="/staff">
              Back to dashboard
            </Link>
          </div>
        </article>
      </section>
    </div>
  )
}

function ReviewRequestPage() {
  const { submissionId } = useParams()
  // A different submission starts with fresh loading, feedback and action state.
  return <SubmissionReview key={submissionId} submissionId={submissionId} />
}

export default ReviewRequestPage
