# Work Log

This file is the running log for work done in this repository.

## Current branch instructions — September 20, 2026

- The current user instructions supersede older mock-data, preview-auth, and URL-identifier planning notes below.
- Preserve the existing display/CSS while connecting to the partner backend. No frontend mock records, generated URL identifiers, client-side substitutes for backend features, or simulated successful actions.
- Display actual HTTP responses for failures, including Django HTML error pages and every JSON validation field. Do not replace them with frontend-written unavailable notices.
- At the user's explicit request, unsupported pages now issue requests too: profile uses `/api/me/`; category and search use their frontend paths under `/api/`; admin uses `/api/admin/`. These are requests to unimplemented URLs, not new or verified backend contracts. Django determines their responses. No backend routes were added.
- Recipe sections also request image, author, favourites and related-data URLs and display their returned responses; those URLs are unimplemented in the current backend.
- Successful signup redirects to `/login` and does not save the token returned by signup. Only successful login stores an authentication token; login redirects to `/`.
- Do not guess the recipe author's ID, ask the user to supply it, or search the public users list to compensate for a missing current-user endpoint. Submit the form to the actual intake endpoint and display its validation response.
- Removed static profile dashboards, unsupported search/moderation scaffolding and the manual recipe-author ID input. Restored the Profile button to reach the real `/api/me/` request.
- Verification at the end of frontend conversion: production build and ESLint passed; HTTP error-preservation checks passed before their test file was removed at the user's request. Do not restore that test file or add permanent testing infrastructure without a request.
- Do not modify backend source or Docker configuration. The attempted Compose startup change was undone; the backend was restarted with the original configuration. No complete database reset was performed.
- The user explicitly requested deletion of one newly registered account. Deleted only `rohrohroh` (ID 3), its profile and auth token from the running database; verified no recipes or reviews belonged to it and that the seeded accounts remained. A pre-deletion backup exists at `/tmp/transcendence-db-backup.LaoVcG/db.sqlite3` (temporary storage).

## Session wrap-up — September 20, 2026

### Resume point
- Slug-removal check for the partner report: no slug references remain in the application-owned frontend or backend source/configuration. Recipe links and requests use the exact backend title with URL encoding; category frontend routes use numeric IDs. Historical work-log entries still mention the previous implementation. Dependencies/build artifacts were excluded from this source scan.
- The user confirms login and signup are both working perfectly. Testing stopped there; do not claim recipe creation or the entire website has been tested successfully.
- Saved reminder: revisit the disputed `/api/recipes/add_recipe/` POST flow. The earlier message asked about creating the recipe, ingredient quantities/units, selected categories, ordered steps, authenticated author and uploaded images (A–F); the partner said that assessment was wrong. Latest user correction: test it first. Do not ask the partner for a working request or repeat the disputed missing-implementation claim in the report before testing.
- Source recheck in this local backend copy: the POST route exists and calls `RecipeDetailedSerializer.save()`. That serializer has no custom nested `create()`, steps are `read_only=True`, images are not serialized, and recipe intake does not pass `request.user` into save. Older explicit recipe-creation code is inside a triple-quoted string and is not the routed handler. These are source findings in this copy, not a completed runtime test of the partner's latest implementation.
- Next testing item: add-recipe, against the existing backend as it is. Show its real responses; do not implement backend fixes or frontend substitutes.
- Required partner follow-up: implement authenticated `GET /api/me/` so the frontend can display the signed-in user's profile. `GET /api/users/` is a profiles list and must not be used as a substitute.
- Checked `backend/config/urls.py`, `backend/users/urls.py`, and the user views: no website logout API is implemented. Request a logout endpoint that invalidates the current token; the frontend will also need to clear its saved token when logout succeeds. `/api/logout/` is a proposed path, not an existing route.
- Keep registration and login separate: signup creates the account, then the frontend navigates to login without saving the signup token. Successful login saves the returned token and navigates home.

### Next-session breakpoint: test add-recipe

1. Resume on `frontend-backend_connection_test`; login/signup are confirmed working. Use the current backend/Docker setup without changing either.
2. Open the add-recipe form while logged in. Check the actual `GET /api/recipes/add_recipe/` response and confirm the returned category/ingredient options reach the form.
3. Submit a clearly identifiable test recipe through the actual frontend. Record the outgoing request body, HTTP status and full response before drawing conclusions. The current form sends title, ingredients with quantity/unit, categories as name objects, ordered steps and an empty reviews list, with the login token in the Authorization header. It does not supply a guessed user ID.
4. Verify A–F against persisted data if creation succeeds: recipe record; ingredient amounts/units; category connections; step ordering; authenticated author; uploaded images. Do not equate a success response with every part being saved.
5. Distinguish frontend limitations from backend behavior. The current picture input is disabled and no images are submitted, so the normal form cannot establish whether backend image upload works. A rejection at an earlier validation step also does not prove later creation stages work or fail.
6. Compare observed failures with the backend code and separate a frontend request mismatch from a backend implementation gap. Preserve actual errors; add no substitute logic and make no backend/Docker edits.
7. Only after testing, prepare a partner update with the exact request/response and verified findings. Until then, report only that add-recipe testing is pending.

