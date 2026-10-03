/*
 * Makerspace request chat → OCS Spring group chat.
 *
 * Live transport: SockJS + STOMP on /ws-chat — Spring already has
 *   .requestMatchers("/ws-chat/**").permitAll()
 * in MvcSecurityConfig, so NO OCS account/session is required for send/receive.
 *
 * REST (group search/create + history) is still gated by SecurityConfig
 * (/api/groups/** requires ROLE_*). Apply makerspace_backend/spring-makerspace-chat-security.java.txt
 * to Open-Coding-Society/spring and redeploy to open those endpoints too.
 * Until then this adapter:
 *   - uses makerspace_spring_group_id / localStorage if known
 *   - tries REST when a session cookie happens to exist
 *   - falls back to makerspace_api/localStorage for history
 *
 * Message shape on the wire: [[request:<id>]] text
 * Backbone group name: makerspace (same pattern as lesson_chat's "lessons").
 */
(function () {
  const GROUP_NAME = 'makerspace';
  const REQUEST_MARKER_RE = /^\s*\[\[request:([^\]]+)\]\]\s?/;
  const CHAT_SOCKET_PORT = 8589;
  const SOCKJS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/sockjs-client/1.5.1/sockjs.min.js';
  const STOMP_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/stomp.js/2.3.3/stomp.min.js';
  const GROUP_ID_CACHE_KEY = 'makerspace-spring-group-id';

  function resolveSpringUri() {
    if (typeof window !== 'undefined' && typeof window.MAKERSPACE_SPRING_API === 'string' && window.MAKERSPACE_SPRING_API) {
      return window.MAKERSPACE_SPRING_API.replace(/\/$/, '');
    }
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:8585';
    return 'https://spring.opencodingsociety.com';
  }

  function buildChatSocketEndpoint() {
    const base = resolveSpringUri();
    const uri = new URL(base);
    if (uri.hostname === 'localhost' || uri.hostname === '127.0.0.1') {
      return `${uri.protocol}//${uri.hostname}:${CHAT_SOCKET_PORT}/ws-chat`;
    }
    return base + '/ws-chat';
  }

  const springFetchOptions = {
    method: 'GET',
    mode: 'cors',
    cache: 'default',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Origin': 'client'
    }
  };

  function loadScriptOnce(src) {
    window.__makerspaceChatScripts = window.__makerspaceChatScripts || {};
    if (!window.__makerspaceChatScripts[src]) {
      window.__makerspaceChatScripts[src] = new Promise(function (resolve, reject) {
        const el = document.createElement('script');
        el.src = src;
        el.onload = function () { resolve(); };
        el.onerror = function () { reject(new Error('failed to load ' + src)); };
        document.head.appendChild(el);
      });
    }
    return window.__makerspaceChatScripts[src];
  }

  async function loadChatLibraries() {
    await loadScriptOnce(SOCKJS_SRC);
    await loadScriptOnce(STOMP_SRC);
  }

  function readCachedGroupId() {
    if (typeof window !== 'undefined' && typeof window.MAKERSPACE_SPRING_GROUP_ID === 'string' && window.MAKERSPACE_SPRING_GROUP_ID) {
      const n = Number(window.MAKERSPACE_SPRING_GROUP_ID);
      if (n) return n;
    }
    try {
      const n = Number(localStorage.getItem(GROUP_ID_CACHE_KEY));
      return n || null;
    } catch (err) {
      return null;
    }
  }

  function cacheGroupId(id) {
    try {
      localStorage.setItem(GROUP_ID_CACHE_KEY, String(id));
    } catch (err) { /* ignore */ }
  }

  const state = {
    backboneGroupId: null,
    stompClient: null,
    subscription: null,
    connected: false,
    available: false,
    historyOk: false,
    status: 'idle',
    seenKeys: new Set(),
    listeners: []
  };

  function setStatus(status) {
    state.status = status;
  }

  function eventKey(event) {
    return [event?.sender || event?.name || '', event?.date || '', event?.message || ''].join('|');
  }

  function matchesRequest(rawMessage, requestId) {
    const m = REQUEST_MARKER_RE.exec(rawMessage || '');
    if (!m) return null;
    if (m[1] !== requestId) return null;
    return (rawMessage || '').replace(REQUEST_MARKER_RE, '');
  }

  function normalizeMessage(raw, requestId) {
    const text = matchesRequest(raw?.message, requestId);
    if (text === null) return null;
    const tsRaw = raw?.date || raw?.ts;
    const ts = tsRaw ? new Date(tsRaw).getTime() : Date.now();
    return {
      sender: raw?.sender || raw?.name || 'Unknown',
      senderEmail: null,
      text: text,
      ts: Number.isNaN(ts) ? Date.now() : ts
    };
  }

  function notify(message) {
    state.listeners.forEach(function (fn) {
      try { fn(message); } catch (err) { /* listener must not break chat */ }
    });
  }

  async function createGroup() {
    try {
      const res = await fetch(resolveSpringUri() + '/api/groups', Object.assign({}, springFetchOptions, {
        method: 'POST',
        body: JSON.stringify({ name: GROUP_NAME, period: '', course: 'makerspace', memberIds: [] })
      }));
      if (res.status === 201) {
        const body = await res.json().catch(function () { return null; });
        return Number(body && body.id) || null;
      }
    } catch (err) { /* network or CORS */ }
    return null;
  }

  async function resolveBackboneGroup() {
    if (state.backboneGroupId) return true;

    const cached = readCachedGroupId();
    if (cached) {
      state.backboneGroupId = cached;
      state.available = true;
      setStatus('ready');
      return true;
    }

    // REST discovery — works after spring security patch, or if an OCS cookie exists.
    const url = resolveSpringUri() + '/api/groups/search?name=' + encodeURIComponent(GROUP_NAME);
    try {
      const res = await fetch(url, springFetchOptions);
      if (res.ok) {
        const body = await res.json();
        const match = Array.isArray(body)
          ? (body.find(function (g) { return String(g?.name || '').toLowerCase() === GROUP_NAME; }) || null)
          : body;
        const id = Number(match && match.id);
        if (id) {
          state.backboneGroupId = id;
          cacheGroupId(id);
          state.available = true;
          setStatus('ready');
          return true;
        }
      } else if (res.status === 201 || res.status === 409) {
        /* fall through to create */
      }
    } catch (err) { /* REST blocked or offline */ }

    const createdId = await createGroup();
    if (createdId) {
      state.backboneGroupId = createdId;
      cacheGroupId(createdId);
      state.available = true;
      setStatus('ready');
      return true;
    }

    // Still try a re-search once (another client may have created it).
    try {
      const retryRes = await fetch(url, springFetchOptions);
      if (retryRes.ok) {
        const retryBody = await retryRes.json();
        const match = Array.isArray(retryBody)
          ? (retryBody.find(function (g) { return String(g?.name || '').toLowerCase() === GROUP_NAME; }) || null)
          : retryBody;
        const id = Number(match && match.id);
        if (id) {
          state.backboneGroupId = id;
          cacheGroupId(id);
          state.available = true;
          setStatus('ready');
          return true;
        }
      }
    } catch (err) { /* ignore */ }

    setStatus(state.connected ? 'connected' : 'needs-group-id');
    return !!state.backboneGroupId;
  }

  async function loadMessagesForRequest(requestId) {
    if (!requestId) return { ok: false, messages: [] };
    const groupOk = await resolveBackboneGroup();
    if (!groupOk || !state.backboneGroupId) return { ok: false, messages: [] };

    try {
      const res = await fetch(
        resolveSpringUri() + '/api/groups/chat/' + state.backboneGroupId + '/messages',
        springFetchOptions
      );
      if (!res.ok) {
        state.historyOk = false;
        return { ok: false, messages: [] };
      }
      const messages = await res.json();
      const out = [];
      (messages || []).forEach(function (msg) {
        const normalized = normalizeMessage(msg, requestId);
        if (!normalized) return;
        state.seenKeys.add(eventKey({ sender: normalized.sender, date: new Date(normalized.ts).toISOString(), message: msg.message }));
        out.push(normalized);
      });
      state.historyOk = true;
      state.available = true;
      setStatus(state.connected ? 'connected' : 'ready');
      return { ok: true, messages: out };
    } catch (err) {
      state.historyOk = false;
      return { ok: false, messages: [] };
    }
  }

  function handleIncoming(event) {
    if (!event || event.context !== 'sendMessageServer') return;
    const key = eventKey(event);
    if (state.seenKeys.has(key)) return;
    state.seenKeys.add(key);
    notify(event);
  }

  async function connect() {
    if (state.connected) return true;

    // WebSocket is permitAll in Spring — do not require a group REST lookup first
    // if we already know the group id (config or localStorage).
    const haveId = !!(state.backboneGroupId || readCachedGroupId());
    if (!haveId) {
      const ok = await resolveBackboneGroup();
      if (!ok) {
        // Connect is still useful once an id appears; without it STOMP send/subscribe fail.
        setStatus('needs-group-id');
        return false;
      }
    } else {
      state.backboneGroupId = state.backboneGroupId || readCachedGroupId();
    }

    if (typeof window.SockJS === 'undefined' || typeof window.Stomp === 'undefined') {
      try {
        await loadChatLibraries();
      } catch (err) {
        setStatus('unavailable');
        return false;
      }
    }
    if (typeof window.SockJS === 'undefined' || typeof window.Stomp === 'undefined') {
      setStatus('unavailable');
      return false;
    }

    setStatus('connecting');
    return new Promise(function (resolve) {
      const socket = new window.SockJS(buildChatSocketEndpoint());
      const client = window.Stomp.over(socket);
      client.debug = null;
      state.stompClient = client;

      client.connect({}, function () {
        state.connected = true;
        state.available = true;
        setStatus('connected');
        state.subscription = client.subscribe('/topic/group/' + state.backboneGroupId, function (frame) {
          try { handleIncoming(JSON.parse(frame.body)); } catch (err) { /* ignore bad frame */ }
        });
        resolve(true);
      }, function () {
        state.connected = false;
        setStatus(state.available ? 'ready' : 'unavailable');
        resolve(false);
      });

      socket.onclose = function () {
        state.connected = false;
        if (state.status === 'connected') setStatus(state.available ? 'ready' : 'unavailable');
      };
    });
  }

  function sendMessage(requestId, text, senderName) {
    if (!state.connected || !state.stompClient || !state.backboneGroupId) return false;
    const payload = {
      context: 'sendMessage',
      groupId: state.backboneGroupId,
      sender: senderName || 'Makerspace',
      message: '[[request:' + requestId + ']] ' + text,
      image: null,
      date: new Date().toISOString()
    };
    try {
      state.stompClient.send('/app/groups.chat', {}, JSON.stringify(payload));
      return true;
    } catch (err) {
      return false;
    }
  }

  function onMessage(fn) {
    state.listeners.push(fn);
  }

  function disconnect() {
    try {
      if (state.subscription) state.subscription.unsubscribe();
      if (state.stompClient && state.connected) state.stompClient.disconnect();
    } catch (err) { /* ignore */ }
    state.subscription = null;
    state.stompClient = null;
    state.connected = false;
  }

  window.MakerspaceSpringChat = {
    groupName: GROUP_NAME,
    resolveSpringUri: resolveSpringUri,
    resolveBackboneGroup: resolveBackboneGroup,
    loadMessagesForRequest: loadMessagesForRequest,
    sendMessage: sendMessage,
    connect: connect,
    disconnect: disconnect,
    onMessage: onMessage,
    status: function () { return state.status; },
    isAvailable: function () { return state.available; },
    isConnected: function () { return state.connected; },
    hasHistory: function () { return state.historyOk; },
    groupId: function () { return state.backboneGroupId; }
  };
})();
