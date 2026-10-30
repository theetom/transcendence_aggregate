# Trello module cards

Board: [Transcendence](https://trello.com/b/dYQHomFA/transcendence)

Trello publication revised and verified: 2026-10-28. Local module progress updated: 2026-10-30.

Publication status: **Complete — ten simplified cards and all 31 native checklist items verified in Trello.**

These cards contain the subject's criteria and the minimum work needed to meet them. They replace the former 78-item draft. Four Majors plus six Minors target **14 points**; implementation and qualification remain separate from this card rewrite.

Frameworks and ORM are already implemented. Both README entries are complete and their Trello tasks are checked off. Existing accepted checks stay accepted; these documentation updates do not start application/backend implementation or runtime tests.

Module 03 advanced permissions is implemented and user-verified. Its README entry and all three Trello tasks are complete.

**Progress: Modules 01–05 complete — 7 of 14 target points.** Module 05 implementation, README documentation and user-led browser verification are complete; temporary sample cleanup is user-confirmed. Module 06 is in progress with source implementation and documentation saved, while user-led runtime acceptance remains pending. Modules 07–10 remain pending; the five unqualified modules represent the remaining 7 target points.

The required README module information is the chosen module, its points, why/how it is implemented and its contributors (subject printed page 28 / PDF page 29). Exact file references, tutorials and separate evidence reports are not mandatory additions.

Module 01's old card was archived because the connector cannot delete its excess native checklist items. Its verified replacement is linked below. Other module links are unchanged. Each card has one **Required work** native checklist; the items below record local progress. Module 04, Module 05 and Module 06 local updates have not been synchronized to Trello.

## Card index

| Module | Card | Type | Points | Required items | Status |
| --- | --- | --- | ---: | ---: | --- |
| 01 | [React + Django frameworks](https://trello.com/c/CrNd2bmK/57-module-01-react-django-frameworks-major-2-points) | Major | 2 | 1 | Complete |
| 02 | [Django ORM](https://trello.com/c/5O2WSAZU/48-module-02-django-orm-minor-1-point) | Minor | 1 | 1 | Complete |
| 03 | [Advanced permissions](https://trello.com/c/VyltJMBQ/49-module-03-advanced-permissions-major-2-points) | Major | 2 | 3 | Complete |
| 04 | [Custom design system](https://trello.com/c/8TOKaPvg/50-module-04-custom-design-system-minor-1-point) | Minor | 1 | 2 | Complete |
| 05 | [Advanced recipe search](https://trello.com/c/TWEqD2Hb/51-module-05-advanced-recipe-search-minor-1-point) | Minor | 1 | 2 | Complete |
| 06 | [Secured public recipe API](https://trello.com/c/ZvUXeo0H/52-module-06-secured-public-recipe-api-major-2-points) | Major | 2 | 5 | In progress |
| 07 | [Recipe data export/import](https://trello.com/c/sonZzuGg/53-module-07-recipe-data-export-import-minor-1-point) | Minor | 1 | 4 | Pending |
| 08 | [Health, status and automated backups](https://trello.com/c/T7ZPZQq9/54-module-08-health-status-and-automated-backups-minor-1-point) | Minor | 1 | 4 | Pending |
| 09 | [Recipe analytics dashboard](https://trello.com/c/8fkox8yA/55-module-09-recipe-analytics-dashboard-major-2-points) | Major | 2 | 5 | Pending |
| 10 | [Two additional browsers](https://trello.com/c/Djc38gP8/56-module-10-two-additional-browsers-minor-1-point) | Minor | 1 | 4 | Pending |
| **Total** | **10 cards** | **4 Major + 6 Minor** | **14** | **31** | **5 complete; 1 in progress; 4 pending** |

## [Module 01] React + Django frameworks — Major (2 points)

**Subject:** ft_transcendence.pdf, printed page 12 / PDF page 13.

**Requirement:** Use a framework for both the frontend and backend.

**Current status:** Already implemented with React and Django. Vite builds the frontend; it is not the backend framework. Existing accepted functionality is retained. Count the combined frameworks Major once, without the separate frontend/backend Minors.

**Required work:**

- [x] Record this module, its 2 points, why/how React and Django are used, and contributors in README.

---

## [Module 02] Django ORM — Minor (1 point)

**Subject:** ft_transcendence.pdf, printed page 12 / PDF page 13.

**Requirement:** Use an ORM for the database.

**Current status:** Already implemented through Django models and queries against PostgreSQL.

**Required work:**

- [x] Record this module, its 1 point, why/how Django ORM is used, and contributors in README.

---

## [Module 03] Advanced permissions — Major (2 points)

**Subject:** ft_transcendence.pdf, printed page 14 / PDF page 15.

**Requirement:** Provide user CRUD, role management, and different views/actions based on role.

**Current status:** Complete: Django administration user CRUD, scoped permission grants/revocation and website staff access grants/revocation were user-verified. Admin saves provision missing website profiles. The required README entry is complete.

**Required work:**

- [x] Complete and verify user CRUD using the existing administration where sufficient.
- [x] Complete and verify role management and role-specific views/actions.
- [x] Record this module, its 2 points, why/how it is implemented, and contributors in README.

---

## [Module 04] Custom design system — Minor (1 point)

**Subject:** ft_transcendence.pdf, printed page 12 / PDF page 13.

**Requirement:** Provide a custom design system with a colour palette, typography, icons and at least 10 reusable components.

**Current status:** Complete: Savour Studio palette, typography, local SVG icons and ten reusable components have source evidence and README documentation. Roh reported passing the guided 390 × 844 mobile page layouts, desktop/narrowed-header review, keyboard/menu focus, empty-form validation and extra ingredient/category/step removal with first-card protection. Completing Module04 brought the subtotal to 6 points before Module05. This local progress update does not update the external Trello card.

**Required work:**

- [x] Complete and verify the palette, typography, icons and at least 10 reusable components used by the application.
- [x] Record this module, its 1 point, why/how it is implemented, and contributors in README.

---

## [Module 05] Advanced recipe search — Minor (1 point)

**Subject:** ft_transcendence.pdf, printed page 13 / PDF page 14.

**Requirement:** Provide advanced search with filters, sorting and pagination.

**Current status:** Complete: the existing approved-recipe collection supports combined title/category/ingredient/minimum-rating filters, title A–Z/Z–A/highest-rated/most-reviewed sorting and 6/12/24-item pagination in the frontend. Roh reported passing the controls' appearance, combined filters/clearing, minimum rating, all four sorts, Next/Previous and page-size ranges, later-page filter reset, refresh persistence and browser Back restoration on October 30, 2026. Source review also covers live-refresh page clamping. The implementation uses Tomaz's existing API without backend application changes, and README purpose/how/1-point/contributor documentation is complete. The completed subtotal is 7/14 points. Roh confirmed temporary sample cleanup was done. This local progress update has not been synchronized to Trello.

**Required work:**

- [x] Implement and verify search filters, sorting and pagination.
- [x] Record this module, its 1 point, why/how it is implemented, and contributors in README.

---

## [Module 06] Secured public recipe API — Major (2 points)

**Subject:** ft_transcendence.pdf, printed page 12 / PDF page 13.

**Requirement:** Provide a public database API with a secured API key, rate limiting, documentation and at least five endpoints covering GET, POST, PUT and DELETE.

**Current status:** In progress: a separate HTTPS `/api/public/v1/` API implements five database paths covering GET/POST/PUT/DELETE, automatic account-bound keys at first successful sign-in and private Profile status/one-time-secret/replacement/revocation controls. Normal account keys permit writes only within each website account's existing recipe ownership/staff permissions; expired/revoked keys are not silently reactivated. Keys have SHA-256 secret digests and expiry, with a shared per-account PostgreSQL quota and a per-IP Nginx limit. New migration `0002` adds the account-key marker while preserving `0001` and the existing credential snapshot exclusions. Existing moderation, revision and photo rules are reused. README user setup/key/endpoint/CRUD/error/quota usage and module purpose/how/2-point/contributor documentation are saved. User-run build/migration/provisioning/lifecycle/authentication/permission/CRUD/rate-limit acceptance remains pending, so the completed subtotal stays **7/14**. No live-key or runtime-pass evidence is claimed. This local progress update has not been synchronized to Trello.

**Required work:**

- [x] Provide secured API-key access.
- [x] Provide at least five database API endpoints covering GET, POST, PUT and DELETE.
- [ ] Apply and check rate limiting.
- [x] Document API authentication and endpoint usage.
- [x] Record this module, its 2 points, why/how it is implemented, and contributors in README.

---

## [Module 07] Recipe data export/import — Minor (1 point)

**Subject:** ft_transcendence.pdf, printed page 19 / PDF page 20.

**Requirement:** Export data in multiple formats, import data with validation, and support bulk operations.

**Current status:** Existing snapshots provide a foundation. Record exports must contain actual data, not only snapshot metadata.

**Required work:**

- [ ] Export actual data in multiple formats.
- [ ] Import data with validation.
- [ ] Support bulk operations on multiple records.
- [ ] Record this module, its 1 point, why/how it is implemented, and contributors in README.

---

## [Module 08] Health, status and automated backups — Minor (1 point)

**Subject:** ft_transcendence.pdf, printed page 19 / PDF page 20.

**Requirement:** Provide health checks, a status page, automated backups and disaster-recovery procedures.

**Current status:** Reuse existing health checks and automatic startup exports where adequate.

**Required work:**

- [ ] Provide working health checks and a status page.
- [ ] Ensure automated backups work, reusing existing automation where adequate.
- [ ] Document usable disaster-recovery procedures.
- [ ] Record this module, its 1 point, why/how it is implemented, and contributors in README.

---

## [Module 09] Recipe analytics dashboard — Major (2 points)

**Subject:** ft_transcendence.pdf, printed page 19 / PDF page 20.

**Requirement:** Provide interactive charts/graphs, real-time data updates, export functionality, and customizable date ranges and filters.

**Current status:** Existing recipe/review data can support the dashboard.

**Required work:**

- [ ] Provide interactive charts or graphs.
- [ ] Update displayed data in real time.
- [ ] Provide data export.
- [ ] Provide customizable date ranges and filters.
- [ ] Record this module, its 2 points, why/how it is implemented, and contributors in README.

---

## [Module 10] Two additional browsers — Minor (1 point)

**Subject:** ft_transcendence.pdf, printed page 13 / PDF page 14.

**Requirement:** Full compatibility in at least two additional browsers, testing/fixing all features, documented limitations and consistent UI/UX.

**Current status:** Qualify at least two browsers beyond Chrome. Retain accepted Chrome results.

**Required work:**

- [ ] Test all features in two additional browsers and fix compatibility problems.
- [ ] Keep UI/UX consistent across supported browsers.
- [ ] Document browser-specific limitations.
- [ ] Record this module, its 1 point, why/how it is implemented, and contributors in README.
