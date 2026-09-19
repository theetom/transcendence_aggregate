import { Link } from 'react-router-dom'
import SectionTitle from '../components/SectionTitle'
import { formatDate, pendingRecipes } from '../data/siteData'

function AdminPage() {
  return (
    <div className="content-frame">
      <section className="page-hero">
        <p className="eyebrow">Admin page</p>
        <h1>Moderation dashboard</h1>
        <p className="page-hero__lead">
          Recipe submissions waiting for moderation will appear here once the
          backend moderation queue is connected.
        </p>
      </section>

      <section className="page-section">
        <SectionTitle
          eyebrow="Pending list"
          title="Submissions waiting for moderation"
          description="Each card should link to a moderation detail page backed by stored submission data."
        />
        {pendingRecipes.length > 0 ? (
          <div className="feature-grid">
            {pendingRecipes.map((recipe) => (
              <article key={recipe.slug} className="admin-card">
                <p className="eyebrow">Pending request</p>
                <h3>{recipe.title}</h3>
                <div className="card-meta-strip">
                  <span>{recipe.author}</span>
                  <span>{formatDate(recipe.submittedOn)}</span>
                </div>
                <p>{recipe.summary}</p>
                <div style={{ marginTop: '18px' }}>
                  <Link className="button button--primary" to={`/admin/review/${recipe.slug}`}>
                    Review request
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">No submissions are waiting for moderation.</div>
        )}
      </section>
    </div>
  )
}

export default AdminPage
