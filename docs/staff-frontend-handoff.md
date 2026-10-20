# Frontend recipe approval handoff

The website now connects the existing staff frontend to Tomaz's recipe API.

An admin logs in normally, opens Profile, clicks **Pending Approval**, and sees
a simple list at `/staff`. Each recipe name opens the full recipe at
`/recipe/{recipe_id}`, for example `/recipe/17`. **Approve** is on that recipe page, so the
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
| Read recipe detail | `GET /api/recipes/{recipe_id}/` |
| Approve | `POST /api/recipes/{recipe_id}/approve/` |
| Reject | `POST /api/recipes/{recipe_id}/reject/` with JSON `{"reason":"Explain what needs changing."}` |
| Read one review | `GET /api/recipes/{recipe_id}/{review_id}/` |

Approval sends no request body. Existing tokens identify signed-in accounts.
An approved public detail can load without a token. Both recipe response
serializers include read-only `approved`, `rejected` and `rejection_reason`.

Both decision buttons and the rejection draft are disabled while saving.
Success requires the matching ID, decision flags and saved reason in the POST
response, followed by a confirming detail GET for that same ID. An uncertain
result locks repeat decisions until
**Reload recipe** checks the saved record. **Back to pending recipes** loads
the queue again.

**Reject** opens an inline required-reason form, with Confirm rejection and
Cancel. Reasons are trimmed and limited to 1,000 characters. Rejected recipes
leave pending and remain saved privately. Their author sees a Rejected recipes
panel with the reason and can open the full private detail. Existing public
lists/search exclude them. Editing/resubmitting, deletion, notifications and
decision reversal remain outside this implementation.

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

Recipe links, detail requests and moderation target the existing numeric recipe
ID. Duplicate titles and title changes no longer select a recipe by its name.
Old title-based links are replaced; open recipes through their updated cards
or pending list. No database migration or title uniqueness rule is needed.
The profile now has Favorites, Approved recipes and Pending
Approval below its general information and picture. Admins get the `/staff`
button in the third panel; normal users get their own pending-submission list.

Authenticated `/api/me/` supplies private `submitted_recipes` summaries for the
current account's approved/pending/rejected sections. Older responses use an approved
ownership lookup by recipe ID and label missing own-pending data unavailable;
ordinary profiles never request the admin list. The frontend also supports
`favorite_recipes` summaries, but current saved favorites are IDs resolved
against the approved list. Favorites are display-only; saving/removing favorites,
editing/resubmission and notifications remain deferred. Rejection reasons are
saved and shown to the author; this is not an email notification flow.

## User-run next steps

With the existing PostgreSQL service running, deploy from the repository root:

```sh
docker compose up -d --build --no-deps --wait --wait-timeout 120 backend frontend
```

Backend startup applies unapplied migrations, including new
`0005_recipe_rejection`. Its defaults preserve current approved/pending states
and all recipe/photo data. If an older database lacks `0004`, that migration
initializes approval as false first. No database reset is needed.

Use a staff account to check Profile → Pending Approval → full recipe → Approve.
Refresh the full recipe, confirm the POST and confirmation GET, then return to
the pending list. Check an approved recipe while signed out and check that a
normal account opening `/staff` sees only the centered bold denial message and
**Back to main page** button. Direct pending-API security must
be verified against the imported guard: signed-out and valid nonstaff requests
should receive HTTP 403, while staff receives the pending list.

Reject another pending recipe with a reason, reload, and check it leaves the
staff queue. As its author, check the same saved reason in the profile and
recipe page; unrelated/signed-out accounts must not read its details/reviews.
Both decisions lock the recipe while saving. Opposing completed decisions
return 409 rather than overwrite each other; retry after an uncertain response
requires reload. Ordinary recipe text edits must preserve the saved decision.

For cross-computer delivery, run normal main-computer startup/export after the
new migration and send matching code/migration plus the whole shared folder.
The merger preserves rejection metadata and supports older local schemas
without changing the previous local database. Cross-computer checks remain
user-run; see the saved work-log checklist.

See [staff-api.md](staff-api.md) for the precise behavior and complete checks.
Source review is complete; frontend builds and browser/API/persistence checks
remain user-run and have not been performed by the assistant. The requested
admin account was created through an authorized management operation; its
login has not been tested. Credentials are not stored in these guides.
