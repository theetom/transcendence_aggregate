import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthPageShell from '../components/AuthPageShell'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState(
    'Frontend auth layout is ready. Django login wiring comes next.',
  )

  function handleSubmit(event) {
    event.preventDefault()

    if (!email.trim() || !password) {
      setStatus('Enter both email and password before continuing.')
      return
    }

    setStatus(
      'Login form validated on the frontend. The next step is connecting this layout to Django session endpoints.',
    )
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
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
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
          <button type="submit" className="button button--ghost">
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
