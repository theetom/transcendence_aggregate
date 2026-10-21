import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getCurrentProfile, getManagedRecipes, getRecipePath } from '../data/recipeApi'
import useTransientMessage from '../hooks/useTransientMessage'

function AdminPage() {
  const location = useLocation()
  const [confirmation] = useTransientMessage(() => location.state?.recipeDeleted ? 'Recipe deleted.' : '')
  const [recipes, setRecipes] = useState(null)
  const [showAllRecipes, setShowAllRecipes] = useState(false)
  const [access, setAccess] = useState('checking')
  const [status, setStatus] = useState('Checking account...')
  const [canRetry, setCanRetry] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadRecipes() {
      let staffConfirmed = false
      try {
        const profile = await getCurrentProfile(controller.signal)
        if (controller.signal.aborted) return

        if (profile.user.is_staff !== true) {
          setAccess('denied')
          setStatus('Only admins can manage recipes.')
          return
        }

        staffConfirmed = true
        setAccess('staff')
        setStatus('Loading recipes...')
        const managedRecipes = await getManagedRecipes(controller.signal)
        if (!controller.signal.aborted) {
          setRecipes(managedRecipes)
          setStatus('')
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          if (error.status === 403) {
            setAccess('denied')
            setRecipes(null)
            setStatus('Only admins can manage recipes.')
          } else {
            if (error.status === 401 || !staffConfirmed) setAccess('unavailable')
            setStatus(error.message)
          }
          setCanRetry(error.status !== 401 && error.status !== 403)
        }
      }
    }

    loadRecipes()
    return () => controller.abort()
  }, [attempt])

  function retry() {
    setRecipes(null)
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

  const pendingRecipes = recipes?.filter((recipe) => recipe.deletion_requested || (!recipe.approved && !recipe.rejected))
  const visibleRecipes = showAllRecipes ? recipes : pendingRecipes

  return (
    <div className="content-frame">
      {confirmation ? (
        <p className="status-banner" role="status">{confirmation}</p>
      ) : null}
      <section className="page-hero">
        <h1>{showAllRecipes ? 'All recipes' : 'Pending Approval'}</h1>
        <div className="staff-page__actions">
          <Link className="button button--ghost" to="/profile">
            Back to profile
          </Link>
          <div className="staff-page__filters" role="group" aria-label="Recipe list view">
            <button
              className={`button ${showAllRecipes ? 'button--ghost' : 'button--primary'}`}
              type="button"
              aria-pressed={!showAllRecipes}
              onClick={() => setShowAllRecipes(false)}
            >
              Pending{pendingRecipes ? ` (${pendingRecipes.length})` : ''}
            </button>
            <button
              className={`button ${showAllRecipes ? 'button--primary' : 'button--ghost'}`}
              type="button"
              aria-pressed={showAllRecipes}
              onClick={() => setShowAllRecipes(true)}
            >
              All recipes{recipes ? ` (${recipes.length})` : ''}
            </button>
          </div>
        </div>
      </section>

      <section className="page-section">
        {!visibleRecipes ? (
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
        ) : visibleRecipes.length > 0 ? (
          <ul className="staff-recipe-list">
            {visibleRecipes.map((recipe) => (
              <li key={recipe.id}>
                <Link to={getRecipePath(recipe.id)}>{recipe.title}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            {showAllRecipes ? 'No recipes have been submitted yet.' : 'No recipes are waiting for approval.'}
          </div>
        )}
      </section>
    </div>
  )
}

export default AdminPage
