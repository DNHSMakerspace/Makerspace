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
- Data file: `makerspace_backend/data/db.json` (created on first run)

The site auto-points at `http://localhost:8787` when opened from `localhost` / `127.0.0.1`.

## Chat (Flask microblog — no OCS account)

Request chat is **retextured Flask microblog** via `assets/js/makerspace/microblog-chat.js`:

| | |
|--|--|
| Backend | `flask.opencodingsociety.com` `/api/microblog` (already deployed) |
| Topic | `makerspace-request-<id>` (one thread per print request) |
| Auth | Free **guest** account derived from makerspace email (`ms-<local>`) |
| Config | `_config.yml` → `makerspace_flask_api` (empty → localhost:8587 / production Flask) |

Messages sync across devices once the guest JWT cookie is set (`credentials: include`). No OCS login, no Spring group id.

Optional fallback: OCS Spring chat (`spring-chat.js`) if Flask is down and a Spring group id / security patch is configured.

Auth, inventory, members, and request status still use **this** API. Chat also falls back to this API’s `/api/chats/*` (or localStorage) if Flask is unreachable.

## Deploy (required for real cross-device inventory/members/status)

GitHub Pages cannot run this process. Deploy it anywhere that can run Python 3 (school server, Render, Railway, Fly.io, a VM behind nginx, etc.), then set the public base URL in `_config.yml`:

```yaml
makerspace_api: "https://makerspace-api.example.com"
```

A Render blueprint example lives in `render.yaml` / `Dockerfile` in this folder.

Rebuild/republish the site so `_layouts/makerspace.html` injects `window.MAKERSPACE_API`.

CORS is open (`*`) for the simple school deployment. If you put it behind a stricter proxy, allow origin `https://pages.opencodingsociety.com`.

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
| POST | `/api/chats/{requestId}/messages` | Bearer | Send chat message |
| GET/POST | `/api/members` | Admin | List / create admins |
| PATCH/DELETE | `/api/members/{email}` | Admin | Edit / delete account |

Auth is a random bearer token returned on signup/signin and stored by the client in `localStorage` (`makerspace-session-token`).

## Notes

- Passwords are stored in the JSON file for this school-demo deployment (same trust model as the previous browser-only demo). Treat `data/db.json` like a credentials file — do not commit it.
- `data/` is gitignored except `.gitkeep`.
- Frontend cache key remains `makerspace-demo-state`; the session token key is `makerspace-session-token`.
