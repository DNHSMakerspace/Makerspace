<!-- 
NOTE: This file serves as the English documentation and explanation for `AGENTS.md` (which is maintained in Chinese to maximize token efficiency and context retention). Any updates or new rules added to `AGENTS.md` must also be translated and updated in this file.
-->

# Agent Programming Guidelines

## Core Principles

### Single Responsibility Principle (SRP)

* Every function, class, and module should have one clear reason to change.
* Avoid "god functions" that handle multiple concerns.
* If you describe a function with "and", it likely violates SRP.
* Prefer composition over large multi-purpose units.

### Simplicity over Cleverness

* Prefer readable code over "clever" abstractions.
* Avoid premature optimization.
* If a junior engineer can’t understand it in 30 seconds → simplify.

### Explicit Over Implicit

* Make dependencies visible.
* Avoid hidden state changes.
* Avoid "magic behavior" (implicit globals, side effects).
* Isolate I/O, network, and filesystem operations where possible.

## Architecture Rules

### Separation of Concerns

Split logic into clear layers:

* UI / interface layer
* Business logic layer
* Data / persistence layer
* Utility/helpers (pure functions)
**Agent rule:** Never mix data access with business logic unless explicitly justified.

### Feature-based Modularity

* Prefer modular files over large monoliths.
* Keep file sizes reasonable (soft rule: <300–500 lines).
* Group by feature, not by type (often better for scaling systems).
* Prefer modular monolith over microservices unless scale demands it.

## System-Specific Rules

### Ecosystem & Tooling Defaults

* **Prioritize SASS:** Use SASS (`.scss`) for styling instead of standard CSS or inline styles.
* **Use `_projects`:** Leverage the modular project auto-registration system in the `_projects/` directory for new projects.
* **System Expansion:** Work within the existing systems and expand them if needed, rather than creating completely new parallel architectures.
* **Calendar pages:** Keep layout and modal styling out of `navigation/calendar.md`; use semantic classes and SCSS instead of utility-heavy inline markup.
* **Cross-origin APIs:** Spring endpoints consumed from `pages.opencodingsociety.com` should explicitly allow credentialed cross-origin requests.
* **Documentation:** Create detailed documentation for difficult or complex implementations as necessary.
* **Commenting:** Add comments for non-trivial logic, but keep them minimal and focused on *why* rather than *what*.
* **Ask Questions:** If system-level constraints, requirements, or patterns are unclear, pause and ask the user questions before proceeding.

### Project Workflow

* Treat [Makefile](Makefile) as the single source of truth; common targets are `make`/`make serve-current`, `make dev`, `make stop`, `make convert`, and `make convert-single` (details in [README.md](README.md)).
* Order matters: stop → build projects → convert notebooks/docx → split courses → jekyll serve (follow [Makefile](Makefile)).
* Project builds must run the [SASS import generator](scripts/generate_sass_imports.py) to create `_sass/projects/_all.scss`; `build-registered-projects` owns this dependency so Jekyll can resolve `projects/all`.
* **Makerspace-only publish:** `_config.yml` `exclude` currently blocks non-makerspace pages/assets (navigation, courses, games, etc.). The public site only builds makerspace pages. To restore the full site, update `exclude` and `minima.nav_pages` together — do not only delete makerspace pages.

### Makerspace Pages (Del Norte Makerspace)

