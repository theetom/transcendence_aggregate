# Evaluation code guide

Read these six parts in order. **Frontend** = browser pages. **Backend** = server code checking requests. **Database** = saved records. A **request** asks the server to read or change something.

## 1. Follow one click from the page to saved data

Open [AddRecipePage.jsx](frontend/src/pages/AddRecipePage.jsx), function `handleSubmit`, then [recipeApi.js](frontend/src/data/recipeApi.js), function `requestRecipeApi`.

The form at `/add-recipe` sends its fields/photos to `/api/recipes/add_recipe/`. [nginx.conf](frontend/nginx.conf) forwards `/api/` requests to Django. [config/urls.py](backend/config/urls.py) passes this address to [recipes/urls.py](backend/recipes/urls.py), which selects `recipe_intake` in [views.py](backend/recipes/views.py). It checks and saves the submission, then replies. The page shows success or an error.

## 2. Understand how the server knows who you are

Read [LoginPage.jsx](frontend/src/pages/LoginPage.jsx), then `WebsiteLoginView`, `sign_up` and `logout` in [users/views.py](backend/users/views.py).

Signup saves a protected password-check value. Login returns a **token**: a secret identifying later requests. The browser keeps it for the tab's session; `requestRecipeApi` sends it. The server identifies the account as `request.user`. Logout removes the server token. An account ID alone cannot identify you securely.

## 3. Understand what gets saved, and why checks happen twice

Read [recipes/models.py](backend/recipes/models.py), then `RecipeDetailedSerializer` in [serializers.py](backend/recipes/serializers.py) and `_recipe_intake` in [views.py](backend/recipes/views.py).

Models describe saved records and their links. `Ingredient` stores “Rice”; `RecipeIngredient` connects it to a recipe with an amount, such as 100 g. Another recipe can use rice with a different amount.

The server checks fields/photos again because requests can bypass our form. It chooses the owner from `request.user`. Related database changes finish together or are undone together on failure; new photos are cleaned up too.

## 4. Explain who may change a recipe

In [recipes/views.py](backend/recipes/views.py), read `recipe_list`, `_recipe_detail`, `_recipe_edit_or_delete`, `recipe_approve` and `recipe_reject`.

Visitors see approved recipes; owners manage their submissions; staff moderate. New recipes and ordinary-owner edits need approval. Rejected recipes can be corrected and resubmitted. Owner deletion asks staff to remove the recipe. The server enforces these rules even if someone changes the page. Account administration is separate: [users/admin.py](backend/users/admin.py).

## 5. Explain what happens when two people save at once

Read the `content_revision` check and `select_for_update()` in `_recipe_edit_or_delete` and `recipe_approve`, in [recipes/views.py](backend/recipes/views.py).

Saving increases the recipe's version number. If a form sends an older version, the server rejects it with **409** and asks for a reload. While saving, other changes to that recipe wait. These two protections prevent old or overlapping saves from overwriting newer work.

## 6. Explain reviews, favorites and automatic updates

Read `_recipe_review` in [recipes/views.py](backend/recipes/views.py), `RecipeReviewStatisticsMixin` in [serializers.py](backend/recipes/serializers.py), `user_favorite` in [users/views.py](backend/users/views.py), and [useLiveRefresh.js](frontend/src/hooks/useLiveRefresh.js).

A review links a user to an approved recipe, with a grade of 1–5. Average = sum of grades ÷ count; empty lists return 0. Favorites belong to that user's profile. Visible pages request fresh data five seconds after the previous request finishes and when focus returns. That is how other people's changes appear.

## Other module logic: know the main idea

| Part | Start here | Be able to explain |
| --- | --- | --- |
| Shared design | [components/](frontend/src/components/) and [index.css](frontend/src/index.css) | Pages reuse buttons, cards and common colors instead of each building a separate design. |
| Search | `searchRecipes` and `paginateRecipeResults` in [recipeSearch.js](frontend/src/data/recipeSearch.js) | The browser filters approved recipes, sorts the matches, then takes the requested page. |
| Public API | [authentication.py](backend/public_api/authentication.py) and [permissions.py](backend/public_api/permissions.py) | Outside programs use a separate API key. The server checks the key, account permissions and request allowance. |
| Recipe files | [transfer_views.py](backend/recipes/transfer_views.py) | Downloads contain recipe contents/photos. Imports are checked before saving as new pending copies; a saved import receipt prevents the same request creating duplicates on retry. |
| Analytics | `build_analytics` in [analytics.py](backend/recipes/analytics.py) | Date/category/title/star choices select data to count and average. Charts and exports use those results; creation dates and review dates are different events. |
| Startup, status and backups | [start.sh](scripts/start.sh), [health.py](backend/config/health.py), [backups-worker.py](scripts/backups-worker.py) | Startup runs the services; health checks whether the database answers; scheduled backups save database/photos for recovery. Shared Git data and private backups serve different purposes. |
| Firefox and Edge | [vite.config.js](frontend/vite.config.js) and the [browser guide](README.md#browser-support-guide) | Build settings choose supported browsers; actual browser behavior also depends on page code and local HTTPS trust. |

For any function, answer: **What comes in? What gets checked? What changes? What comes back?** Follow `urls.py`; old quoted examples at the bottom of `recipes/views.py` are inactive.
