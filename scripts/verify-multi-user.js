// Paste into the Console of each signed-in test session. Installing runs no requests.
// Only prepare/run/verify/captureDecision/staleApprove perform the actions described below.
// prepare(role, runId, fixtureTitle) can explicitly select a differently named disposable recipe.
(() => {
  if (window.multiUserCheck) throw new Error('multiUserCheck is already installed in this page.')

  const origin = window.location.origin
  const tokenKey = 'recipe-site-auth-token'
  const requests = []
  const checks = []
  const dispatches = []
  const createdReviewIds = {}
  let session = null
  let decision = null
  let blocked = false
  let busy = false
  let lastRun = 0
  let lastVerified = 0
  let ownReviewId = null
  let authors = null
  let firstReviews = null

  const positiveId = (value) => Number.isSafeInteger(value) && value > 0
  const sorted = (values) => [...values].sort((left, right) => left - right)
  const sameIds = (left, right) => JSON.stringify(sorted(left)) === JSON.stringify(sorted(right))
  const reviewPath = (id) => `/api/recipes/${id}/`
  const comment = (suffix) => `Multi-user ${session.runId} ${suffix}`

  function need(condition, message) {
    if (!condition) throw new Error(message)
  }

  function halt(message) {
    blocked = true
    checks.push({ check: message, pass: false })
    throw new Error(message)
  }

  function contextCheck(context, write = false) {
    if (window.location.protocol !== 'https:' || window.location.origin !== origin) {
      halt('Use the same HTTPS website throughout this check.')
    }
    if (!context.token || window.sessionStorage.getItem(tokenKey) !== context.token) {
      halt('The signed-in token changed. Stop and inspect the results; do not repeat writes.')
    }
    if (write && blocked) throw new Error('Further writes are blocked after an uncertain or failed check.')
  }

  function currentRecipeId() {
    const match = window.location.pathname.match(/^\/recipe\/([1-9]\d*)\/?$/)
    const id = match ? Number(match[1]) : null
    need(positiveId(id), 'Open the actual recipe detail page before using this command.')
    return id
  }

  function readProfile(data) {
    if (!(positiveId(data?.user?.id) && typeof data.user.username === 'string'
      && typeof data.user.is_staff === 'boolean' && typeof data.bio === 'string'
      && Array.isArray(data.favorites) && data.favorites.every(positiveId)
      && new Set(data.favorites).size === data.favorites.length)) halt('The account response could not be validated.')
    return data
  }

  function readRecipe(data, id) {
    if (!(data?.id === id && Array.isArray(data.reviews)
      && Number.isSafeInteger(data.number_of_reviews) && data.number_of_reviews >= 0
      && Number.isFinite(data.average_score))) halt('The recipe response could not be validated.')
    if (!data.reviews.every((review) => positiveId(review.id) && positiveId(review.user)
      && Number.isInteger(review.grade) && review.grade >= 1 && review.grade <= 5
      && typeof review.comment === 'string') || new Set(data.reviews.map((review) => review.id)).size !== data.reviews.length) {
      halt('The loaded review list could not be validated.')
    }
    const count = data.reviews.length
    const average = count ? data.reviews.reduce((total, review) => total + review.grade, 0) / count : 0
    if (!(data.number_of_reviews === count && Math.abs(data.average_score - average) < 1e-9)) {
      halt('The returned average/count disagree with the loaded review list.')
    }
    return data
  }

  async function request(context, label, path, { method = 'GET', body } = {}) {
    contextCheck(context, method !== 'GET')
    const started = Date.now()
    const start = performance.now()
    const record = { role: context.role, label, method, path, clientStartMs: started,
      startedAt: new Date(started).toISOString(), status: null, elapsedMs: null }
    requests.push(record)
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 30000)
    try {
      const response = await fetch(`${origin}${path}`, {
        method, cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Token ${context.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      record.status = response.status
      const data = response.status === 204 ? null : await response.json().catch(() => null)
      contextCheck(context)
      return { status: response.status, data }
    } catch {
      record.uncertain = true
      halt(`${label} could not be confirmed. Do not retry writes; inspect the current data.`)
    } finally {
      record.elapsedMs = Math.round((performance.now() - start) * 10) / 10
      window.clearTimeout(timer)
    }
  }

  function expectedStatus(result, status, label) {
    if (result.status !== status) halt(`${label}: expected HTTP ${status}, received ${result.status}.`)
    return result.data
  }

  async function profileFor(context, label) {
    const profile = readProfile(expectedStatus(await request(context, label, '/api/me/'), 200, label))
    if (context.userId !== undefined && profile.user.id !== context.userId) halt('The authenticated account changed.')
    return profile
  }

  async function recipeFor(context, id, label) {
    return readRecipe(expectedStatus(await request(context, label, reviewPath(id)), 200, label), id)
  }

  async function summaryFor(context, id, label) {
    const summaries = expectedStatus(await request(context, label, '/api/recipes/all_recipes/'), 200, label)
    need(Array.isArray(summaries), 'The recipe summary list could not be read.')
    const summary = summaries.find((item) => item.id === id)
    need(Boolean(summary), 'The approved summary list omitted the test recipe.')
    return summary
  }

  async function together(operations) {
    const results = await Promise.allSettled(operations)
    const failure = results.find((result) => result.status === 'rejected')
    if (failure) throw failure.reason
    return results.map((result) => result.value)
  }

  function requireFixture(recipe, fixtureTitle = null) {
    const titleMatches = typeof recipe.title === 'string'
      && (fixtureTitle === null ? /^Multi-user test\b/i.test(recipe.title) : recipe.title === fixtureTitle)
    need(recipe.approved === true && recipe.rejected === false && recipe.deletion_requested === false
      && titleMatches, fixtureTitle === null
      ? 'Use an approved disposable recipe whose title begins with "Multi-user test", with no deletion request.'
      : 'Use the explicitly selected approved disposable recipe, with no deletion request.')
  }

  function identifyRound(recipe, round) {
    const expected = round === 1 ? [['A1', 2], ['B1', 4]] : [['B1', 4], ['B2', 5]]
    need(recipe.reviews.length === 2, 'Expected exactly the two test reviews; stop if another review was added.')
    const found = expected.map(([suffix, grade]) => {
      const review = recipe.reviews.find((item) => item.comment === comment(suffix) && item.grade === grade)
      need(Boolean(review), `Missing or changed test review ${suffix}.`)
      return review
    })
    if (round === 1) {
      need(found[0].user !== found[1].user, 'A and B must be different ordinary accounts.')
      need(session.role !== 'A' || found[0].user === session.userId, 'A review has the wrong author.')
      need(session.role !== 'B' || found[1].user === session.userId, 'B review has the wrong author.')
      need(session.role !== 'A' || found[0].id === createdReviewIds.A1, 'A1 does not match the confirmed creation response.')
      need(session.role !== 'B' || found[1].id === createdReviewIds.B1, 'B1 does not match the confirmed creation response.')
      need(session.role !== 'S' || found.every((review) => review.user !== session.userId), 'The staff session must be a third account.')
      if (firstReviews) need(found[0].id === firstReviews.A && found[1].id === firstReviews.B
        && found[0].user === authors.A && found[1].user === authors.B, 'The original round-1 review identities changed.')
      authors = { A: found[0].user, B: found[1].user }
      firstReviews = { A: found[0].id, B: found[1].id }
    } else {
      need(authors && firstReviews && found.every((review) => review.user === authors.B)
        && found[0].id === firstReviews.B && recipe.reviews.every((review) => review.id !== firstReviews.A),
      'Round 2 must retain B1, remove the original A1 and contain only B-authored test reviews.')
      need(session.role !== 'B' || (found[0].id === createdReviewIds.B1 && found[1].id === createdReviewIds.B2),
        'The B review IDs do not match the confirmed creation responses.')
    }
    need(recipe.average_score === (round === 1 ? 3 : 4.5) && recipe.number_of_reviews === 2,
      'The final test average/count are incorrect.')
  }

  async function prepare(role, runId = 'round1', fixtureTitle = null) {
    need(!session && !busy && !blocked, 'Prepare once per session; use report() before leaving this page.')
    need(['A', 'B', 'S'].includes(role), 'Role must be A, B or S.')
    need(typeof runId === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(runId), 'Use the same short letters/numbers runId in all three sessions.')
    need(fixtureTitle === null || (typeof fixtureTitle === 'string' && fixtureTitle.trim().length > 0),
      'The optional test recipe title must be a nonempty exact title.')
    const context = { role, token: window.sessionStorage.getItem(tokenKey) }
    contextCheck(context)
    const recipeId = currentRecipeId()
    busy = true
    try {
      const [profile, recipe] = await together([profileFor(context, 'prepare profile'), recipeFor(context, recipeId, 'prepare recipe')])
      need(profile.user.is_staff === (role === 'S'), 'A/B must be ordinary accounts; S must be staff.')
      requireFixture(recipe, fixtureTitle)
      need(recipe.reviews.length === 0, 'The disposable recipe must have zero reviews before round 1.')
      session = { ...context, userId: profile.user.id, username: profile.user.username, runId, recipeId,
        title: recipe.title, fixtureTitle, bio: profile.bio, favorites: [...profile.favorites] }
      console.table([{ role, userId: session.userId, username: session.username, recipeId, title: recipe.title }])
    } finally {
      busy = false
    }
  }

  function command(round) {
    need(session && !busy && !blocked && [1, 2].includes(round), 'Prepare first and finish the previous round before generating a command.')
    need(round === lastRun + 1 && (round === 1 || lastVerified === 1), 'Run and verify the rounds in order.')
    console.log(`multiUserCheck.run(${round}, ${Date.now() + 90000})`)
  }

  async function roundOperations(round) {
    const id = session.recipeId
    const favorite = async (add) => {
      const data = expectedStatus(await request(session, `round ${round} favorite`, `/api/me/favorites/${id}/`, { method: add ? 'PUT' : 'DELETE' }), 200, 'favorite change')
      need(data?.user_id === session.userId && data.recipe_id === id && data.is_favorite === add
        && Array.isArray(data.favorites) && data.favorites.every(positiveId)
        && new Set(data.favorites).size === data.favorites.length && data.favorites.includes(id) === add,
      'The favorite response has the wrong account or saved state.')
    }
    const post = async (suffix, grade) => {
      const data = expectedStatus(await request(session, `round ${round} review`, reviewPath(id), {
        method: 'POST', body: { grade, comment: comment(suffix) },
      }), 201, 'review creation')
      need(positiveId(data?.id) && data.user === session.userId && data.grade === grade && data.comment === comment(suffix),
        'The saved review could not be confirmed as this account\'s test review.')
      createdReviewIds[suffix] = data.id
      if (session.role === 'A' && round === 1) ownReviewId = data.id
    }
    if (session.role === 'A') {
      return Promise.allSettled([
        round === 1 ? post('A1', 2) : request(session, 'round 2 delete A1', `/api/recipes/${id}/${ownReviewId}/`, { method: 'DELETE' })
          .then((result) => expectedStatus(result, 204, 'own test review deletion')),
        favorite(round === 1),
      ])
    }
    if (session.role === 'B') return Promise.allSettled([post(round === 1 ? 'B1' : 'B2', round === 1 ? 4 : 5), favorite(round === 2)])
    return Promise.allSettled([
      recipeFor(session, id, `round ${round} staff detail`),
      summaryFor(session, id, `round ${round} staff summaries`).then((summary) => {
        const possible = round === 1
          ? [[0, 0], [1, 2], [1, 4], [2, 3]]
          : [[2, 3], [1, 4], [3, 11 / 3], [2, 4.5]]
        need(Number.isFinite(summary.average_score) && possible.some(([count, average]) => (
          summary.number_of_reviews === count && Math.abs(summary.average_score - average) < 1e-9
        )), 'The summary rating/count do not match any valid state in this round.')
      }),
      profileFor(session, `round ${round} staff profile`),
    ])
  }

  async function run(round, time) {
    need(session && !busy && !blocked, 'Prepare first; no other command may be active and no failure may be unresolved.')
    need([1, 2].includes(round) && round === lastRun + 1 && (round === 1 || lastVerified === 1), 'Run each round once, in order, and verify round 1 first.')
    need(Number.isSafeInteger(time) && time > Date.now() + 1000 && time <= Date.now() + 300000, 'Paste the same future command into all three sessions within five minutes.')
    need(document.visibilityState === 'visible' && currentRecipeId() === session.recipeId, 'Keep this test recipe tab selected and visible.')
    contextCheck(session, true)
    busy = true
    const firstRecord = requests.length
    try {
      const [profile, recipe] = await together([
        profileFor(session, `round ${round} preflight identity`),
        recipeFor(session, session.recipeId, `round ${round} preflight recipe`),
      ])
      need(profile.user.is_staff === (session.role === 'S'), 'The account role changed; no round writes were sent.')
      need(profile.bio === session.bio && sameIds(profile.favorites.filter((id) => id !== session.recipeId),
        session.favorites.filter((id) => id !== session.recipeId)), 'The baseline profile changed; no round writes were sent.')
      requireFixture(recipe, session.fixtureTitle)
      if (round === 1) need(recipe.reviews.length === 0, 'Round 1 requires an empty review list.')
      else {
        identifyRound(recipe, 1)
        if (session.role === 'A') need(recipe.reviews.some((item) => item.id === ownReviewId && item.user === session.userId && item.comment === comment('A1')),
          'Only A\'s successfully created round-1 test review may be deleted.')
      }
      need(time > Date.now(), 'Preflight missed the target time; no write was sent.')
      lastRun = round
      await new Promise((resolve) => window.setTimeout(resolve, time - Date.now()))
      contextCheck(session, true)
      const delayMs = Date.now() - time
      dispatches.push({ round, scheduledMs: time, clientStartMs: Date.now(), delayMs })
      if (Math.abs(delayMs) > 1000 || document.visibilityState !== 'visible' || currentRecipeId() !== session.recipeId) {
        halt('Dispatch was late, hidden or on another page. No round writes were sent; start a fresh recorded run.')
      }
      const results = await roundOperations(round)
      checks.push(...results.map((result, index) => ({ round, check: `Operation ${index + 1} response/status validation`, pass: result.status === 'fulfilled' })))
      if (results.some((result) => result.status === 'rejected')) {
        blocked = true
        console.table(results.map((result, index) => ({ operation: index + 1, pass: result.status === 'fulfilled' })))
        throw new Error('A request failed or was uncertain. Do not repeat writes; inspect results and report().')
      }
      console.log(`Round ${round} requests finished here. Wait for ALL three sessions before verify(${round}).`)
    } catch (error) {
      blocked = true
      throw error
    } finally {
      busy = false
      console.table(requests.slice(firstRecord))
    }
  }

  async function verify(round) {
    need(session && !busy && [1, 2].includes(round) && lastRun === round, 'Finish the requested round in all sessions before verification.')
    contextCheck(session)
    busy = true
    const rows = []
    const check = (name, pass) => rows.push({ round, check: name, pass: Boolean(pass) })
    try {
      const [profile, recipe, summary] = await together([
        profileFor(session, `verify ${round} profile`),
        recipeFor(session, session.recipeId, `verify ${round} recipe`),
        summaryFor(session, session.recipeId, `verify ${round} summary`),
      ])
      check('Own account and role retained', profile.user.id === session.userId && profile.user.is_staff === (session.role === 'S'))
      check('Bio unchanged', profile.bio === session.bio)
      check('Other favorites unchanged', sameIds(profile.favorites.filter((id) => id !== session.recipeId), session.favorites.filter((id) => id !== session.recipeId)))
      const expected = session.role === 'S' ? session.favorites.includes(session.recipeId) : session.role === (round === 1 ? 'A' : 'B')
      check('Target favorite belongs to correct account', profile.favorites.includes(session.recipeId) === expected)
      identifyRound(recipe, round)
      check('Exact test comments/authors/grades, count and average', true)
      check('Final recipe summary matches settled review data', summary.number_of_reviews === 2
        && summary.average_score === (round === 1 ? 3 : 4.5))
      check('No earlier uncertain request', !blocked)
      if (rows.every((row) => row.pass)) lastVerified = round
      else blocked = true
    } catch {
      blocked = true
      check('Responses/final review state could not be validated; inspect request statuses', false)
    } finally {
      checks.push(...rows)
      busy = false
      console.table(rows)
    }
  }

  function pendingRecipe(recipe) {
    need(recipe.approved === false && recipe.rejected === false && recipe.deletion_requested === false
      && positiveId(recipe.content_revision) && typeof recipe.title === 'string' && /^Multi-user test\b/i.test(recipe.title),
    'Use a pending disposable recipe titled "Multi-user test...", without a deletion request.')
  }

  function contents(recipe) {
    return JSON.stringify([recipe.id, recipe.content_revision, recipe.title, recipe.description,
      recipe.ingredients, recipe.categories, recipe.steps, recipe.images,
      recipe.approved, recipe.rejected, recipe.rejection_reason, recipe.deletion_requested])
  }

  async function captureDecision() {
    need(!busy && !blocked && !decision, 'Capture one decision before the owner edits; no other command may be active.')
    const context = session || { role: 'S', token: window.sessionStorage.getItem(tokenKey) }
    contextCheck(context)
    const id = currentRecipeId()
    busy = true
    try {
      const profile = await profileFor(context, 'capture staff identity')
      need(profile.user.is_staff === true, 'Only the staff session may capture a decision.')
      const recipe = await recipeFor(context, id, 'capture pending recipe')
      pendingRecipe(recipe)
      decision = { context: { ...context, userId: profile.user.id }, id, title: recipe.title,
        revision: recipe.content_revision, attempted: false }
      console.table([{ role: 'S', userId: profile.user.id, recipeId: id, capturedRevision: decision.revision }])
    } finally {
      busy = false
    }
  }

  async function staleApprove() {
    need(decision && !decision.attempted && !busy && !blocked, 'Capture a pending decision once, then save the owner edit before this command.')
    contextCheck(decision.context, true)
    busy = true
    const firstRecord = requests.length
    try {
      const [profile, before] = await together([
        profileFor(decision.context, 'confirm staff identity'),
        recipeFor(decision.context, decision.id, 'before stale approval'),
      ])
      decision.checkedRevision = before.content_revision
      need(profile.user.is_staff === true, 'The current account must still be staff; no approval was sent.')
      pendingRecipe(before)
      need(before.content_revision > decision.revision, 'The owner must save a newer revision first; no approval was sent.')
      decision.attempted = true
      const result = await request(decision.context, 'stale approval', `/api/recipes/${decision.id}/approve/`, {
        method: 'POST', body: { content_revision: decision.revision },
      })
      decision.responseStatus = result.status
      decision.responseCode = result.data?.code === 'recipe_changed' ? 'recipe_changed' : null
      if (result.status !== 409 || result.data?.code !== 'recipe_changed') halt('Stale approval was not rejected as expected. Stop; do not retry or approve again.')
      const after = await recipeFor(decision.context, decision.id, 'after stale approval')
      decision.afterRevision = after.content_revision
      const pass = contents(before) === contents(after)
      checks.push({ check: 'Captured old approval rejected409; current contents/status unchanged', pass })
      console.table([{ check: 'Captured old approval rejected409; current contents/status unchanged', pass }])
      if (!pass) blocked = true
    } finally {
      busy = false
      console.table(requests.slice(firstRecord))
    }
  }

  function report() {
    const setup = session ? { role: session.role, userId: session.userId, username: session.username,
      recipeId: session.recipeId, title: session.title, runId: session.runId, origin } : null
    const capturedDecision = decision ? { role: 'S', recipeId: decision.id, title: decision.title,
      staffUserId: decision.context.userId, capturedRevision: decision.revision, attempted: decision.attempted,
      checkedRevision: decision.checkedRevision ?? null, responseStatus: decision.responseStatus ?? null,
      responseCode: decision.responseCode ?? null, afterRevision: decision.afterRevision ?? null } : null
    return JSON.stringify({ setup, lastRun, lastVerified, blocked, createdReviewIds, capturedDecision, dispatches, requests, checks }, null, 2)
  }

  window.multiUserCheck = Object.freeze({ prepare, command, run, verify, report, captureDecision, staleApprove })
  console.log('multiUserCheck installed. No requests have run. Use the documented prepare/run/verify steps.')
})()
