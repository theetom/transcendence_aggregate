# Frontend staff dashboard and review

The frontend requests pending submissions and submission details, sends review
decisions with feedback, and displays the saved status returned by the API.
Existing layout, CSS, login and `/staff` addresses are retained. The review URL
now uses a submission ID: `/staff/review/42`.

**This is a proposed contract, awaiting agreement with the backend partner.**
These moderation endpoints and their storage do not currently exist. Without
them, a signed-in viewer sees an unavailable message; no approval or rejection
is saved. The existing backend `reviews` app handles ratings/comments, not
staff moderation. Backend implementation is partner-owned.

## Proposed API contract

All requests use same-origin `/api/...` addresses, so the deployed website uses
its existing HTTPS proxy. The frontend reads the existing login token from
sessionStorage and sends `Authorization: Token <token>`. Decision requests also
send `Content-Type: application/json`. There is no new login mechanism.

| Request | Successful JSON response |
| --- | --- |
| `GET /api/staff/submissions/?status=pending` | Plain array of pending submissions; `[]` means an empty queue |
| `GET /api/staff/submissions/{id}/` | Full submission, including ingredients and steps |
| `POST /api/staff/submissions/{id}/decision/` | Full updated submission with the saved status and feedback |

Use positive integer submission IDs. Titles can repeat; the staff API should
not use titles as record identifiers. This contract intentionally has no list
pagination. If the partner chooses pagination or different fields/URLs, agree
on them and adapt the helper/pages before connecting the real API.

Example full submission (the list may omit only `ingredients` and `steps`):

```json
{
  "id": 42,
  "title": "Rice bowl",
  "description": "A simple rice bowl.",
  "author": "recipe_author",
  "date_created": "2026-10-08T09:00:00Z",
  "status": "pending",
  "feedback": "",
  "ingredients": [{"name": "Rice", "quantity": "100", "unit": "g"}],
  "steps": [{"step_number": 1, "instruction": "Cook the rice."}]
}
```

The field names `description`, `date_created`, ingredient objects and step
objects follow the existing recipe API. `author` is a username string. Status
must be `pending`, `approved` or `rejected`; feedback must be a string, including
`""` when absent. Dates can be ISO timestamps or `YYYY-MM-DD`; the frontend
displays the date portion. Ingredients/steps must be arrays, including `[]`
when absent. Step numbers must be positive integers.

Decision body:

```json
{"status": "rejected", "feedback": "Please clarify the cooking time."}
```

Approval uses `"status": "approved"` and optional feedback. Rejection requires
nonblank feedback. The frontend trims feedback. A successful decision response
must be HTTP 200 with the full submission, matching ID and requested saved
status; HTTP 204, HTML or incomplete JSON is not sufficient confirmation.
Approved/rejected submissions must disappear from subsequent pending-list reads.

Expected errors:

| HTTP status | Meaning and frontend behavior |
| --- | --- |
| 400 | Invalid decision/feedback; show a correction message and retain the draft |
| 401 | Missing/invalid/expired authentication; show a sign-in message |
| 403 | Authenticated nonstaff account; show staff access denied |
| 404 | API or submission unavailable; show an unavailable message |
| 409 | Submission already reviewed; fetch its latest detail and lock decision controls |
| Other failures | Show a plain retry message and keep the last confirmed status |

Malformed successful JSON or missing required fields shows an error instead
of invented submission data or an approval message. A mismatched decision ID
or status asks the viewer to reload before retrying.

Every endpoint must enforce staff permission on the backend. The frontend's
token check and access-denied display do not enforce authorization. The partner
must also handle concurrent decisions atomically: only a pending submission can
transition once; an already-decided record returns 409. Browser preview checks
below cannot verify backend security or persistence.

## Changed code

- `frontend/src/data/moderationApi.js`: three API operations, token headers,
  response checks and friendly errors. Proposed URLs live here.
- `frontend/src/pages/AdminPage.jsx`: fetch the pending queue when opened,
  display loading/error/empty states and link by ID.
- `frontend/src/pages/ReviewRequestPage.jsx`: fetch detail, collect feedback,
  submit decisions, disable controls while saving/after a decision, and display
  returned status/feedback. Navigation to another ID starts with fresh state.
- `frontend/src/App.jsx`: rename only `:slug` to `:submissionId` on the staff
  detail route. The address pattern and Django `/admin/` remain unchanged.

Returning through **Back to dashboard** mounts the dashboard again and fetches
the current pending list. There is no polling, global cache, new styling,
application mock mode or new package dependency.

## User-run checks available now

These commands/browser actions are instructions, not checks run by the assistant.

1. From the repository root, rebuild/recreate only the frontend:

   ```sh
   docker compose up -d --build --no-deps --wait --wait-timeout 120 frontend
   ```

   This builds the updated React files and replaces the frontend container.
   Keep the existing backend/PostgreSQL running and existing certificates/data.
   This command does not rebuild/restart the backend or migrate its database.

2. Open `https://localhost:8443/staff` in a private signed-out window. Expect
   **Sign in with a staff account to continue.** There should be no moderation
   API request without a saved token. Repeat with `/staff/review/42`.
3. Sign in using the existing login page and open `/staff`. With the current
   backend, the moderation request returns 404 and the page shows unavailable,
   rather than claiming the queue is empty. In Developer Tools > Network,
   confirm the request uses HTTPS and the proposed pending URL. Do not copy or
   share the Authorization value.
