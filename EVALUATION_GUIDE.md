# How the project works

Each section explains what the user does, what the server checks and what gets saved. File and function references are at the end. A function is a named group of instructions doing one job; use **Ctrl+F** to find it by name.

## What the site stores

A **user** is someone using the site. The **recipe owner** is the user who submitted that recipe. **Staff** can approve, reject and manage recipes. The existing `admin` handles this moderation; `superadmin` can also manage accounts and their permissions.

A recipe has a name, ingredient amounts, ordered instructions, photos, an author and an approval state. A review is a written opinion with a score from 1 to 5. A favorite saves a recipe in one person's collection.

The **browser** displays the page and collects what a person types. The **server** checks requests and decides what is allowed. The **database** keeps saved information after the page closes. An **ID** is a number identifying one saved record, such as recipe 60.

**Files and functions to check**

- [README → Demo account logins](README.md#demo-catalogue).
- [models.py → Recipe](backend/recipes/models.py#L4).

## 1. Opening a recipe

When the user opens `/recipe/60`, the page needs the saved name, instructions, photos and reviews for recipe 60.

1. On the first visit, the website sends the browser the files needed to display its pages.
2. The page address tells the browser to open the recipe screen for recipe 60.
3. That screen asks the server for the saved data at `/api/recipes/60/`.
4. The server finds recipe 60 and checks access. If approved, it is public. If not approved, only its owner or staff may view it.
5. The server sends the recipe data back. The browser puts those values into the visible page.

The two addresses have different jobs: `/recipe/60` chooses the screen; `/api/recipes/60/` supplies its information. Nginx is the website's entry point: it delivers page files and forwards data requests to Django, which runs our server-side checks. Django's main address list delegates recipe addresses to the recipe-specific list, which chooses the handling function.

The reply identifies the recipe (`id`), gives its name (`title`) and says whether staff approved it for public display (`approved`). **`approved: true` means staff approved this recipe, so it may appear publicly.** `approved: false` means it is not approved for public display; its owner and staff can still access it. These named values are sent as text in a format called **JSON**.

**Files and functions to check**

- [App.jsx](frontend/src/App.jsx#L46) and [RecipePage.jsx → loadRecipe](frontend/src/pages/RecipePage.jsx#L648).
- [recipeApi.js → getRecipeDetails](frontend/src/data/recipeApi.js#L245).
- [nginx.conf](frontend/nginx.conf), [main address list](backend/config/urls.py#L24), [recipe address list](backend/recipes/urls.py#L9), then [views.py → _recipe_detail](backend/recipes/views.py#L530).

A shortened data reply can look like this:

```json
{"id": 60, "title": "Lemon and Herb Roast Chicken", "approved": true}
```

## 2. Signing in

Before accepting a recipe, review or favorite, the server needs to identify the signed-in user.

1. During signup, the server checks the account details, matching passwords and password rules. It saves a protected password-check value instead of readable password text.
2. Login checks the user's username/email and password.
3. A successful login returns a **token**, a secret identifying that account on later website requests.
4. The browser keeps it for that tab and sends it with requests. The server uses it to identify the user.
5. Logout deletes the server token, so it can no longer identify a valid login.

The server uses the signed-in identity as the recipe author. Sending another account's ID does not let a user act as that account.

**Files and functions to check**

- [LoginPage.jsx → handleSubmit](frontend/src/pages/LoginPage.jsx#L15).
- [users/serializers.py → SignupSerializer](backend/users/serializers.py#L120).
- [users/views.py → WebsiteLoginView](backend/users/views.py#L35), [sign_up](backend/users/views.py#L62) and [logout](backend/users/views.py#L117).
- [recipeApi.js → requestRecipeApi](frontend/src/data/recipeApi.js#L5).

## 3. Saving a recipe and its photos

The user fills in the recipe form with ingredients, amounts, instructions and a photo, then clicks **Add recipe**.

1. The page collects the fields and selected photos.
2. It checks obvious mistakes before sending them.
3. The server checks again: requests can be sent without using our form. It checks quantities, required fields, duplicate names, step numbers and actual photo contents and sizes.
4. It saves the recipe with the signed-in user as its owner and links its ingredients, instructions and photo records.
5. It replies with success or errors; the page displays that result.

Each ingredient amount belongs to a particular recipe. One recipe can use **600 g of potatoes** and another **300 g**, while both refer to the ingredient “Potatoes.” Instructions are also saved as separate records linked to the recipe.

The related database changes finish together or are undone together if saving fails. New image files are also cleaned up if creation fails.

### How the photos are linked to the recipe

**Uploaded recipe images are stored inside the `backend` Docker container at `/app/media/recipes/`.** In the database, a separate **photo record** stores the recipe's ID and the image's relative file location. Using `photo.jpg` as an example filename:

```text
Recipe record: id=60, title="Lemon and Herb Roast Chicken"
Photo record: recipe_id=60, image="recipes/photo.jpg"
File inside the backend container: /app/media/recipes/photo.jpg
```

The matching `60` links that photo to that recipe. Two photos create two photo records with the same recipe ID. Django combines its storage folder `/app/media/` with the saved value `recipes/photo.jpg` to find the file.

### Where that file lives in Docker and the project

Docker keeps the images in a **volume**, a storage folder managed by Docker that survives normal container restarts and replacement. Our Compose configuration calls it `django_media`. Both containers have access to the same stored files through different paths:

| Where you look | Location of the example image | What happens there |
| --- | --- | --- |
| `backend` container | `/app/media/recipes/photo.jpg` | Django saves the uploaded image. |
| `frontend` container, which runs Nginx | `/srv/django/media/recipes/photo.jpg` | Nginx reads the same file through a read-only connection to the volume. |
| Browser | `/media/recipes/photo.jpg` | The browser requests this address; Nginx sends back the image file. |

**On this installation**, the full volume name is `transcendence_aggregate_django_media`. Docker reports its storage folder as `/var/lib/docker/volumes/transcendence_aggregate_django_media/_data/`, so the example image would be under `_data/recipes/photo.jpg`. Another computer's Docker storage path can differ.

In the project folder, `data/shared-database/photos/` contains **exported photo copies** for sharing with partners. Those copies use generated filenames; `data/shared-database/manifest.json` records the mapping. The running website saves and reads its images through the Docker volume.

**Files and functions to check**

- [AddRecipePage.jsx → handleSubmit](frontend/src/pages/AddRecipePage.jsx#L277).
- [recipes/views.py → _recipe_intake](backend/recipes/views.py#L21).
- [serializers.py → RecipeDetailedSerializer](backend/recipes/serializers.py#L126), especially [create](backend/recipes/serializers.py#L224).
- [models.py → RecipeIngredient](backend/recipes/models.py#L41), [RecipeStep](backend/recipes/models.py#L54) and [RecipeImage](backend/recipes/models.py#L73).
- [views.py → save the photo file and its database record](backend/recipes/views.py#L113), [settings.py → photo storage paths](backend/config/settings.py#L169) and [nginx.conf → serve photo files](frontend/nginx.conf#L77).
- [docker-compose.yml → backend image storage](docker-compose.yml#L35) and [the same storage connected to Nginx](docker-compose.yml#L68).
- [share-postgres.py → publish exported photo copies](scripts/share-postgres.py#L403).

From the project root, list the actual image files inside the backend container with:

```sh
docker compose exec -T backend ls /app/media/recipes
```

To check where Docker stores this installation's volume, run:

```sh
docker volume inspect transcendence_aggregate_django_media --format '{{.Mountpoint}}'
```

## 4. Approving, rejecting and deleting recipes

Submitting a recipe saves it as **pending approval**. It is saved, but ordinary visitors cannot see it yet.

1. The recipe owner and staff can view the pending submission.
2. Staff approve it for public display or reject it with a reason.
3. If rejected, the owner sees the reason, corrects the recipe and submits it again.
4. An ordinary owner's content edit sends it back for approval. Staff edits normally preserve its approval state.
5. An owner's deletion request waits for a staff decision. An approved recipe can remain public until staff approve its removal.

For editing, the server rejects a person who is **neither staff nor the owner**. These checks happen on the server even if somebody changes the browser's buttons. Managing user accounts and granting permissions is a separate administration job.

**Files and functions to check**

- [views.py → _recipe_detail](backend/recipes/views.py#L530).
- [views.py → _recipe_edit_or_delete](backend/recipes/views.py#L333).
- [recipe_approve](backend/recipes/views.py#L184) and [recipe_reject](backend/recipes/views.py#L233).
- [users/admin.py](backend/users/admin.py).

## 5. Preventing an old edit from overwriting a newer one

A user and a staff member open version **3** of the same recipe. The staff member saves a changed instruction first, producing version **4**.

1. The user's older form still sends version 3.
2. Before changing anything, the server compares that number with the saved version 4.
3. The numbers differ, so the server refuses the old save with response **409**, meaning a conflict. The user must reload before editing again.

A second protection makes competing changes to the same recipe wait while one save finishes. This keeps the comparison and save together. Waiting handles changes happening together; version numbers catch an old form even much later. Content edits increase the number; adding a review or favorite does not.

**Files and functions to check**

- [views.py → _recipe_edit_or_delete](backend/recipes/views.py#L333) and [recipe_approve](backend/recipes/views.py#L184).
- In those functions, find `content_revision` for the version comparison, `select_for_update()` for waiting, and `transaction.atomic()` for keeping the operation together.

## 6. Saving reviews, favorites and updated results

The user can rate an approved recipe and add it to their saved collection.

1. A review saves the signed-in user, the recipe, a comment and a grade from **1–5**.
2. The server calculates the count and average from saved reviews, and the page displays them. Grades **4** and **5** give **(4 + 5) / 2 = 4.5**. With no reviews, it returns zero instead of dividing by zero.
3. A favorite links the signed-in user's profile to the recipe. It changes only that user's saved collection.
4. Other open pages request fresh data five seconds after the previous request finishes and when focus returns. This is how the changed review count appears without a manual reload. Hidden pages pause these reads.

The server chooses the user from the login, not from a name typed into the review or favorite request.

**Files and functions to check**

- [views.py → _recipe_review](backend/recipes/views.py#L499).
- [serializers.py → RecipeReviewStatisticsMixin](backend/recipes/serializers.py#L102).
- [users/views.py → user_favorite](backend/users/views.py#L150).
- [useLiveRefresh.js](frontend/src/hooks/useLiveRefresh.js#L5).

## 7. Filtering and sorting search results

The user can combine choices such as vegetarian recipes, an ingredient containing “chickpea,” and a minimum rating of three stars.

1. Start with the approved recipe collection.
2. Keep recipes satisfying **all** the selected choices.
3. Sort those matches, for example from highest rating to lowest.
4. Take the selected page of matches, such as the first six.

Filtering only one page could hide matches elsewhere, so filtering comes before dividing results into pages. Our search does this in the browser after downloading the approved collection. Choices are kept in the page address so reload and browser Back can restore them. Applying a new filter returns to page 1 because the old page number may no longer exist.

**Files and functions to check**

- [recipeSearch.js → searchRecipes](frontend/src/data/recipeSearch.js#L81), then [paginateRecipeResults](frontend/src/data/recipeSearch.js#L122).
- [SearchResultsPage.jsx](frontend/src/pages/SearchResultsPage.jsx).

## 8. Another program asks our site for recipes

An **API** is a set of addresses that programs can use to ask for information or changes. The separate Public API Tester uses these addresses when its buttons create, read, edit or delete a recipe.

1. The tester sends an **API key**, a secret identifying its account's access.
2. The server checks that the key is valid, enabled, unexpired and belongs to an active account.
3. It checks the account's allowance: **60 requests in 60 seconds**. Too many returns **429** with a waiting time.
4. It checks the account's ownership/staff permissions. An ordinary user's key cannot edit another user's recipe.

The allowance belongs to the account, so another key does not reset it. This key can expire or be disabled independently of the website login token.

**Files and functions to check**

- [authentication.py → PublicAPIKeyAuthentication](backend/public_api/authentication.py#L35) and [consume_public_api_quota](backend/public_api/authentication.py#L19).
- [permissions.py → PublicAPIKeyPermission](backend/public_api/permissions.py#L6).

## 9. Exporting and importing recipes

**Export** turns selected recipes into a downloadable file. **Import** reads such a file and creates new recipe copies. Our website's JSON files keep named fields/lists; CSV files arrange recipes into rows. Both include photos.

1. The user selects their recipes and downloads a file.
2. When importing, the server checks the whole file and its photos before saving.
3. A valid batch becomes new copies owned by the importing user, pending approval. The original recipes remain unchanged.
4. If the save succeeds but the connection drops before its reply arrives, a saved **receipt** identifies the request and file. Retrying that request returns its existing result instead of creating the batch twice.

Starting a new import deliberately creates another batch, even with the same file. The receipt protects a retry, not every future use of that file.

**Files and functions to check**

- [transfer_views.py → RecipeExportView](backend/recipes/transfer_views.py#L57), [RecipeValidateView](backend/recipes/transfer_views.py#L109), [RecipeImportView](backend/recipes/transfer_views.py#L142) and [RecipeImportStatusView](backend/recipes/transfer_views.py#L203).
- [transfer_formats.py](backend/recipes/transfer_formats.py).

## 10. Displaying activity charts

Analytics turns many saved records into useful counts, averages and charts. A recipe created last month can receive a review today: that is **a review today**, not **a recipe created today**.

1. Select currently approved recipes matching the category/title choices.
2. Count recipe creation and review activity using each event's own date, within the selected range.
3. Apply a star choice to review statistics. The ratings distribution still displays all grades so people can compare them.
4. Send those results to the page, which draws the charts.
5. Export the displayed results together with their filters and generation time. Later refreshes can load newer relevant changes.

The report describes the displayed results, rather than quietly downloading a different report.

**Files and functions to check**

- [analytics.py → read_filters](backend/recipes/analytics.py#L34) and [build_analytics](backend/recipes/analytics.py#L110).
- [AnalyticsPage.jsx](frontend/src/pages/AnalyticsPage.jsx#L229).
- [recipeAnalytics.js → createAnalyticsDownload](frontend/src/data/recipeAnalytics.js#L195).

## 11. The team starts the site or recovers lost work

The database, server, page-serving software, API Tester and backup worker must run together. Startup prepares these parts, loads shared project data and saves the current shared bundle. It also prepares **HTTPS**, the protected connection between browser and website; the browser must trust our local certificate identifying the site.

The Status page makes a small real database query to check whether the database answers. It checks availability, not every recipe feature.

For recovery:

1. The backup worker saves a private copy of database records and photos on a schedule.
2. It verifies the copy before marking it completed.
3. Restoring creates a **separate database** containing that backup.
4. Activating it for the website is a separate decision, so checking a restore does not immediately replace current work.

Shared Git data delivers project content to partners. Private backups keep recovery information, including credentials, outside Git. Both records and actual photos are needed: a saved image location cannot replace a lost image file.

**Files and functions to check**

- [docker-compose.yml](docker-compose.yml#L1) and [start.sh](scripts/start.sh).
- [health.py → health](backend/config/health.py#L15).
- [backups-worker.py → daemon](scripts/backups-worker.py#L720), [create_backup](scripts/backups-worker.py#L537) and [restore_backup](scripts/backups-worker.py#L655).
- [share-postgres.py → export_snapshot](scripts/share-postgres.py#L467).

## 12. The same controls appear across pages and browsers

A **component** is a reusable page piece. Several screens use the same button component, while each supplies its own label and action.

1. Shared buttons, icons, colors and spacing keep pages consistent.
2. A correction to a shared piece can improve every page using it.
3. Before deployment, the build tool prepares browser-ready files using the supported browser settings.
4. Firefox and Edge run those files. Their own calendars or file choosers may look different, while the selected values and resulting actions must agree.

Browser support depends on the page code behaving correctly and the browser trusting the local HTTPS connection. A date picker's appearance alone does not determine whether the feature works.

**Files and functions to check**

- [Button.jsx](frontend/src/components/Button.jsx#L1), [Icon.jsx](frontend/src/components/Icon.jsx#L13) and [savour-system.css](frontend/src/styles/savour-system.css).
- [vite.config.js](frontend/vite.config.js#L10).
- [start.sh](scripts/start.sh).
