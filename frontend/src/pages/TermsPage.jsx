import PageHero from '../components/PageHero'

function TermsPage() {
  return (
    <div className="content-frame">
      <PageHero
        eyebrow="General usage conditions"
        title="Use the recipe site respectfully while it is still in development."
        lead="The footer links here because your notes explicitly asked for general usage conditions."
      />

      <section className="page-section split-grid">
        <article className="detail-panel">
          <p className="eyebrow">Platform use</p>
          <h3>Recipe browsing and submissions</h3>
          <p>
            Users are expected to browse, save, and submit recipes in good faith.
            Admin review tools exist to moderate requests before publication.
          </p>
        </article>

        <article className="detail-panel">
          <p className="eyebrow">Development status</p>
          <h3>Features may reset while the project evolves</h3>
          <p>
            Because the project is being rebuilt, account flows, recipe data, and
            moderation states may change before the final backend is in place.
          </p>
        </article>
      </section>
    </div>
  )
}

export default TermsPage
