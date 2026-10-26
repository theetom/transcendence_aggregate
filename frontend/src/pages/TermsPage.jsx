import { Link } from 'react-router-dom'
import PageHero from '../components/PageHero'

function TermsPage() {
  return (
    <div className="content-frame">
      <PageHero
        eyebrow="Terms of use"
        title="Using Recipe Site."
        lead="The rules for accounts, recipe submissions, reviews, and moderation."
      />

      <section className="page-section split-grid">
        <article className="detail-panel">
          <p className="eyebrow">Platform use</p>
          <h3>Browsing and using an account</h3>
          <p>
            You can browse approved recipes and public profiles without signing in.
            Sign in to submit recipes, save favorites, or post ratings and reviews.
            Use your own account, keep your sign-in details private, and sign out
            when using a shared browser.
          </p>
        </article>

        <article className="detail-panel">
          <p className="eyebrow">Your contributions</p>
          <h3>Share content responsibly</h3>
          <p>
            Submit recipes, photos, and reviews that you created or have permission
            to share. Keep contributions relevant and respectful. Do not post spam,
            abusive content, or another person&apos;s private information.
          </p>
          <p>
            Public profiles include your email address. Uploaded images are accessible
            to anyone with their image URL, even while a recipe is awaiting approval.
            Consider what you are sharing before uploading or submitting content.
          </p>
        </article>

        <article className="detail-panel">
          <p className="eyebrow">Publication and editing</p>
          <h3>Staff review recipes before publication</h3>
          <p>
            New recipes are pending until staff approve them. Pending and rejected
            recipe detail pages are visible to their owner and staff. Staff can reject
            a pending recipe with a reason; its owner can edit and resubmit it.
          </p>
          <p>
            Saving owner edits sends a recipe back for approval. A previously approved
            recipe becomes unpublished until staff approve it again. If a recipe has
            changed since you opened it, reload and review the latest version before
            saving edits or making a moderation decision.
          </p>
        </article>

        <article className="detail-panel">
          <p className="eyebrow">Ratings and favorites</p>
          <h3>Reviews are public contributions</h3>
          <p>
            Reviews on approved recipes require a rating from 1 to 5 and a written
            comment. They are attributed to your account and contribute to the
            recipe&apos;s displayed average and review count. Favorites are managed
            through your own account.
          </p>
          <p>
            You can delete your own reviews. Recipe owners can remove reviews by
            ordinary accounts on their recipes, and staff can remove any review.
            Staff can also remove recipes.
          </p>
        </article>

        <article className="detail-panel">
          <p className="eyebrow">Recipe deletion</p>
          <h3>A request needs staff action</h3>
          <p>
            Recipe owners can request deletion. While a request is pending, owner
            editing is blocked and an approved recipe remains public. Staff can
            delete the recipe or decline the request. Declining a request keeps the
            recipe and allows owner editing again.
          </p>
          <p>
            Recipe deletion removes the live recipe, its reviews, and its favorite
            links. Uploaded files and previously exported copies may remain; deletion
            from the website does not remove every shared copy.
          </p>
        </article>

        <article className="detail-panel">
          <p className="eyebrow">Privacy and account questions</p>
          <h3>Understand what is stored and shared</h3>
          <p>
            Read the <Link to="/privacy">Privacy page</Link> for details about
            account data, public visibility, browser storage, and project exports.
            Contact the team running this site for privacy or account-removal
            requests. Account deletion is not available in profile settings.
          </p>
        </article>
      </section>
    </div>
  )
}

export default TermsPage
