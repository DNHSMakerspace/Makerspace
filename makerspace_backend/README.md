# Del Norte Makerspace API

Shared backend for the makerspace site so **accounts, print requests, chats, and filament inventory sync across devices**.

The static Jekyll site is still published on GitHub Pages. This API is a separate process that stores state in `data/db.json`.

## Why this exists

`localStorage` is per-browser. Two computers signed into the same makerspace account used to see different chats and inventory. This server is the source of truth; the browser keeps a cache for instant paint / offline fallback.

## Run locally

```bash
# from repo root
python3 makerspace_backend/server.py
```

- Listens on `http://localhost:8787` by default
- Override: `MAKERSPACE_API_PORT=9000 python3 makerspace_backend/server.py`
- Production: honors Render `PORT` env var
- Data file: `makerspace_backend/data/db.json` (created on first run)

The site auto-points at `http://localhost:8787` when opened from `localhost` / `127.0.0.1`. Production sets `makerspace_api` in `_config.yml`.

## Production (Render)

- Live service: `https://makerspace-api-o7u6.onrender.com`
- Health: `GET /api/health`
- Blueprint: repo-root `render.yaml` + `makerspace_backend/render.yaml`
  - `rootDir: makerspace_backend`, `dockerfilePath: ./Dockerfile`, `dockerContext: .`
- Free tier: cold starts (~30–60s after idle); no persistent disk — `data/db.json` resets on redeploy. Flask chat posts persist on the school server.
- **Keep-alive:** repo workflow `.github/workflows/keep-render-awake.yml` hits `/api/health` every 10 minutes so the service does not sleep. If school Wi-Fi still drops the first request, the site shows a gold **Retry connection** banner (`#makerspaceApiStatus`).
- After changing `_config.yml` `makerspace_api`, push so GitHub Pages redeploys `window.MAKERSPACE_API`.

## Chat (request chats are real chats)

Browser → **this API** → Flask microblog (server-side). Direct browser → Flask CORS fails on `dnhsmakerspace.github.io` and often on `localhost:4500`.

| | |
|--|--|
| Browser | `GET /api/microblog?topic=makerspace-request-<id>` + `POST /api/microblog` `{topic, message, sender}` |
| Server | Flask `opencodingsociety.com` `/api/microblog` (guest auth derived from makerspace email) |
| Also saved | Durable copy on this API under `/api/chats/<requestId>` |
| Topic | `makerspace-request-<id>` (one thread per print request) |

`/api/inventory-feed` is an alias for the same handlers (defaults topic `makerspace-inventory`).

Optional fallback: OCS Spring chat (`spring-chat.js`) or this API `/api/chats/*`, then localStorage.

**Flask security:** no per-topic ACL — any authenticated guest can read/write any topic. Request chats are school-shared, not private.

### Inventory updates microblog (admin posts + auto stock notes)

The site’s **Inventory updates** panel reads Flask topic `makerspace-inventory` via this API (server-side Flask call). Same CORS reason as request chats. **Only admins can post** to the inventory topic; any signed-in user can read it.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/microblog?topic=makerspace-inventory` | Bearer | Load shared stock-chat messages (any signed-in user) |
| POST | `/api/microblog` | Admin | `{ "message": "...", "topic": "makerspace-inventory" }` — non-admins get 403 |
| GET | `/api/inventory-feed` | Bearer | Alias (defaults inventory topic) |
| POST | `/api/inventory-feed` | Admin | Alias of microblog POST |

When an admin adds or removes inventory, the client auto-posts a short note: `"<name> was added."` or `"<name> is out of stock."`

Override Flask base with `MAKERSPACE_FLASK_API` (default `https://flask.opencodingsociety.com`).

Topic ACL: inventory topics are read-only for non-admins (post is admin-only); request topics limited to the request owner or an admin when the request row exists on this API.

## Deploy (required for real cross-device inventory/members/status)

GitHub Pages cannot run this process. Deploy it anywhere that can run Python 3 (Render, Railway, Fly.io, a VM behind nginx, etc.), then set the public base URL in `_config.yml`:

```yaml
makerspace_api: "https://makerspace-api-o7u6.onrender.com"
```

A Render blueprint example lives in `render.yaml` / `Dockerfile` in this folder.

Rebuild/republish the site so `_layouts/makerspace.html` injects `window.MAKERSPACE_API`.

CORS is open (`*`) for the simple school deployment. If you put it behind a stricter proxy, allow the GitHub Pages origin.

## Seeded accounts

| Role | Email | Password | School ID |
|------|-------|----------|-----------|
| Admin | `krishk27411@stu.powayusd.com` | `KrishK` | `1927411` |
| Member (demo) | `teststudent@stu.powayusd.com` | `test1234` | `1999999` |

Primary admin cannot be deleted. Demo student + one active request/chat are seeded on first boot.

## API surface

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/health` | — | Liveness |
| GET | `/api/state` | optional Bearer | Full state for the signed-in user (inventory always; requests/chats filtered) |
| GET | `/api/microblog?topic=...` | Bearer | Shared chat / inventory feed (Flask proxy) |
| POST | `/api/microblog` | Bearer | Post to shared chat; inventory topic requires admin |
| GET | `/api/inventory-feed?topic=...` | Bearer | Alias of microblog GET |
| POST | `/api/inventory-feed` | Admin | Alias of microblog POST (inventory topic) |
| POST | `/api/auth/signup` | — | Create member account + session |
| POST | `/api/auth/signin` | — | Sign in |
| POST | `/api/auth/signout` | Bearer | Drop session token |
| GET | `/api/auth/me` | Bearer | Current user |
| GET | `/api/inventory` | — | Filament list |
| POST | `/api/inventory` | Admin | Add color |
| DELETE | `/api/inventory/{id}` | Admin | Remove color |
| GET | `/api/requests` | Bearer | Own requests (admin: all) |
| POST | `/api/requests` | Bearer | Create print request |
| POST | `/api/requests/{id}/status` | Admin | `{ "action": "accept\|complete\|close\|reject" }` |
| GET | `/api/chats/{requestId}` | Bearer | One request chat |
| GET | `/api/inventory-feed` | Bearer | Shared inventory microblog messages |
| POST | `/api/inventory-feed` | Admin | Post inventory microblog message (`<name> was added.` / `<name> is out of stock.`) |
| POST | `/api/chats/{requestId}/messages` | Bearer | Send chat message |
| GET/POST | `/api/members` | Admin | List / create admins |
| PATCH/DELETE | `/api/members/{email}` | Admin | Edit / delete account (`@` may be `%40`-encoded; blank password keeps current) |

Auth is a random bearer token returned on signup/signin and stored by the client in `localStorage` (`makerspace-session-token`).

## Notes

- Passwords are stored in the JSON file for this school-demo deployment (same trust model as the previous browser-only demo). Treat `data/db.json` like a credentials file — do not commit it.
- `data/` is gitignored except `.gitkeep`.
- Frontend cache key remains `makerspace-demo-state`; the session token key is `makerspace-session-token`.
