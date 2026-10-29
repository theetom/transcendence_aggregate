import { Link, useLocation } from 'react-router-dom'
import Icon from './Icon'
import {
  getCategoryPath,
  isViewerAuthenticated,
  landingRecipeCategories,
} from '../data/siteData'

function SiteFooter() {
  const location = useLocation()
  const isAuthenticated = isViewerAuthenticated()
  const footerLinksClassName = isAuthenticated
    ? 'site-footer__links site-footer__links--authenticated'
    : 'site-footer__links'

  return (
    <footer className="site-footer">
      <div className="content-frame site-footer__inner">
        <section className="site-footer__panel site-footer__brand">
          <div className="site-footer__brand-copy">
            <p className="eyebrow">Recipe Site</p>
            <h3>A place at the table.</h3>
            <p className="site-footer__copy">
              Discover something delicious. Share what you love to cook.
            </p>
          </div>
        </section>

        <div className="site-footer__aside">
          <nav className={footerLinksClassName} aria-label="Footer links">
            <Link className="footer-link" to="/terms">
              Terms
            </Link>
            <Link className="footer-link" to="/privacy">
              Privacy
            </Link>
            {!isAuthenticated ? (
              <Link className="footer-link" to="/connect">
                Connect
              </Link>
            ) : null}
          </nav>

          <nav className="site-footer__category-list" aria-label="Footer categories">
            {landingRecipeCategories.map((category) => (
              <Link
                key={category.id}
                className="footer-category-link"
                to={getCategoryPath(category.slug)}
              >
                {category.name}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <nav className="mobile-navigation" aria-label="Quick navigation">
        <Link to="/" aria-current={location.pathname === '/' ? 'page' : undefined}>
          <Icon name="home" />Home
        </Link>
        <Link to="/results/search" aria-current={location.pathname === '/results/search' ? 'page' : undefined}>
          <Icon name="search" />Search
        </Link>
        <Link to={isAuthenticated ? '/profile' : '/connect'} aria-current={location.pathname === '/profile' ? 'page' : undefined}>
          <Icon name="heart" />Saved
        </Link>
      </nav>
    </footer>
  )
}

export default SiteFooter