Category clarification: numeric IDs are implemented only in frontend links/routes (`/category/:id`) using IDs returned by the options API. The frontend's `/api/category/<id>/` request does not correspond to an implemented backend endpoint; it displays the actual response. Do not report category browsing as implemented or working.

### Partner report draft

Teammate Report (September 20, 2026)

- Connected the frontend to the current backend API and removed the mock-data and development-login paths.
- Pages display the server's actual HTTP responses/errors for testing.
- Changed signup to require a separate login; it no longer signs users in automatically or redirects them to the profile page.
- Testing stopped at login/signup. Add-recipe testing is next.
- Please implement `/api/me/` for the authenticated user's profile; the existing users-list endpoint does not cover that behavior.
- No website logout API is currently implemented. Please add token invalidation for logout and confirm the endpoint path with the frontend.
- Current status: frontend integration in progress; profile/logout backend endpoints needed; add-recipe testing pending.

## Project Snapshot

- Repository: `42_ft_transcendence`
- Stack: Django, Django REST Framework, PostgreSQL, React, Vite, Tailwind CSS, Nginx, Docker Compose
- Main directories:
  - `backend/` for Django app and API
  - `frontend/` for React app
  - `nginx/` for reverse proxy and HTTPS configuration
- Current routing model:
  - Nginx serves the built frontend and proxies `/api/` to Django
  - React Router handles frontend pages like `/signup`, `/login`, `/home`, `/privacy`, and `/terms`

## Log Format

Use this structure for future entries:

```md
## YYYY-MM-DD

### Task
- Short description of the requested work

### Actions
- Concrete actions taken

### Notes
- Important findings, blockers, or decisions
```

## Teammate Report Format

Use this structure for teammate-facing reports, including reports saved in `WORK_LOG.md`:

```md
Teammate Report (Month DD, YYYY)

- Short bullet describing a concrete change.
- Short bullet describing another concrete change.
- Current status: short state summary such as frontend-only, backend pending, or blocked.
```

Keep the bullets concise and concrete, and end each report with a `Current status:` line.

## Explanation Protocol

Use this protocol whenever the user asks for a code explanation, logic walkthrough, or architecture explanation in this repository.

- Explain line by line when the user asks for code flow or syntax explanation.
- Define jargon in simple language before using it heavily.
- Explain each item in this order:
  - what it is
  - why it exists
  - how it works
  - how it connects to the next part
- Do not only narrate behavior. Explain the mechanism.
- Do not assume the user knows terms like:
  - WSGI
  - ASGI
  - CORS
  - CSRF
  - REST framework
  - class-based view
  - middleware
  - proxy
  - origin
  - cookie
  - session
- When explaining routing, spell out the exact flow:
  - what URL the browser requested
  - what Nginx does with that URL
  - what Django file receives it first
  - how Django matches the path
  - why the path may be split across multiple `urls.py` files
  - which view function or class handles it next
- When explaining a split routing setup such as `config/urls.py` and `users/urls.py`, explain why the project divides responsibilities instead of placing every route in one file.
- When explaining syntax like `.as_view()`, explain:
  - what object exists before `.as_view()`
  - why Django cannot use the class directly as the final request handler
  - what `.as_view()` returns
  - how the returned callable leads Django to `get()` or `post()`
- Avoid vague phrases like "eventually Django runs ..." unless the call chain has already been explained step by step.
- Tie backend explanations to the frontend and Nginx when relevant, so the user can see the full request-response path.
- Prefer concrete examples using the actual paths in this repository, such as `/api/users/login/`.
- If a configuration file uses values from `.env`, explain exactly how the value is loaded and where that loading happens in code.
- If the user sounds unfamiliar with the topic, write as if teaching from zero knowledge and reduce jargon aggressively.
- Do not compress the explanation into a short summary if the user asked for a detailed walkthrough.
- When explaining code logic in the terminal, lay out the code lines themselves in the explanation, not only file names or line numbers.
- If the user asks where the frontend sends API calls, include the actual frontend code that performs the request and explain it step by step.
- When a multi-chunk explanation is in progress, save the chunk breakdown in the work log if the user wants to continue later.
- Unless the user explicitly says otherwise, explain code logic as if the user has no background knowledge at all, including basic syntax and foundational programming concepts.

## Session Start Rule

- At the start of every future Codex session in this repository, read `WORK_LOG.md` before suggesting or applying changes.

## Frontend Styling Rule

