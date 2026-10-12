# Frontend recipe approval handoff

The website now connects the existing staff frontend to Tomaz's recipe API.

An admin logs in normally, opens Profile, clicks **Pending Approval**, and sees
a simple list at `/staff`. Each recipe name opens the full recipe at
`/recipe/{URL-encoded exact title}`. **Approve** is on that recipe page, so the
admin can read the ingredients and instructions before deciding.

The profile button is shown only when `profile.user.is_staff === true`.
The staff page checks the current profile before loading pending data.
The regular top-bar Profile link remains `/profile`; Django's `/admin/`
is a separate management page using the same saved accounts and recipes.

## Connected requests

| Action | Request |
| --- | --- |
| Read current account | `GET /api/me/` |
| List pending recipes | `GET /api/recipes/all_recipes/pending/` |
| Read recipe detail | `GET /api/recipes/{URL-encoded exact title}/` |
| Approve | `POST /api/recipes/{URL-encoded exact title}/approve/` |

Approval sends no request body. Existing tokens identify signed-in accounts.
An approved public detail can load without a token. Both recipe response
serializers include the read-only `approved` boolean.

The Approve button is disabled while saving. Success requires a matching
`id`/`title` and `approved: true` in the POST response, followed by a confirming
detail GET for that same ID. An uncertain result locks repeat approval until
**Reload recipe** checks the saved record. **Back to pending recipes** loads
the queue again.

The old submission-ID review route, proposed status/feedback API and simulated
browser preview have been removed. **Reject remains disabled** until the
backend provides rejection/deletion.

## Backend import and limits

Selectively imported `backend/recipes/models.py`, migration
`0004_recipe_approved.py`, `urls.py` and `views.py` from
`backend_admin_logic`. Added the read-only response flag while preserving
quantity validation. Existing PostgreSQL settings and account/login/profile
code were preserved.

**Tomaz's pending-list admin check is imported from commit `71a1b8b`.**
The backend now refuses signed-out and valid nonstaff pending-list requests
with HTTP 403 before reading recipe data. Approval and pending detail retain
their backend checks. The frontend's role gate is an additional presentation
check; verify the actual backend restriction in user-run tests after rebuilding.

Recipe lookup still uses exact titles, so duplicate/renamed titles remain a
backend limitation. The profile now has Favorites, Approved recipes and Pending
Approval below its general information and picture. Admins get the `/staff`
button in the third panel; normal users get their own pending-submission list.

The frontend supports private `submitted_recipes` and `favorite_recipes` arrays
in `/api/me/`, but the backend addition remains pending. Current responses still
support approved-recipe ownership lookup and saved-favorite ID display where
available. Missing own-pending data is labeled unavailable, never loaded through
the admin list. Favorites are display-only; saving/removing favorites, editing,
notifications and feedback remain deferred.

## User-run next steps

With the existing PostgreSQL service running, deploy from the repository root:

```sh
docker compose up -d --build --no-deps --wait --wait-timeout 120 backend frontend
```

Backend startup applies migration `0004`, setting existing recipes'
`approved` field to false. Those recipes remain saved and enter the pending
queue; they appear publicly again after approval. No old record is
automatically approved and no database reset is needed.

Use a staff account to check Profile → Pending Approval → full recipe → Approve.
Refresh the full recipe, confirm the POST and confirmation GET, then return to
the pending list. Check an approved recipe while signed out and check that a
normal account opening `/staff` sees only the centered bold denial message and
**Back to main page** button. Direct pending-API security must
be verified against the imported guard: signed-out and valid nonstaff requests
should receive HTTP 403, while staff receives the pending list.

See [staff-api.md](staff-api.md) for the precise behavior and complete checks.
Source review is complete; frontend builds and browser/API/persistence checks
remain user-run and have not been performed by the assistant. The requested
admin account was created through an authorized management operation; its
login has not been tested. Credentials are not stored in these guides.