* Dedicated layout: [_layouts/makerspace.html](_layouts/makerspace.html) + shared topbar [_includes/makerspace-topbar.html](_includes/makerspace-topbar.html); the only stylesheet is [assets/css/makerspace.css](assets/css/makerspace.css), with logic in [assets/js/makerspace.js](assets/js/makerspace.js).
* Pages: `index.html` (homepage, permalink `/`), `about.md`, `submit.md` (print request form), `requests.md` (active requests + print history), `admin.md` (admin tools + member directory), `signin.md`, `signup.md`, `signout.md`; all use `layout: makerspace`. Do not wrap them in the minima/`page` layout again (that reintroduces the theme header/post-title chrome).
* `index.md` is an unpublished legacy homepage draft (`published: false`) so it does not collide with `index.html`'s `/` permalink; homepage edits belong in `index.html`.
* Brand name is consistently **Del Norte Makerspace** (matches `_config.yml`).
* URL convention: makerspace pages use trailing-slash pretty permalinks (`/about/`, `/submit/`, `/requests/`, `/admin/`, `/signin/`, `/signup/`, `/signout/`); HTML links must use `relative_url`; JS navigation must use `msUrl()` (reads `window.MAKERSPACE_BASE` / `data-makerspace-base`). Never hard-code `window.location.href = '/requests'` — that drops `site.baseurl` or 404s depending on trailing slashes.

### Sources vs Generated Files

* Sources live in [notebook sources](_notebooks/) and [docx sources](_docx/); converted Markdown is written to [generated posts](_posts/) (generated, do not hand-edit).
* Course-split outputs (`*_csp.md`/`*_csa.md`/`*_csse.md`/`*_content.md`) are generated; never edit them. See [scripts/split_multi_course_files.py](scripts/split_multi_course_files.py).
* Conversion behavior is defined in [scripts/convert_notebooks.py](scripts/convert_notebooks.py) and [scripts/convert_docx.py](scripts/convert_docx.py).

### Project Registry & Styling

* New projects must follow [_projects/REGISTRATION.md](_projects/REGISTRATION.md); architecture reference in [_projects/ARCHITECTURE.md](_projects/ARCHITECTURE.md).
* Use SCSS-first styling; theme and styling conventions are in [README.md](README.md).

### Backend Boundary

* Makerspace shared backend: [makerspace_backend/README.md](makerspace_backend/README.md) (`python3 makerspace_backend/server.py`, default `:8787`, Render reads `PORT`, data in `makerspace_backend/data/db.json`). **Accounts, inventory, member directory, print-request status, and request chats** are owned by that API; browser `localStorage` is only a cache. Production API: `https://makerspace-api-o7u6.onrender.com` (`makerspace_api` in `_config.yml`). `make makerspace-api` / `make makerspace-api-stop`. **Render free has no persistent disk:** without a durable backend, every redeploy/cold start resets `data/db.json` to seed (members/chats/inventory wiped). **Default fix:** run `python3 makerspace_backend/setup_remote_db.py --force-backup` to push an encrypted snapshot to school Flask topic `makerspace-state-v1` (`MAKERSPACE_STATE_SECRET`; the public API denies access to that topic). Optional `MAKERSPACE_DATA_URL` (any GET/PUT JSON endpoint). On boot the server picks the richest source (remote → flask → local → seed); saves write local + a throttled Flask snapshot. Disable Render Auto Deploy so routine git pushes do not redeploy the API.
* **Production chats and inventory announcements: browsers must not call Flask directly** (github.io / localhost CORS blocks preflight). Use the makerspace_backend proxy: `GET/POST /api/microblog?topic=...` (request topics `makerspace-request-<id>`) plus the `/api/inventory-feed` alias. The server derives the Flask guest identity from the makerspace email and dual-writes request chats to `/api/chats/<id>`. Client `assets/js/makerspace.js` prefers the proxy when `API_BASE` is set, then falls back Flask direct → Spring → API chats → localStorage.
* **Makerspace request chat = Flask microblog retextured as chat — no OCS account:** adapter [assets/js/makerspace/microblog-chat.js](assets/js/makerspace/microblog-chat.js) (localhost fallback); production prefers the makerspace API proxy. Backend `flask.opencodingsociety.com` `/api/microblog` (already deployed). One topic per print request: `makerspace-request-<id>`. **Inventory announcements** use shared topic `makerspace-inventory`. Auth is a free **guest** account derived from the makerspace email (`ms-<local>`). `_config.yml` `makerspace_flask_api` overrides the direct Flask URI. Optional fallbacks: OCS Spring (`spring-chat.js`) or makerspace_api/localStorage. `assets/js/api/config.js` and `assets/js/api/microblog.js` are excluded from the makerspace-only publish — resolve URIs/APIs in the adapter; do not import those files from makerspace pages. **Note:** Flask microblog has no per-topic ACL — any logged-in guest can read/write any topic (including `makerspace-request-*`); request ids are guessable, so chats are school-shared, not private. **Exception for inventory topic `makerspace-inventory`:** the makerspace API enforces admin-only POST (any signed-in user may GET). Client auto-posts `"<name> was added."` / `"<name> is out of stock."` when admins change inventory. `submit`/`requests`/`admin` pages show `#inventoryFeed` for stock announcements (students are read-only; the post form is admin-only). Cache-bust stamp is currently `?v=ms28`. **Production github.io must not call Flask directly** (CORS → Failed to fetch); the client only falls back to Flask on localhost and otherwise uses the makerspace_api proxy. `resolveApiBase()` falls back to `https://makerspace-api-o7u6.onrender.com` when cached HTML missed the injected config. **Render free tier sleeps:** `.github/workflows/keep-render-awake.yml` pings `/api/health` every hour; the UI has a `#makerspaceApiStatus` banner + Retry (school firewalls often drop connections before cold start finishes). **Member edit:** server `unquote`s `/api/members/{email}` paths (client `encodeURIComponent` turns `@` into `%40`, which used to cause "Account not found"); blank password keeps the existing one; on 404 the client `hydrateFromApi()`s and refreshes the member list. **Chat UI is not clobbered by poll:** `renderRequestLists`/`renderAdminRequests` snapshot/restore open chat drafts; the 20s poll skips `renderAll` while `isUserTyping()`; `renderChat`/`openChatForRequest` skip focused chat areas.
* Other backend services live in [node_backend/README.md](node_backend/README.md) and are separate from the site build pipeline; read it before making backend changes.

