import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SectionTitle from '../components/SectionTitle'
import { getPendingSubmissions } from '../data/moderationApi'
import { formatDate } from '../data/siteData'

function AdminPage() {
  const [pendingRecipes, setPendingRecipes] = useState(null)
  const [status, setStatus] = useState('Loading submissions...')

  useEffect(() => {
    const controller = new AbortController()

    async function loadSubmissions() {
      try {
        const submissions = await getPendingSubmissions(controller.signal)
        if (!controller.signal.aborted) setPendingRecipes(submissions)
      } catch (error) {
        if (!controller.signal.aborted) setStatus(error.message)
      }
    }

    loadSubmissions()
    return () => controller.abort()
  }, [])

  return (
    <div className="content-frame">
      <section className="page-hero">
        <p className="eyebrow">Admin page</p>
        <h1>Moderation dashboard</h1>
        <p className="page-hero__lead">
          Review pending recipe submissions and send a decision to their authors.
        </p>
      </section>

      <section className="page-section">
        <SectionTitle
          eyebrow="Pending list"
          title="Submissions waiting for moderation"
          description="Open a submission to read its ingredients and steps before making a decision."
        />
        {!pendingRecipes ? (
          <div className="empty-state" role="status">{status}</div>
        ) : pendingRecipes.length > 0 ? (
          <div className="feature-grid">
            {pendingRecipes.map((recipe) => (
              <article key={recipe.id} className="admin-card">
                <p className="eyebrow">Pending request</p>
                <h3>{recipe.title}</h3>
                <div className="card-meta-strip">
                  <span>{recipe.author}</span>
                  <span>{formatDate(recipe.date_created.split('T')[0])}</span>
                </div>
                <p>{recipe.description}</p>
                <div style={{ marginTop: '18px' }}>
                  <Link className="button button--primary" to={`/staff/review/${recipe.id}`}>
                    Review request
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">No submissions are waiting for review.</div>
        )}
      </section>
    </div>
  )
}

export default AdminPage
