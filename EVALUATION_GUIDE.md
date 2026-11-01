# Understanding the project's logic

Read each explanation, then open its code references. Use **Ctrl+F** to find the named function—a piece of code doing a particular job.

## Before the examples: what are we working with?

**Ana Silva (`ana`), Marco Costa (`marco`) and Lee Park (`lee`) are ordinary demo accounts in the website.** The stories are hypothetical, not records of their actual actions. The existing `admin` handles recipe moderation. `superadmin` can also manage users and their permissions.

A recipe has a name, ingredient amounts, ordered instructions, photos, an author and an approval state. A review is a written opinion with a score from 1 to 5. A favorite saves a recipe in one person's collection.

The **browser** displays the page and collects what a person types. The **server** checks requests and decides what is allowed. The **database** keeps saved information after the page closes. An **ID** is a number identifying one saved record, such as recipe 60.

**Files and functions to check**

- [README → Demo account logins](README.md#demo-catalogue).
- [models.py → Recipe](backend/recipes/models.py#L4).

## 1. Marco opens a recipe

Marco opens `/recipe/60`. He wants to see that recipe's name, instructions, photos and reviews.

1. On the first visit, the website sends the browser the files needed to display its pages.
2. The page address tells the browser to open the recipe screen for recipe 60.
3. That screen asks the server for the saved data at `/api/recipes/60/`.
4. The server finds recipe 60 and checks access. If approved, it is public. If not approved, only its owner or staff may view it.
5. The server sends the recipe data back. The browser puts those values into the visible page.

The two addresses have different jobs: `/recipe/60` chooses the screen; `/api/recipes/60/` supplies its information. Nginx is the website's entry point: it delivers page files and forwards data requests to Django. Django's main address list delegates recipe addresses to the recipe-specific list, which chooses the handling function.

The reply identifies the recipe (`id`), gives its name (`title`) and says whether staff approved it for public display (`approved`). **`approved: true` means staff approved this recipe, so it may appear publicly.** `approved: false` means it is not approved for public display; its owner and staff can still access it. These named values are sent as text in a format called **JSON**.

**Question to prepare:** Why does the page need a separate data request?

**Files and functions to check**

- [App.jsx](frontend/src/App.jsx#L46) and [RecipePage.jsx → loadRecipe](frontend/src/pages/RecipePage.jsx#L648).
- [recipeApi.js → getRecipeDetails](frontend/src/data/recipeApi.js#L245).
- [nginx.conf](frontend/nginx.conf), [main address list](backend/config/urls.py#L24), [recipe address list](backend/recipes/urls.py#L9), then [views.py → _recipe_detail](backend/recipes/views.py#L530).

A shortened data reply can look like this:

```json
{"id": 60, "title": "Lemon and Herb Roast Chicken", "approved": true}
```

## 2. Ana signs in before changing anything

Ana wants to submit a recipe. The server must know that the request really belongs to her.

1. During signup, the server checks the account details, matching passwords and password rules. It saves a protected password-check value instead of readable password text.
2. Login checks Ana's username/email and password.
3. A successful login returns a **token**, a secret identifying her account on later website requests.
4. The browser keeps it for that tab and sends it when requesting a save. The server uses it to identify Ana.
5. Logout deletes the server token, so it can no longer identify a valid login.

The server takes the recipe's author from this signed-in identity. It does not let a submitted author ID decide ownership. Otherwise, Marco could claim to be Ana simply by sending her number.

**Question to prepare:** Why is knowing Ana's ID different from proving you are signed in as Ana?

**Files and functions to check**

- [LoginPage.jsx → handleSubmit](frontend/src/pages/LoginPage.jsx#L15).
- [users/serializers.py → SignupSerializer](backend/users/serializers.py#L120).
- [users/views.py → WebsiteLoginView](backend/users/views.py#L35), [sign_up](backend/users/views.py#L62) and [logout](backend/users/views.py#L117).
- [recipeApi.js → requestRecipeApi](frontend/src/data/recipeApi.js#L5).

## 3. Ana submits a recipe with ingredients and a photo

Ana enters her chicken recipe, including **600 g of potatoes**, instructions and a photo, then clicks **Add recipe**.

1. The page collects the fields and selected photos.
2. It checks obvious mistakes before sending them.
3. The server checks again: requests can be sent without using our form. It checks quantities, required fields, duplicate names, step numbers and actual photo contents and sizes.
4. It saves the recipe with Ana as its owner and connects its ingredients, instructions and photo records.
5. It replies with success or errors; the page displays that result.

The amount belongs to the recipe's connection to an ingredient. “Potatoes” can be reused by another recipe with **300 g** without changing Ana's **600 g**. Instructions and photos are also separate records connected to their recipe.

The related database changes finish together or are undone together if saving fails. Photos require additional cleanup because the image itself is a file, while the database stores its location. A failed creation removes newly written files too.

**Question to prepare:** What prevents an unsuccessful save from leaving half of a recipe behind?

**Files and functions to check**

- [AddRecipePage.jsx → handleSubmit](frontend/src/pages/AddRecipePage.jsx#L277).
- [recipes/views.py → _recipe_intake](backend/recipes/views.py#L21).
- [serializers.py → RecipeDetailedSerializer](backend/recipes/serializers.py#L126), especially [create](backend/recipes/serializers.py#L224).
- [models.py → RecipeIngredient](backend/recipes/models.py#L41), [RecipeStep](backend/recipes/models.py#L54) and [RecipeImage](backend/recipes/models.py#L73).

## 4. The admin decides whether Ana's recipe becomes public

Submitting a recipe saves it as **pending approval**. It is saved, but ordinary visitors cannot see it yet.

1. Ana and staff can view the pending submission.
2. Staff approve it for public display or reject it with a reason.
3. If rejected, Ana can correct it and submit it again.
4. If Ana later edits its contents, it returns for approval. Staff edits normally preserve its current approval state.
5. If Ana requests deletion, staff make the final removal decision. An approved recipe can remain public while the deletion request waits.

For editing, the server rejects a person who is **neither staff nor the owner**. These checks happen on the server even if somebody changes the browser's buttons. Managing user accounts and granting permissions is a separate administration job.

**Question to prepare:** Why does hiding an Edit button not protect Ana's recipe by itself?

**Files and functions to check**

- [views.py → _recipe_detail](backend/recipes/views.py#L530).
- [views.py → _recipe_edit_or_delete](backend/recipes/views.py#L333).
- [recipe_approve](backend/recipes/views.py#L184) and [recipe_reject](backend/recipes/views.py#L233).
- [users/admin.py](backend/users/admin.py).

## 5. Ana and the admin save different edits

Ana and the admin both open version **3** of the same recipe. The admin saves a changed instruction first, producing version **4**.

1. Ana's older form still sends version 3.
2. Before changing anything, the server compares that number with the saved version 4.
3. The numbers differ, so the server refuses the old save with response **409**, meaning a conflict. Ana must reload before editing again.

A second protection makes competing changes to the same recipe wait while one save finishes. This keeps the comparison and save together. Waiting handles changes happening together; version numbers catch an old form even much later. Content edits increase the number; adding a review or favorite does not.

**Question to prepare:** Why must the server check the version even if the saves happen minutes apart?

**Files and functions to check**

- [views.py → _recipe_edit_or_delete](backend/recipes/views.py#L333) and [recipe_approve](backend/recipes/views.py#L184).
- In those functions, find `content_revision` for the version comparison, `select_for_update()` for waiting, and `transaction.atomic()` for keeping the operation together.

## 6. Marco reviews and saves Ana's recipe

Marco wants to rate the approved recipe and keep it in his saved collection.

1. A review saves his identity, the recipe, a comment and a grade from **1–5**.
2. The server calculates the count and average from saved reviews, and the page displays them. Grades **4** and **5** give **(4 + 5) / 2 = 4.5**. With no reviews, it returns zero instead of dividing by zero.
3. A favorite connects Marco's profile to that recipe. It changes Marco's collection, not Ana's.
4. Other open pages request fresh data five seconds after the previous request finishes and when focus returns. This is how the changed review count appears without a manual reload. Hidden pages pause these reads.

The server chooses the user from the login, not from a name typed into the review or favorite request.

**Question to prepare:** What makes a favorite private to Marco's own collection?

**Files and functions to check**

- [views.py → _recipe_review](backend/recipes/views.py#L499).
- [serializers.py → RecipeReviewStatisticsMixin](backend/recipes/serializers.py#L102).
- [users/views.py → user_favorite](backend/users/views.py#L150).
- [useLiveRefresh.js](frontend/src/hooks/useLiveRefresh.js#L5).

## 7. Ana searches for dinner

Ana asks for vegetarian recipes containing chickpeas and rated at least three stars.

1. Start with the approved recipe collection.
2. Keep recipes satisfying **all** the selected choices.
3. Sort those matches, for example from highest rating to lowest.
4. Take the selected page of matches, such as the first six.

Filtering only one page could hide matches elsewhere, so filtering comes before dividing results into pages. Our search does this in the browser after downloading the approved collection. Choices are kept in the page address so reload and browser Back can restore them. Applying a new filter returns to page 1 because the old page number may no longer exist.

**Question to prepare:** Why can filtering after selecting a page give the wrong impression of the results?

**Files and functions to check**

- [recipeSearch.js → searchRecipes](frontend/src/data/recipeSearch.js#L81), then [paginateRecipeResults](frontend/src/data/recipeSearch.js#L122).
- [SearchResultsPage.jsx](frontend/src/pages/SearchResultsPage.jsx).

## 8. Another program asks our site for recipes

An **API** is a set of addresses that programs can use to ask for information or changes. The separate Public API Tester uses these addresses when its buttons create, read, edit or delete a recipe.

1. The tester sends an **API key**, a secret identifying its account's access.
2. The server checks that the key is valid, enabled, unexpired and belongs to an active account.
3. It checks the account's allowance: **60 requests in 60 seconds**. Too many returns **429** with a waiting time.
4. It checks the account's normal ownership/staff permissions. Marco's key still cannot edit Ana's recipe.

The allowance belongs to the account, so another key does not reset it. This key can expire or be disabled independently of the website login token.

**Question to prepare:** Why does having an API key not automatically give administrator powers?

**Files and functions to check**

- [authentication.py → PublicAPIKeyAuthentication](backend/public_api/authentication.py#L35) and [consume_public_api_quota](backend/public_api/authentication.py#L19).
- [permissions.py → PublicAPIKeyPermission](backend/public_api/permissions.py#L6).

## 9. Ana moves recipes in a downloaded file

**Export** turns selected recipes into a downloadable file. **Import** reads such a file and creates new recipe copies. Our website's JSON files keep named fields/lists; CSV files arrange recipes into rows. Both include photos.

1. Ana selects her recipes and downloads a file.
2. When importing, the server checks the whole file and its photos before saving.
3. A valid batch becomes new copies owned by the importing user, pending approval. The original recipes remain unchanged.
4. If the save succeeds but the connection drops before its reply arrives, a saved **receipt** identifies the request and file. Retrying that request returns its existing result instead of creating the batch twice.

Starting a new import deliberately creates another batch, even with the same file. The receipt protects a retry, not every future use of that file.

**Question to prepare:** Why does losing the reply not prove the save failed?

**Files and functions to check**

- [transfer_views.py → RecipeExportView](backend/recipes/transfer_views.py#L57), [RecipeValidateView](backend/recipes/transfer_views.py#L109), [RecipeImportView](backend/recipes/transfer_views.py#L142) and [RecipeImportStatusView](backend/recipes/transfer_views.py#L203).
- [transfer_formats.py](backend/recipes/transfer_formats.py).

## 10. Ana reads the activity charts

Analytics turns many saved records into useful counts, averages and charts. A recipe created last month can receive a review today: that is **a review today**, not **a recipe created today**.

1. Select currently approved recipes matching the category/title choices.
2. Count recipe creation and review activity using each event's own date, within the selected range.
3. Apply a star choice to review statistics. The ratings distribution still displays all grades so people can compare them.
4. Send those results to the page, which draws the charts.
5. Export the displayed results together with their filters and generation time. Later refreshes can load newer relevant changes.

The report describes the displayed results, rather than quietly downloading a different report.

**Question to prepare:** Why can an older recipe contribute to today's review chart?

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

**Question to prepare:** Why are restoring a backup and activating it separate actions?

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

**Question to prepare:** What is the benefit of one shared button over copies maintained separately on many pages?

**Files and functions to check**

- [Button.jsx](frontend/src/components/Button.jsx#L1), [Icon.jsx](frontend/src/components/Icon.jsx#L13) and [savour-system.css](frontend/src/styles/savour-system.css).
- [vite.config.js](frontend/vite.config.js#L10).
- [start.sh](scripts/start.sh).

## Preparing your explanation

Explain one scenario: what arrives, what is checked, what changes and what the person sees. Consider invalid input, the wrong account and outdated data.

**Files and functions to check**

Use the active functions named by [recipes/urls.py](backend/recipes/urls.py#L9). Old quoted examples near the bottom of [recipes/views.py](backend/recipes/views.py#L568) are inactive.
