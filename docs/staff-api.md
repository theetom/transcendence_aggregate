# Recipe approval integration

The implemented website flow is:

```text
Normal login → Profile → Pending Approval → /staff → Full recipe → Approve
```

Only an account whose current profile returns `user.is_staff === true` sees
**Pending Approval** on its profile. The top-bar Profile button keeps opening
`/profile`. The pending page is `/staff`; a recipe opens at
`/recipe/{URL-encoded exact title}`. Django's separate `/admin/` management
page remains available.

The approval flow is implemented in source, including the imported pending-list
permission correction. Browser/API/persistence checks remain user-run.

## Actual requests

These same-origin requests use the existing HTTPS proxy and website login.
The frontend reads the login token from sessionStorage and sends
`Authorization: Token <token>` when one is available.

| Action | Request | Successful response |
| --- | --- | --- |
| Identify the current account | `GET /api/me/` | Own profile, with nested `user.is_staff` |
| Load pending recipes | `GET /api/recipes/all_recipes/pending/` | Plain array of recipe summaries; `[]` means no pending recipes |
| Load a full recipe | `GET /api/recipes/{URL-encoded exact title}/` | Recipe detail with ingredients, steps and reviews |
| Approve a recipe | `POST /api/recipes/{URL-encoded exact title}/approve/` | Updated recipe summary |

The approval POST sends **no body**. Pending/profile/approval operations require
the saved login token in the frontend. A detail request can be sent without a
token for an approved public recipe; pending details require the author or a
staff account on the backend. Approved recipes remain publicly readable.

Both recipe serializers now return `approved` as a read-only boolean.
Summaries include the actual positive integer `id`, exact `title` and
`approved`; detailed responses retain their existing recipe fields.
Recipe submission input cannot set this read-only field to approve itself.
The frontend accepts only `approved: false` records in the pending list.

## Permissions and remaining work

The website checks the current account through `/api/me/` before requesting
pending recipes. A nonstaff account receives **Only admins can review pending
recipes.** and no pending-list request is made by that page.

**The pending-list backend now checks `request.user.is_staff` before reading
recipes.** Tomaz's correction from commit `71a1b8b` is imported. Signed-out
visitors and valid nonstaff accounts should receive HTTP 403 for a direct
pending-list request. Invalid tokens may instead be rejected by authentication.
The approval handler also checks staff status; pending recipe details allow
only the author or staff. These backend checks are separate from hiding the
frontend link and still require user-run verification.

**Reject** is visibly disabled. No rejection/deletion endpoint, author
notification or moderation feedback storage has been invented. The previous
submission-status/feedback API proposal and browser preview are obsolete.

The current backend identifies recipes by their exact titles. Duplicate titles
or title changes remain a backend limitation.

## Recipe author information

Recipe details include a read-only `author` object alongside the existing
numeric `user` ID. It contains the author's ID, username, display name, public
email, bio, profile-picture URL and `approved_recipes` links (`id`/`title`).
The recipe page displays these fields from the author's current account/profile.
The other-recipe list contains only that author's approved recipes, excludes the
current recipe and exposes no pending submissions or favorites. Accounts without
a profile still return their account name, username and email. Email is public
on visible recipe pages by the user's explicit October 15 decision.

## Profile sections

The profile shows general information on the left and the picture on the right,
with Favorites, Approved recipes and Pending Approval panels underneath.
The panels stack on small screens. An admin's Pending Approval panel links to
`/staff`; a normal user's panel is reserved for their own pending submissions.

Authenticated `GET /api/me/` returns the signed-in account's
`submitted_recipes` summaries, split into approved and pending lists by the
read-only `approved` value. These private submissions are added only to the
own-account response. The ordinary-user profile never requests the admin's
pending list. An approved-recipe ownership lookup remains as a fallback for
older responses that omit submissions.

The profile also supports `favorite_recipes` summaries, but the current backend
returns saved `favorites` IDs instead. Those IDs are resolved against the
available approved list; unresolved favorites are shown as unavailable rather
than removed or counted as an empty collection. Saving/removing favorites is
not implemented. Future favorite summaries must respect recipe visibility.

## Editing your own profile

Authenticated `PATCH /api/me/` accepts these optional fields:

| Field | Behavior |
| --- | --- |
| `first_name` | Updates the current account's first name, up to 150 characters |
| `last_name` | Updates the current account's last name, up to 150 characters |
| `bio` | Updates the profile biography |
| `profile_picture` | Replaces the photo with a valid nonempty JPEG, PNG, GIF or WebP image, at most 5 MiB |

