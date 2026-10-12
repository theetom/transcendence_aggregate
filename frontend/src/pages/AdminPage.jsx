import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPendingRecipes } from '../data/moderationApi'
import { getCurrentProfile, getRecipePath } from '../data/recipeApi'

function AdminPage() {
  const [pendingRecipes, setPendingRecipes] = useState(null)
  const [access, setAccess] = useState('checking')
  const [status, setStatus] = useState('Checking account...')
  const [canRetry, setCanRetry] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadPendingRecipes() {
      let staffConfirmed = false
      try {
        const profile = await getCurrentProfile(controller.signal)
        if (controller.signal.aborted) return

        if (profile.user.is_staff !== true) {
          setAccess('denied')
          setStatus('Only admins can review pending recipes.')
          return
        }

        staffConfirmed = true
        setAccess('staff')
        setStatus('Loading pending recipes...')
        const recipes = await getPendingRecipes(controller.signal)
        if (!controller.signal.aborted) setPendingRecipes(recipes)
      } catch (error) {
        if (!controller.signal.aborted) {
          if (error.status === 403) {
            setAccess('denied')
            setPendingRecipes(null)
            setStatus('Only admins can review pending recipes.')
          } else {
            if (error.status === 401 || !staffConfirmed) setAccess('unavailable')
            setStatus(error.message)
          }
          setCanRetry(error.status !== 401 && error.status !== 403)
        }
      }
    }

    loadPendingRecipes()
    return () => controller.abort()
  }, [attempt])

  function retry() {
    setPendingRecipes(null)
    setAccess('checking')
    setStatus('Checking account...')
    setCanRetry(false)
    setAttempt((value) => value + 1)
  }

  if (access !== 'staff') {
    return (
      <div className="content-frame staff-access-state">
        <p className="staff-access-state__message" role="status">{status}</p>
        {canRetry ? (
          <button className="button button--ghost" type="button" onClick={retry}>
            Try again
          </button>
        ) : null}
        <Link className="button button--ghost" to="/">
          Back to main page
        </Link>
      </div>
    )
  }

  return (
    <div className="content-frame">
      <section className="page-hero">
        <h1>Pending Approval</h1>
        <p className="page-hero__lead">Open a recipe to review it.</p>
        <div className="page-hero__actions">
          <Link className="button button--ghost" to="/profile">
            Back to profile
          </Link>
        </div>
      </section>

      <section className="page-section">
        {!pendingRecipes ? (
          <div className="empty-state">
            <p role="status" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {status}
            </p>
            {canRetry ? (
              <button className="button button--ghost" type="button" onClick={retry}>
                Try again
              </button>
            ) : null}
          </div>
        ) : pendingRecipes.length > 0 ? (
          <ul className="pending-list">
            {pendingRecipes.map((recipe) => (
              <li key={recipe.id} className="pending-item">
                <Link to={getRecipePath(recipe.title)}>{recipe.title}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">No recipes are waiting for approval.</div>
        )}
      </section>
    </div>
  )
}

export default AdminPage
