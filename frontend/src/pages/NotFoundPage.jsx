import { Link } from 'react-router-dom'
import PageHero from '../components/PageHero'

function NotFoundPage() {
  return (
    <div className="content-frame">
      <PageHero
        eyebrow="404"
        title="This page is not part of the current recipe-site map."
        lead="The route shell exists, but there is no page assigned to this URL yet."
        className="not-found"
      >
        <Link className="button button--primary" to="/">
          Return to landing page
        </Link>
      </PageHero>
    </div>
  )
}

export default NotFoundPage
