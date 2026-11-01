# Understanding the project for evaluation

This guide follows ordinary actions on our recipe website. Read the situation and explanation first, then open the named functions and follow the same steps in code. The questions help you practise explaining the reason behind the code.

## First, understand what the website is handling

Ana and Marco are ordinary users in our examples. The existing `admin` reviews recipes; `superadmin` can manage accounts and their permissions.

A **recipe** contains a name, ingredient amounts, ordered instructions, photos, its author and its approval state. For example, Ana's chicken recipe might contain 600 g of potatoes, four instructions and one photo. A **review** adds somebody's written opinion and a score from 1 to 5. A **favorite** bookmarks a recipe in one person's saved collection.

Three parts cooperate:

- **The browser page**, called the frontend, shows information and collects what someone types. React builds these pages from reusable pieces.
- **The server code**, called the backend, receives messages, checks the rules and reads or saves information. Django organizes this work.
- **The database**, PostgreSQL, keeps saved records after a page closes. Each record has an **ID**, a number used to identify and connect it to other records.

A **function** is a named piece of code doing a particular job. The names below tell you which part of a file to read. Open the file link, then use **Ctrl+F** to find that name.

## 1. Marco opens a recipe: how does information reach the page?

Marco visits `/recipe/60`. This address chooses the recipe page, but the page still needs the recipe's actual name, ingredients and photos.

1. On the first visit, Nginx delivers the page files. [App.jsx](frontend/src/App.jsx) then chooses `RecipePage` for that address.
2. The page calls `getRecipeDetails(60)`, which asks the server for `/api/recipes/60/`. This is a separate address for the recipe's data.
3. Nginx, the website's entry point, forwards this `/api/` message to Django.
4. Django finds the recipe, checks whether Marco may see it, and returns its fields. React uses those fields to display the recipe.

A shortened reply might look like this:

```json
{"id": 60, "title": "Lemon and Herb Roast Chicken", "approved": true}
```

This is **JSON**, text containing names and their values. Here, `true` means yes. The browser receives these facts and uses them to build the visible page.

Django chooses the handling function through two address lists: [config/urls.py](backend/config/urls.py) recognizes `api/` and delegates recipe addresses to [recipes/urls.py](backend/recipes/urls.py). Its `recipes/<int:recipe_id>/` entry selects `recipe_detail`, with `60` as `recipe_id`. Splitting the lists keeps recipe addresses with recipe code.

**Look at:** [RecipePage.jsx](frontend/src/pages/RecipePage.jsx), `getRecipeDetails` in [recipeApi.js](frontend/src/data/recipeApi.js), and `_recipe_detail` in [recipes/views.py](backend/recipes/views.py). Forwarding is in [nginx.conf](frontend/nginx.conf).

**Practise:** Why are `/recipe/60` and `/api/recipes/60/` different? One selects the page; the other supplies its data.

## 2. Ana signs in: how does a later request belong to her?

Typing Ana's name into a form cannot prove somebody is Ana. Login first checks her username/email and password.

Signup checks the account details and matching passwords. Django stores a **password hash**: a one-way calculated value used to check a password without saving its readable text. Login checks the supplied password and returns a **token**, a secret identifying the account on later website requests.

The browser keeps this token in its tab's storage. `requestRecipeApi` attaches it when asking the server to save a recipe, favorite or review. Django then identifies the account as `request.user`. The server uses that identity as the recipe author; it does not trust an author ID supplied by the page. Logout deletes the server token, stopping its further use.

**Look at:** `handleSubmit` in [LoginPage.jsx](frontend/src/pages/LoginPage.jsx); `SignupSerializer` in [users/serializers.py](backend/users/serializers.py); `WebsiteLoginView`, `sign_up` and `logout` in [users/views.py](backend/users/views.py).

**Practise:** Why is knowing Ana's account ID insufficient? The request must carry valid proof of her signed-in identity.

## 3. Ana submits a recipe: what is saved, and what can go wrong?

Ana enters ingredients and steps, selects a photo and clicks **Add recipe**. The page collects these values and sends them to `/api/recipes/add_recipe/`.

The form checks easy mistakes before sending. The server checks again because somebody can send messages directly, bypassing our form. It checks positive ingredient amounts, required fields, duplicate names, step numbers and the actual photo contents and size.

A recipe uses several connected records. `Ingredient` stores the name “Potatoes.” `RecipeIngredient` connects potatoes to Ana's recipe with **600 g**. Another recipe can use the same ingredient with **300 g**. Steps and photo records also point to their recipe. This is how we reuse information while keeping each recipe's quantities separate.

Django models describe these records. The **ORM** is Django's way of working with them as Python objects instead of manually writing every database instruction.

Saving these connected records is grouped into a **transaction**: either the database changes finish together, or they are undone on failure. Photos need extra care: their actual bytes are stored as files, while the database stores their locations. Failed creation also cleans up newly written photo files.

