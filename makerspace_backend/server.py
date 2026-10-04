#!/usr/bin/env python3
"""Del Norte Makerspace shared API.

Persists users, print requests, chats, and filament inventory to a JSON file
so every signed-in device sees the same data. Serves CORS for the static site.

Run:  python3 makerspace_backend/server.py
Port: 8787 (override with MAKERSPACE_API_PORT)
"""

from __future__ import annotations

import json
import os
import re
import secrets
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, unquote, urlparse

DATA_PATH = Path(__file__).resolve().parent / "data" / "db.json"
# Render injects $PORT; local default stays 8787.
PORT = int(os.environ.get("PORT") or os.environ.get("MAKERSPACE_API_PORT") or "8787")
HOST = os.environ.get("MAKERSPACE_API_HOST", "0.0.0.0")
FLASK_BASE = os.environ.get("MAKERSPACE_FLASK_API", "https://flask.opencodingsociety.com").rstrip("/")
INVENTORY_TOPIC = os.environ.get("MAKERSPACE_INVENTORY_TOPIC", "makerspace-inventory")
UNIT_SEP = "\u001f"

ADMIN_EMAIL = "krishk27411@stu.powayusd.com"
DEMO_STUDENT_EMAIL = "teststudent@stu.powayusd.com"
ALLOWED_MATERIALS = {"PLA", "PETG", "SILK+"}
ACTIVE_STATUSES = {"pending", "approved"}
HISTORY_STATUSES = {"rejected", "completed", "closed"}

DEFAULT_INVENTORY = [
    {"id": "inv-pla-orange", "name": "Orange PLA basic", "material": "PLA"},
    {"id": "inv-pla-black", "name": "Black PLA basic", "material": "PLA"},
    {"id": "inv-pla-white", "name": "White PLA basic", "material": "PLA"},
    {"id": "inv-petg-clear", "name": "Clear PETG", "material": "PETG"},
    {"id": "inv-petg-black", "name": "Black PETG", "material": "PETG"},
    {"id": "inv-silk-gold", "name": "Gold SILK+", "material": "SILK+"},
    {"id": "inv-silk-silver", "name": "Silver SILK+", "material": "SILK+"},
]

_lock = threading.RLock()
_db: Dict[str, Any] = {}


def now_ms() -> int:
    return int(time.time() * 1000)


def uid(prefix: str) -> str:
    return f"{prefix}-{now_ms()}-{secrets.token_hex(4)}"


def normalize_email(value: str) -> str:
    return (value or "").strip().lower()


def is_student_email(email: str) -> bool:
    return bool(re.match(r"^[^\s@]+@stu\.powayusd\.com$", email or "", re.I))


def is_school_id(school_id: str) -> bool:
    return bool(re.match(r"^19\d{5}$", school_id or ""))


def admin_emails(state: Dict[str, Any]) -> List[str]:
    return [
        normalize_email(u.get("email"))
        for u in state.get("users", [])
        if u and u.get("role") == "admin" and u.get("email")
    ]


def with_admin_participants(state: Dict[str, Any], emails: List[str]) -> List[str]:
    merged = {normalize_email(e) for e in (emails or []) if e}
    merged.update(admin_emails(state))
    return sorted(merged)


def public_user(user: Dict[str, Any], include_password: bool = False) -> Dict[str, Any]:
    out = {
        "id": user.get("id"),
        "name": user.get("name"),
        "email": user.get("email"),
        "schoolId": user.get("schoolId"),
        "role": user.get("role") or "member",
        "createdBy": user.get("createdBy"),
        "createdAt": user.get("createdAt"),
    }
    if include_password:
        out["password"] = user.get("password") or ""
    return out


