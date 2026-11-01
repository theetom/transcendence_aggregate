# How the project works

This guide follows each action from what the user does to what appears on the page. Each section ends with the files and functions involved. A **function** is a named group of instructions that performs one job; use **Ctrl+F** to find the named function when opening the code.

## What the different parts do

The **browser** runs React, our page-building JavaScript code. React displays forms, reads what the user enters and sends requests when it needs saved information or wants to change it.

Those requests first reach **Nginx**, the web server running in the `frontend` Docker container. Nginx either sends a requested file itself or forwards an API request to **Django**, our Python application in the `backend` container. Django checks who made the request, decides whether the action is allowed and reads or changes records in **PostgreSQL**, our database in the `postgres` container. Django's reply returns through Nginx to the browser, where React updates the page.

Docker runs these programs in separate **containers**, each with its own environment and file paths. The containers communicate with each other, which is how Nginx can pass a request to Django and Django can query PostgreSQL.

An **API** is a set of addresses that programs call to request data or changes. A **request** contains an address, an action and, when needed, data. For example, `GET` asks to read information, while `POST` submits information. The **response** is the server's reply, including a status number and any returned data.

The saved information connects these actions: a **user account** identifies someone; a **recipe** belongs to its submitting user and has ingredients, instructions, photos and an approval state; a **review** connects a user to a recipe with a comment and a score; a **favorite** connects a recipe to one user's saved collection. An **ID** is the number identifying a particular record, such as recipe 60.

The **recipe owner** is the submitting user. **Staff** can moderate recipes. The existing `admin` handles recipe moderation, while `superadmin` can also manage accounts and permissions.

**Files and functions to check**

