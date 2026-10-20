# Recipe approval integration

The implemented website flow is:

```text
Normal login → Profile → Pending Approval → /staff → Full recipe → Approve
```

Only an account whose current profile returns `user.is_staff === true` sees
**Pending Approval** on its profile. The top-bar Profile button keeps opening
`/profile`. The pending page is `/staff`; a recipe opens at
`/recipe/{recipe_id}`, for example `/recipe/17`. Django's separate `/admin/` management
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
| Load a full recipe | `GET /api/recipes/{recipe_id}/` | Recipe detail with ingredients, steps and reviews |
| Approve a recipe | `POST /api/recipes/{recipe_id}/approve/` | Updated recipe summary |
| Reject a pending recipe | `POST /api/recipes/{recipe_id}/reject/` with JSON `{"reason":"Explain what needs changing."}` | Updated rejected recipe summary |
| Read one review | `GET /api/recipes/{recipe_id}/{review_id}/` | Review belonging to that recipe |

The approval POST sends **no body**. Pending/profile/approval operations require
the saved login token in the frontend. A detail request can be sent without a
token for an approved public recipe; pending and rejected details require the
author or staff. The same unpublished-recipe guard applies to standalone
review reads. Approved recipes remain publicly readable.

Both recipe serializers return read-only `approved`, `rejected` and
`rejection_reason` fields alongside the ID/title and existing recipe data.
Submission/edit input cannot set moderation fields. Pending means both flags
are false with an empty reason; approved means only `approved` is true;
rejected means only `rejected` is true with a saved reason. Database constraints
prevent contradictory states. The staff pending list includes only pending
records, never rejected recipes.

## Permissions and remaining work

The website checks the current account through `/api/me/` before requesting
pending recipes. A nonstaff account receives **Only admins can review pending
recipes.** and no pending-list request is made by that page.

**The pending-list backend now checks `request.user.is_staff` before reading
recipes.** Tomaz's correction from commit `71a1b8b` is imported. Signed-out
visitors and valid nonstaff accounts should receive HTTP 403 for a direct
pending-list request. Invalid tokens may instead be rejected by authentication.
Approval and rejection handlers also check staff status; unpublished recipe
and review details allow only the author or staff. These backend checks are separate from hiding the
frontend link and still require user-run verification.

**Reject** opens an inline reason form. A trimmed, nonblank reason of at most
1,000 characters is required. Confirm rejection saves the reason and leaves
the recipe/photos intact privately. The author sees it under **Rejected
recipes** on their own profile and on the full recipe page. It leaves the
pending queue and is excluded from public search/home/author lists. No email,
deletion, edit/resubmission or decision-reversal flow is added.

Approval and rejection lock the selected recipe for the decision. Only a
pending recipe can become rejected; a reviewed recipe returns HTTP 409.
Approving a rejected recipe also returns 409; approving an already approved
recipe remains safe to repeat. A competing decision must be reloaded rather
than silently replacing the saved result.

Recipe links and lookups use each recipe's existing positive integer ID. Titles
remain display/search text, so recipes with the same title have separate detail
and approval addresses. Changing a title does not change the recipe's address.
The frontend checks that detail/approval responses contain the requested ID.
The old title-based addresses are replaced; reopen recipes through the updated
cards or pending list rather than using saved title links. No model migration
or recipe renaming is required for this change.

## Recipe author information

Recipe details include a read-only `author` object alongside the existing
numeric `user` ID. It contains the author's ID, username, display name, public
email, bio, profile-picture URL and `approved_recipes` summaries, including
IDs, titles, photos, categories, ingredients and rating/count for preview cards.
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
`submitted_recipes` summaries, split into approved, pending and rejected lists
by their read-only decision flags. Rejected previews show the saved reason;
the additional panel appears only when there are rejected submissions. These private submissions are added only to the
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

## Confirming a decision

The frontend disables both decisions and the reason draft while saving. It
validates that the POST response matches the opened recipe's ID, decision
flags and rejection reason (empty for approval). It then GETs the full recipe
again and checks those same values before showing **Recipe approved.** or
**Recipe rejected.** Blank/invalid reasons remain editable.

Returning through **Back to pending recipes** opens `/staff` again and fetches
the current queue. Approved and rejected recipes no longer match its pending filter.

A refused request shows an error. If the save or its confirmation is ambiguous,
the page requires **Reload recipe** before allowing another attempt, so it does
not assume a network failure means the database was unchanged. Reload verifies
the record ID and current saved decision. No simulated success is shown.

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

   Backend startup applies any unapplied migrations. New rejection migration
   `0005_recipe_rejection` defaults to not rejected with an empty reason and
   preserves existing approved/pending decisions and all recipe/photo data.
   For databases not yet on `0004_recipe_approved`, that older migration first
   initializes approval as false. Do not reset the database for this update.
   Keep the existing private environment, certificates and database storage.

2. Sign in using a staff account, open Profile, and select **Pending Approval**.
   Expect a loading message followed by the real pending names or a verified
   empty-list message. Failed requests must show an error rather than an empty
   queue. Never share the Authorization token from Network tools.

3. Select a real pending recipe. Read its actual ingredients and instructions,
   then refresh the recipe address. The same recipe should load.
   Missing saved ingredients/steps must be shown honestly.

4. Click **Approve**. In Network tools, check the POST to that recipe ID's
   `/api/recipes/{recipe_id}/approve/` URL with no body, then the confirmation
   detail GET for the same ID.
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

7. Open another pending recipe as staff. Click **Reject**, check blank/space-only
   validation, enter a reason and confirm. Check the rejection POST body and
   confirming GET use that same ID. Refresh and return to pending: it should
   be absent. Sign in as its author: the profile's Rejected recipes panel and
   full detail should show the same reason, while pending excludes it. Ordinary
   unrelated/signed-out visitors must not read that recipe or its reviews, and
   public search/home/author lists must exclude it. Direct nonstaff moderation
   requests must be refused. Record actual outcomes without secrets.

8. Using ordinary submission, create two distinguishable recipes with the same
   title (different descriptions or authors). Open each through its card/queue
   link and refresh: the addresses and detail IDs must differ, while titles may
   match. Approve only one as staff, then reload both and the queue; only the
   selected ID should become approved. Confirm profile/search/author/home cards
   open their own IDs, unknown IDs return unavailable/not-found, and ordinary
   users still cannot approve or read another author's pending recipe. These
   are user-run checks, not results already obtained.

9. With two staff sessions on one pending recipe, try opposing decisions.
   The first saved decision must remain; the later opposite request must get
   409 and require reload. Check ordinary text edits cannot overwrite the
   decision. Review loading/network/ambiguous-save handling without treating
   uncertain responses as successful decisions.

When delivering this schema update to another computer, first run normal
`sh scripts/start.sh` on the main computer to apply the migration and export
current records/photos. Commit/push the matching code/migration and whole
`data/shared-database/` folder together. Existing snapshot schema checks still
apply. The receiving merge can read older local recipes without the rejection
columns and preserves rejection fields when they exist; it does not migrate
or modify the previous local database merely to combine records. These paths
still need the saved user-run cross-computer checks.

Source review has been performed. No assistant-run frontend build, application
test, login/API/browser check, deployment or recipe migration was executed.
The requested account creation was an authorized management operation, not a
login or moderation test.
