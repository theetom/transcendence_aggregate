import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthPageShell from '../components/AuthPageShell'
import Button from '../components/Button'
import FieldError from '../components/FieldError'

function readErrorMessage(value) {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean).join(' ')
  }
  return ''
}

function readSignupErrors(data) {
  const errors = {}
  for (const field of ['username', 'email', 'password', 'password_confirm']) {
    const message = readErrorMessage(data?.[field])
    if (!message) continue
    if (field === 'username' && /already exists/i.test(message)) {
      errors[field] = 'A user with this username already exists.'
    } else if (field === 'email' && /already exists/i.test(message)) {
      errors[field] = 'A user with this email already exists.'
    } else {
      errors[field] = message
    }
  }

  const message = readErrorMessage(data?.non_field_errors) || readErrorMessage(data?.detail)
  return { errors, message }
}

function SignupPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [status, setStatus] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function clearFieldError(field) {
    setFieldErrors((current) => ({
      ...current,
      [field]: '',
      ...(['username', 'email'].includes(field) ? { password: '' } : {}),
      ...(['password', 'password_confirm'].includes(field) ? { password_confirm: '' } : {}),
    }))
    setFormError('')
    setStatus('')
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (isSubmitting) {
      return
    }

    setStatus('')
    setFormError('')
    const errors = {}
    if (!username.trim()) errors.username = 'Enter a username.'
    if (!email.trim()) errors.email = 'Enter an email address.'
    if (!password.trim()) {
      errors.password = 'Enter a password.'
    } else if (Array.from(password).length < 8) {
      errors.password = 'Use at least 8 characters for your password.'
    }
    if (!passwordConfirm) {
      errors.password_confirm = 'Confirm your password.'
    } else if (password && password !== passwordConfirm) {
      errors.password_confirm = 'Passwords do not match.'
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }

    setIsSubmitting(true)
    setStatus('Creating account...')

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

      const data = await response.json().catch(() => null)
      setStatus('')

      if (!response.ok) {
        if (response.status === 400) {
          const { errors: serverErrors, message } = readSignupErrors(data)
          setFieldErrors(serverErrors)
          setFormError(message || (Object.keys(serverErrors).length > 0
            ? ''
            : 'Please check your information and try again.'))
        } else {
          setFormError('Unable to create your account right now. Please try again later.')
        }
        return
      }

      if (response.status !== 201 || !data?.user?.username) {
        setFormError('Unable to confirm account creation. Try signing in before submitting again.')
        return
      }

      navigate('/login', { replace: true })
    } catch {
      setStatus('')
      setFormError('Unable to complete signup. Check your connection and try again.')
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
        <FieldError id="signup-form-error" message={formError} className="signup-field-error" label="Error:" />
        <div className="field">
          <label htmlFor="signup-username">Username</label>
          <input
            id="signup-username"
            name="username"
            type="text"
            autoComplete="username"
            disabled={isSubmitting}
            value={username}
            onChange={(event) => {
              setUsername(event.target.value)
              clearFieldError('username')
            }}
            placeholder="Your display name"
            aria-invalid={Boolean(fieldErrors.username)}
            aria-describedby={fieldErrors.username ? 'signup-username-error' : undefined}
          />
          <FieldError id="signup-username-error" message={fieldErrors.username} className="signup-field-error" label="Error:" />
        </div>

        <div className="field">
          <label htmlFor="signup-email">Email</label>
          <input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            disabled={isSubmitting}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              clearFieldError('email')
            }}
            placeholder="you@example.com"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'signup-email-error' : undefined}
          />
          <FieldError id="signup-email-error" message={fieldErrors.email} className="signup-field-error" label="Error:" />
        </div>

        <div className="field">
          <label htmlFor="signup-password">Password</label>
          <input
            id="signup-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            disabled={isSubmitting}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              clearFieldError('password')
            }}
            placeholder="Create a password"
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? 'signup-password-help signup-password-error' : 'signup-password-help'}
          />
          <p id="signup-password-help">
            Use at least 8 characters. Avoid common passwords, numbers only, and passwords similar to your username or email.
          </p>
          <FieldError id="signup-password-error" message={fieldErrors.password} className="signup-field-error" label="Error:" />
        </div>

        <div className="field">
          <label htmlFor="signup-password-confirm">Confirm password</label>
          <input
            id="signup-password-confirm"
            name="password_confirm"
            type="password"
            autoComplete="new-password"
            disabled={isSubmitting}
            value={passwordConfirm}
            onChange={(event) => {
              setPasswordConfirm(event.target.value)
              clearFieldError('password_confirm')
            }}
            onBlur={() => {
              if (passwordConfirm && password !== passwordConfirm) {
                setFieldErrors((current) => ({ ...current, password_confirm: 'Passwords do not match.' }))
              }
            }}
            placeholder="Confirm your password"
            aria-invalid={Boolean(fieldErrors.password_confirm)}
            aria-describedby={fieldErrors.password_confirm ? 'signup-password-confirm-error' : undefined}
          />
          <FieldError id="signup-password-confirm-error" message={fieldErrors.password_confirm} className="signup-field-error" label="Error:" />
        </div>

        <div className="auth-card__actions">
          <Button type="submit" variant="ghost" disabled={isSubmitting}>
            Create account
          </Button>
          <Link className="button button--ghost" to="/login">
            Already registered?
          </Link>
        </div>
      </form>
    </AuthPageShell>
  )
}

export default SignupPage