- [README → Demo account logins](README.md#demo-catalogue).
- [models.py → Recipe](backend/recipes/models.py#L4).

## 1. Opening a recipe: from the page address to saved data

Suppose the user enters `https://localhost:8443/recipe/60` in the browser. The `/recipe/60` part is the path asking to open recipe 60's page. Opening that page starts two connected requests:

1. The browser first requests `/recipe/60` from Nginx. Nginx sends the website's starting HTML page, and the browser loads the JavaScript and styles needed to run React.
2. React reads `/recipe/60`, selects the recipe screen and takes `60` as the recipe ID. At this point it knows which recipe to show, but it still needs that recipe's saved contents.
3. To get those contents, React makes an **API call**: the browser sends `GET /api/recipes/60/` to Nginx. This explicitly asks to read recipe 60's data.
4. Nginx recognizes the `/api/` path and forwards the complete request to Django at `backend:8000` inside Docker. Nginx does not look up the recipe itself.
5. Django's main address list matches the `api/` prefix and passes the remaining `recipes/60/` to its recipe address list. That list recognizes the recipe ID and selects the function that handles this request. Keeping recipe addresses together lets the main list connect several areas, such as accounts and recipes, without containing every individual address.
6. That function finds recipe 60 in PostgreSQL and checks access. An approved recipe is public; an unapproved recipe can be read only by its owner or staff. If access is refused or the recipe does not exist, Django returns an error for the page to display.
7. If access is allowed, Django turns the saved recipe and its related records into **JSON**, text containing named values and lists. The response travels back through Nginx to the browser. React reads those values and displays the name, ingredients, instructions and reviews.

For example, part of the JSON response could be:

```json
{"id": 60, "title": "Lemon and Herb Roast Chicken", "approved": true}
```

Here, `id: 60` identifies the saved recipe and `title` contains the name to display. **`approved: true` means staff approved that recipe for public display.** If `approved` is `false`, it has not been approved for public display, although its owner and staff can still access it.

The response also contains image addresses. After React places those addresses in the page, the browser requests the actual image files separately. Section 3 follows that part of the process.

**Files and functions to check**

- [App.jsx](frontend/src/App.jsx#L46) and [RecipePage.jsx → loadRecipe](frontend/src/pages/RecipePage.jsx#L648).
- [recipeApi.js → getRecipeDetails](frontend/src/data/recipeApi.js#L245).
- [nginx.conf](frontend/nginx.conf), [main address list](backend/config/urls.py#L24), [recipe address list](backend/recipes/urls.py#L9), then [views.py → _recipe_detail](backend/recipes/views.py#L530).

## 2. Signing in: how later requests belong to an account

Reading an approved recipe does not require an account. Saving a recipe, review or favorite does, because Django must know which user is making the change.

1. During signup, the browser sends the entered account details and passwords to `/api/sign_up/` using `POST`. Nginx forwards the request to Django, which checks the fields, duplicate accounts and password rules. Django saves the account and its profile, storing a protected password-check value called a **hash**. After successful signup, the website opens the login page.
2. On that page, the user enters a username or email and a password. The browser sends them in `POST /api/login/`, again through Nginx to Django. Django checks whether those credentials match a saved active account.
3. If they match, Django returns a **token**, a secret value linked to that account. The browser stores it in that tab's session storage, an area the page can read on later requests.
4. When the user saves something, the browser includes this token in the request's **headers**, information sent alongside the main data. Django looks up the token to identify the user before handling the requested change. It can then use that user as the recipe author or choose that user's favorites collection.
5. On logout, the browser sends `POST /api/logout/` with the token. Django deletes the server's token record, and the browser clears its stored login. That token can no longer authorize a save.

This connects signing in to ownership: Django gets the author from the checked login token. Entering someone else's account ID in submitted data does not prove that the request belongs to them.

**Files and functions to check**

- [LoginPage.jsx → handleSubmit](frontend/src/pages/LoginPage.jsx#L15).
- [users/serializers.py → SignupSerializer](backend/users/serializers.py#L120).
- [users/views.py → WebsiteLoginView](backend/users/views.py#L35), [sign_up](backend/users/views.py#L62) and [logout](backend/users/views.py#L117).
- [recipeApi.js → requestRecipeApi](frontend/src/data/recipeApi.js#L5).
- [SignupPage.jsx → signup request and login navigation](frontend/src/pages/SignupPage.jsx#L86) and [SiteHeader.jsx → logout](frontend/src/components/SiteHeader.jsx#L70).

## 3. Saving a recipe: connected records and actual photo files

The user fills in a recipe form and clicks **Add recipe**. React has to send both the written information and the selected image files so Django can save the complete submission.

1. React collects the name, categories, ingredient amounts, ordered instructions and photos. It checks the form and highlights invalid fields before sending anything.
2. If the form passes, the browser sends `POST /api/recipes/add_recipe/` with the login token. The request carries the text fields and image contents together in separate parts. Nginx forwards that request to Django.
3. Django identifies the user from the token and checks the submitted values and actual image contents. These checks are necessary because someone could send a request directly without using our form.
4. Django saves a recipe owned by that user, then saves the related ingredient amounts, instructions and photo records connected to its ID. It uses a **transaction**: these database changes finish together, or they are undone together if saving fails. Newly written image files also receive separate cleanup if creation fails.
5. Once saving succeeds, Django returns status **201**, meaning a new record was created. The response comes back through Nginx, and React opens the submission confirmation page. The recipe is saved as pending approval, leading to the moderation process in section 4.

The connected records matter because the same ingredient can appear in several recipes with different amounts. One recipe's ingredient record can link “Potatoes” to **600 g**, while another recipe's record links it to **300 g**. Each amount belongs to that recipe's connection to the ingredient. Instructions and photos likewise have their own records linked to a particular recipe.

### Following one photo from saving to display

Use `photo.jpg` as an example filename. A photo record in PostgreSQL could contain `recipe_id=60` and `image="recipes/photo.jpg"`. The first value connects it to recipe 60. The second tells Django where to find its file relative to the image storage folder. Two photos have two records with the same recipe ID.

When Django saves that image, it combines its storage folder `/app/media/` with `recipes/photo.jpg`. **The actual file is therefore at `/app/media/recipes/photo.jpg` inside the `backend` container.** The image contents live in that file; the database record keeps the connection and file location.

Docker connects `/app/media/` to a persistent storage folder called a **volume**. Our Compose configuration calls it `django_media`. Because the volume keeps the files separately from the container, normal container restarts or replacement preserve them.

The `frontend` container connects to that same volume at `/srv/django/media/`, with read-only access. It therefore sees the same image as `/srv/django/media/recipes/photo.jpg`. Django can save the file through its path, and Nginx can read that file through its own path.

When the recipe response gives React an image address such as `/media/recipes/photo.jpg`, React places it in the page. The browser then sends `GET /media/recipes/photo.jpg` to Nginx. Nginx matches `/media/` to its `/srv/django/media/` folder, reads the image file and sends its contents to the browser. The browser can now display the photo beside the recipe information fetched in section 1.

**On this installation**, Docker names the volume `transcendence_aggregate_django_media` and reports its storage folder as `/var/lib/docker/volumes/transcendence_aggregate_django_media/_data/`. The example file would therefore be at `/var/lib/docker/volumes/transcendence_aggregate_django_media/_data/recipes/photo.jpg` on the Docker host. Another computer's Docker storage location can differ.

The project folder also contains `data/shared-database/photos/`. Those are photo copies created when exporting shared project data for partners. Their generated filenames are mapped in `data/shared-database/manifest.json`; the live website reads its images through the Docker volume described above.

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

## 4. Approval and deletion: how the saved state controls access

Saving a submission does not make it public immediately. Django initially marks it pending approval, so the owner and staff can inspect it while ordinary visitors cannot see it.

1. Staff open the submission and inspect its contents. Clicking Approve sends `POST /api/recipes/60/approve/` with their login token and the version they inspected. Nginx forwards the request to Django, which checks staff permission and that the contents still match that version.
2. If those checks pass, Django marks the recipe approved and returns the saved result through Nginx. Later requests for public recipe lists can include it, and ordinary visitors can open its page.
3. If staff reject it instead, their request includes a reason. Django saves the rejection and reason. The owner can then read that reason, correct the recipe and submit it for approval again.
4. When an ordinary owner edits a recipe's contents, the browser sends the changes to Django using `PUT`, meaning update, at `/api/recipes/60/`. After checking ownership and the loaded version, Django saves the contents and returns the recipe to pending approval. Staff content edits normally preserve its existing approval state.
5. If the owner requests deletion, the browser uses `DELETE /api/recipes/60/`. Django records a deletion request and returns status **202**, meaning the request was accepted for later action. An approved recipe can stay public while staff decide. When staff approve removal, Django deletes it and returns **204**, meaning success with no response data.

Django checks these permissions on the request itself. Hiding a button in React helps show appropriate controls, but changing those controls cannot give a user staff permission or ownership. Managing accounts and granting permissions is a separate administration action.

**Files and functions to check**

- [views.py → _recipe_detail](backend/recipes/views.py#L530).
- [views.py → _recipe_edit_or_delete](backend/recipes/views.py#L333).
- [recipe_approve](backend/recipes/views.py#L184) and [recipe_reject](backend/recipes/views.py#L233).
- [users/admin.py](backend/users/admin.py).

## 5. Two people edit: how the newer save is protected

Opening an edit form loads both the recipe contents and a version number. Suppose a user and a staff member each load version **3**. The staff member saves a changed instruction first, so the database now contains version **4**. The user's open form still holds the older contents and version 3.

1. When the user submits that form, the browser sends the edits and version 3 in `PUT /api/recipes/60/`. Nginx passes the request to Django.
2. Django locks that recipe's database record while checking and saving. If another request is currently changing the same record, this request waits for it to finish before checking the latest saved state.
3. After checking permission, Django compares the submitted version 3 with the saved version 4. Because they differ, Django leaves the saved contents unchanged and returns status **409**, meaning the request conflicts with newer data.
4. Nginx returns that response to the browser. React displays the conflict message and requires the user to reload the current recipe before trying another edit.

If the versions match, Django can save the changes and increase the version before releasing the lock. The lock keeps simultaneous saves from both passing the check against the same old state; the version number also catches an old form submitted much later.

Staff approval and rejection requests carry the inspected version too, so a decision about old contents cannot silently apply to newer contents. Adding a review or favorite does not change the recipe's content version because it does not edit the recipe itself.

**Files and functions to check**

- [views.py → _recipe_edit_or_delete](backend/recipes/views.py#L333) and [recipe_approve](backend/recipes/views.py#L184).
- In those functions, find `content_revision` for the version comparison, `select_for_update()` for waiting, and `transaction.atomic()` for keeping the operation together.

## 6. Reviews and favorites: saving a change and seeing it elsewhere

When a signed-in user posts a review, the browser sends the comment and a grade from **1 to 5** in `POST /api/recipes/60/`. Nginx forwards it to Django. Django identifies the user from the token, checks that the recipe is still approved and saves a review connecting that user to that recipe.

After Django confirms creation, the browser requests the recipe details again. Django reads the saved reviews and calculates their count and average, then returns the updated result. React confirms that the new review appears and displays it with the updated figures. For example, grades **4** and **5** give **(4 + 5) / 2 = 4.5**. With no reviews, the recipe response gives a count and average of zero.

A favorite saves a different connection. Clicking the favorite control sends `PUT /api/me/favorites/60/` with the login token. Django uses that token to select the current user's profile, adds the link to recipe 60 and returns that profile's updated favorite IDs. React uses the reply to show the saved state. Removing the favorite uses `DELETE` at the same address. Each request changes the identified user's collection.

Another person's open recipe page will not receive these changes automatically from Django. Instead, the page periodically sends new read requests through Nginx to Django. Each refresh gets the latest saved data, and React updates the visible review count and other relevant values. The next refresh starts five seconds after the previous one finishes; returning focus to the page also triggers a refresh, while hidden pages pause these requests.

**Files and functions to check**

- [views.py → _recipe_review](backend/recipes/views.py#L499).
- [serializers.py → RecipeReviewStatisticsMixin](backend/recipes/serializers.py#L102).
- [users/views.py → user_favorite](backend/users/views.py#L150).
- [useLiveRefresh.js](frontend/src/hooks/useLiveRefresh.js#L5).

## 7. Search: from downloaded recipes to the selected results page

Suppose the user wants vegetarian recipes containing “chickpea,” with an average rating of at least three stars. The search screen needs the approved recipe collection before it can apply those choices.

1. The browser sends `GET /api/recipes/all_recipes/` to Nginx. Nginx forwards it to Django, which reads approved recipe summaries from the database and returns them as JSON.
2. React keeps that returned collection in the browser. It reads the user's search choices and keeps recipes satisfying **all** of them: the selected category, an ingredient containing the text and the minimum average rating.
3. React sorts all the matching recipes using the selected order, such as highest rating first. Only then does it choose the displayed page, such as the first six results, and draw their cards.
4. Changing a filter updates the choices in the page address and returns to page 1. Reloading or using browser Back lets React read those saved choices from the address and apply them again.

In this feature, filtering happens in the browser after the collection is downloaded. Each filter change does not ask Django to run a matching database search. Filtering and sorting the whole collection before choosing a page ensures that matches outside the previously displayed page are included.

**Files and functions to check**

- [recipeSearch.js → searchRecipes](frontend/src/data/recipeSearch.js#L81), then [paginateRecipeResults](frontend/src/data/recipeSearch.js#L122).
- [SearchResultsPage.jsx](frontend/src/pages/SearchResultsPage.jsx).

## 8. The Public API Tester: a second program calls the site

The recipe website uses its API for its own pages. The separate **Public API Tester** demonstrates another program reading or changing recipes through the public API. The tester has its own browser page and its own Python server.

1. The user connects an **API key**, a secret granting access for an account, in the tester. When they click a tester action, its browser page sends a request to the tester's server.
2. For example, to read its tracked recipe 60, the tester server sends `GET /api/public/v1/recipes/60/` to the recipe website over HTTPS. It adds the API key in the request headers so Django can identify the account.
3. The request reaches the website's Nginx, which forwards the public API path to Django. Django checks that the key is valid, enabled, unexpired and belongs to an active account.
4. Django then checks the account's allowance of **60 requests per 60 seconds**, shared across its keys. If exhausted, it returns status **429**, meaning too many requests, with a waiting time. Nginx also has a separate limit on rapid public API traffic from the same client address.
5. If the request can proceed, Django checks the key's permission and the account's recipe access. A change requires a key allowed to write as well as the normal ownership or staff permission. A valid key alone does not let an ordinary user edit someone else's recipe.
6. Django performs the allowed action and returns its response through Nginx to the tester server. The tester server sends the result to its own browser page, which displays the outcome.

The API key can expire or be disabled independently of the website login token from section 2. Both identify an account, but they are checked as separate credentials for their respective APIs.

**Files and functions to check**

- [authentication.py → PublicAPIKeyAuthentication](backend/public_api/authentication.py#L35) and [consume_public_api_quota](backend/public_api/authentication.py#L19).
- [permissions.py → PublicAPIKeyPermission](backend/public_api/permissions.py#L6).
- [Public API Tester server → outgoing API request](demos/public-api-tester/server.py#L216) and [public API addresses](backend/public_api/urls.py#L8).

## 9. Recipe files: export, check and import

**Export** turns selected recipes into a downloadable file. **Import** reads a file to create new recipe copies. Our JSON format keeps named fields and lists; CSV arranges the records into rows. Both formats include the image contents encoded as text, so the file carries the photos too.

1. To export, the browser sends selected recipe IDs and the chosen format in `POST /api/me/recipe-data/export/`, with the login token. Nginx forwards it to Django. Django checks that the recipes belong to the user, reads their connected records and photos, and returns the requested file. The browser saves that response as the download.
2. To import, the user first chooses a file for checking. The browser sends it to `/api/me/recipe-data/validate/` using `POST`. Django checks the whole file and its photos, then returns a preview and a **fingerprint**, a value calculated from the file's contents.
3. When the user confirms import, the browser sends that file, its fingerprint and a unique request ID to `/api/me/recipe-data/import/`. Django rechecks them, then saves the recipe copies and an import receipt together. The new recipes belong to the importing user and await staff approval. The original recipes remain unchanged.
4. Django returns the receipt, including the new recipe IDs, through Nginx. The page can now show which recipes were created.

The receipt also handles a lost connection. Django might finish saving before the browser receives its response. In that case, the browser can ask for the receipt using the request ID or retry the same import request and file. Django returns the existing result instead of creating those recipes twice.

Starting a new import uses a new request ID and deliberately creates another batch, even with the same file. The receipt ties retries to one particular attempted import.

**Files and functions to check**

- [transfer_views.py → RecipeExportView](backend/recipes/transfer_views.py#L57), [RecipeValidateView](backend/recipes/transfer_views.py#L109), [RecipeImportView](backend/recipes/transfer_views.py#L142) and [RecipeImportStatusView](backend/recipes/transfer_views.py#L203).
- [transfer_formats.py](backend/recipes/transfer_formats.py).

## 10. Analytics: from saved events to charts and a matching download

The Analytics page lets the user choose a date range, category, recipe title text and review grade. To turn those choices into charts, React sends them as parameters in `GET /api/analytics/`. Nginx forwards the request to Django, which checks that the choices are valid before calculating the results.

Django starts with recipes that are **currently approved** and match the category and title choices. It reads a consistent database snapshot, so the returned counts and charts describe the same saved state. It then separates recipe creation from review activity: a recipe created last month can receive a review today, so it contributes to today's review count without being counted as a recipe created today.

The date range limits each activity using its own date. Choosing one review grade narrows the review statistics, while the rating distribution still shows all five grades for comparison. That grade choice does not change the recipe counts.

Django sends the calculated counts, averages and grouped values back through Nginx as JSON. React reads the response and draws the charts. A later refresh requests another response and can show newly saved activity.

When the user downloads the report, the browser builds the file from the response currently displayed, including its filters and generation time. It does not make a separate request for a newly calculated report, so the downloaded figures match the visible charts.

**Files and functions to check**

- [analytics.py → read_filters](backend/recipes/analytics.py#L34) and [build_analytics](backend/recipes/analytics.py#L110).
- [AnalyticsPage.jsx](frontend/src/pages/AnalyticsPage.jsx#L229).
- [recipeAnalytics.js → createAnalyticsDownload](frontend/src/data/recipeAnalytics.js#L195).

## 11. Startup, status and recovery: how the running parts fit together

The startup script prepares the local HTTPS certificate and browser trust, starts PostgreSQL and prepares shared recipe records and photos while retaining local work. It builds and starts the website, API Tester and backup worker, then exports the current shared project data. **HTTPS** protects the connection between the browser and website; the local certificate lets the browser check the identity of this local site.

Once the services are running, the Status page can check whether Django and PostgreSQL respond. The browser sends `GET /api/health/` to Nginx, which forwards it to Django. Django runs a small real database query and waits for the result. It returns status **200** when the database answers correctly, or **503** when the database is unavailable. React reads that response to display the service state. This checks availability; it does not exercise every recipe feature.

The backup worker provides a recovery path if saved work is lost:

1. On its schedule, the worker reads the database records and the referenced image files from the shared media volume. In its container, that volume is available at `/media/`.
2. It writes a private backup and verifies it before marking it completed. The backup container writes under `/backups/`, connected to the project's `data/backups/` folder.
3. During a requested restore, the recovery tool verifies the backup, creates a separate recovery database, restores its records and installs the needed photos. It checks the recovered recipe count and returns the recovery database's name.
4. The website can then be deliberately switched to that database. Checking a restore therefore does not immediately switch the running website away from its current database.

The shared bundle under `data/shared-database/` carries project content to partners through Git. Private backups under `data/backups/` keep recovery data, including credentials, outside Git. Both records and photos must be preserved, because a database path pointing to a missing image cannot display that image.

**Files and functions to check**

- [docker-compose.yml](docker-compose.yml#L1) and [start.sh](scripts/start.sh).
- [health.py → health](backend/config/health.py#L15).
- [backups-worker.py → daemon](scripts/backups-worker.py#L720), [create_backup](scripts/backups-worker.py#L537) and [restore_backup](scripts/backups-worker.py#L655).
- [share-postgres.py → export_snapshot](scripts/share-postgres.py#L467).
- [StatusPage.jsx → request and display the health result](frontend/src/pages/StatusPage.jsx#L66).

## 12. Shared controls: from reusable page code to browser actions

A **component** is a reusable piece of a React page. For example, a recipe form and a login form can both use the shared button component, while passing it different labels and actions.

When React builds either page, that component produces an actual button in the browser. The shared styles give it the site's colors, spacing and focus appearance. Clicking it runs the action supplied by that page: the login button starts the login request in section 2, while the recipe button starts the submission flow in section 3. Correcting the shared button or its styles can therefore improve every page using it.

Before those pages reach a browser, Vite, the build tool, prepares the React JavaScript and styles as files Nginx can serve. Its configured browser targets guide which language features those files may use. Nginx sends those built files to Chrome, Firefox, Edge or another supported browser, which executes the page code and sends the applicable API requests.

A browser's own date picker or file chooser may look different, but the page must still read the selected value and send the correct request. The browser must also trust the local HTTPS certificate to reach the site successfully. Code compatibility and connection trust are separate requirements that meet when the user loads and uses the page.

**Files and functions to check**

- [Button.jsx](frontend/src/components/Button.jsx#L1), [Icon.jsx](frontend/src/components/Icon.jsx#L13) and [savour-system.css](frontend/src/styles/savour-system.css).
- [vite.config.js](frontend/vite.config.js#L10).
- [start.sh](scripts/start.sh).
