import PageHero from '../components/PageHero'

function PrivacyPage() {
  return (
    <div className="content-frame">
      <PageHero
        eyebrow="Privacy"
        title="Privacy and account handling."
        lead="This page is now aligned with the recipe-site direction rather than the old Transcendence setup."
      />

      <section className="page-section split-grid">
        <article className="detail-panel">
          <p className="eyebrow">What we store</p>
          <h3>Account and recipe data</h3>
          <p>
            The platform is expected to store account identity details, submitted
            recipes, moderation notes, favorites, and review activity once the Django
            and MariaDB layers are connected.
          </p>
        </article>

        <article className="detail-panel">
          <p className="eyebrow">Why it matters</p>
          <h3>Educational project boundaries</h3>
          <p>
            This remains a student project. Sensitive production-grade privacy handling
            is not assumed yet, and the frontend currently acts as a structured preview.
          </p>
        </article>
      </section>
    </div>
  )
}

export default PrivacyPage
