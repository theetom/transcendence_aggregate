import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Icon from './Icon'
import { clearAccountAPIKeyState } from '../data/accountApiKey'
import {
  authTokenStorageKey,
  isViewerAuthenticated,
  menuRecipeTypeLabels,
  menuThemeLabels,
} from '../data/siteData'

function SiteHeader() {
  const location = useLocation()
  const navigate = useNavigate()
  const isAuthenticated = isViewerAuthenticated()
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const menuPopoverRef = useRef(null)
  const menuToggleRef = useRef(null)
  const logoutPendingRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) clearAccountAPIKeyState()
  }, [isAuthenticated])

  useEffect(() => {
    setMenuOpen(false)

    if (location.pathname === '/results/search') {
      const params = new URLSearchParams(location.search)
      setQuery(params.get('q') ?? '')
    }
  }, [location.pathname, location.search, location.hash])

  useEffect(() => {
    if (!menuOpen) {
      return undefined
    }

    function handlePointerDown(event) {
      if (menuPopoverRef.current?.contains(event.target)) {
        return
      }

      setMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [menuOpen])

  function handleSearchSubmit(event) {
    event.preventDefault()
    setMenuOpen(false)

    const trimmedQuery = query.trim()

    if (!trimmedQuery) {
      navigate('/results/search')
      return
    }

    navigate(`/results/search?q=${encodeURIComponent(trimmedQuery)}`)
  }

  async function handleLogout() {
    if (logoutPendingRef.current) {
      return
    }

    const token = window.sessionStorage.getItem(authTokenStorageKey)

    if (!token) {
      clearAccountAPIKeyState()
      navigate('/connect', { replace: true })
      return
    }

    logoutPendingRef.current = true
    setIsLoggingOut(true)
    setLogoutError('')

    try {
      const response = await fetch('/api/logout/', {
        method: 'POST',
        headers: { Authorization: `Token ${token}` },
      })

      // An invalid token may mean a previous logout succeeded but its response was lost.
      if (response.status !== 204 && response.status !== 401) {
        setLogoutError('Unable to log out right now. Please try again.')
        return
      }

      clearAccountAPIKeyState()
      window.sessionStorage.removeItem(authTokenStorageKey)
      navigate('/connect', { replace: true })
    } catch {
      setLogoutError('Unable to log out. Check your connection and try again.')
    } finally {
      logoutPendingRef.current = false
      setIsLoggingOut(false)
    }
  }

  return (
    <header className="site-header">
      <div className="site-header__inner content-frame">
        <div
          ref={menuPopoverRef}
          className="menu-popover"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setMenuOpen(false)
              menuToggleRef.current?.focus()
            }
          }}
        >
          <button
            ref={menuToggleRef}
            type="button"
            className="menu-button"
            onClick={() => setMenuOpen((current) => !current)}
            aria-expanded={menuOpen}
            aria-controls="site-menu-panel"
          >
            <Icon name="menu" />
            <span className="sr-only">Toggle menu</span>
          </button>

          <div
            id="site-menu-panel"
            className={menuOpen ? 'menu-panel is-open' : 'menu-panel'}
          >
            <div className="menu-panel__stack">
              <form className="search-form" onSubmit={handleSearchSubmit}>
                <input
                  id="site-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Recipes or users"
                  aria-label="Search recipes or users"
                />
                <button type="submit" className="search-button">
                  <Icon name="search" />
                  <span className="sr-only">Search</span>
                </button>
              </form>
              <Link className="menu-line" to="/#popular-section-title" onClick={() => setMenuOpen(false)}>Discover recipes</Link>
              <Link className="menu-line" to="/#recently-added-section-title" onClick={() => setMenuOpen(false)}>Recently added</Link>
              <Link className="menu-line" to={isAuthenticated ? '/add-recipe' : '/connect'}>
                Propose a recipe{' '}
                {!isAuthenticated ? (
                  <span className="menu-line__hint">(needs login)</span>
                ) : null}
              </Link>

              <Link className="menu-line" to={isAuthenticated ? '/profile' : '/connect'}>
                {isAuthenticated ? 'Your profile and saved recipes' : 'Sign in or create an account'}
              </Link>

              {menuRecipeTypeLabels.length > 0 ? <section className="menu-group">
                <p className="menu-group__title">Recipes by Type</p>
                <div className="menu-link-list">
                  {menuRecipeTypeLabels.map((label) => (
                    <button
                      key={label}
                      type="button"
                      className="menu-line menu-line--nested"
                      disabled
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section> : null}

              {menuThemeLabels.length > 0 ? <section className="menu-group">
                <p className="menu-group__title">Recipes by Theme</p>
                <div className="menu-link-list">
                  {menuThemeLabels.map((label) => (
                    <button
                      key={label}
                      type="button"
                      className="menu-line menu-line--nested"
                      disabled
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section> : null}
            </div>
          </div>
        </div>

        <Link className="brand" to="/" aria-label="Recipe Site home">
          <span className="brand__name">Recipe Site</span>
        </Link>

        <nav className="site-header__navigation" aria-label="Main navigation">
          <Link to="/#popular-section-title">Discover</Link>
          <Link to="/#recently-added-section-title">Latest</Link>
          <Link to={isAuthenticated ? '/add-recipe' : '/connect'}>Submit a recipe</Link>
        </nav>

        <div className="header-actions">
          {!isAuthenticated ? (
            <Link className="header-button header-button--connect" to="/connect">
              Connect
            </Link>
          ) : null}
          <Link
            className="header-button header-button--profile"
            to={isAuthenticated ? '/profile' : '/connect'}
          >
            <Icon name="user" />
            <span className="header-button__label">Profile</span>
          </Link>
          {isAuthenticated ? (
            <button
              type="button"
              className="header-button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              aria-busy={isLoggingOut}
              aria-describedby={logoutError ? 'logout-error' : undefined}
            >
              <Icon name="logout" />
              <span className="header-button__label">{isLoggingOut ? 'Logging out...' : 'Log out'}</span>
            </button>
          ) : null}
        </div>
      </div>
      {logoutError ? (
        <p id="logout-error" className="status-banner content-frame" role="alert">
          {logoutError}
        </p>
      ) : null}
    </header>
  )
}

export default SiteHeader
