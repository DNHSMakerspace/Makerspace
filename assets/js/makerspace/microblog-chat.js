/*
 * Del Norte Makerspace request chat → Flask microblog (retextured as chat).
 *
 * Backend: flask.opencodingsociety.com /api/microblog (already deployed, free).
 * Auth: free guest account derived from the makerspace email (no OCS login).
 * Topics:
 *   makerspace-request-<id> — one thread per print request (host-resolved URI).
 *   makerspace-inventory    — shared admin inventory announcements (always the
 *                             shared/school Flask, even when the admin is on
 *                             localhost, so changes sync across devices).
 * Message wire format: "Sender\u001Ftext" (unit separator) so display names survive.
 *
 * URI resolution is inlined — assets/js/api/config.js is excluded from the
 * makerspace-only publish. Override with window.MAKERSPACE_FLASK_API.
 */
(function () {
  const TOPIC_PREFIX = 'makerspace-request-';
  const INVENTORY_TOPIC = 'makerspace-inventory';
  const SEP = '\u001F';
  const STATUS = {
    idle: 'idle',
    ready: 'ready',
    connecting: 'connecting',
    connected: 'connected',
    unavailable: 'unavailable'
  };

  function resolveFlaskUri() {
    if (typeof window !== 'undefined' && typeof window.MAKERSPACE_FLASK_API === 'string' && window.MAKERSPACE_FLASK_API) {
      return window.MAKERSPACE_FLASK_API.replace(/\/$/, '');
    }
    if (typeof window === 'undefined') return '';
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:8587';
    return 'https://flask.opencodingsociety.com';
  }

  // Shared board topics (inventory announcements) must always hit the school
  // Flask so a localhost admin edit still posts where production devices listen.
  function resolveSharedFlaskUri() {
    if (typeof window !== 'undefined' && typeof window.MAKERSPACE_FLASK_API === 'string' && window.MAKERSPACE_FLASK_API) {
      return window.MAKERSPACE_FLASK_API.replace(/\/$/, '');
    }
    return 'https://flask.opencodingsociety.com';
  }

  function baseFetch(method, body) {
    return {
      method: method || 'GET',
      mode: 'cors',
      cache: 'default',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Origin': 'client'
      },
      body: body ? JSON.stringify(body) : undefined
    };
  }

  function topicFor(requestId) {
    return TOPIC_PREFIX + String(requestId || '').replace(/[^\w.-]/g, '');
  }

  function sanitizeTopicPath(topicPath) {
    return String(topicPath || '').replace(/[^\w.-]/g, '');
  }

  function guestIdentity(user) {
    const email = ((user && user.email) || '').trim().toLowerCase();
    const local = email.split('@')[0] || 'guest';
    const slug = local.replace(/[^a-z0-9]/g, '') || 'guest';
    const uid = 'ms-' + slug;
    // Deterministic password so the same makerspace account reuses the same
    // Flask guest on every device without storing secrets in localStorage.
    let hash = 5381;
    const seed = 'dnms|' + email;
    for (let i = 0; i < seed.length; i += 1) {
      hash = ((hash * 33) ^ seed.charCodeAt(i)) >>> 0;
    }
    return { uid, password: 'ms' + hash.toString(36) + 'x' };
  }

  function parseMessage(post) {
    const raw = post && post.content != null ? String(post.content) : '';
    let sender = (post && (post.userName || post.userUid)) || 'Unknown';
    let text = raw;
    const idx = raw.indexOf(SEP);
    if (idx >= 0) {
      const left = raw.slice(0, idx).trim();
      if (left) sender = left;
      text = raw.slice(idx + 1);
    }
    let ts = Date.now();
    if (post && post.timestamp) {
      const parsed = new Date(String(post.timestamp).includes('T') ? post.timestamp : String(post.timestamp) + 'Z');
      if (!Number.isNaN(parsed.getTime())) ts = parsed.getTime();
    }
    return { sender, senderEmail: null, text: text, ts: ts, remoteId: post && post.id };
  }

  const state = {
    status: STATUS.idle,
    ready: false,
    lastError: null,
    historyOk: false
  };

  function setStatus(status, err) {
    state.status = status;
    state.lastError = err || null;
    if (status === STATUS.connected) state.ready = true;
  }

  async function ensureGuestAuth(user, uriOverride) {
    const base = uriOverride || resolveFlaskUri();
    if (!base) {
      setStatus(STATUS.unavailable, 'no-flask-uri');
      return false;
    }
    const id = guestIdentity(user);
    try {
      let res = await fetch(base + '/api/authenticate', baseFetch('POST', id));
      if (!res.ok) {
        await fetch(base + '/api/user/guest', baseFetch('POST', id)).catch(function () { /* may already exist */ });
        res = await fetch(base + '/api/authenticate', baseFetch('POST', id));
      }
      if (!res.ok) {
        setStatus(STATUS.unavailable, 'auth-failed');
        return false;
      }
      setStatus(STATUS.connected);
      return true;
    } catch (error) {
      setStatus(STATUS.unavailable, 'network');
      return false;
    }
  }

  async function loadMessagesForTopic(topicPath, user, options) {
    const opts = options || {};
    const topic = sanitizeTopicPath(topicPath);
    if (!topic) return { ok: false, messages: [] };
    const base = opts.uri || resolveSharedFlaskUri() || resolveFlaskUri();
    const authed = await ensureGuestAuth(user, base);
    if (!authed) return { ok: false, messages: [] };
    try {
      const url = base + '/api/microblog?pagePath=' + encodeURIComponent(topic);
      const res = await fetch(url, baseFetch('GET'));
      if (!res.ok) {
        state.historyOk = false;
        return { ok: false, messages: [] };
      }
      const data = await res.json();
      const posts = (data && (data.microblogs || data.posts)) || (Array.isArray(data) ? data : []);
      const messages = posts.map(parseMessage).sort(function (a, b) { return a.ts - b.ts; });
      state.historyOk = true;
      setStatus(STATUS.connected);
      return { ok: true, messages: messages };
    } catch (error) {
      state.historyOk = false;
      return { ok: false, messages: [] };
    }
  }

  async function sendMessageToTopic(topicPath, text, senderName, user, options) {
    const opts = options || {};
    const topic = sanitizeTopicPath(topicPath);
    if (!topic || !text) return false;
    const base = opts.uri || resolveSharedFlaskUri() || resolveFlaskUri();
    const authed = await ensureGuestAuth(user, base);
    if (!authed) return false;
    const payload = {
      content: String(senderName || 'Unknown') + SEP + String(text),
      topicPath: topic
    };
    try {
      const res = await fetch(base + '/api/microblog', baseFetch('POST', payload));
      return res.ok;
    } catch (error) {
      return false;
    }
  }

  async function loadMessagesForRequest(requestId, user) {
    return loadMessagesForTopic(topicFor(requestId), user, { uri: resolveFlaskUri() });
  }

  async function sendMessage(requestId, text, senderName, user) {
    return sendMessageToTopic(topicFor(requestId), text, senderName, user, { uri: resolveFlaskUri() });
  }

  window.MakerspaceMicroblogChat = {
    backend: 'flask-microblog',
    INVENTORY_TOPIC: INVENTORY_TOPIC,
    resolveFlaskUri: resolveFlaskUri,
    resolveSharedFlaskUri: resolveSharedFlaskUri,
    topicFor: topicFor,
    guestIdentity: guestIdentity,
    ensureGuestAuth: ensureGuestAuth,
    loadMessagesForTopic: loadMessagesForTopic,
    sendMessageToTopic: sendMessageToTopic,
    loadMessagesForRequest: loadMessagesForRequest,
    sendMessage: sendMessage,
    status: function () { return state.status; },
    isAvailable: function () { return state.status === STATUS.connected || state.ready; },
    hasHistory: function () { return state.historyOk; },
    lastError: function () { return state.lastError; }
  };
})();
