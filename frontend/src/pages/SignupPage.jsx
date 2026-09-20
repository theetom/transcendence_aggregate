import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthPageShell from '../components/AuthPageShell'
import { requestJson } from '../api'

function SignupPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const navigate = useNavigate()
  const [status, setStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()

    if (submitting) return
    setSubmitting(true)
    setError(null)
    setStatus('Creating your account…')

    try {
      await requestJson('/api/sign_up/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), email: email.trim(), password, password_confirm: passwordConfirm }),
      })
      navigate('/login', { replace: true, state: { signupSuccess: 'Account created. Log in with your new credentials.' } })
    } catch (error) {
      setStatus('')
      setError(error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthPageShell
      introEyebrow="Signup page"
      introTitle="Create an account."
      introDescription="After registration, log in with your new credentials."
      bullets={[
        'Choose a username and password for your account.',
        'A successful registration does not log you in automatically.',
        'Log in after creating the account.',
      ]}
      formEyebrow="Register"
      formTitle="Create account"
      status={status}
      error={error}
    >
      <form className="field-list" onSubmit={handleSubmit} style={{ marginTop: '18px' }}>
        <div className="field">
          <label htmlFor="signup-username">Username</label>
          <input
            id="signup-username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Your display name"
          />
        </div>

        <div className="field">
          <label htmlFor="signup-email">Email</label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="field">
          <label htmlFor="signup-password">Password</label>
          <input
            id="signup-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Create a password"
          />
        </div>

        <div className="field">
          <label htmlFor="signup-password-confirm">Confirm password</label>
          <input
            id="signup-password-confirm"
            type="password"
            value={passwordConfirm}
            onChange={(event) => setPasswordConfirm(event.target.value)}
            placeholder="Repeat your password"
          />
        </div>

        <div className="auth-card__actions">
          <button type="submit" className="button button--ghost" disabled={submitting}>
            Create account
          </button>
          <Link className="button button--ghost" to="/login">
            Already registered?
          </Link>
        </div>
      </form>
    </AuthPageShell>
  )
}

export default SignupPage