- Do not add additional or extra styling unless the user explicitly asks for it.
- When the user asks for structure only, keep the frontend plain and close to the existing header/footer style.
- Use the same straightforward font direction as the existing header/footer unless the user asks for a different one.

## 2026-08-26

### Task
- Save the user's standing rule for future frontend styling and session startup behavior

### Actions
- Added a session-start instruction to read `WORK_LOG.md` at the beginning of future work in this repository
- Added a frontend styling rule to avoid extra styling unless the user explicitly requests it
- Recorded that plain structural frontend work should stay aligned with the existing header/footer style and font direction

### Notes
- Frontend structure should default to plain layout work, not visual design expansion, unless the user asks for styling

## 2026-08-26

### Task
- Record the user's current routing and URL-usage direction for later team discussion

### Actions
- Recorded that slug-based path identifiers should remain under strong consideration for single-item detail pages
- Recorded that query parameters should remain under strong consideration for search, filtering, sorting, pagination, and similar page-state controls
- Recorded that `id + slug` is not the preferred direction right now because it feels unnecessarily complex for the current stage

### Notes
- Current preference under discussion:
  - path identifiers such as slugs for one-item detail pages
  - query parameters for search and UI state
- This is a design consideration note, not a final backend contract

## 2026-08-26

### Task
- Save the user's teammate-facing routing report and note the follow-up report preference

### Actions
- Recorded the user's Teammate Report 1 text for August 26, 2026
- Recorded that a later Teammate Report 2 for the same day is expected and should be generated from the user's queue/instructions when requested

### Notes
- User-authored report text:
  - `Teammate Report 1 ( Auguest 26, 2026)`
  - `Worked on the frontend routing structure.`
  - `- React Router = the frontend routing system that decides which React page/component to show when the URL changes.`
  - `- URL identifier = the value inside the URL that tells the app which specific record to load, for example a slug or an id.`
  - `Difference between them:`
  - `- React Router chooses the page type.`
  - `- The URL identifier chooses the specific data for that page.`
  - `(e.g.`
  - `router is for which page in the whole site.`
  - `/login/, /admin/, /recipe/, etc.`
  - `Identifier is for which specific data within those respective pages.`
  - `/login/who/, /recipe/examplefood/, etc.)`
  - `used Reach Router + slug in my case.`
  - `Left untouched for later:`
  - `- The homepage recipe image/name boxes are still just clickable no-op buttons for now.`
  - `- Nothing is connected  to backend/database data yet.`
  - `- Real recipe-page redirection and real data loading are  for later development.`
- Future preference:
  - when the user later provides the queue for Teammate Report 2 on August 26, 2026, generate it in the same general reporting context unless the user asks for a different format

## 2026-08-30

### Task
- Save a teammate-facing report for the recent frontend profile/auth flow changes
- Record follow-up work still needed on the add-recipe page

### Actions
- Recorded a concise teammate report covering profile page creation/refinement, auth-route cleanup, footer behavior changes, temporary recipe-request storage removal, and auth-state testing
- Saved remaining add-recipe follow-up items as explicit notes for later implementation

### Notes
- Teammate Report (August 30, 2026)
- Built and refined the profile page flow, including the profile hero and the recipe, favourites, and pending-request sections.
- Updated the profile page text styling so the main profile title and profile box titles render black consistently.
- Removed the temporary frontend-only recipe request persistence and changed the profile/add-recipe messaging so it no longer implies database-backed saving exists yet.
- Hid `Connect` in the footer for authenticated state and redirected authenticated users away from `/connect`, `/login`, and `/signup` to `/profile`.
- Fixed the logged-in footer layout so the remaining footer buttons stay evenly distributed when `Connect` is hidden.
- Tested both `isAuthenticated = true` and `isAuthenticated = false` states to check footer links, connect-page access, and auth-gated navigation behavior.
- Restored the italic pending-request notice and fixed the CSS specificity issue that had kept one profile section title brown.
- Current status: frontend-only cleanup completed, backend/database integration still pending.
- Add-recipe page follow-up items still pending:
  - add safety and spam protections so the add-recipe flow is harder to abuse or troll
  - add picture-box notice text that clearly states a minimum of 2 and maximum of 6 pictures are required
  - add one more picture upload section in the picture box flow
  - continue fixing the add-recipe page after the database-backed submission path is ready

## 2026-09-18

### Task
- Resume the project after a two-week break and review the current frontend flow before examining a teammate's backend repository.

