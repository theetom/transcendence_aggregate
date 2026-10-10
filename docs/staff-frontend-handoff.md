**The frontend is now prepared for API integration.** Your partner still needs to implement the proposed APIs before real submissions or saved decisions can work.

I changed four frontend files, added an API/testing guide, and updated the work log. Backend files, styling, and dependencies were untouched.

[moderationApi.js](/home/roh7891/projects/transcendence_aggregate/frontend/src/data/moderationApi.js:7) is the new helper. It reuses your login token and handles these proposed requests:

| Action | Request |
|---|---|
| Load pending submissions | `GET /api/staff/submissions/?status=pending` |
| Load one submission | `GET /api/staff/submissions/{id}/` |
| Save a decision | `POST /api/staff/submissions/{id}/decision/` |

The decision request sends:

```js
method: 'POST',
body: JSON.stringify({ status, feedback }),
```

It also checks responses and displays plain authentication, permission, connection, and unavailable messages.

[AdminPage.jsx](/home/roh7891/projects/transcendence_aggregate/frontend/src/pages/AdminPage.jsx:14) now fetches the queue instead of receiving an empty demonstration list:

```js
const submissions = await getPendingSubmissions(controller.signal)
if (!controller.signal.aborted) setPendingRecipes(submissions)
```

The page distinguishes loading, failed loading, and a genuinely empty queue. Cards link to submissions by ID.

[ReviewRequestPage.jsx](/home/roh7891/projects/transcendence_aggregate/frontend/src/pages/ReviewRequestPage.jsx:33) now loads details and connects Approve/Reject. After a confirmed response:

```js
const updatedSubmission = await saveSubmissionDecision(
  submissionId, decision, feedback
)
setRequest(updatedSubmission)
setModeratorReply(updatedSubmission.feedback)
```

This updates the displayed status and saved feedback. Rejection requires feedback. Controls are disabled while saving, after a decision, or after an already-reviewed conflict. Returning to the dashboard fetches the queue again.

[App.jsx](/home/roh7891/projects/transcendence_aggregate/frontend/src/App.jsx:107) has one route change:

```jsx
<Route path="/staff/review/:submissionId" element={<ReviewRequestPage />} />
```

The address remains `/staff/review/...`; the parameter now represents an ID.

**To test it yourself:**

1. Keep the backend and PostgreSQL running. Rebuild only the frontend:

   ```sh
   docker compose up -d --build --no-deps --wait --wait-timeout 120 frontend
   ```

2. Open `https://localhost:8443/staff` in a private, signed-out window. Expect **“Sign in with a staff account to continue.”**

3. Sign in normally and open `/staff`. Since the API is missing, expect a controlled unavailable message. Repeat with `/staff/review/42` and check the back link.

4. To test the buttons **before the backend exists**, follow the [browser preview instructions](/home/roh7891/projects/transcendence_aggregate/docs/staff-api.md:130). They let you check loading, recipe details, rejection feedback, approval, disabled controls, and queue removal using data held only in that browser tab.

5. Give your partner the [proposed API contract](/home/roh7891/projects/transcendence_aggregate/docs/staff-api.md:14). After agreement and implementation, run the [real integration checks](/home/roh7891/projects/transcendence_aggregate/docs/staff-api.md:231).

I reviewed the source and had it independently reviewed. **No builds or browser tests were run**, so runtime success remains for your checks.
