#!/usr/bin/env python3
"""Ensure makerspace API data survives Render redeploys.

Render free has no disk. Without a durable backend, every git push that
redeploys the API resets members/chats/inventory to seed.

This script:
  1. Pushes an encrypted snapshot of local data/db.json to the school Flask
     server (topic makerspace-state-v1) — works with zero new accounts.
  2. Optionally creates a jsonblob.com store when --jsonblob is passed and
     MAKERSPACE_DATA_URL is unset (may be blocked on school Wi-Fi).
  3. Prints the Render env vars to paste in the dashboard.

Usage:
  python3 makerspace_backend/setup_remote_db.py
  python3 makerspace_backend/setup_remote_db.py --force-backup
  python3 makerspace_backend/setup_remote_db.py --jsonblob
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_LOCAL = ROOT / "data" / "db.json"
JSONBLOB_CREATE = "https://jsonblob.com/api/jsonBlob"


def http_json(method, url, body=None, timeout=20.0, headers=None):
    data = None
    hdrs = {"Accept": "application/json", "User-Agent": "makerspace-setup"}
    if headers:
        hdrs.update(headers)
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        hdrs["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read()
        location = response.headers.get("Location") or response.headers.get("location")
        status = response.status
    parsed = json.loads(raw.decode("utf-8")) if raw else None
    return status, location, parsed


def load_local_payload(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(
            f"{path} not found. Start the local API once (python3 makerspace_backend/server.py) "
            "so seed data exists, then re-run this script."
        )
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or not payload.get("users"):
        raise SystemExit(f"{path} has no users — refusing to push an empty seed as 'backup'.")
    return payload


def push_flask_snapshot(payload: dict, force: bool) -> None:
    # Import after path setup so `python3 makerspace_backend/setup_remote_db.py` works.
    sys.path.insert(0, str(ROOT))
    import server  # type: ignore

    ok = server.flask_put_state(payload)
    if not ok:
        raise SystemExit(
            "Flask state backup failed. Check network access to flask.opencodingsociety.com "
            "(try a phone hotspot), then re-run."
        )
    restored = server.flask_get_state()
    if not restored:
        raise SystemExit("Flask accepted the snapshot but restore failed — check MAKERSPACE_STATE_SECRET.")
    print(
        "Flask backup OK — "
        f"users={len(restored.get('users') or [])} "
        f"requests={len(restored.get('requests') or [])} "
        f"chats={len(restored.get('chats') or [])} "
        f"inventory={len(restored.get('inventory') or [])}"
    )
    if force:
        print("(force mode: snapshot written even if debounced)")


def create_jsonblob(payload: dict) -> str:
    status, location, parsed = http_json("POST", JSONBLOB_CREATE, payload)
    if not location:
        raise SystemExit(f"jsonblob create failed status={status} body={parsed!r}")
    return location.strip()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upload", dest="upload_path", default=str(DEFAULT_LOCAL))
    parser.add_argument(
        "--jsonblob",
        action="store_true",
        help="Also create a jsonblob.com store and print MAKERSPACE_DATA_URL (optional extra).",
    )
    parser.add_argument(
        "--force-backup",
        action="store_true",
        help="Disable debounce while pushing the Flask snapshot.",
    )
    args = parser.parse_args()

    payload = load_local_payload(Path(args.upload_path))
    print(f"Local snapshot: users={len(payload.get('users') or [])} from {args.upload_path}")
    print("Pushing encrypted snapshot to school Flask (makerspace-state-v1) ...")
    if args.force_backup:
        os.environ["MAKERSPACE_STATE_BACKUP_INTERVAL"] = "0"
    push_flask_snapshot(payload, force=args.force_backup)

    existing = os.environ.get("MAKERSPACE_DATA_URL", "").strip()
    if args.jsonblob and not existing:
        print("Creating optional jsonblob.com store ...")
        try:
            existing = create_jsonblob(payload)
        except SystemExit as exc:
            print(f"jsonblob skipped: {exc}", file=sys.stderr)
            existing = ""

    print("")
    print("Persistence is ready.")
    print("")
    print("Render Dashboard → makerspace-api → Environment:")
    print("  1. (Recommended) Set MAKERSPACE_STATE_SECRET to a long random string.")
    print("     Same secret must be used if you ever restore manually.")
    print("  2. Disable Auto Deploy so routine git pushes do not redeploy the API.")
    print("  3. Optional extra store:")
    if existing:
        print(f"       MAKERSPACE_DATA_URL={existing}")
    else:
        print("       python3 makerspace_backend/setup_remote_db.py --jsonblob  # from a non-school network")
    print("")
    print("After Render redeploys, the API reloads from Flask (and MAKERSPACE_DATA_URL if set).")
    print("Health check: GET /api/health  →  persistence should not be local-seed-only.")
    print("Treat MAKERSPACE_STATE_SECRET / MAKERSPACE_DATA_URL like passwords.")


if __name__ == "__main__":
    main()
