import { Link } from 'react-router-dom'
import PageHero from '../components/PageHero'

function PrivacyPage() {
  return (
    <div className="content-frame">
      <PageHero
        eyebrow="Privacy"
        title="Privacy on Recipe Site."
        lead="What we store, how we use it, and what other people can see."
      />

      <section className="page-section split-grid">
        <article className="detail-panel">
          <p className="eyebrow">What we store</p>
          <h3>Account and recipe data</h3>
          <p>
            Creating an account provides your username, email address, and password.
            Your password is stored as a hash for sign-in checks. You can also provide
            your name, a bio, and a profile picture.
          </p>
          <p>
            We store submitted recipes, ingredients, quantities, steps, categories,
            photos, ratings, written reviews, favorites, and their associated account
            and date information. Recipe records also include moderation status,
            rejection reasons, and deletion requests.
          </p>
        </article>

        <article className="detail-panel">
          <p className="eyebrow">How we use it</p>
          <h3>Running your account and the recipe service</h3>
          <p>
            We use account information to sign you in and associate your recipes,
            reviews, and favorites with you. Recipe and review data support browsing,
            search, author profiles, and rating summaries. Staff use submissions and
            moderation records to decide what is published or removed.
          </p>
        </article>

        <article className="detail-panel">
          <p className="eyebrow">Public information</p>
          <h3>Your profile and published contributions</h3>
          <p>
            <strong>Your email address is public.</strong> Public profiles include
            your username, name, email address, bio, profile picture, and approved
            recipes. These can be viewed without signing in.
          </p>
          <p>
            Approved recipes and their ratings and written reviews are public.
            Reviews identify their author and show when they were posted. Your
            favorites, full submission list, and combined review history are available
            through your signed-in profile. Site operators can access stored records.
          </p>
        </article>

        <article className="detail-panel">
          <p className="eyebrow">Recipe visibility</p>
          <h3>Unpublished recipes and uploaded images</h3>
          <p>
            Pending and rejected recipe detail pages are available to the recipe
            owner and staff. New submissions need staff approval before appearing
            in public recipe lists. Owner edits send a recipe back for approval and
            hide its detail page from other ordinary visitors until it is approved again.
          </p>
          <p>
            Uploaded recipe and profile images are accessible to anyone with their
            image URL, including images attached to pending or rejected recipes.
            Only upload images you are comfortable making public.
          </p>
        </article>

        <article className="detail-panel">
          <p className="eyebrow">Browser storage and other services</p>
          <h3>Sign-in storage and fonts</h3>
          <p>
            The website keeps your sign-in token in browser storage for the current
            tab. Signing out removes that stored token and revokes it on the server.
            The administration area also uses essential session and security cookies.
            Sign out before leaving a shared browser.
          </p>
          <p>
            This page loads fonts from Google Fonts, so your browser contacts Google.
            See{' '}
            <a href="https://policies.google.com/privacy">Google&apos;s Privacy Policy</a>
            {' '}for information about its handling of those requests.
          </p>
        </article>

        <article className="detail-panel">
          <p className="eyebrow">Moderation and removal</p>
          <h3>What deletion changes</h3>
          <p>
            Recipe owners request deletion; staff can complete or decline the request.
            An approved recipe stays public while its deletion request is waiting.
            Owner editing is blocked while that request is pending. Staff can also
            remove recipes directly.
          </p>
          <p>
            Deleting a recipe removes its live recipe entry, associated reviews, and
            favorite links. Review authors can delete their own reviews; recipe owners
            can remove reviews by ordinary accounts on their recipes, and staff can
            remove any review. Stored image files and existing copies may remain
            after a recipe is deleted.
          </p>
        </article>

        <article className="detail-panel">
          <p className="eyebrow">Retention and shared copies</p>
          <h3>Data can remain in project exports</h3>
          <p>
            Account, recipe, and review records have no automatic expiry. Project
            maintainers can export stored data and uploaded images to share with
            other project checkouts.
            These copies include account and profile information, hashed passwords,
            recipes including unpublished submissions, reviews, favorites, and
            moderation records. Login tokens and server sessions are excluded.
          </p>
          <p>
            Exported copies and retained image files can outlast a change or deletion
            on the running website. Removing a live recipe does not erase copies
            that have already been shared.
          </p>
        </article>

        <article className="detail-panel">
          <p className="eyebrow">Your choices</p>
          <h3>Managing information and asking for help</h3>
          <p>
            In your profile you can edit your name, bio, and profile picture and
            manage your favorites. You can edit your recipes, request their deletion,
            and delete your own reviews. Account deletion is not available in profile
            settings; contact the team running this site for account-removal requests
            or privacy questions.
          </p>
          <p>
            Read the <Link to="/terms">Terms of use</Link> for the submission,
            moderation, and review rules.
          </p>
        </article>
      </section>
    </div>
  )
}

export default PrivacyPage
