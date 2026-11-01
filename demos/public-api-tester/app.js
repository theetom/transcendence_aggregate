'use strict'

;(() => {
  const element = (id) => document.getElementById(id)
  const ui = {
    form: element('connection-form'), key: element('api-key'), connect: element('connect-button'),
    disconnect: element('disconnect-button'), connection: element('connection-state'),
    proof: element('api-proof'), error: element('error-notice'),
  }
  const state = { connected: false, busy: false, demoBusy: false, retryUntil: 0, retryTimer: null }

  function showError(message = '') {
    ui.error.textContent = message
    ui.error.hidden = !message
  }

  function updateControls() {
    const busy = state.busy || state.demoBusy
    ui.key.disabled = busy
    ui.connect.disabled = busy || state.retryUntil > Date.now()
    ui.disconnect.disabled = busy
  }

  function renderConnection() {
    ui.connection.textContent = state.connected ? 'Connected' : 'Not connected'
    ui.connection.classList.toggle('is-connected', state.connected)
    ui.form.hidden = state.connected
    ui.disconnect.hidden = !state.connected
    updateControls()
    window.dispatchEvent(new CustomEvent('public-api-tester-connection', { detail: { connected: state.connected } }))
  }

  function setBusy(value) {
    state.busy = value
    ui.form.setAttribute('aria-busy', String(value))
    updateControls()
    window.dispatchEvent(new CustomEvent('public-api-tester-main-busy', { detail: { busy: value } }))
  }

  async function request(path, body) {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'X-Public-API-Tester': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const data = await response.json().catch(() => null)
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The local connector returned unreadable data.')
    if (!response.ok) {
      if (response.status === 429) {
        const seconds = Number.isSafeInteger(data.retry_after) && data.retry_after > 0 ? data.retry_after : 60
        state.retryUntil = Date.now() + seconds * 1000
        window.clearTimeout(state.retryTimer)
        state.retryTimer = window.setTimeout(updateControls, seconds * 1000 + 50)
      }
      throw new Error(typeof data.error === 'string' ? data.error : 'The connection request failed.')
    }
    if (typeof data.connected !== 'boolean') throw new Error('The connection status could not be read.')
    return data
  }

  async function perform(path, body) {
    if (state.busy || state.demoBusy) return
    setBusy(true)
    showError()
    try {
      const data = await request(path, body)
      state.connected = data.connected
      ui.proof.textContent = state.connected
        ? data.upstream_status === 200 ? 'Connection verified: Recipe Site API replied HTTP 200.' : 'Connected. Use the tester controls below to see real API responses.'
        : 'Connect an active key to begin testing.'
    } catch (error) {
      // A failed reconnect may have already cleared the previous credential.
      state.connected = false
      ui.proof.textContent = 'Connection could not be confirmed. Connect an active key to continue.'
      showError(error.message || 'The local connector could not be reached.')
    } finally {
      ui.key.value = ''
      renderConnection()
      setBusy(false)
    }
  }

  ui.form.addEventListener('submit', (event) => {
    event.preventDefault()
    if (ui.connect.disabled) return
    const apiKey = ui.key.value.trim()
    ui.key.value = ''
    void perform('/api/connect', { api_key: apiKey })
  })
  ui.disconnect.addEventListener('click', () => void perform('/api/disconnect', {}))
  window.addEventListener('public-api-tester-demo-busy', (event) => {
    if (typeof event.detail?.busy === 'boolean') state.demoBusy = event.detail.busy
    updateControls()
  })
  window.addEventListener('public-api-tester-demo-auth-failed', () => {
    state.connected = false
    ui.proof.textContent = 'Recipe Site rejected the key. Reconnect with an active key; the temporary recipe is still tracked.'
    renderConnection()
  })
  void perform('/api/status')
})()