4. Open `/staff/review/42` directly and refresh. Expect a controlled unavailable
   message and a working **Back to staff page** link, rather than a React crash
   or Django admin page. Use your configured HTTPS port if different.

## Optional browser preview before the backend exists

This manually substitutes only moderation responses in one browser tab. It
does not send decisions to the server, create accounts/recipes or change the
application source. Results exist in memory until refresh/closing the tab.
Use this only to check frontend behavior; it does not prove staff permission,
real saved decisions or database persistence.

1. Sign in normally, open the homepage `/`, and open Developer Tools > Console.
2. Run this snippet once. It intercepts only same-origin moderation addresses
   and leaves other requests alone:

   ```js
   const originalFetch = window.fetch
   const basePath = '/api/staff/submissions/'
   window.staffPreview = {
     httpStatus: 200,
     submission: {
       id: 42, title: 'Rice bowl', description: 'A simple rice bowl.',
       author: 'preview_author', date_created: '2026-10-08T09:00:00Z',
       status: 'pending', feedback: '',
       ingredients: [{ name: 'Rice', quantity: '100', unit: 'g' }],
       steps: [{ step_number: 1, instruction: 'Cook the rice.' }],
     },
     restore() {
       window.fetch = originalFetch
       delete window.staffPreview
     },
   }
   window.fetch = async (input, options = {}) => {
     const url = new URL(input instanceof Request ? input.url : String(input), location.origin)
     if (url.origin !== location.origin || !url.pathname.startsWith(basePath)) {
       return originalFetch.call(window, input, options)
     }
     await new Promise((resolve) => setTimeout(resolve, 600))
     if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
     const preview = window.staffPreview
     const recipe = preview.submission
     let status = preview.httpStatus
     let body = { detail: 'Preview error' }
     if (status === 200 && url.pathname === basePath && (!options.method || options.method === 'GET')) {
       body = recipe.status === 'pending' ? [recipe] : []
     } else if (status === 200 && url.pathname === `${basePath}42/` && (!options.method || options.method === 'GET')) {
       body = recipe
     } else if (status === 200 && url.pathname === `${basePath}42/decision/` && options.method === 'POST') {
       if (recipe.status !== 'pending') {
         status = 409
       } else {
         const decision = JSON.parse(options.body)
         recipe.status = decision.status
         recipe.feedback = decision.feedback
         body = recipe
       }
     } else if (status === 200) {
       status = 404
     }
     return new Response(JSON.stringify(body), {
       status, headers: { 'Content-Type': 'application/json' },
     })
   }
   window.history.pushState({}, '', '/staff')
   window.dispatchEvent(new PopStateEvent('popstate'))
   ```

3. Expect loading, then one Rice bowl card. Click **Review request**; expect its
   author, date, ingredients, steps and `pending` status.
4. Click **Reject** without feedback. Expect **Write feedback before rejecting
   this submission.** No decision should be sent or status changed.
5. Enter feedback and click **Reject**. During the preview delay, both buttons
   and the feedback field should be disabled. Afterward, expect `rejected`,
   saved feedback and disabled controls. **Back to dashboard** should show an
   empty pending queue.
6. To exercise approval, reset the preview record in Console:

   ```js
   window.staffPreview.submission.status = 'pending'
   window.staffPreview.submission.feedback = ''
   ```

   From the review page, use **Back to dashboard**, then open the card again.
   If already on the empty dashboard, navigate to `/` using the site brand and
   repeat the snippet's last two navigation lines to mount `/staff` again.
   Approve without feedback; expect `approved` and removal from the queue.
7. While a pending detail is open, simulate another reviewer in Console by
   setting `window.staffPreview.submission.status = 'approved'`. Attempt a
   decision. The preview returns 409, the page fetches the updated detail, and
   controls stay locked. To simulate permission/server errors, set
   `window.staffPreview.httpStatus = 403` or `500`, then navigate away/back to
   fetch again. Expect a plain error, without a false success message.
8. Restore real requests and reload when finished:

   ```js
   window.staffPreview.restore()
   window.location.reload()
   ```

   A normal full refresh also removes the preview automatically. If no backend
   moderation API exists, the real unavailable message returns. DevTools may
   not list intercepted fetches as actual network requests; inspect real request
   methods/headers/body only after the backend is connected.

## Integration checks after partner APIs exist

1. Confirm the partner accepts this contract, then rebuild the frontend if any
   agreed URL/field changes were needed.
2. Sign in as real staff, open `/staff`, select a real pending submission and
   confirm its full detail. Refresh the detail address; it should load again.
3. Reject once with explanatory feedback. Confirm one JSON POST with the correct
   ID/status/feedback, saved `rejected` status, and removal from the queue.
   Reopen/refresh the ID: its saved status and feedback should remain.
4. Repeat with another pending record and approval. No success should appear
   before the API confirms the decision, and controls should remain disabled
   after an approved/rejected response.
5. Have the backend partner verify each endpoint rejects nonstaff tokens with
   403 and invalid tokens with 401, and cannot be bypassed by calling the API
   directly. The corresponding frontend messages should appear. Merely hiding
   buttons or checking the browser preview is insufficient.
6. Use two staff sessions to review the same pending record. After one decision,
   the other session's attempt should return 409 and load the saved status.
   Confirm feedback validation, malformed responses, network failures and
   navigation between different submission IDs do not show false decisions or
   details from the previous record. Check persistence with your backend partner.

Full backend integration/security/persistence and browser behavior remain
unverified until these user/partner checks are performed.
