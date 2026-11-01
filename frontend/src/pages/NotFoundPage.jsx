import { Link } from 'react-router-dom'
import PageHero from '../components/PageHero'

function NotFoundPage() {
  return (
    <div className="content-frame">
      <PageHero
        eyebrow="404"
        title="Page not found."
        lead="Check the address or return to the home page."
        className="not-found"
      >
        <Link className="button button--primary" to="/">
          Return to home page
        </Link>
      </PageHero>
    </div>
  )
}

export default NotFoundPage