def default_db() -> Dict[str, Any]:
    admin = {
        "id": "admin-1",
        "name": "Krish Kelageri",
        "email": ADMIN_EMAIL,
        "schoolId": "1927411",
        "password": "KrishK",
        "role": "admin",
    }
    student = {
        "id": "demo-student-1",
        "name": "Test Student",
        "email": DEMO_STUDENT_EMAIL,
        "schoolId": "1999999",
        "password": "test1234",
        "role": "member",
    }
    request = {
        "id": "demo-request-1",
        "name": "Test Student",
        "email": DEMO_STUDENT_EMAIL,
        "projectName": "Robotics Gear Mount",
        "material": "PLA",
        "color": "Orange PLA basic",
        "dimensions": "See uploaded file",
        "description": (
            "Mount plate for the FTC gear assembly. Keep walls 3 mm thick. "
            "Size is in the STL (about 80 x 40 x 12 mm)."
        ),
        "deadline": "Flexible",
        "fileName": "gear-mount-v2.stl",
        "status": "Pending",
        "createdAt": now_ms() - 1000 * 60 * 42,
    }
    t = now_ms() - 1000 * 60 * 40
    chat = {
        "id": f"chat-{request['id']}",
        "requestId": request["id"],
        "participants": [DEMO_STUDENT_EMAIL, ADMIN_EMAIL],
        "messages": [
            {
                "sender": "Test Student",
                "senderEmail": DEMO_STUDENT_EMAIL,
                "text": "Hi! I submitted a gear mount for robotics. Can you check if PLA Orange works for this?",
                "ts": t,
            },
            {
                "sender": "Makerspace",
                "senderEmail": ADMIN_EMAIL,
                "text": (
                    "Looks good — Orange PLA basic should work. Before we print, "
                    "I’ll confirm the price here. Rough estimate is about $4–$6 depending on infill."
                ),
                "ts": t + 1000 * 60 * 8,
            },
            {
                "sender": "Test Student",
                "senderEmail": DEMO_STUDENT_EMAIL,
                "text": "That works for me. Thanks!",
                "ts": t + 1000 * 60 * 12,
            },
        ],
    }
    return {
        "users": [admin, student],
        "requests": [request],
        "chats": [chat],
        "inventory": [dict(item) for item in DEFAULT_INVENTORY],
        "sessions": {},
        "seeded": True,
    }


def load_db() -> Dict[str, Any]:
    global _db
    with _lock:
        if _db:
            return _db
        if DATA_PATH.exists():
            try:
                parsed = json.loads(DATA_PATH.read_text(encoding="utf-8"))
                if isinstance(parsed, dict) and parsed.get("users"):
                    _db = parsed
                    _db.setdefault("requests", [])
                    _db.setdefault("chats", [])
                    _db.setdefault("inventory", [dict(i) for i in DEFAULT_INVENTORY])
                    _db.setdefault("sessions", {})
                    return _db
            except (json.JSONDecodeError, OSError):
                pass
        _db = default_db()
        save_db_locked()
        return _db


