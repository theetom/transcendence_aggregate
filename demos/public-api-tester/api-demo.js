'use strict'

;(() => {
  const element = (id) => document.getElementById(id)
  const panel = element('api-demo')
  const ui = {
    createForm: element('demo-create-form'), photo: element('demo-photo'), create: element('demo-create'),
    read: element('demo-read'), renameForm: element('demo-rename-form'), title: element('demo-title'),
    rename: element('demo-rename'), remove: element('demo-delete'), refresh: element('demo-refresh'),
    record: element('demo-recipe-state'), error: element('demo-error'), controls: element('demo-controls'),
    history: element('demo-history'), responseHelp: element('demo-response-help'),
  }
  const state = {
    connected: false, synced: false, busy: false,
    mainBusy: element('connection-form').getAttribute('aria-busy') === 'true', remoteBusy: false, recipe: null,
    deleted: false, uncertain: false, retryUntil: 0, retryTimer: null, evidence: new Map(),
    lastEvidence: '', evidenceRecipeId: null, refreshNeeded: false,
  }

  function errorMessage(message = '') {
    ui.error.textContent = message
    ui.error.hidden = !message
  }

  function updateControls() {
    const coolingDown = state.retryUntil > Date.now()
    const unavailable = state.busy || state.mainBusy || state.remoteBusy || coolingDown
    const ready = !unavailable && state.connected && state.synced
    const writable = ready && !state.uncertain
    ui.photo.disabled = !writable || Boolean(state.recipe)
    ui.create.disabled = !writable || Boolean(state.recipe)
    ui.read.disabled = !ready || !(state.recipe || state.deleted || state.uncertain)
    ui.title.disabled = !writable || !state.recipe || state.recipe.deletion_requested === true
    ui.rename.disabled = ui.title.disabled
    ui.remove.disabled = !writable || !state.recipe
    ui.refresh.disabled = state.busy || coolingDown
    ui.controls.setAttribute('aria-busy', String(state.busy || state.mainBusy || state.remoteBusy))
  }

  function renderRecord() {
    const recipe = state.recipe
    let message
    if (state.uncertain) {
      message = 'The last write could not be confirmed. Read the tracked recipe before another change; if creation has no ID, check your Recipe Site profile for cleanup.'
    } else if (recipe?.deletion_requested === true) {
      message = `Recipe #${recipe.id}: ${recipe.title}. Deletion requested; staff removal is still required.`
    } else if (recipe) {
      message = `Recipe #${recipe.id}: ${recipe.title}. Revision ${recipe.content_revision}${recipe.approved === true ? '' : ' · pending approval'}.`
    } else if (state.deleted) {
      message = 'The temporary recipe was deleted. Read it again to confirm HTTP 404, or create another demonstration.'
    } else {
      message = 'No temporary recipe yet. Choose a photo and create one to begin.'
    }
    if (!state.connected) message += ' Connect your Recipe Site key above to continue.'
    if (state.retryUntil > Date.now()) message += ' The API limit is active; wait before trying again.'
    ui.record.textContent = message
    updateControls()
  }

  function setBusy(value) {
    state.busy = value
    window.dispatchEvent(new CustomEvent('public-api-tester-demo-busy', { detail: { busy: value } }))
    updateControls()
  }

  function applyMetadata(data) {
    if (Object.hasOwn(data, 'connected')) {
      if (typeof data.connected !== 'boolean') throw new Error('The demo connection status could not be read.')
      state.connected = data.connected
    }
    if (Object.hasOwn(data, 'recipe')) {
      const recipe = data.recipe
      if (recipe !== null && (!Number.isSafeInteger(recipe?.id) || recipe.id < 1
        || typeof recipe.title !== 'string' || !recipe.title.trim()
        || data.uncertain !== true && (!Number.isSafeInteger(recipe.content_revision) || recipe.content_revision < 1))) {
        throw new Error('The temporary recipe status could not be read. Refresh demo status before trying again.')
      }
      state.recipe = recipe
    }
    if (typeof data.deleted === 'boolean') state.deleted = data.deleted
    if (typeof data.uncertain === 'boolean') state.uncertain = data.uncertain
    if (typeof data.busy === 'boolean') state.remoteBusy = data.busy
    if (data.evidence) showEvidence(data.evidence)
    state.synced = true
    renderRecord()
  }

  function showEvidence(evidence) {
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(evidence.method)
      || typeof evidence.path !== 'string' || !/^\/api\/public\/v1\/recipes\/(?:[1-9]\d*\/)?$/.test(evidence.path)
      || !Number.isInteger(evidence.status) || evidence.status < 100 || evidence.status > 599) {
      throw new Error('The public API response details could not be read.')
    }
    const recipeId = state.recipe?.id
    if (evidence.method === 'POST' && evidence.status === 201 && Number.isSafeInteger(recipeId)
      && recipeId !== state.evidenceRecipeId) {
      state.evidence.clear()
      state.lastEvidence = ''
      state.evidenceRecipeId = recipeId
      ui.history.replaceChildren()
      for (const method of ['get', 'post', 'put', 'delete']) {
        const result = element(`demo-result-${method}`)
        result.textContent = 'Not run'
        result.classList.remove('is-success', 'is-error')
      }
    }
    const fingerprint = JSON.stringify(evidence)
    if (fingerprint === state.lastEvidence) return
    state.lastEvidence = fingerprint
    state.evidence.delete(evidence.method)
    state.evidence.set(evidence.method, evidence)
    const result = element(`demo-result-${evidence.method.toLowerCase()}`)
    const deletionConfirmed = evidence.method === 'GET' && evidence.status === 404 && state.deleted
    result.textContent = `HTTP ${evidence.status}${evidence.status === 202 ? ' · staff removal pending' : deletionConfirmed ? ' · deletion confirmed' : ''}`
    result.classList.toggle('is-success', evidence.status >= 200 && evidence.status < 300 || deletionConfirmed)
    result.classList.toggle('is-error', evidence.status >= 400 && !deletionConfirmed)
    ui.history.replaceChildren()
    for (const response of [...state.evidence.values()].reverse()) {
      const details = document.createElement('details')
      details.className = 'api-demo__response'
      details.open = response === evidence
      const summary = document.createElement('summary')
      const method = document.createElement('strong')
      method.textContent = response.method
      const path = document.createElement('code')
      path.textContent = response.path
      const status = document.createElement('span')
      status.textContent = `HTTP ${response.status}`
      summary.append(method, path, status)
      const body = document.createElement('pre')
      body.textContent = response.status === 204 ? '(No response body)' : JSON.stringify(response.body ?? null, null, 2)
      details.append(summary, body)
      ui.history.append(details)
    }
    ui.responseHelp.textContent = 'These are Recipe Site’s public API responses. Recipe fields are shown without private account details; each method keeps its latest result for this page visit.'
  }

  async function request(path, { method = 'GET', body } = {}) {
    const form = body instanceof FormData
    let response
    try {
      response = await fetch(path, {
        method, credentials: 'same-origin', cache: 'no-store',
        headers: { 'X-Public-API-Tester': '1', ...(body === undefined || form ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }),
      })
    } catch {
      throw new Error('The local connector could not be reached. A write may have completed; refresh demo status before trying again.')
    }
    const data = await response.json().catch(() => null)
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('The connector returned unreadable data. Refresh demo status before trying again.')
    }
    applyMetadata(data)
    if (!response.ok) {
      if (response.status === 401) {
        state.connected = false
        window.dispatchEvent(new CustomEvent('public-api-tester-demo-auth-failed'))
      }
      if (method === 'GET' && path === '/api/demo/recipe' && response.status === 404 && state.deleted) {
        renderRecord()
        return data
      }
      throw Object.assign(new Error(typeof data.error === 'string' ? data.error : 'The API demonstration request failed.'), {
        status: response.status,
        retryAfter: Number.isSafeInteger(data.retry_after) && data.retry_after > 0 ? data.retry_after : null,
      })
    }
    return data
  }

  async function perform(path, options = {}) {
    const metadataOnly = path === '/api/demo' && (!options.method || options.method === 'GET')
    if (state.busy || (state.remoteBusy || state.mainBusy) && !metadataOnly || state.retryUntil > Date.now()) return
    if (metadataOnly) state.refreshNeeded = false
    setBusy(true)
    errorMessage()
    try {
      await request(path, options)
    } catch (error) {
      state.synced = false
      if (error.status === 429) {
        const seconds = error.retryAfter || 60
        state.retryUntil = Date.now() + seconds * 1000
        window.clearTimeout(state.retryTimer)
        state.retryTimer = window.setTimeout(() => {
          state.retryUntil = 0
          renderRecord()
        }, seconds * 1000 + 50)
        errorMessage(`${error.message} Try again in ${seconds} seconds, then refresh demo status.`)
      } else errorMessage(error.message || 'The API demonstration could not complete the request.')
      renderRecord()
    } finally {
      setBusy(false)
      if (state.refreshNeeded && panel.open && !state.mainBusy) void perform('/api/demo')
    }
  }

  panel.addEventListener('toggle', () => {
    if (panel.open) void perform('/api/demo')
  })
  ui.refresh.addEventListener('click', () => void perform('/api/demo'))
  ui.createForm.addEventListener('submit', (event) => {
    event.preventDefault()
    if (ui.create.disabled) return
    const photo = ui.photo.files?.[0]
    if (!photo || photo.size === 0 || photo.size > 5 * 1024 * 1024
      || !['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(photo.type)) {
      errorMessage('Choose one JPEG, PNG, GIF or WebP photo up to 5 MiB.')
      return
    }
    const body = new FormData()
    body.append('images', photo)
    void perform('/api/demo', { method: 'POST', body })
  })
  ui.read.addEventListener('click', () => void perform('/api/demo/recipe'))
  ui.renameForm.addEventListener('submit', (event) => {
    event.preventDefault()
    if (ui.rename.disabled) return
    const title = ui.title.value.trim()
    if (!title || [...title].length > 100) {
      errorMessage('Enter a recipe title of 1–100 characters.')
      ui.title.focus()
      return
    }
    void perform('/api/demo/recipe', { method: 'PUT', body: { title } })
  })
  ui.remove.addEventListener('click', () => {
    if (ui.remove.disabled || !state.recipe) return
    if (!window.confirm(`Send DELETE for temporary recipe #${state.recipe.id}: ${state.recipe.title}? A staff key removes it; an ordinary owner’s key requests removal.`)) return
    void perform('/api/demo/recipe', { method: 'DELETE', body: {} })
  })
  window.addEventListener('public-api-tester-connection', (event) => {
    if (typeof event.detail?.connected === 'boolean') state.connected = event.detail.connected
    state.synced = false
    renderRecord()
    if (state.busy || state.mainBusy) state.refreshNeeded = true
    else if (panel.open) void perform('/api/demo')
  })
  window.addEventListener('public-api-tester-main-busy', (event) => {
    if (typeof event.detail?.busy !== 'boolean') return
    state.mainBusy = event.detail.busy
    updateControls()
    if (!state.mainBusy && !state.busy && state.refreshNeeded && panel.open) void perform('/api/demo')
  })
  renderRecord()
  if (panel.open) void perform('/api/demo')
})()