### Actions
- Confirmed the frontend production build succeeds.
- Reviewed the frontend route structure, shared header/footer behavior, temporary auth preview, placeholder recipe/category/search data, profile, recipe submission, and moderation flows.
- Confirmed that the current `frontend` branch is frontend-only: its working tree does not contain the Django backend, Nginx, or Docker Compose files, although the shared `main` Git history still contains a small Django user-auth API.
- Identified that the frontend currently makes no network/API requests. `frontend/src/data/siteData.js` is the temporary data source and future backend integration boundary.
- Identified current access-control gaps: `/add-recipe` is guarded by the frontend preview-auth check, while `/profile`, `/admin`, and `/admin/review/:slug` are not yet guarded; admin-role authorization is not implemented.
- Confirmed the newest local frontend commit is one commit ahead of `origin/frontend`.
- Confirmed `npm run lint` currently reports one React hook-rule error in `frontend/src/components/SiteHeader.jsx` because it synchronously calls `setMenuOpen(false)` inside an effect.

### Notes
- Resume point: frontend flow review is in progress. Next, explain the flow at complete-beginner level, beginning with the meaning and purpose of a URL slug.
- The user plans to bring their partner's backend repository only after this frontend review. Do not begin backend integration until that repository is available and its actual endpoints/data models have been reviewed together.
- User preference: explain frontend and backend flow as if teaching a complete beginner; do not provide only a compressed summary when they request a walkthrough.
- Session rule: read `WORK_LOG.md` at the start of every future repository session and use it to continue the active question/progress flow.

## 2026-09-18

### Task
- Inspect the partner repository at `/home/suroh/Documents/react_django_tryout` and explain its implemented backend before planning integration.

### Actions
- Inspected the repository read-only: its Git history, Django settings, URL configuration, models, serializers, and views for users, recipes, and reviews.
- Confirmed the partner has implemented Django data models for user profiles/favourites, recipes, categories, ingredients with per-recipe quantity/unit, ordered recipe steps, recipe images, and reviews with grades/comments/timestamps.
- Confirmed the partner has implemented read endpoints for the recipe landing page, all recipe summaries, a recipe detail selected by recipe title, a review detail selected by recipe title plus review ID, a registration endpoint that creates an auth token, and Django REST Framework's token-login endpoint.
- Attempted `python manage.py check`; it could not run because this local checkout's Python environment lacks the `rest_framework` package. No repository files were changed.

### Notes
- Partner endpoint route shapes currently use `recipe_name` (the exact title) rather than a slug. This differs from the frontend's current `/recipe/:slug` direction and must be agreed before integration.
- The partner recipe models currently have numeric database IDs but no slug field.
- Before integration planning, explain the partner implementation as beginner-level flow and distinguish working read paths from unfinished/problematic write paths. In particular, the current nested `RecipeDetailedSerializer` does not implement creation of nested ingredients/categories/steps, and its recipe POST path is not ready to accept the frontend add-recipe form as-is.
- The original repository's `main` Git history contains an earlier Django session-cookie authentication exercise. The user clarified that it was educational infrastructure only, not a backend previously built for this recipe website. Treat the partner repository as the first recipe-backend candidate. It uses DRF token authentication (`Authorization: Token <token>`), and the team must choose an authentication approach before wiring login/signup and protected requests.

## 2026-09-18

### Task
- Explain the frontend/partner-backend differences in complete-beginner language and prepare a WhatsApp coordination message for the partner.

### Actions
- Clarified URL terminology: a slug is the readable, usually stable public identifier in a path such as `/recipe/chocolate-cake`; it is not a performance optimization. A database can still keep and use a numeric internal ID.
- Clarified the reason for a stable slug: a visible title may change while the slug and previously shared URL can remain unchanged.
- Clarified that the current frontend already implements slug-shaped browser routes and search query parameters, but no backend recipe/category/search integration exists yet.
- Clarified that the partner backend and frontend were built independently; the partner did not change the frontend landing page. Their current landing endpoint and the frontend labels/data requirements simply differ and need a shared final definition.
- Prepared a WhatsApp message that asks the partner to confirm: slug versus exact-title recipe lookup; username versus email login; frontend addition of `password_confirm`; a future current-user endpoint such as `/api/me/`; the completion state of recipe creation; missing search/category endpoints; and the final landing-page content direction.
- Expanded the recipe-creation finding: `GET /api/recipes/add_recipe/` returns existing category and ingredient options. The intended `POST` route uses `RecipeDetailedSerializer`, but source review did not find the completed creation logic needed to create one recipe and save its ingredient quantity/unit links, categories, ordered steps, authenticated author, and uploaded image records.