def save_db_locked() -> None:
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = DATA_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(_db, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(DATA_PATH)


def save_db() -> None:
    with _lock:
        load_db()
        save_db_locked()


def find_user_by_email(state: Dict[str, Any], email: str) -> Optional[Dict[str, Any]]:
    target = normalize_email(email)
    for user in state.get("users", []):
        if normalize_email(user.get("email") or "") == target:
            return user
    return None


def session_user(state: Dict[str, Any], token: str) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    session = (state.get("sessions") or {}).get(token)
    if not session:
        return None
    return find_user_by_email(state, session.get("email") or "")


def ensure_seed_integrity(state: Dict[str, Any]) -> None:
    users = state.setdefault("users", [])
    if not any(normalize_email(u.get("email") or "") == ADMIN_EMAIL.lower() for u in users):
        users.insert(
            0,
            {
                "id": "admin-1",
                "name": "Krish Kelageri",
                "email": ADMIN_EMAIL,
                "schoolId": "1927411",
                "password": "KrishK",
                "role": "admin",
            },
        )
    primary = find_user_by_email(state, ADMIN_EMAIL)
    if primary:
        primary["role"] = "admin"


def state_for_user(state: Dict[str, Any], user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    ensure_seed_integrity(state)
    is_admin = bool(user and user.get("role") == "admin")
    viewer_email = normalize_email(user.get("email") if user else "")

    if user:
        users = [public_user(user, include_password=is_admin)]
        if is_admin:
            users = [public_user(u, include_password=True) for u in state.get("users", [])]
        requests = list(state.get("requests", []))
        chats = []
        for chat in state.get("chats", []):
            participants = {normalize_email(p) for p in chat.get("participants") or []}
            if is_admin or viewer_email in participants:
                chats.append(chat)
    else:
        users = []
        requests = []
        chats = []

    inventory = list(state.get("inventory") or [])
    session = None
    if user:
        session = {
            "email": user.get("email"),
            "role": user.get("role") or "member",
            "name": user.get("name"),
        }

    return {
        "session": session,
        "users": users,
        "requests": requests,
        "chats": chats,
        "inventory": inventory,
    }


def api_error(status: int, message: str) -> tuple:
    return status, {"error": message}


def base36(value: int) -> str:
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    if value == 0:
        return "0"
    out = ""
    while value:
        value, rem = divmod(value, 36)
        out = digits[rem] + out
    return out


def guest_identity(email: str) -> Dict[str, str]:
    """Mirror assets/js/makerspace/microblog-chat.js guest derivation."""
    normalized = normalize_email(email)
    local = normalized.split("@")[0] or "guest"
    slug = re.sub(r"[^a-z0-9]", "", local) or "guest"
    uid = f"ms-{slug}"
    seed = f"dnms|{normalized}"
    hash_value = 5381
    for ch in seed:
        hash_value = ((hash_value * 33) ^ ord(ch)) & 0xFFFFFFFF
    return {"uid": uid, "password": f"ms{base36(hash_value)}x"}


def flask_call(
    method: str,
    path: str,
    payload: Optional[Dict[str, Any]] = None,
    cookie: str = "",
) -> Tuple[int, Dict[str, Any], str]:
    url = f"{FLASK_BASE}{path}"
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Content-Type", "application/json")
    request.add_header("X-Origin", "makerspace-backend")
    request.add_header("Origin", "https://pages.opencodingsociety.com")
    if cookie:
        request.add_header("Cookie", cookie)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read()
            set_cookie = response.headers.get("Set-Cookie") or ""
            status = response.status
    except urllib.error.HTTPError as error:
        raw = error.read()
        set_cookie = error.headers.get("Set-Cookie") or ""
        status = error.code
    except Exception as error:  # network / DNS
        return 0, {"error": f"Flask unreachable: {error}"}, ""

    parsed: Dict[str, Any] = {}
    if raw:
        try:
            parsed = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            parsed = {"raw": raw.decode("utf-8", errors="replace")}
    return status, parsed if isinstance(parsed, dict) else {"data": parsed}, set_cookie


def flask_guest_cookie(email: str) -> str:
    identity = guest_identity(email)
    status, _, set_cookie = flask_call("POST", "/api/authenticate", identity)
    if status != 200:
        flask_call("POST", "/api/user/guest", identity)
        status, _, set_cookie = flask_call("POST", "/api/authenticate", identity)
    if status != 200 or not set_cookie:
        return ""
    return set_cookie.split(";", 1)[0]


def parse_microblog_posts(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    posts = payload.get("microblogs") or payload.get("posts") or []
    if not isinstance(posts, list):
        return []
    messages: List[Dict[str, Any]] = []
    for post in posts:
        if not isinstance(post, dict):
            continue
        raw = str(post.get("content") or "")
        sender = str(post.get("userName") or post.get("userUid") or "Unknown")
        text = raw
        if UNIT_SEP in raw:
            left, right = raw.split(UNIT_SEP, 1)
            if left.strip():
                sender = left.strip()
            text = right
        ts = None
        timestamp = post.get("timestamp")
        if timestamp:
            try:
                parsed_ts = time.mktime(time.strptime(str(timestamp)[:19], "%Y-%m-%dT%H:%M:%S"))
                ts = int(parsed_ts * 1000)
            except ValueError:
                ts = None
        messages.append(
            {
                "sender": sender,
                "text": text,
                "ts": ts,
                "remoteId": post.get("id"),
            }
        )
    messages.sort(key=lambda item: item.get("ts") or 0)
    return messages


def sanitize_topic(topic: str) -> str:
    return re.sub(r"[^\w.-]", "", str(topic or ""))


def request_topic_id(topic: str) -> str:
    prefix = "makerspace-request-"
    if topic.startswith(prefix):
        return topic[len(prefix):]
    return ""


def can_access_topic(
    state: Dict[str, Any],
    user: Dict[str, Any],
    topic: str,
    *,
    for_post: bool = False,
) -> bool:
    if not user:
        return False
    if topic in {INVENTORY_TOPIC, "makerspace-inventory"}:
        # Anyone signed in can read stock updates; only admins may post.
        if for_post:
            return user.get("role") == "admin"
        return True
    request_id = request_topic_id(topic)
    if not request_id:
        return True
    request = next(
        (r for r in state.get("requests", []) if r.get("id") == request_id),
        None,
    )
    if not request:
        # Chat may exist on Flask before this API has the request row.
        return True
    return user.get("role") == "admin" or normalize_email(
        request.get("email")
    ) == normalize_email(user.get("email"))


def read_json_body(handler: BaseHTTPRequestHandler) -> Dict[str, Any]:
    length = int(handler.headers.get("Content-Length") or 0)
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    if not raw:
        return {}
    try:
        parsed = json.loads(raw.decode("utf-8"))
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def auth_token(handler: BaseHTTPRequestHandler) -> str:
    header = handler.headers.get("Authorization") or ""
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return ""


def cors_headers() -> Dict[str, str]:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
    }


class MakerspaceHandler(BaseHTTPRequestHandler):
    server_version = "MakerspaceAPI/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:  # quieter logs
        import sys

        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send(self, status: int, payload: Any) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        for key, value in cors_headers().items():
            self.send_header(key, value)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        for key, value in cors_headers().items():
            self.send_header(key, value)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _handle_microblog_get(self, parsed) -> None:
        with _lock:
            state = load_db()
            user = session_user(state, auth_token(self))
            if not user:
                self._send(401, {"error": "Sign in required."})
                return
            query = parse_qs(parsed.query or "")
            topic = sanitize_topic((query.get("topic") or query.get("pagePath") or [INVENTORY_TOPIC])[0] or INVENTORY_TOPIC)
            if not can_access_topic(state, user, topic):
                self._send(403, {"error": "You do not have access to this chat."})
                return
        cookie = flask_guest_cookie(user.get("email") or "")
        if not cookie:
            self._send(502, {"error": "Unable to reach the shared chat server."})
            return
        status, payload, _ = flask_call(
            "GET",
            f"/api/microblog?pagePath={urllib.parse.quote(topic)}",
            cookie=cookie,
        )
        if status != 200:
            self._send(502, {"error": "Shared chat server returned an error."})
            return
        # Also merge durable makerspace_backend chat history for this request.
        messages = parse_microblog_posts(payload)
        request_id = request_topic_id(topic)
        if request_id:
            chat = next(
                (c for c in state.get("chats", []) if c.get("requestId") == request_id),
                None,
            )
            if chat:
                for message in chat.get("messages") or []:
                    sender = message.get("sender")
                    text = message.get("text")
                    match = next(
                        (
                            m
                            for m in messages
                            if m.get("sender") == sender and m.get("text") == text
                        ),
                        None,
                    )
                    if match:
                        # Same logical post written to Flask + this API — keep
                        # durable senderEmail for "mine" highlight.
                        if not match.get("senderEmail") and message.get("senderEmail"):
                            match["senderEmail"] = message.get("senderEmail")
                        continue
                    messages.append(
                        {
                            "sender": sender,
                            "senderEmail": message.get("senderEmail"),
                            "text": text,
                            "ts": message.get("ts"),
                        }
                    )
                messages.sort(key=lambda item: item.get("ts") or 0)
        self._send(200, {"topic": topic, "messages": messages})

    def _handle_microblog_post(self, body: Dict[str, Any]) -> None:
        with _lock:
            state = load_db()
            user = session_user(state, auth_token(self))
            if not user:
                self._send(401, {"error": "Sign in required."})
                return
            message = (body.get("message") or body.get("text") or "").strip()
            if not message:
                self._send(400, {"error": "Type a message first."})
                return
            topic = sanitize_topic(body.get("topic") or body.get("topicPath") or INVENTORY_TOPIC) or INVENTORY_TOPIC
            if not can_access_topic(state, user, topic, for_post=True):
                if topic in {INVENTORY_TOPIC, "makerspace-inventory"}:
                    self._send(403, {"error": "Only admins can post inventory updates."})
                else:
                    self._send(403, {"error": "You do not have access to this chat."})
                return
            sender = (body.get("sender") or user.get("name") or "Staff").strip() or "Staff"
            content = f"{sender}{UNIT_SEP}{message}"
            request_id = request_topic_id(topic)

            # Durable copy on this API (works even if Flask is down later).
            if request_id:
                chat = next(
                    (c for c in state.get("chats", []) if c.get("requestId") == request_id),
                    None,
                )
                if not chat:
                    request = next(
                        (r for r in state.get("requests", []) if r.get("id") == request_id),
                        None,
                    )
                    chat = {
                        "id": f"chat-{request_id}",
                        "requestId": request_id,
                        "participants": with_admin_participants(
                            state,
                            [request.get("email") if request else user.get("email"), user.get("email")],
                        ),
                        "messages": [],
                    }
                    state.setdefault("chats", []).insert(0, chat)
                chat.setdefault("messages", []).append(
                    {
                        "sender": sender,
                        "senderEmail": user.get("email"),
                        "text": message,
                        "ts": now_ms(),
                    }
                )
                save_db_locked()

        cookie = flask_guest_cookie(user.get("email") or "")
        if not cookie:
            # Local API copy saved; Flask sync failed.
            self._send(200, {"ok": True, "topic": topic, "savedLocally": True})
            return
        status, payload, _ = flask_call(
            "POST",
            "/api/microblog",
            {"content": content, "topicPath": topic},
            cookie=cookie,
        )
        if status != 200:
            self._send(200, {"ok": True, "topic": topic, "savedLocally": True, "flaskSync": False})
            return
        self._send(200, {"ok": True, "topic": topic, "remoteId": payload.get("id"), "flaskSync": True})

    def _handle_inventory_feed_get(self, parsed) -> None:
        self._handle_microblog_get(parsed)

    def _handle_inventory_feed_post(self, body: Dict[str, Any]) -> None:
        if not (body.get("topic") or body.get("topicPath")):
            body = dict(body)
            body["topic"] = INVENTORY_TOPIC
        self._handle_microblog_post(body)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path in {"/api/inventory-feed", "/api/microblog"}:
            self._handle_microblog_get(parsed)
            return

        with _lock:
            state = load_db()
            user = session_user(state, auth_token(self))

            if path == "/api/health":
                self._send(200, {"ok": True, "service": "makerspace-api"})
                return

            if path == "/api/state":
                self._send(200, state_for_user(state, user))
                return

            if path == "/api/auth/me":
                if not user:
                    self._send(401, {"error": "Not signed in."})
                    return
                self._send(200, {"user": public_user(user, include_password=user.get("role") == "admin")})
                return

            if path == "/api/inventory":
                self._send(200, {"inventory": list(state.get("inventory") or [])})
                return

            if path == "/api/requests":
                if not user:
                    self._send(401, {"error": "Sign in required."})
                    return
                if user.get("role") == "admin":
                    items = list(state.get("requests") or [])
                else:
                    email = normalize_email(user.get("email"))
                    items = [
                        r for r in state.get("requests", [])
                        if normalize_email(r.get("email") or "") == email
                    ]
                self._send(200, {"requests": items})
                return

            if path.startswith("/api/chats/"):
                request_id = path[len("/api/chats/"):]
                if not user:
                    self._send(401, {"error": "Sign in required."})
                    return
                request = next(
                    (r for r in state.get("requests", []) if r.get("id") == request_id),
                    None,
                )
                if not request:
                    self._send(404, {"error": "Request not found."})
                    return
                can_view = user.get("role") == "admin" or normalize_email(
                    request.get("email")
                ) == normalize_email(user.get("email"))
                if not can_view:
                    self._send(403, {"error": "You do not have access to this request."})
                    return
                chat = next(
                    (c for c in state.get("chats", []) if c.get("requestId") == request_id),
                    None,
                )
                self._send(200, {"chat": chat})
                return

            if path == "/api/members":
                if not user or user.get("role") != "admin":
                    self._send(403, {"error": "Admin only."})
                    return
                self._send(
                    200,
                    {"users": [public_user(u, include_password=True) for u in state.get("users", [])]},
                )
                return

        self._send(404, {"error": "Not found."})

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        body = read_json_body(self)

        if path in {"/api/inventory-feed", "/api/microblog"}:
            self._handle_microblog_post(body)
            return

        with _lock:
            state = load_db()
            user = session_user(state, auth_token(self))

            if path == "/api/auth/signup":
                name = (body.get("name") or "").strip()
                email = normalize_email(body.get("email") or "")
                school_id = (body.get("schoolId") or "").strip()
                password = body.get("password") or ""
                if not name or not email or not school_id or not password:
                    self._send(*api_error(400, "Please complete every required field."))
                    return
                if not is_student_email(email) and email != ADMIN_EMAIL.lower():
                    self._send(*api_error(400, "Use a valid Poway school email ending in @stu.powayusd.com."))
                    return
                if not is_school_id(school_id):
                    self._send(*api_error(400, "School ID must be 7 digits and start with 19."))
                    return
                if len(password) < 4:
                    self._send(*api_error(400, "Password must be at least 4 characters."))
                    return
                if find_user_by_email(state, email):
                    self._send(*api_error(409, "An account with that email already exists."))
                    return
                if any(
                    (u.get("schoolId") or "").lower() == school_id.lower()
                    for u in state.get("users", [])
                ):
                    self._send(*api_error(409, "That school ID is already in use."))
                    return
                new_user = {
                    "id": uid("user"),
                    "name": name,
                    "email": email,
                    "schoolId": school_id,
                    "password": password,
                    "role": "admin" if email == ADMIN_EMAIL.lower() else "member",
                    "createdAt": now_ms(),
                }
                state["users"].append(new_user)
                token = secrets.token_hex(32)
                state.setdefault("sessions", {})[token] = {
                    "email": email,
                    "createdAt": now_ms(),
                }
                save_db_locked()
                self._send(201, {"token": token, **state_for_user(state, new_user)})
                return

            if path == "/api/auth/signin":
                email = normalize_email(body.get("email") or "")
                password = body.get("password") or ""
                user = find_user_by_email(state, email)
                if not user or (user.get("password") or "") != password:
                    self._send(*api_error(401, "Incorrect email or password."))
                    return
                token = secrets.token_hex(32)
                state.setdefault("sessions", {})[token] = {
                    "email": email,
                    "createdAt": now_ms(),
                }
                save_db_locked()
                self._send(200, {"token": token, **state_for_user(state, user)})
                return

            if path == "/api/auth/signout":
                token = auth_token(self)
                if token and token in (state.get("sessions") or {}):
                    del state["sessions"][token]
                    save_db_locked()
                self._send(200, {"ok": True})
                return

            if not user:
                self._send(401, {"error": "Sign in required."})
                return

            if path == "/api/inventory":
                if user.get("role") != "admin":
                    self._send(*api_error(403, "Only admin accounts can update inventory."))
                    return
                name = (body.get("name") or "").strip()
                material = (body.get("material") or "").strip()
                if not name or not material:
                    self._send(*api_error(400, "Enter a color/stock name and choose a material."))
                    return
                if material not in ALLOWED_MATERIALS:
                    self._send(*api_error(400, "Material must be PLA, PETG, or SILK+."))
                    return
                inventory = state.setdefault("inventory", [])
                if any(
                    (item.get("name") or "").lower() == name.lower()
                    and (item.get("material") or "") == material
                    for item in inventory
                ):
                    self._send(*api_error(409, "That color is already listed for this material."))
                    return
                item = {
                    "id": uid("inv"),
                    "name": name,
                    "material": material,
                    "createdBy": user.get("email"),
                    "createdAt": now_ms(),
                }
                inventory.append(item)
                save_db_locked()
                self._send(201, {"item": item, **state_for_user(state, user)})
                return

            if path == "/api/requests":
                project_name = (body.get("projectName") or "").strip()
                material = (body.get("material") or "").strip()
                color = (body.get("color") or "").strip()
                description = (body.get("description") or "").strip()
                deadline = (body.get("deadline") or "").strip() or "Flexible"
                file_name = (body.get("fileName") or "").strip()
                if not project_name or not material or not color or not description or not file_name:
                    self._send(*api_error(400, "Missing required request fields."))
                    return
                if material not in ALLOWED_MATERIALS:
                    self._send(*api_error(400, "Choose PLA, PETG, or SILK+."))
                    return
                inventory = state.get("inventory") or []
                stocked = [i for i in inventory if i.get("material") == material]
                if not stocked:
                    self._send(*api_error(400, f"We don’t have {material} inventory stocked right now."))
                    return
                if not any(i.get("name") == color for i in stocked):
                    self._send(*api_error(400, "Choose a color from the list stocked for your selected material."))
                    return
                if not re.search(r"\.(stl|3mf)$", file_name, re.I):
                    self._send(*api_error(400, "File must be an STL (.stl) or 3MF (.3mf)."))
                    return
                request = {
                    "id": uid("request"),
                    "name": user.get("name"),
                    "email": user.get("email"),
                    "projectName": project_name,
                    "material": material,
                    "color": color,
                    "dimensions": "See uploaded file",
                    "description": description,
                    "deadline": deadline,
                    "fileName": file_name,
                    "status": "Pending",
                    "createdAt": now_ms(),
                }
                state.setdefault("requests", []).insert(0, request)
                chat = {
                    "id": f"chat-{request['id']}",
                    "requestId": request["id"],
                    "participants": with_admin_participants(state, [user.get("email")]),
                    "messages": [
                        {
                            "sender": user.get("name"),
                            "senderEmail": user.get("email"),
                            "text": "Request created. Waiting for admin review.",
                            "ts": now_ms(),
                        },
                        {
                            "sender": "Makerspace",
                            "senderEmail": ADMIN_EMAIL,
                            "text": (
                                "Thanks! Once we review this request, we’ll message you here "
                                "to confirm the price before printing begins."
                            ),
                            "ts": now_ms(),
                        },
                    ],
                }
                state.setdefault("chats", []).insert(0, chat)
                save_db_locked()
                self._send(201, {"request": request, **state_for_user(state, user)})
                return

            if path.startswith("/api/requests/") and path.endswith("/status"):
                if user.get("role") != "admin":
                    self._send(*api_error(403, "Admin only."))
                    return
                request_id = path[len("/api/requests/") : -len("/status")]
                request = next((r for r in state.get("requests", []) if r.get("id") == request_id), None)
                if not request:
                    self._send(404, {"error": "Request not found."})
                    return
                action = (body.get("action") or "").strip().lower()
                normalized = (request.get("status") or "Pending").lower()
                notes = {
                    "accepted": "Request accepted. We’re moving ahead with the print.",
                    "completed": "Print marked completed. It’s now in your print history.",
                    "closed": "Request closed. It’s now in your print history.",
                    "rejected": "Request rejected. We won’t print this job.",
                }
                if action in {"accept", "approve"}:
                    if normalized != "pending":
                        self._send(*api_error(409, "Only pending requests can be accepted."))
                        return
                    request["status"] = "Approved"
                    note_key = "accepted"
                elif action == "complete":
                    if normalized != "approved":
                        self._send(*api_error(409, "Only approved requests can be marked completed."))
                        return
                    request["status"] = "Completed"
                    note_key = "completed"
                elif action == "close":
                    if normalized not in ACTIVE_STATUSES:
                        self._send(*api_error(409, "Only open requests can be closed."))
                        return
                    request["status"] = "Closed"
                    note_key = "closed"
                elif action == "reject":
                    if normalized not in ACTIVE_STATUSES:
                        self._send(*api_error(409, "Only open requests can be rejected."))
                        return
                    request["status"] = "Rejected"
                    note_key = "rejected"
                else:
                    self._send(*api_error(400, "Unknown status action."))
                    return

                chat = next(
                    (c for c in state.get("chats", []) if c.get("requestId") == request_id),
                    None,
                )
                if not chat:
                    chat = {
                        "id": f"chat-{request_id}",
                        "requestId": request_id,
                        "participants": with_admin_participants(state, [request.get("email"), user.get("email")]),
                        "messages": [],
                    }
                    state.setdefault("chats", []).insert(0, chat)
                chat.setdefault("messages", []).append(
                    {
                        "sender": user.get("name"),
                        "senderEmail": user.get("email"),
                        "text": f"{request.get('projectName') or 'Request'} status → {request.get('status')}. {notes.get(note_key, '')}".strip(),
                        "ts": now_ms(),
                    }
                )
                chat["participants"] = with_admin_participants(
                    state,
                    list(chat.get("participants") or []) + [request.get("email"), user.get("email")],
                )
                save_db_locked()
                self._send(200, {"request": request, **state_for_user(state, user)})
                return

            if path.startswith("/api/chats/") and path.endswith("/messages"):
                request_id = path[len("/api/chats/") : -len("/messages")]
                text = (body.get("text") or "").strip()
                if not text:
                    self._send(*api_error(400, "Message text is required."))
                    return
                request = next((r for r in state.get("requests", []) if r.get("id") == request_id), None)
                if not request:
                    self._send(404, {"error": "Request not found."})
                    return
                can_view = user.get("role") == "admin" or normalize_email(
                    request.get("email")
                ) == normalize_email(user.get("email"))
                if not can_view:
                    self._send(*api_error(403, "Unable to send message for this request."))
                    return
                chat = next(
                    (c for c in state.get("chats", []) if c.get("requestId") == request_id),
                    None,
                )
                if not chat:
                    chat = {
                        "id": f"chat-{request_id}",
                        "requestId": request_id,
                        "participants": with_admin_participants(
                            state, [request.get("email"), user.get("email")]
                        ),
                        "messages": [],
                    }
                    state.setdefault("chats", []).insert(0, chat)
                chat.setdefault("messages", []).append(
                    {
                        "sender": user.get("name"),
                        "senderEmail": user.get("email"),
                        "text": text,
                        "ts": now_ms(),
                    }
                )
                chat["participants"] = with_admin_participants(
                    state,
                    list(chat.get("participants") or []) + [request.get("email"), user.get("email")],
                )
                save_db_locked()
                self._send(200, {"chat": chat, **state_for_user(state, user)})
                return

            if path == "/api/members":
                if user.get("role") != "admin":
                    self._send(*api_error(403, "Admin only."))
                    return
                name = (body.get("name") or "").strip()
                email = normalize_email(body.get("email") or "")
                school_id = (body.get("schoolId") or "").strip()
                password = body.get("password") or ""
                if not name or not email or not school_id or not password:
                    self._send(*api_error(400, "Please complete every required field."))
                    return
                if not is_student_email(email) and email != ADMIN_EMAIL.lower():
                    self._send(*api_error(400, "Use a valid Poway school email ending in @stu.powayusd.com."))
                    return
                if not is_school_id(school_id):
                    self._send(*api_error(400, "School ID must be 7 digits and start with 19."))
                    return
                if len(password) < 4:
                    self._send(*api_error(400, "Password must be at least 4 characters."))
                    return
                if find_user_by_email(state, email):
                    self._send(*api_error(409, "An account with that email already exists."))
                    return
                if any(
                    (u.get("schoolId") or "").lower() == school_id.lower()
                    for u in state.get("users", [])
                ):
                    self._send(*api_error(409, "That school ID is already in use."))
                    return
                new_admin = {
                    "id": uid("admin"),
                    "name": name,
                    "email": email,
                    "schoolId": school_id,
                    "password": password,
                    "role": "admin",
                    "createdBy": user.get("email"),
                    "createdAt": now_ms(),
                }
                state["users"].append(new_admin)
                for chat in state.get("chats", []):
                    chat["participants"] = with_admin_participants(
                        state, list(chat.get("participants") or []) + [email]
                    )
                save_db_locked()
                self._send(201, {"user": public_user(new_admin, include_password=True), **state_for_user(state, user)})
                return

        self._send(404, {"error": "Not found."})

    def do_PATCH(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        body = read_json_body(self)

        with _lock:
            state = load_db()
            user = session_user(state, auth_token(self))
            if not user or user.get("role") != "admin":
                self._send(403, {"error": "Admin only."})
                return

            if path.startswith("/api/members/"):
                # Client encodeURIComponent()s emails (@ → %40); decode before lookup.
                original_email = normalize_email(unquote(path[len("/api/members/") :]))
                target = find_user_by_email(state, original_email)
                if not target:
                    self._send(404, {"error": "Account not found."})
                    return
                if original_email == ADMIN_EMAIL.lower() and normalize_email(
                    body.get("email") or original_email
                ) != ADMIN_EMAIL.lower():
                    self._send(*api_error(400, "The primary admin email cannot be changed."))
                    return
                new_email = normalize_email(body.get("email") or original_email)
                school_id = (body.get("schoolId") or target.get("schoolId") or "").strip()
                password = body.get("password") or ""
                role = "admin" if (body.get("role") or "").strip() == "admin" else "member"
                if not new_email or not school_id:
                    self._send(*api_error(400, "Email and school ID are required."))
                    return
                if not is_student_email(new_email) and new_email != ADMIN_EMAIL.lower():
                    self._send(*api_error(400, "Use a valid Poway school email ending in @stu.powayusd.com."))
                    return
                if not is_school_id(school_id):
                    self._send(*api_error(400, "School ID must be 7 digits and start with 19."))
                    return
                if password and len(password) < 4:
                    self._send(*api_error(400, "Password must be at least 4 characters."))
                    return
                email_taken = any(
                    normalize_email(u.get("email") or "") == new_email and u is not target
                    for u in state.get("users", [])
                )
                if email_taken:
                    self._send(*api_error(409, "Another account already uses that email."))
                    return
                id_taken = any(
                    (u.get("schoolId") or "").lower() == school_id.lower() and u is not target
                    for u in state.get("users", [])
                )
                if id_taken:
                    self._send(*api_error(409, "That school ID is already in use."))
                    return

                if original_email != new_email:
                    target["email"] = new_email
                    for request in state.get("requests", []):
                        if normalize_email(request.get("email") or "") == original_email:
                            request["email"] = new_email
                    for chat in state.get("chats", []):
                        participants = [
                            new_email if normalize_email(p or "") == original_email else p
                            for p in chat.get("participants") or []
                        ]
                        chat["participants"] = with_admin_participants(state, participants)
                    for session in (state.get("sessions") or {}).values():
                        if normalize_email(session.get("email") or "") == original_email:
                            session["email"] = new_email
                target["schoolId"] = school_id
                target["role"] = "admin" if original_email == ADMIN_EMAIL.lower() else role
                if password:
                    target["password"] = password
                save_db_locked()
                self._send(200, {"user": public_user(target, include_password=True), **state_for_user(state, user)})
                return

        self._send(404, {"error": "Not found."})

    def do_DELETE(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        with _lock:
            state = load_db()
            user = session_user(state, auth_token(self))
            if not user or user.get("role") != "admin":
                self._send(403, {"error": "Admin only."})
                return

            if path.startswith("/api/inventory/"):
                item_id = path[len("/api/inventory/") :]
                inventory = state.get("inventory") or []
                before = len(inventory)
                state["inventory"] = [i for i in inventory if i.get("id") != item_id]
                if len(state["inventory"]) == before:
                    self._send(404, {"error": "Inventory item not found."})
                    return
                save_db_locked()
                self._send(200, {"ok": True, **state_for_user(state, user)})
                return

            if path.startswith("/api/members/"):
                email = normalize_email(unquote(path[len("/api/members/") :]))
                if email == ADMIN_EMAIL.lower():
                    self._send(*api_error(400, "The primary admin account cannot be deleted."))
                    return
                target = find_user_by_email(state, email)
                if not target:
                    self._send(404, {"error": "Account not found."})
                    return
                state["users"] = [
                    u for u in state.get("users", []) if normalize_email(u.get("email") or "") != email
                ]
                state["sessions"] = {
                    token: session
                    for token, session in (state.get("sessions") or {}).items()
                    if normalize_email(session.get("email") or "") != email
                }
                save_db_locked()
                self._send(200, {"ok": True, **state_for_user(state, user)})
                return

        self._send(404, {"error": "Not found."})


def main() -> None:
    load_db()
    server = ThreadingHTTPServer((HOST, PORT), MakerspaceHandler)
    print(f"Makerspace API listening on http://{HOST}:{PORT}")
    print(f"Persisting to {DATA_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down makerspace API")
        server.server_close()


if __name__ == "__main__":
    main()
