import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthPageShell from '../components/AuthPageShell'
import { saveAuthSession } from '../auth'
import { requestJson } from '../api'

function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState(location.state?.signupSuccess ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()

    if (submitting) return
    setSubmitting(true)
    setError(null)
    setStatus('Signing in…')

    try {
      const data = await requestJson('/api/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      if (typeof data?.token !== 'string' || !data.token) {
        throw new Error('The login response did not include an authentication token.')
      }

      saveAuthSession({ token: data.token })
      navigate('/', { replace: true })
    } catch (error) {
      setStatus('')
      setError(error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthPageShell
      introEyebrow="Login page"
      introTitle="Welcome back to your kitchen corner."
      introDescription="Log in with the credentials you chose when registering."
      bullets={[
        'Enter your username and password.',
        'New here? Create an account first.',
        'After logging in, you will return to the main page.',
      ]}
      formEyebrow="Sign in"
      formTitle="Log in"
      status={status}
      error={error}
    >
      <form className="field-list" onSubmit={handleSubmit} style={{ marginTop: '18px' }}>
        <div className="field">
          <label htmlFor="login-username">Username</label>
          <input
            id="login-username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Your username"
          />
        </div>

        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
          />
        </div>

        <div className="auth-card__actions">
          <button type="submit" className="button button--ghost" disabled={submitting}>
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
