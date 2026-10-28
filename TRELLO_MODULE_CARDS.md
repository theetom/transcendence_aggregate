# Trello module cards

Board: [Transcendence](https://trello.com/b/dYQHomFA/transcendence)

Revised and verified: 2026-10-28.

Publication status: **Complete — ten simplified cards and all 31 native checklist items verified in Trello.**

These cards contain the subject's criteria and the minimum work needed to meet them. They replace the former 78-item draft. Four Majors plus six Minors target **14 points**; implementation and qualification remain separate from this card rewrite.

Frameworks and ORM are already implemented. Both README entries are complete and their Trello tasks are checked off. Existing accepted checks stay accepted; these documentation updates do not start application/backend implementation or runtime tests.

Module 03 advanced permissions is implemented and user-verified. Its README entry and all three Trello tasks are complete.

**Progress: Modules 01–03 complete — 5 of 14 target points.** Modules 04–10 remain pending qualification, representing the remaining 9 target points.

The required README module information is the chosen module, its points, why/how it is implemented and its contributors (subject printed page 28 / PDF page 29). Exact file references, tutorials and separate evidence reports are not mandatory additions.

Module 01's old card was archived because the connector cannot delete its excess native checklist items. Its verified replacement is linked below. Other module links are unchanged. Each card has one **Required work** native checklist; the items below mirror it.

## Card index

| Module | Card | Type | Points | Required items | Status |
| --- | --- | --- | ---: | ---: | --- |
| 01 | [React + Django frameworks](https://trello.com/c/CrNd2bmK/57-module-01-react-django-frameworks-major-2-points) | Major | 2 | 1 | Complete |
| 02 | [Django ORM](https://trello.com/c/5O2WSAZU/48-module-02-django-orm-minor-1-point) | Minor | 1 | 1 | Complete |
| 03 | [Advanced permissions](https://trello.com/c/VyltJMBQ/49-module-03-advanced-permissions-major-2-points) | Major | 2 | 3 | Complete |
| 04 | [Custom design system](https://trello.com/c/8TOKaPvg/50-module-04-custom-design-system-minor-1-point) | Minor | 1 | 2 | Pending |
| 05 | [Advanced recipe search](https://trello.com/c/TWEqD2Hb/51-module-05-advanced-recipe-search-minor-1-point) | Minor | 1 | 2 | Pending |
| 06 | [Secured public recipe API](https://trello.com/c/ZvUXeo0H/52-module-06-secured-public-recipe-api-major-2-points) | Major | 2 | 5 | Pending |
| 07 | [Recipe data export/import](https://trello.com/c/sonZzuGg/53-module-07-recipe-data-export-import-minor-1-point) | Minor | 1 | 4 | Pending |
| 08 | [Health, status and automated backups](https://trello.com/c/T7ZPZQq9/54-module-08-health-status-and-automated-backups-minor-1-point) | Minor | 1 | 4 | Pending |
| 09 | [Recipe analytics dashboard](https://trello.com/c/8fkox8yA/55-module-09-recipe-analytics-dashboard-major-2-points) | Major | 2 | 5 | Pending |
| 10 | [Two additional browsers](https://trello.com/c/Djc38gP8/56-module-10-two-additional-browsers-minor-1-point) | Minor | 1 | 4 | Pending |
| **Total** | **10 cards** | **4 Major + 6 Minor** | **14** | **31** | **3 complete; 7 pending** |

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

**Current status:** Shared styles and components already exist. Finish only unmet requirements.

**Required work:**

- [ ] Complete and verify the palette, typography, icons and at least 10 reusable components used by the application.
- [ ] Record this module, its 1 point, why/how it is implemented, and contributors in README.

---

## [Module 05] Advanced recipe search — Minor (1 point)

**Subject:** ft_transcendence.pdf, printed page 13 / PDF page 14.

**Requirement:** Provide advanced search with filters, sorting and pagination.

**Current status:** Basic search exists; filters, sorting and pagination remain.

**Required work:**

- [ ] Implement and verify search filters, sorting and pagination.
- [ ] Record this module, its 1 point, why/how it is implemented, and contributors in README.

---

## [Module 06] Secured public recipe API — Major (2 points)

**Subject:** ft_transcendence.pdf, printed page 12 / PDF page 13.

**Requirement:** Provide a public database API with a secured API key, rate limiting, documentation and at least five endpoints covering GET, POST, PUT and DELETE.

**Current status:** Existing Django REST routes provide a foundation.

**Required work:**

- [ ] Provide secured API-key access.
- [ ] Provide at least five database API endpoints covering GET, POST, PUT and DELETE.
- [ ] Apply and check rate limiting.
- [ ] Document API authentication and endpoint usage.
- [ ] Record this module, its 2 points, why/how it is implemented, and contributors in README.

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
