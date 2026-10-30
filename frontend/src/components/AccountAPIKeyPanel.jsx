import { useEffect, useRef, useState } from 'react'
import Button from './Button'
import {
  clearPendingAccountAPIKey,
  consumeAccountAPIKey,
  ensureAccountAPIKey,
  getAccountAPIKey,
  replaceAccountAPIKey,
  retainAccountAPIKeyPanel,
  revokeAccountAPIKey,
} from '../data/accountApiKey'
import '../styles/account-api-key.css'

function displayDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function AccountAPIKeyPanel({ userId }) {
  const [key, setKey] = useState(null)
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [isBusy, setIsBusy] = useState(true)
  const [needsReload, setNeedsReload] = useState(false)
  const [setupAllowed, setSetupAllowed] = useState(false)
  const [message, setMessage] = useState('Loading your API access...')
  const [error, setError] = useState('')
  const mounted = useRef(false)
  const busy = useRef(true)

  useEffect(() => {
    let active = true
    mounted.current = true
    const release = retainAccountAPIKeyPanel(userId)
    ensureAccountAPIKey(userId).then((payload) => {
      if (!active) return
      setKey(payload.key)
      setSecret(consumeAccountAPIKey(userId, payload.key))
      setMessage('')
    }).catch((failure) => {
      if (!active) return
      setError(failure.message || 'Unable to load your API access.')
      setNeedsReload(true)
      setMessage('')
    }).finally(() => {
      if (!active) return
      busy.current = false
      setIsBusy(false)
    })
    return () => {
      active = false
      mounted.current = false
      release()
    }
  }, [userId])

  function clearSecret() {
    setSecret('')
    setShowSecret(false)
    clearPendingAccountAPIKey()
  }

  async function reloadStatus() {
    if (busy.current) return
    busy.current = true
    setIsBusy(true)
    setError('')
    setMessage('Reloading key status...')
    try {
      const payload = await getAccountAPIKey(userId)
      if (!mounted.current) return
      if (!payload.key?.active || payload.key.id !== key?.id) clearSecret()
      setKey(payload.key)
      setSetupAllowed(payload.key === null)
      setNeedsReload(false)
      setMessage(payload.key ? 'Key status updated.' : 'No API key exists yet. Set up your API access below.')
    } catch (failure) {
      if (!mounted.current) return
      if ([401, 403].includes(failure.status)) clearSecret()
      setNeedsReload(true)
      setError(failure.message || 'Unable to reload key status.')
      setMessage('')
    } finally {
      if (mounted.current) {
        busy.current = false
        setIsBusy(false)
      }
    }
  }

  async function setupKey() {
    if (busy.current || needsReload || !setupAllowed || key) return
    busy.current = true
    setIsBusy(true)
    setError('')
    setMessage('Setting up your API access...')
    try {
      const payload = await ensureAccountAPIKey(userId)
      if (!mounted.current) return
      setKey(payload.key)
      setSecret(consumeAccountAPIKey(userId, payload.key))
      setSetupAllowed(false)
      setMessage('API access is ready.')
    } catch (failure) {
      if (!mounted.current) return
      setNeedsReload(true)
      setError(failure.message || 'Unable to set up your API access.')
      setMessage('')
    } finally {
      if (mounted.current) {
        busy.current = false
        setIsBusy(false)
      }
    }
  }

  async function changeKey(action) {
    if (busy.current || needsReload || !key) return
    const confirmation = action === 'replace'
      ? 'Generate a new API key? Your current key will stop working. Connected apps will need the new key.'
      : 'Disable your API key? Connected apps will lose access. Your website login will still work.'
    if (!window.confirm(confirmation)) return
    busy.current = true
    setIsBusy(true)
    setError('')
    setMessage(action === 'replace' ? 'Generating your new API key...' : 'Disabling your API key...')
    clearSecret()
    try {
      const payload = await (action === 'replace'
        ? replaceAccountAPIKey(userId, key.id)
        : revokeAccountAPIKey(userId, key.id))
      if (!mounted.current) return
      setKey(payload.key)
      setSecret(consumeAccountAPIKey(userId, payload.key))
      setMessage(action === 'replace' ? 'New key created. Copy and save it before leaving or refreshing this page.' : 'API key disabled. No new key was created.')
    } catch (failure) {
      if (!mounted.current) return
      setNeedsReload(Boolean(failure.uncertain || failure.requiresReload || [401, 403].includes(failure.status)))
      setError(failure.message || 'Unable to change your API key.')
      setMessage('')
    } finally {
      if (mounted.current) {
        busy.current = false
        setIsBusy(false)
      }
    }
  }

  async function copyKey() {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret)
      if (mounted.current) {
        setError('')
        setMessage('API key copied.')
      }
    } catch {
      if (mounted.current) setError('Copy failed. Show the key and select it to copy manually.')
    }
  }

  return (
    <details
      className="detail-panel detail-panel--profile-section account-api-key"
      onToggle={(event) => {
        if (event.currentTarget.open) void reloadStatus()
        else setShowSecret(false)
      }}
    >
      <summary className="account-api-key__summary">
        <h2 className="profile-page__section-title">Public API access</h2>
      </summary>
      <div className="account-api-key__body" aria-busy={isBusy}>
        <p className="profile-page__section-note">
          Use your API key to connect another app to Recipe Site. It follows your account's recipe permissions.
        </p>
        {key ? (
          <dl className="account-api-key__metadata">
            <div><dt>Status</dt><dd>{key.active ? 'Active' : key.revoked_at ? 'Disabled' : 'Expired'}</dd></div>
            <div><dt>Expires</dt><dd><time dateTime={key.expires_at}>{displayDate(key.expires_at)}</time></dd></div>
          </dl>
        ) : null}
        {key ? (
          <div className="account-api-key__secret">
            <label htmlFor={`account-api-key-${userId}`}>{secret ? 'New API key' : 'API key'}</label>
            <input
              id={`account-api-key-${userId}`}
              type={showSecret ? 'text' : 'password'}
              value={secret}
              placeholder={secret ? undefined : 'Full key unavailable on this page'}
              readOnly
              disabled={!secret}
              autoComplete="off"
              spellCheck={false}
              aria-describedby={`account-api-key-help-${userId}`}
            />
            <p id={`account-api-key-help-${userId}`} className="profile-page__section-note">
              {secret ? (
                <>
                  Copy and save this key privately. After you leave or refresh this page, we cannot show it again.
                  Hiding the key or closing this section keeps it available while you stay on this page.
                </>
              ) : (
                <>
                  Show and Copy are unavailable because the full key is no longer on this page.
                  If you saved it, that copy still works. If you lost it, Generate new key creates a replacement and stops the old key.
                </>
              )}
            </p>
            <div className="account-api-key__actions">
              <Button
                variant="ghost"
                onClick={() => setShowSecret((current) => !current)}
                aria-pressed={showSecret}
                aria-describedby={`account-api-key-help-${userId}`}
                disabled={!secret}
              >
                {showSecret ? 'Hide key' : 'Show key'}
              </Button>
              <Button variant="ghost" onClick={copyKey} disabled={!secret} aria-describedby={`account-api-key-help-${userId}`}>Copy key</Button>
            </div>
          </div>
        ) : null}
        <div className="account-api-key__actions">
          {needsReload ? <Button variant="ghost" onClick={reloadStatus} disabled={isBusy}>Refresh key status</Button> : null}
          {setupAllowed ? <Button onClick={setupKey} disabled={isBusy || needsReload}>Set up API access</Button> : null}
          <Button onClick={() => changeKey('replace')} disabled={isBusy || needsReload || !key}>Generate new key</Button>
          <Button variant="ghost" onClick={() => changeKey('revoke')} disabled={isBusy || needsReload || !key?.active}>Disable key</Button>
        </div>
        {message ? <p className="account-api-key__message" role="status">{message}</p> : null}
        {error ? <p className="account-api-key__error" role="alert">{error}</p> : null}
      </div>
    </details>
  )
}

export default AccountAPIKeyPanel