### Notes
- User preference for explanations: define terms with concrete examples first; avoid abstract architecture language, vague future-planning lists, and unexplained database jargon. State plainly what code currently does, what it does not do, and why a recommendation is made.
- Frontend signup decision: add a Confirm Password field so the frontend supplies the partner backend's required `password_confirm` value. This is a planned change only; do not edit files until the user explicitly asks to implement it and approves the proposed edit.
- Auth integration is implementation work, not a conceptual dispute: replace the frontend-only dev-auth preview with the partner backend's token-based login flow after the team confirms login identity/endpoint details.
- Profile integration gap: the partner backend has no current-user endpoint. `GET /api/users/` lists profiles; the frontend profile page instead needs a route such as `GET /api/me/` that returns the authenticated user's own profile and favourites.
- Moderation gap: the frontend contains visual admin/review pages, but the partner backend currently has no pending-submission status, approve/deny action, moderator reply storage, or moderation API. Treat moderation as unconnected future work unless the project requires it now.
- Do not claim the partner POST recipe route works end-to-end: its source has not been runtime-tested locally because the checkout lacks `rest_framework`, and the serializer/view source indicates nested recipe creation is unfinished.

## 2026-07-29

### Task
- Save the user's explanation protocol into the repository work log for future sessions

### Actions
- Reviewed the existing work log file in the project root
- Added a dedicated `Explanation Protocol` section with the user's preferred explanation rules
- Recorded this update as a dated work log entry

### Notes
- The repository uses `WORK_LOG.md` as the existing persistent notes file
- Future explanation requests in this repo should follow the protocol above unless the user asks for a different style

## 2026-07-29

### Task
- Save the Step F chunk breakdown so the explanation can resume later

### Actions
- Recorded the planned Step F teaching chunks for the database, migration, session, and authentication flow

### Notes
- Step F chunk plan:
  - Chunk 1: `models.py`
    - what a model is
    - what `class User(AbstractUser):` means
    - what fields mean
    - how Python model code represents database structure
  - Chunk 2: migrations
    - what a migration is
    - what `makemigrations` does
    - what `migrate` does
    - how model code becomes a real PostgreSQL table
  - Chunk 3: database connection
    - how `settings.py` connects Django to PostgreSQL
    - what each `DATABASES` value means
    - how Django knows which database to use
  - Chunk 4: signup to database write
    - how signup reaches `create_user(...)`
    - what gets saved into the database
    - why password is hashed instead of stored raw
  - Chunk 5: login to session/auth state
    - how login checks stored user data
    - what `authenticate(...)` compares
    - what `login(request, user)` stores for future requests
  - Chunk 6: `/me/` and session reuse
    - how Django reads the session on later requests
    - how `request.user` is reconstructed from stored session/auth data
  - Chunk 7: logout and session destruction
    - what gets invalidated
    - why the old session no longer works
  - Chunk 8: full Step F connection map
    - model -> migration -> database table -> signup -> login -> session -> me -> logout

## 2026-07-30

### Task
- Record the repo-level collaboration rule for future edits

### Actions
- Added a standing note that real file changes should be proposed and explained first

### Notes
- Before making any real file changes in this repo:
  - explain the proposed changes first
  - explain why those changes are being made
  - wait for explicit user approval before applying them
- Future changes and recommendations for this repo should be checked against
  `ft_transcendence.pdf` for compliance before implementation.
- The current Docker/HTTPS/bootstrap approach is for development only.
- Later, when preparing the final production deployment version, use a clear
  dev vs production split:
  - production should use real CA-issued certificates
  - production should use separate production settings/environment handling
  - production should use tighter secret handling
  - production should include backups, logging, restart policy, and monitoring
  - production should not reuse the self-signed localhost certificate flow
  - production should not keep `DEBUG=True`
  - production should not expose dev-only bind mounts
  - production should not commit private keys
- When `README.md` is next updated, add a clear note that the current setup is
  for development only and is not the final production deployment approach.
- Planned work order for the next major phases:
  - finish and clean the local/development setup first
  - then make the app more Kanban-focused
  - then prepare the deployable/production version

## 2026-07-24

### Task
- Create a dedicated markdown file to track work done in this project

### Actions
- Read the repository structure and identified the main areas: `backend/`, `frontend/`, and `nginx/`
- Reviewed the main project context from `README.md`
- Reviewed service orchestration in `docker-compose.yml`
- Reviewed backend dependencies in `backend/requirements.txt`
- Reviewed frontend dependencies in `frontend/package.json`
- Reviewed Django configuration in `backend/config/settings.py`
- Reviewed frontend routing in `frontend/src/App.jsx`
- Reviewed reverse proxy setup in `nginx/default.conf`
- Created this file as the persistent work log for future sessions

### Notes
- The project is set up as a Dockerized full-stack app with Django, PostgreSQL, React, and Nginx
- Authentication and basic policy pages are already described in the repository documentation
- This file can now be appended as we continue working

## 2026-07-24

### Task
- Read `Notes.txt` and align with the current study progress

### Actions
- Reviewed `Notes.txt` in the project root
- Confirmed the repository study plan is organized into six logic flows named A through F
- Noted that steps A and B are complete and the next focus is step C: React frontend startup and routing flow
- Reviewed the step C files:
  - `frontend/src/main.jsx`
  - `frontend/src/App.jsx`
  - `frontend/src/pages/LoginPage.jsx`
  - `frontend/src/pages/SignupPage.jsx`
  - `frontend/src/pages/HomePage.jsx`
  - `frontend/src/pages/PrivacyPage.jsx`
  - `frontend/src/pages/TermsPage.jsx`

