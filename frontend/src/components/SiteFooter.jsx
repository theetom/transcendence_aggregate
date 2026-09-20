import { Link } from 'react-router-dom'
import { isAuthenticated } from '../auth'

function SiteFooter() {
  const authenticated = isAuthenticated()
  const footerLinksClassName = authenticated
    ? 'site-footer__links site-footer__links--authenticated'
    : 'site-footer__links'

  return (
    <footer className="site-footer">
      <div className="content-frame site-footer__inner">
        <section className="site-footer__panel site-footer__brand">
          <div className="site-footer__mark" aria-hidden="true">
            RS
          </div>
          <div className="site-footer__brand-copy">
            <p className="eyebrow">Recipe Site</p>
            <h3>Site footer</h3>
            <p className="site-footer__copy">
              Shared site links and account entry points live here.
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
            {!authenticated ? (
              <Link className="footer-link" to="/connect">
                Connect
              </Link>
            ) : null}
          </nav>

        </div>
      </div>
    </footer>
  )
}

export default SiteFooter
