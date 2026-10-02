import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthPageShell from '../components/AuthPageShell'

function SignupPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [status, setStatus] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()

    if (isSubmitting) {
      return
    }

    if (!username.trim() || !email.trim() || !password || !passwordConfirm) {
      setStatus('Username, email, password, and password confirmation are all required.')
      return
    }

    if (password !== passwordConfirm) {
      setStatus('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    setStatus('Creating account...')
    let responseDetails = 'POST /api/sign_up/'

    try {
      const response = await fetch('/api/sign_up/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          password,
          password_confirm: passwordConfirm,
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

      if (response.status !== 201 || !data?.user?.username) {
        setStatus(`${responseDetails}\n\nFrontend: Expected HTTP 201 with the created user.`)
        return
      }

      navigate('/login', { replace: true })
    } catch (error) {
      setStatus(`${responseDetails}\n\n${error.name}: ${error.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthPageShell
      introEyebrow="Signup page"
      introTitle="Create a cooking profile worth coming back to."
      introDescription="Create an account to save favorites, manage your profile, and come back to recipes later."
      bullets={[
        'Start your own recipe space and keep the dishes you want to revisit.',
        'Save favorites in one place instead of hunting for them again later.',
        'Join now and share your recipes',
      ]}
      formEyebrow="Register"
      formTitle="Create account"
      status={status}
    >
      <form className="field-list" onSubmit={handleSubmit} style={{ marginTop: '18px' }}>
        <div className="field">
          <label htmlFor="signup-username">Username</label>
          <input
            id="signup-username"
            name="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Your display name"
          />
        </div>

        <div className="field">
          <label htmlFor="signup-email">Email</label>
          <input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="field">
          <label htmlFor="signup-password">Password</label>
          <input
            id="signup-password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Create a password"
          />
        </div>

        <div className="field">
          <label htmlFor="signup-password-confirm">Confirm password</label>
          <input
            id="signup-password-confirm"
            name="password_confirm"
            type="password"
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(event) => setPasswordConfirm(event.target.value)}
            placeholder="Confirm your password"
          />
        </div>

        <div className="auth-card__actions">
          <button type="submit" className="button button--ghost" disabled={isSubmitting}>
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
