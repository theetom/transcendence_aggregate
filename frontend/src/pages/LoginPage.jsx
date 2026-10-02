import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthPageShell from '../components/AuthPageShell'
import { authTokenStorageKey } from '../data/siteData'

function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()

    if (isSubmitting) {
      return
    }

    if (!username.trim() || !password) {
      setStatus('Enter both username and password before continuing.')
      return
    }

    setIsSubmitting(true)
    setStatus('Signing in...')
    let responseDetails = 'POST /api/login/'

    try {
      const response = await fetch('/api/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      })

      responseDetails += `\nHTTP ${response.status} ${response.statusText}`
      const body = await response.text()
      responseDetails += `\n\n${body}`

      if (!response.ok) {
        setStatus(responseDetails)
        return
      }

      const data = JSON.parse(body)

      if (typeof data?.token !== 'string' || !data.token.trim()) {
        setStatus(`${responseDetails}\n\nFrontend: The response did not contain a login token.`)
        return
      }

      window.sessionStorage.setItem(authTokenStorageKey, data.token)
      navigate('/', { replace: true })
    } catch (error) {
      setStatus(`${responseDetails}\n\n${error.name}: ${error.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthPageShell
      introEyebrow="Login page"
      introTitle="Welcome back to your kitchen corner."
      introDescription="Sign in to pick up where you left off, revisit saved recipes, and keep your own food space in one place."
      bullets={[
        'Find your saved recipes without digging for them again.',
        'Get back to the dishes you meant to try next.',
        'Keep your account ready for sharing and saving more later.',
      ]}
      formEyebrow="Sign in"
      formTitle="Log in"
      status={status}
    >
      <form className="field-list" onSubmit={handleSubmit} style={{ marginTop: '18px' }}>
        <div className="field">
          <label htmlFor="login-username">Username</label>
          <input
            id="login-username"
            name="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Enter your username"
          />
        </div>

        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
          />
        </div>

        <div className="auth-card__actions">
          <button type="submit" className="button button--ghost" disabled={isSubmitting}>
            Continue
          </button>
          <Link className="button button--ghost" to="/signup">
            Need an account?
          </Link>
        </div>
      </form>
    </AuthPageShell>
  )
}

export default LoginPage