**Look at:** `handleSubmit` in [AddRecipePage.jsx](frontend/src/pages/AddRecipePage.jsx); `_recipe_intake` in [views.py](backend/recipes/views.py); `RecipeDetailedSerializer.create` in [serializers.py](backend/recipes/serializers.py); record definitions in [models.py](backend/recipes/models.py).

**Practise:** What if saving the steps fails? We should not leave a half-created recipe saved as if everything succeeded.

## 4. The admin reviews Ana's submission: who may do what?

Submitting saves the recipe as **pending approval**. Ana and staff can see it; unrelated ordinary users cannot. Staff approve it for public display or reject it with a reason. Ana can correct a rejected recipe and resubmit it.

The server checks the signed-in user's rights for every action. For editing, the central condition rejects someone who is **neither staff nor the owner**. Hiding an Edit button helps the interface, but the server check provides the protection.

An ordinary owner's content edit sends the recipe back for approval. A staff edit normally preserves its approval state. An owner's deletion action requests removal; staff make the final decision. An approved recipe can remain public while that deletion request waits.

Website staff and full account administration are separate. `admin` handles recipe moderation; `superadmin` can create users and grant or remove account permissions through Django administration.

**Look at:** `_recipe_detail`, `_recipe_edit_or_delete`, `recipe_approve` and `recipe_reject` in [recipes/views.py](backend/recipes/views.py); account administration in [users/admin.py](backend/users/admin.py).

**Practise:** Could Marco edit Ana's recipe by changing the page's buttons? The server still checks his identity and ownership.

## 5. Ana and the admin edit the same recipe: whose change wins?

Both open version **3** of Ana's recipe. The admin changes an instruction and saves, producing version **4**. Ana's older form still sends version **3**.

The server compares the submitted `content_revision` with the saved version. Because they differ, it refuses Ana's old save with **409**, a response meaning there is a conflict, and asks her to reload. It does not silently overwrite the admin's newer instruction.

There is a second protection: `select_for_update()` makes other changes to that recipe wait while one change is being saved. This keeps the version comparison and save together. Waiting handles overlapping writes; version checking catches an old form even much later. Content edits increase this version; posting a review or saving a favorite does not.

**Look at:** the `content_revision`, `select_for_update()` and `transaction.atomic()` parts of `_recipe_edit_or_delete` and `recipe_approve` in [recipes/views.py](backend/recipes/views.py).

**Practise:** Why use both protections? A form can become outdated even when two saves do not happen at exactly the same moment.

## 6. Marco reviews and favorites the recipe: what changes for whom?

A review saves Marco's identity, the approved recipe, his comment and a grade from **1–5**. If its two reviews have grades **4** and **5**, the average is **(4 + 5) / 2 = 4.5**. With no reviews, the code returns zero instead of dividing by zero. Deleting a review changes the saved count and average too.

A favorite is a connection between Marco's profile and the recipe. It appears in Marco's saved collection, not everybody's. The server chooses the profile from the signed-in user.

Ana's open page sees these changes by repeatedly asking for fresh data: five seconds after the previous request finishes, and when focus returns. Hidden pages pause. The update is a fresh read of saved information, not an instant message pushed into every browser.

**Look at:** `_recipe_review` in [recipes/views.py](backend/recipes/views.py), `RecipeReviewStatisticsMixin` in [serializers.py](backend/recipes/serializers.py), `user_favorite` in [users/views.py](backend/users/views.py), and [useLiveRefresh.js](frontend/src/hooks/useLiveRefresh.js).

**Practise:** Why doesn't Marco's favorite appear in Ana's saved recipes? Their profiles hold separate connections.

## 7. Ana searches for dinner: why filter, sort, then split into pages?

Ana asks for vegetarian recipes containing chickpeas, rated at least three stars. The code starts with approved recipes and keeps only those satisfying all selected choices. It then sorts the matches—for example, highest rating first—and takes the requested page of results.

This order matters. Filtering only one page could show no matches even though matching recipes exist on another page. Our filtering happens in the browser over the downloaded approved collection. Applied choices are saved in the page address so reloading or browser Back can restore them.

**Look at:** `searchRecipes` and `paginateRecipeResults` in [recipeSearch.js](frontend/src/data/recipeSearch.js); [SearchResultsPage.jsx](frontend/src/pages/SearchResultsPage.jsx) connects them to the controls.

**Practise:** Why does applying a new filter return to page 1? The old page number may not exist in the smaller result set.

## 8. Another program uses our recipes: what is the public API?

An **API** is a set of addresses programs can call to read or change information. Our separate Public API Tester is an example: its buttons ask Recipe Site to create, read, edit or delete a recipe.

It sends a separate **API key**, identifying the account allowed to make the request. The server checks that the key is valid, enabled, unexpired and belongs to an active account. Normal ownership/staff rules still apply: a key does not make Marco an administrator.

