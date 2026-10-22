import { useEffect, useRef, useState } from 'react'

function readErrorMessage(value) {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    return value.filter((message) => typeof message === 'string').join(' ')
  }
  return ''
}

function ReviewFieldError({ id, message }) {
  if (!message) return null

  return <p id={id} className="status-banner recipe-review-form__error" role="alert">{message}</p>
}

function RecipeReviewForm({ disabled, isSubmitting, fieldErrors = {}, onClearFieldError, onSubmit }) {
  const [grade, setGrade] = useState('')
  const [comment, setComment] = useState('')
  const [localErrors, setLocalErrors] = useState({})
  const [isWaiting, setIsWaiting] = useState(false)
  const [submissionUncertain, setSubmissionUncertain] = useState(false)
  const mounted = useRef(false)
  const submissionInFlight = useRef(false)
  const posting = isSubmitting || isWaiting
  const controlsDisabled = disabled || posting || submissionUncertain
  const gradeError = localErrors.grade || readErrorMessage(fieldErrors.grade)
  const commentError = localErrors.comment || readErrorMessage(fieldErrors.comment)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  function clearFieldError(field) {
    setLocalErrors((current) => ({ ...current, [field]: '' }))
    onClearFieldError?.(field)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (controlsDisabled || submissionInFlight.current) return

    const numericGrade = Number(grade)
    const trimmedComment = comment.trim()
    const errors = {}
    if (!Number.isInteger(numericGrade) || numericGrade < 1 || numericGrade > 5) {
      errors.grade = 'Choose a rating from 1 to 5 stars.'
    }
    if (!trimmedComment) errors.comment = 'Write a review.'
    setLocalErrors(errors)
    if (Object.keys(errors).length > 0) return

    submissionInFlight.current = true
    setIsWaiting(true)
    try {
      const saved = await onSubmit({ grade: numericGrade, comment: trimmedComment })
      if (mounted.current && saved === true) {
        setGrade('')
        setComment('')
        setLocalErrors({})
      }
    } catch {
      if (mounted.current) setSubmissionUncertain(true)
    } finally {
      submissionInFlight.current = false
      if (mounted.current) setIsWaiting(false)
    }
  }

  return (
    <form className="field-list recipe-review-form" onSubmit={handleSubmit} noValidate aria-label="Write a review">
      <h3>Write a review</h3>
      {submissionUncertain ? (
        <p className="status-banner recipe-review-form__error" role="alert">
          Unable to confirm your review. Reload this page before posting again.
        </p>
      ) : null}
      <div className="field recipe-review-form__rating">
        <label htmlFor="recipe-review-grade">Rating</label>
        <select
          id="recipe-review-grade"
          name="grade"
          required
          disabled={controlsDisabled}
          value={grade}
          onChange={(event) => {
            setGrade(event.target.value)
            clearFieldError('grade')
          }}
          aria-invalid={Boolean(gradeError)}
          aria-describedby={gradeError ? 'recipe-review-grade-error' : undefined}
        >
          <option value="">Choose a rating</option>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>{value} {value === 1 ? 'star' : 'stars'}</option>
          ))}
        </select>
        <ReviewFieldError id="recipe-review-grade-error" message={gradeError} />
      </div>
      <div className="field">
        <label htmlFor="recipe-review-comment">Review</label>
        <textarea
          id="recipe-review-comment"
          name="comment"
          rows={4}
          required
          disabled={controlsDisabled}
          value={comment}
          onChange={(event) => {
            setComment(event.target.value)
            clearFieldError('comment')
          }}
          aria-invalid={Boolean(commentError)}
          aria-describedby={commentError ? 'recipe-review-comment-error' : undefined}
        />
        <ReviewFieldError id="recipe-review-comment-error" message={commentError} />
      </div>
      <div className="recipe-review-form__actions">
        <button className="button button--primary" type="submit" disabled={controlsDisabled}>
          {posting ? 'Posting...' : 'Post review'}
        </button>
      </div>
    </form>
  )
}

export default RecipeReviewForm