## Coding Standards

### Naming Conventions

Names should:

* Explain *intent*, not implementation.
* Avoid abbreviations unless standard.
* Be consistent across the codebase.
* Example: Use `normalizeUserTransactionData()` instead of `procData2()`.

### Error Handling

* **Fail Fast:** Validate inputs early, raise errors immediately with clear messages, and don't silently ignore failures.
* **Defensive Programming:** Assume inputs are invalid or malicious, add guards for edge cases, and never trust external data sources.
* **Discipline:** Never swallow exceptions silently. Always include context in errors and use typed/custom errors where appropriate.

### Logging Rules

* Log meaningful events, not noise.
* Logs should answer: *what happened and why?*
* Avoid logging sensitive data.

## Testing Rules

### Behavior-driven Tests

* Tests should describe behavior, not implementation.
* Every critical logic path should be testable.
* Prefer unit tests for logic, integration tests for flows.

### Critical Path Coverage Required

* **Agent rule:** If code changes behavior, update or add tests.
* Ensure deterministic behavior (avoid randomness unless explicitly required, fix seeds when needed).

## Agent Behavior Rules

### Plan Before Coding

* For non-trivial tasks: write a short plan before coding.
* Break into steps before implementation.

### Minimize Diffs

* Prefer minimal diffs over refactors unless required.
* Don’t rewrite working code without reason.

### Follow Existing Patterns

* Match existing codebase style and structure.
* Don’t introduce new architecture unless necessary.
* **Verify Assumptions:** If unclear, infer cautiously and flag assumptions. Never silently guess critical requirements.

### Self-Updating and Continuous Learning

* **Update this file:** As you iterate, make mistakes, and learn new system patterns or constraints, actively update `AGENTS.md` (and its optimized counterpart) with important notes so the system improves over time.

## Anti-Patterns

### God Functions

* Avoid functions that do too many things. Stick to SRP.

### Hidden Side Effects

* Ensure predictability by keeping side effects explicit and well-documented.

### Over-engineering

* **YAGNI (You Aren’t Gonna Need It):** Don’t build features unless required now. Avoid speculative generalization.
* Optimize only after correctness is guaranteed (Profile before optimizing).