### Notes
- Step C starts in `frontend/src/main.jsx`, where React loads and mounts `<App />` into the HTML element with id `root`
- `frontend/src/App.jsx` wraps the app in `BrowserRouter`, renders the navigation links, and maps URL paths to page components
- The page files are the route targets that React Router displays after matching the browser URL
- `LoginPage.jsx`, `SignupPage.jsx`, and `HomePage.jsx` also contain request logic, so they belong partly to step D as well

## 2026-08-24

### Task
- Split the repository workflow so frontend work can continue on a dedicated branch

### Actions
- Recorded the decision to stop pursuing the earlier Kanban-heavy scope for now
- Recorded that the next active focus is the website frontend and overall display work
- Prepared a dedicated `frontend` branch setup that removes backend and infrastructure files from the working branch view while keeping `WORK_LOG.md`

### Notes
- Current working agreement:
  - the active implementation focus is the frontend only
  - Docker infrastructure, backend, and database design are out of scope for the current branch
- Files intended to stay available on the `frontend` branch:
  - `frontend/`
  - `.env`
  - `ft_transcendence.pdf`
  - `WORK_LOG.md`
- Files intended to be removed from the `frontend` branch:
  - `backend/`
  - `nginx/`
  - `.env.example`
  - `.gitignore`
  - `docker-compose.yml`
  - markdown documentation files except `WORK_LOG.md`
  - loose text notes such as `Some backend commands.txt`

## 2026-08-24

### Task
- Record the revised project stack and rebuild direction for the restarted implementation

### Actions
- Recorded that the project is being redone and will need a new frontend container
- Recorded the agreed technology choices for the restarted build:
  - Django for the backend framework
  - React for the frontend application
  - MariaDB for the database
- Recorded that snowflake-style table relationship planning has been raised as a database design topic to evaluate later

### Notes
- The old repository snapshot and the new project direction are not the same thing
- The current active branch focus is still frontend implementation and overall website display work
- Frontend container work should be treated as a rebuild, not as a small patch on top of the previous setup
- Database schema design is not finalized yet; `snowflake schema` is currently a planning note, not an implemented decision in this branch

## 2026-08-24

### Task
- Rebuild the frontend container for the restarted frontend-first branch

### Actions
- Replaced the old frontend image definition with a clean development-focused Dockerfile
- Switched dependency installation in the frontend image to `npm ci` so the lockfile drives the container install
- Kept the container entrypoint focused on the Vite development server on port `5173`
- Added `frontend/.dockerignore` to keep local build output, editor files, and dependency folders out of the Docker build context

### Notes
- This container is now a frontend development container, not a production static-build image
- The container rebuild is intentionally isolated from backend, reverse proxy, and database orchestration

## 2026-08-24

### Task
- Read the recipe-site planning document and rebuild the React frontend structure around it

### Actions
- Read `Recipe Website.txt` from `/home/suroh/Downloads` to capture the current product direction
- Confirmed the project has pivoted to a recipe website with shared header/footer and these main page types:
  - landing page
  - category page
  - recipe page
  - add recipe page
  - profile page
  - admin page
  - login and signup flows
  - search results page
- Replaced the previous auth-demo router with a recipe-site route map
- Added shared frontend building blocks:
  - site header with menu/search/connect/profile actions
  - site footer with general usage and category links
  - reusable recipe cards and section headings
- Added frontend mock content for categories, recipes, profile preview data, and admin review requests
- Rebuilt the page layer to match the planning document:
  - landing page with popular/latest/theme sections
  - category pages with top/latest/all groupings
  - recipe detail pages with rating anchor, gallery slots, ingredients, steps, author, suggestions, and comments
  - add recipe page with repeatable frontend form fields
  - profile page with recipes, favorites, and pending review state
  - admin dashboard and review-detail pages for pending recipe moderation
  - login/signup pages restyled for the new product direction
- Replaced the old demo CSS with a new global visual system for the recipe-site branch

### Notes
- The current frontend is intentionally backend-independent and uses mock data until Django and MariaDB endpoints are rebuilt
- Auth forms, recipe submission, favorites, and moderation actions are UI-ready but still use placeholder status handling
- This environment does not provide `node`, `npm`, or `docker`, so the rebuilt frontend could not be compiled or previewed here

## 2026-08-24

### Task
- Save the agreed frontend-only work order for future turns

### Actions
- Recorded the current recommended frontend workflow so later check-ins can continue from the same order