Text-only requests can use JSON. Photo requests use multipart form data with
the file field named `profile_picture`; the browser supplies the multipart
boundary. Omitted fields remain unchanged, and blank names/bio clear those
text fields. A new photo is not required when editing text. Other fields are
rejected, including account IDs, usernames, email addresses, passwords,
permissions and favorites.

The server selects the profile using `request.user`, updates the related
account/profile records in one transaction, and returns the same full response
shape as GET. A failed update preserves the existing photo; newly stored files
are cleaned up on failure, and a replaced old file is deleted only after commit
if no profile still references it. File cleanup failures are logged separately.
The existing media volume serves uploaded profile pictures as well as recipe
photos; this does not change media URL visibility or public-user serializers.

On `/profile`, Edit profile opens the name/bio/photo form. Choosing a picture
shows a local preview; Save sends the update and refreshes the displayed
information/photo, while Cancel discards the draft. Email and date joined
remain displayed. Runtime checks are user-led and still pending.

## Confirming an approval

The frontend disables Approve while saving. It validates that the POST response
matches the opened recipe's `id` and `title`, with `approved === true`.
It then GETs the full recipe again and checks the matching record ID and saved
approval before showing **Recipe approved.**

Returning through **Back to pending recipes** opens `/staff` again and fetches
the current queue. Approved recipes no longer match the backend pending filter.

A rejected request shows an error. If the save or its confirmation is ambiguous,
the page requires **Reload recipe** before allowing another attempt, so it does
not assume a network failure means the database was unchanged. Reload verifies
the record ID and current saved approval. No simulated success is shown.

## Imported backend scope

Moderation changes were selectively imported from `backend_admin_logic` into:

- `backend/recipes/models.py`
- `backend/recipes/migrations/0004_recipe_approved.py`
- `backend/recipes/urls.py`
- `backend/recipes/views.py`

The read-only response field was added in `backend/recipes/serializers.py`
while preserving the committed quantity validation. PostgreSQL settings and
existing account/login/profile code were not replaced.

## User-run deployment and checks

These are instructions for the user, not checks run by the assistant.

1. With the existing PostgreSQL service running, rebuild/recreate the backend
   and frontend from the repository root:

   ```sh
   docker compose up -d --build --no-deps --wait --wait-timeout 120 backend frontend
   ```

   Existing backend startup applies migration `0004_recipe_approved`.
   Its `default=False` makes **preexisting recipes pending** as well as new ones.
   Records are preserved; they will disappear from public lists until approved.
   No automatic approval of old recipes or database reset is performed.
   Keep the existing private environment, certificates and database storage.

2. Sign in using a staff account, open Profile, and select **Pending Approval**.
   Expect a loading message followed by the real pending names or a verified
   empty-list message. Failed requests must show an error rather than an empty
   queue. Never share the Authorization token from Network tools.

3. Select a real pending recipe. Read its actual ingredients and instructions,
   then refresh the recipe address. The same recipe should load.
   Missing saved ingredients/steps must be shown honestly.

4. Click **Approve**. In Network tools, check the POST to the exact title's
   `approve/` URL with no body, then the confirmation detail GET.
   Expect **Recipe approved.**, approval controls to disappear, and the
   recipe to leave the pending list after **Back to pending recipes**.

5. Open the approved recipe in a signed-out browser. Expect public detail access
   with no moderation buttons. An unrelated normal account should be denied
   access to a still-pending recipe and should not see the profile admin link.

6. Sign in normally as a nonstaff account and directly open `/staff`.
   Expect only the large, bold, centered admin-only message and a
   **Back to main page** button linking to `/`, with no staff heading or
   pending-list request. Account checking/errors also hide the staff layout.
   Separately, verify direct pending API requests are refused for a valid
   normal-account token and for a signed-out visitor. Expect HTTP 403 from the
   imported staff check rather than a recipe list. The signed-out check can use
   `/api/recipes/all_recipes/pending/` in a fresh private browser window.

7. Confirm **Reject** stays disabled. Review loading/network/permission errors
   and ambiguous-save reload behavior without treating them as successful
   decisions. Record any failure's URL/status with secrets removed.

Source review has been performed. No assistant-run frontend build, application
test, login/API/browser check, deployment or recipe migration was executed.
The requested account creation was an authorized management operation, not a
login or moderation test.
