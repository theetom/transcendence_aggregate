import { useEffect, useRef, useState } from 'react'
import Button from '../components/Button'
import PageHero from '../components/PageHero'
import '../styles/status.css'

const refreshDelay = 30 * 1000
const requestTimeout = 10 * 1000

function readHealth(status, data) {
  const database = data?.services?.database
  if (typeof data?.checked_at !== 'string' || !Number.isFinite(Date.parse(data.checked_at))
    || data?.services?.backend !== 'online'
    || !(status === 200 && data.status === 'ok' && database === 'online'
      || status === 503 && data.status === 'degraded' && database === 'unavailable')) {
    throw new Error('The service check could not be read. Try refreshing the status shortly.')
  }
  return data
}

function ServiceCard({ title, state, label, children }) {
  return (
    <article className="status-page__card">
      <div className="status-page__card-heading">
        <h3>{title}</h3>
        <span className={`status-page__state status-page__state--${state}`}>{label}</span>
      </div>
      <p>{children}</p>
    </article>
  )
}

function StatusPage() {
  const [health, setHealth] = useState(null)
  const [error, setError] = useState('')
  const [isChecking, setIsChecking] = useState(true)
  const [lastChecked, setLastChecked] = useState('')
  const refresh = useRef(null)

  useEffect(() => {
    let active = true
    let sequence = 0
    let timer = null
    let request = null

    async function checkStatus() {
      if (!active || document.hidden || request) return
      window.clearTimeout(timer)
      const check = ++sequence
      const controller = new AbortController()
      request = controller
      let timedOut = false
      const timeout = window.setTimeout(() => {
        timedOut = true
        controller.abort()
      }, requestTimeout)
      setIsChecking(true)
      setError('')
      try {
        const response = await fetch('/api/health/', {
          method: 'GET', credentials: 'omit', cache: 'no-store',
          headers: { Accept: 'application/json' }, signal: controller.signal,
        })
        const data = await response.json().catch(() => null)
        const value = readHealth(response.status, data)
        if (!active || check !== sequence || controller.signal.aborted) return
        setHealth(value)
        setLastChecked(value.checked_at)
      } catch (failure) {
        if (!active || check !== sequence || controller.signal.aborted && !timedOut) return
        setHealth(null)
        setLastChecked(new Date().toISOString())
        setError(timedOut
          ? 'The server did not respond in time. Try refreshing the status shortly.'
          : failure.message === 'The service check could not be read. Try refreshing the status shortly.'
            ? failure.message
            : 'The server could not be reached. Try refreshing the status shortly.')
      } finally {
        window.clearTimeout(timeout)
        if (active && check === sequence) {
          request = null
          setIsChecking(false)
          if (!document.hidden) timer = window.setTimeout(checkStatus, refreshDelay)
        }
      }
    }

    function onVisibilityChange() {
      window.clearTimeout(timer)
      if (document.hidden) {
        sequence++
        request?.abort()
        request = null
        setIsChecking(false)
      } else void checkStatus()
    }

    refresh.current = () => void checkStatus()
    document.addEventListener('visibilitychange', onVisibilityChange)
    if (!document.hidden) void checkStatus()
    else setIsChecking(false)

    return () => {
      active = false
      sequence++
      window.clearTimeout(timer)
      request?.abort()
      refresh.current = null
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  const serverState = isChecking ? 'checking' : health ? 'online' : error ? 'unavailable' : 'unknown'
  const databaseState = isChecking ? 'checking' : health?.services.database || 'unknown'
  const labels = { online: 'Online', unavailable: 'Unavailable', checking: 'Checking…', unknown: 'Not checked' }
  const summary = health?.status === 'ok'
    ? 'All services are responding.'
    : health?.status === 'degraded'
      ? 'The server is online, but the database is unavailable. Some features may not work.'
      : error ? 'The service check is unavailable right now.' : isChecking ? 'Checking services…' : 'Service status has not been checked yet.'

  return (
    <div className="content-frame status-page">
      <PageHero
        eyebrow="Service status"
        title="Recipe Site status."
        lead="A quick check of the website, server and database."
      />
      <section className="page-section status-page__overview" aria-labelledby="status-services-title" aria-busy={isChecking}>
        <div className="status-page__heading">
          <h2 id="status-services-title">Current services</h2>
          <Button variant="ghost" disabled={isChecking} onClick={() => refresh.current?.()}>
            {isChecking ? 'Checking status…' : 'Refresh status'}
          </Button>
        </div>
        <p className="status-page__summary" role="status">{summary}</p>
        <div className="status-page__cards">
          <ServiceCard title="Website" state="online" label="Loaded">
            This page loaded successfully in your browser.
          </ServiceCard>
          <ServiceCard title="Server" state={serverState} label={labels[serverState]}>
            The server handles sign-in, recipes and other website requests.
          </ServiceCard>
          <ServiceCard title="Database" state={databaseState} label={labels[databaseState]}>
            {databaseState === 'unknown'
              ? 'Its status could not be checked while the server is unavailable.'
              : 'The database stores accounts, recipes, reviews and favorites.'}
          </ServiceCard>
        </div>
        {error ? <p className="status-banner" role="alert">{error}</p> : null}
        <p className="status-page__note">
          Checks refresh every 30 seconds while this page is visible.
          {lastChecked ? <> Last checked: <time dateTime={lastChecked}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(lastChecked))}</time>.</> : null}
        </p>
      </section>
    </div>
  )
}

export default StatusPage