### Notes
- Current frontend-first work order:
  - preview the site locally and review the design first
  - prepare a short guide for teammates so they can run `npm run dev` and check the layout/design for confirmation
  - check the main flows one by one:
    - landing page
    - category page
    - recipe page
    - add recipe page
    - profile page
    - admin and review pages
    - login and signup pages
  - write down exact frontend corrections after preview:
    - colors
    - typography
    - spacing
    - card layout
    - header and menu behavior
    - mobile layout
    - missing or weak sections
  - keep improving only frontend structure:
    - reusable UI pieces
    - responsiveness
    - forms
    - empty states
    - mock content quality
  - do not define real API integration until backend behavior is confirmed
  - later replace mock data gradually when Django and database output is confirmed

## 2026-08-24

### Task
- Wrap up the current frontend-only work session with a clear summary for continuation tomorrow

### Actions
- Confirmed the active branch remains `frontend`
- Rebuilt the frontend as a recipe-site UI rather than the previous project direction
- Rebuilt the frontend container as a dedicated development container
- Replaced the old starter-style frontend pages with recipe-site pages and routes:
  - landing page
  - category page
  - recipe page
  - add recipe page
  - profile page
  - admin dashboard and review page
  - login and signup pages
  - connect page
  - search results page
  - privacy and terms pages
- Added shared frontend components for cleaner structure:
  - site header
  - site footer
  - recipe card
  - section title
  - page hero
  - auth page shell
- Centralized the current placeholder content in `frontend/src/data/siteData.js`
- Removed leftover starter/demo files that were no longer used:
  - old Vite starter assets
  - old cookie helper
  - old icon sprite
- Updated the frontend title and favicon so the branch reflects the recipe-site branding
- Confirmed the site runs in local development after `npm ci`, `npm audit fix`, and `npm run dev`
- Confirmed the frontend-only workflow going forward:
  - keep using mock data for UI work
  - keep avoiding API/backend assumptions until the backend contract is known
- Compared `frontend_css` against `frontend`, then moved local `frontend` to the same commit and switched back to `frontend` so continued work stays on the user branch without changing the partner branch

### Notes
- `npm audit fix` changed the lockfile, not the declared dependency list in `package.json`
- The built output folder `frontend/dist/` and local `frontend/node_modules/` are development artifacts from local npm commands and are not part of the intended source history
- The current frontend is a structural and visual prototype with placeholder data, ready for more pure frontend refinement before backend integration

## 2026-08-25

### Task
- Refine the frontend header menu behavior, remove remaining mock category/data behavior, and save a teammate-facing summary of today's work

### Actions
- Fixed the header menu popup so it opens as a compact box anchored to the menu button instead of stretching across the page
- Updated the menu popup sizing so its height follows the real content and no longer cuts off lower menu items
- Reduced the popup width and kept it viewport-safe for smaller screens
- Removed the dedicated mock category page flow by deleting `frontend/src/pages/CategoryPage.jsx`
- Changed `/category/:slug` handling in `frontend/src/App.jsx` to redirect back to `/` instead of rendering a mock category page
- Removed clickable mock category and theme links from the menu and kept them as non-clickable labels until real backend-driven navigation exists
- Removed the global mock-data banner that was displayed across the site chrome
- Cleared the hard-coded mock recipe, profile, and moderation record data from `frontend/src/data/siteData.js`
- Converted the affected pages to empty-state or backend-pending behavior instead of showing fake records:
  - `frontend/src/pages/HomePage.jsx`
  - `frontend/src/pages/SearchResultsPage.jsx`
  - `frontend/src/pages/ProfilePage.jsx`
  - `frontend/src/pages/AdminPage.jsx`
  - `frontend/src/pages/ReviewRequestPage.jsx`
  - `frontend/src/pages/RecipePage.jsx`
- Updated `frontend/src/pages/AddRecipePage.jsx` so category and ingredient inputs no longer depend on fake database-driven select options
- Cleaned up several remaining placeholder labels in the shared UI text, including footer and recipe action labels
- Prepared a teammate-report summary in Google-doc-friendly bullet format for today's work

### Notes
- The frontend now behaves more honestly as a structural shell: category routes no longer pretend real category pages exist, and the shared data file no longer injects fake recipe/profile/admin records
- Runtime verification could not be completed in this shell because `node` and `npm` are unavailable here, so today's checks were limited to source inspection
- Remaining `placeholder="..."` attributes in form fields are standard input placeholder text, not mock content records

## 2026-08-26

### Task
- Unify the frontend visual style around the landing-page system, refine auth page copy, and build a placeholder category directory plus one sample category detail page