An account may make **60 requests in a 60-second window**. Exceeding that allowance returns **429** with a waiting time. The allowance belongs to the account, so obtaining another key does not reset it. This key and its expiry are separate from the website login token.

**Look at:** `PublicAPIKeyAuthentication` and `consume_public_api_quota` in [authentication.py](backend/public_api/authentication.py); `PublicAPIKeyPermission` in [permissions.py](backend/public_api/permissions.py).

**Practise:** Why have a separate key? An outside program can be given access that can expire or be disabled independently of website login.

## 9. Ana moves recipes using a file: how do import and export work?

**Export** turns selected saved recipes into a downloadable file. JSON preserves named fields and lists; CSV arranges recipes into rows. The website's portable files include photos. **Import** reads one of these files and creates new recipe copies owned by the importing user, pending approval.

The server checks the whole batch before saving it together. It does not overwrite the original recipes.

Suppose the save succeeds but Ana loses her connection before receiving the reply. A saved **receipt** identifies her request and file. Retrying that same request returns its existing result instead of creating the batch twice. Starting a new import deliberately creates another batch, even with the same file.

**Look at:** `RecipeExportView`, `RecipeValidateView` and `RecipeImportView` in [transfer_views.py](backend/recipes/transfer_views.py); file reading/writing in [transfer_formats.py](backend/recipes/transfer_formats.py).

**Practise:** Why remember a successful import? A missing reply does not necessarily mean nothing was saved.

## 10. Ana opens Analytics: where do the chart numbers come from?

The dashboard summarizes saved recipes and reviews into counts, averages and charts. Consider a recipe created last month that receives a review today: it adds to **today's reviews**, not **today's recipes created**. Those are different events with different dates.

The server selects currently approved recipes matching the category/title choices, then counts creation and review activity within the chosen dates. Selecting five-star reviews narrows review statistics; the ratings distribution deliberately keeps all grades visible for comparison.

The browser draws the returned results. CSV/JSON exports contain the displayed set of results, with its filters and generation time, so the downloaded report describes what was shown. Regular refresh brings in later relevant changes.

**Look at:** `read_filters` and `build_analytics` in [analytics.py](backend/recipes/analytics.py); chart display in [AnalyticsPage.jsx](frontend/src/pages/AnalyticsPage.jsx); downloads in [recipeAnalytics.js](frontend/src/data/recipeAnalytics.js).

**Practise:** Why might an older recipe affect today's chart? Its review date can be today even though its creation date is older.

## 11. The team starts the site or recovers lost work: what runs?

The website needs several running parts: the database, server, page-serving software, API Tester and backup worker. Docker runs each part in its own packaged environment; [docker-compose.yml](docker-compose.yml) describes them. [start.sh](scripts/start.sh) starts these parts, loads shared project data and exports the current shared bundle.

Startup also prepares **HTTPS**, which protects messages travelling between the browser and website. The browser must trust our local certificate, the file identifying the site, to trust that connection.

The Status page asks the server to perform a small real database query. It tells us whether the database answers; it does not run every recipe feature.

A **backup** is a private recovery copy of the database and its photos. The worker takes and verifies consistent copies on a schedule. Restoring one creates a **separate database**. Selecting that restored database for the website is another action, so checking a recovery does not immediately replace current work.

Shared Git data delivers project content to partners. Private backups protect recovery data and include credentials, so they stay outside Git.

**Look at:** `health` in [health.py](backend/config/health.py); `daemon`, `create_backup` and `restore_backup` in [backups-worker.py](scripts/backups-worker.py); `export_snapshot` in [share-postgres.py](scripts/share-postgres.py).

**Practise:** Why save photos as well as database records? A saved photo location is useless if the actual image file is lost.

## 12. Pages share a design and work in different browsers: how?

A **component** is a reusable piece of a page. For example, several screens use our `Button`; each screen supplies its label and action. Shared colors, spacing and icons keep those pieces consistent, so one common correction can improve several pages.

Firefox and Edge run the same page code, but may draw their own date picker or file chooser differently. What matters is that the selected value and action remain correct. Before deployment, Vite prepares browser-ready files from our page code; its build settings select the browser features those files may use. Local HTTPS trust lets each browser open the site securely.

**Look at:** [Button.jsx](frontend/src/components/Button.jsx), [Icon.jsx](frontend/src/components/Icon.jsx), shared rules in [savour-system.css](frontend/src/styles/savour-system.css), browser targets in [vite.config.js](frontend/vite.config.js), and trust setup in [start.sh](scripts/start.sh).

**Practise:** Why reuse a button? Shared behavior and appearance can be maintained in one place instead of being copied across pages.

## How to use this when preparing questions

Pick a scenario and follow its named functions. Explain **what the person wants, what information arrives, what gets checked, what is saved, and what the person sees afterward**. Then ask what happens with invalid input, the wrong account or an old copy of the data.

Follow the active functions named in `urls.py`. The old quoted examples at the bottom of `recipes/views.py` are inactive.