### Actions
- Normalized the frontend layout so the inner pages, login page, and signup page follow the same visual direction as the landing page, header, and footer
- Refined shared styling in `frontend/src/App.css` so the boxed landing-page treatment is used more consistently across sections, cards, form surfaces, and navigation controls
- Updated the login and signup page messaging to use more natural and more persuasive copy
- Added a placeholder category directory page at `frontend/src/pages/CategoryPage.jsx`
- Added `/category` routing in `frontend/src/App.jsx`
- Built the category directory with:
  - `Top 5 categories`
  - `All categories`
  - 18 placeholder category cards per page
  - 3 pages total
- Added centered pagination controls with `First`, `Previous`, numbered page buttons, `Next`, and `Last`
- Adjusted the pagination layout so the numbered page buttons remain fixed in the page center even when the side navigation buttons appear or disappear
- Styled the category cards as square cards and set the main category grid to 3 cards per row
- Kept the top 5 category cards in a single row
- Replaced the old landing-page category entry block with visible top-category cards plus a `See more Categories` button
- Added a sample category detail page at `frontend/src/pages/CategoryDetailPage.jsx`
- Added `/category/:slug` handling in `frontend/src/App.jsx`
- Limited the active sample detail route to `Category 01` for now, while leaving the other category cards as placeholder no-op buttons
- Built the sample category detail page with:
  - `Trending Recipe in This Category`
  - `List of All Recipes in This Category`
  - no-op sample recipe buttons named `Sample recipe 01` through `Sample recipe 18`
- Removed the extra temporary category placeholder data file and simplified the sample category behavior back into the page files
- Created a teammate-facing uploadable summary in `teammate_report_2.md`

### Notes
- The category flow remains frontend-only placeholder behavior and does not assume a backend or final database schema yet
- Runtime verification could not be completed in this shell because `node` and `npm` are unavailable here, so today's checks were limited to source inspection

### Teammate Report 1
Teammate Report (August 26, 2026)

- Worked on the frontend routing structure with `React Router` and slug-based URLs.
- Split the routing logic so the route decides which page to show and the URL identifier decides which specific record to load.
- Left the homepage recipe image and name boxes as clickable no-op placeholders for now.
- Current status: recipe-page redirection and real backend/database-connected data loading are still for later development.

### Teammate Report 2
Teammate Report (August 26, 2026)

- Added visible top-category cards on the landing page and kept a `See more Categories` entry into the category flow.
- Built the category page layout with `Top 5 categories`, `All categories`, square cards, and centered pagination.
- Built one sample `Category 01` detail page with a trending recipe block and a list of sample recipes.
- Cleaned up the login and signup page copy so those pages stay aligned with the shared frontend layout.
- Current status: the category flow is still frontend-only placeholder behavior with no backend or database connection yet.

## 2026-08-28

### Task
- Restore the category recipe-listing route structure and clean up the login/signup layout based on the user's corrections

### Actions
- Restored direct category detail routing in `frontend/src/App.jsx` with `/category/:slug`
- Kept `/category` as a redirect back to `/` so there is no separate category landing page
- Updated the landing-page category cards in `frontend/src/pages/HomePage.jsx` so each category button redirects to its matching `/category/:slug` route
- Added minimal category metadata and category-filter helpers in `frontend/src/data/siteData.js` without reintroducing mock recipe records
- Recreated `frontend/src/pages/CategoryPage.jsx` as a structural category listing page that filters the shared `recipes` array by category slug and shows an empty state when no real recipes exist
- Removed the top `Recipe Site / Back to landing page` block from the shared auth shell in `frontend/src/components/AuthPageShell.jsx`
- Adjusted the auth grid in `frontend/src/App.css` so the left login/signup info box no longer stretches to the height of the form box
- Removed the normal category-page back button, while keeping the invalid-category fallback link pointed to the main landing page

### Notes
- No mock recipe content was intentionally kept for this work; `frontend/src/data/siteData.js` still uses an empty `recipes` array
- Because the shared recipe source is still empty, the restored category page structure will currently show the empty-state message until real recipe data is connected
- Runtime verification could not be completed in this shell because `node` and `npm` are unavailable here
- Future continuation note: when the user later provides a queue for a report about work done on August 28, 2026, use today's work context from this entry

## 2026-08-30

### Task
- Save the user's August 30 teammate report and standardize the teammate-report format for future entries, including the report text stored in `WORK_LOG.md`

### Actions
- Added a dedicated teammate-report format section near the top of this log
- Rewrote the saved August 26 teammate reports into the new `Teammate Report (Month DD, YYYY)` format
- Recorded the user's August 30 teammate report text in the new format

### Notes
- Use this teammate-report structure for future reports unless the user asks for a different format
- Saved report text:

Teammate Report (August 30, 2026)

- Simplified the category page layout by removing the extra placeholder heading and helper text.
- Cleaned up the recipe page comments section by removing the extra title and copy and merging the empty comments area into a single box.
- Unified the button styling on the connect, login, and signup pages so those action buttons now use the same white style.
- Current status: this was frontend UI cleanup only. Backend and data connection are still for later.
