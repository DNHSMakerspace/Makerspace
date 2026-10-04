(function () {
  const STORAGE_KEY = 'makerspace-demo-state';
  const SESSION_TOKEN_KEY = 'makerspace-session-token';
  const ADMIN_EMAIL = 'krishk27411@stu.powayusd.com';
  const ACTIVE_STATUSES = ['pending', 'approved'];
  const HISTORY_STATUSES = ['rejected', 'completed', 'closed'];
  const ALLOWED_MATERIALS = ['PLA', 'PETG', 'SILK+'];
  // Fallback if HTML was cached before _config.yml injected MAKERSPACE_API.
  const FALLBACK_PRODUCTION_API = 'https://makerspace-api-o7u6.onrender.com';
  // School firewalls often drop long hangs before Render finishes waking up.
  const API_TIMEOUT_MS = 25000;
  const API_STATUS_ID = 'makerspaceApiStatus';

  function isLocalhostHost() {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1';
  }

  // Browser → Flask CORS fails on github.io / most school origins.
  // Only localhost may call Flask directly; everyone else must use the API proxy.
  function directFlaskAllowed() {
    return isLocalhostHost();
  }

  // Shared API base. Layout injects window.MAKERSPACE_API in production;
  // localhost auto-points at makerspace_backend/server.py on :8787.
  function resolveApiBase() {
    if (typeof window !== 'undefined' && typeof window.MAKERSPACE_API === 'string' && window.MAKERSPACE_API) {
      return window.MAKERSPACE_API.replace(/\/$/, '');
    }
    if (typeof window === 'undefined') return '';
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:8787';
    // Stale HTML cache can miss the injected config — use known production API.
    if (host.endsWith('github.io') || host === 'pages.opencodingsociety.com') {
      return FALLBACK_PRODUCTION_API;
    }
    return '';
  }

  const API_BASE = resolveApiBase();
  let stateCache = null;
  let apiHealthy = null;
  let apiStatusKind = ''; // '', 'ok', 'waking', 'blocked'

  function msBaseUrl() {
    if (typeof window !== 'undefined' && typeof window.MAKERSPACE_BASE === 'string') {
      return window.MAKERSPACE_BASE.replace(/\/$/, '');
    }
    const fromDom = document.documentElement.getAttribute('data-makerspace-base');
    if (typeof fromDom === 'string') return fromDom.replace(/\/$/, '');
    const scripts = document.querySelectorAll('script[src*="makerspace.js"]');
    for (let i = 0; i < scripts.length; i += 1) {
      const src = scripts[i].getAttribute('src') || '';
      const marker = '/assets/js/makerspace.js';
      const idx = src.indexOf(marker);
      if (idx > 0) return src.slice(0, idx).replace(/\/$/, '');
      if (idx === 0) return '';
    }
    return '';
  }

  function msUrl(path) {
    const base = msBaseUrl();
    let raw = path || '/';
    if (!raw.startsWith('/')) raw = '/' + raw;
    let hash = '';
    const hashIdx = raw.indexOf('#');
    if (hashIdx >= 0) {
      hash = raw.slice(hashIdx);
      raw = raw.slice(0, hashIdx);
    }
    let clean = raw.split('?')[0];
    if (clean.length > 1 && !clean.endsWith('/')) clean += '/';
    if (clean !== '/' && base) {
      if (clean === base + '/' || clean.startsWith(base + '/')) {
        return clean + hash;
      }
    }
    if (clean === '/') return (base || '') + '/' + hash;
    return base + clean + hash;
  }

  function sessionToken() {
    try {
      return localStorage.getItem(SESSION_TOKEN_KEY) || '';
    } catch (error) {
      return '';
    }
  }

  function setSessionToken(token) {
    try {
      if (token) localStorage.setItem(SESSION_TOKEN_KEY, token);
      else localStorage.removeItem(SESSION_TOKEN_KEY);
    } catch (error) { /* ignore quota */ }
  }

  function defaultInventory() {
    return [
      { id: 'inv-pla-orange', name: 'Orange PLA basic', material: 'PLA' },
      { id: 'inv-pla-black', name: 'Black PLA basic', material: 'PLA' },
      { id: 'inv-pla-white', name: 'White PLA basic', material: 'PLA' },
      { id: 'inv-petg-clear', name: 'Clear PETG', material: 'PETG' },
      { id: 'inv-petg-black', name: 'Black PETG', material: 'PETG' },
      { id: 'inv-silk-gold', name: 'Gold SILK+', material: 'SILK+' },
      { id: 'inv-silk-silver', name: 'Silver SILK+', material: 'SILK+' }
    ];
  }

  function defaultState() {
    return {
      users: [
        {
          id: 'admin-1',
          name: 'Krish Kelageri',
          email: ADMIN_EMAIL,
          schoolId: '1927411',
          password: 'KrishK',
          role: 'admin'
        }
      ],
      requests: [],
      chats: [],
      inventory: defaultInventory(),
      session: null
    };
  }

  function normalizeServerState(raw) {
    const seed = defaultState();
    const parsed = raw && typeof raw === 'object' ? raw : {};
    return {
      users: Array.isArray(parsed.users) ? parsed.users : seed.users,
      requests: Array.isArray(parsed.requests) ? parsed.requests : [],
      chats: Array.isArray(parsed.chats) ? parsed.chats : [],
      inventory: Array.isArray(parsed.inventory) ? parsed.inventory : seed.inventory,
      session: parsed.session && typeof parsed.session === 'object' ? parsed.session : null
    };
  }

  function readState() {
    if (stateCache) return stateCache;

    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      raw = null;
    }

    if (!raw) {
      const fresh = defaultState();
      writeState(fresh);
      return fresh;
    }

    try {
      const parsed = JSON.parse(raw);
      const normalized = normalizeServerState(parsed);
      stateCache = normalized;
      return stateCache;
    } catch (error) {
      const fresh = defaultState();
      writeState(fresh);
      return fresh;
    }
  }

  function writeState(state) {
    stateCache = normalizeServerState(state);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateCache));
    } catch (error) { /* ignore quota */ }
    return stateCache;
  }

  function applyApiPayload(payload) {
    if (!payload || typeof payload !== 'object') return readState();
    return writeState(payload);
  }

  async function apiFetch(path, options) {
    if (!API_BASE) {
      const err = new Error('Makerspace API is not configured for this environment.');
      err.code = 'NO_API';
      throw err;
    }
    const opts = options || {};
    const headers = Object.assign({}, opts.headers || {});
    if (opts.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const token = sessionToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const timeoutMs = opts.timeoutMs || API_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, timeoutMs);
    let res;
    try {
      res = await fetch(API_BASE + path, Object.assign({}, opts, { headers, signal: controller.signal }));
    } catch (error) {
      clearTimeout(timer);
      const err = new Error(
        'Cannot reach the shared makerspace server. It may be waking up (~30s on first use) — wait a moment and try again.'
      );
      err.code = 'NETWORK';
      err.cause = error;
      throw err;
    }
    clearTimeout(timer);
    let data = null;
    try {
      data = await res.json();
    } catch (error) {
      data = null;
    }
    if (!res.ok) {
      const message = (data && data.error) || `Request failed (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      err.code = 'API_ERROR';
      throw err;
    }
    apiHealthy = true;
    return data || {};
  }

  async function apiFetchWithRetry(path, options, retries) {
    const attempts = typeof retries === 'number' ? retries : 1;
    let lastError;
    for (let i = 0; i <= attempts; i += 1) {
      try {
        return await apiFetch(path, options);
      } catch (error) {
        lastError = error;
        if (error && error.code === 'NETWORK' && i < attempts) {
          await new Promise(function (resolve) { setTimeout(resolve, 2500); });
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  async function hydrateFromApi() {
    if (!API_BASE) {
      apiHealthy = false;
      setApiStatus('blocked', 'Shared makerspace server is not configured on this page.');
      return false;
    }
    try {
      const data = await apiFetchWithRetry('/api/state', null, 1);
      applyApiPayload(data);
      apiHealthy = true;
      setApiStatus('ok', 'Shared server connected.');
      return true;
    } catch (error) {
      apiHealthy = false;
      console.warn('Makerspace API hydrate failed; using local cache.', error);
      const reason = (error && error.code) || 'network';
      if (reason === 'NETWORK') {
        setApiStatus('waking', 'Shared server unreachable — it may be waking up, or school Wi-Fi is blocking makerspace-api-o7u6.onrender.com.');
      } else {
        setApiStatus('blocked', (error && error.message) || 'Shared server error.');
      }
      return false;
    }
  }

  function setApiStatus(kind, message) {
    apiStatusKind = kind || '';
    let el = document.getElementById(API_STATUS_ID);
    if (!el) {
      const main = document.getElementById('main') || document.querySelector('.makerspace-main') || document.body;
      el = document.createElement('div');
      el.id = API_STATUS_ID;
      el.className = 'api-status';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      main.insertBefore(el, main.firstChild);
    }
    el.className = 'api-status' + (kind ? ' is-' + kind : '');
    el.hidden = !kind || kind === 'ok';
    if (!kind || kind === 'ok') {
      el.innerHTML = '';
      return;
    }
    const server = API_BASE || 'not configured';
    el.innerHTML = `
      <div class="api-status-text">
        <strong>${kind === 'waking' ? 'Shared server slow / unreachable' : 'Shared server problem'}</strong>
        <span>${escapeHtml(message || '')}</span>
        <span class="api-status-meta">Server: ${escapeHtml(server)}</span>
      </div>
      <button type="button" class="makerspace-action-button api-status-retry" data-api-retry>Retry connection</button>
    `;
  }

  async function retryApiConnection() {
    setApiStatus('waking', 'Retrying shared server…');
    const ok = await hydrateFromApi();
    renderAll();
    if (!ok) {
      setApiStatus(
        'waking',
        'Still unreachable. Wait ~30s after the first visit (Render wakes from sleep), then Retry. If this is school Wi-Fi, try another network.'
      );
    }
  }

  function attachApiStatusHandlers() {
    document.addEventListener('click', function (event) {
      const btn = event.target.closest('[data-api-retry]');
      if (!btn) return;
      event.preventDefault();
      retryApiConnection();
    });
  }

  function keepApiWarm() {
    if (!API_BASE || apiHealthy) return;
    apiFetch('/api/health', { timeoutMs: 20000 }).then(function () {
      apiHealthy = true;
      setApiStatus('ok', 'Shared server connected.');
    }).catch(function () { /* banner already set by hydrate */ });
  }

  function currentUser() {
    const state = readState();
    return state.session
      ? (state.users.find((user) => user.email === state.session.email) || null)
      : null;
  }

  async function clearSession() {
    const token = sessionToken();
    const local = readState();
    local.session = null;
    writeState(local);
    if (token && API_BASE) {
      try {
        await apiFetch('/api/auth/signout', { method: 'POST' });
      } catch (error) { /* token already useless locally */ }
    }
    setSessionToken('');
  }

  function showAlert(selector, message, type) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.textContent = message;
    el.className = `alert show ${type}`;
  }

  function normalizeStatus(status) {
    return (status || 'Pending').toLowerCase();
  }

  function isActiveStatus(status) {
    return ACTIVE_STATUSES.includes(normalizeStatus(status));
  }

  function isHistoryStatus(status) {
    return HISTORY_STATUSES.includes(normalizeStatus(status));
  }

  function canViewRequest(item, user) {
    if (!user || !item) return false;
    if (user.role === 'admin') return true;
    return item.email === user.email;
  }

  function findChatByRequest(requestId) {
    const state = readState();
    return (state.chats || []).find((c) => c.requestId === requestId) || null;
  }

  // Request chat: Flask microblog first (guest auth, no OCS login).
  // Auth/inventory/members stay on makerspace_backend. localStorage is only a cache.
  function microblogChat() {
    return (typeof window !== 'undefined' && window.MakerspaceMicroblogChat) || null;
  }

  const INVENTORY_TOPIC = 'makerspace-inventory';

  function inventoryTopic() {
    const mb = microblogChat();
    return (mb && mb.INVENTORY_TOPIC) || INVENTORY_TOPIC;
  }

  function summarizeInventory(inventory) {
    const byMaterial = {};
    (inventory || []).forEach(function (item) {
      if (!item || !item.name) return;
      const material = item.material || 'Other';
      if (!byMaterial[material]) byMaterial[material] = [];
      byMaterial[material].push(item.name);
    });
    const materials = ALLOWED_MATERIALS.concat(
      Object.keys(byMaterial).filter(function (material) { return !ALLOWED_MATERIALS.includes(material); })
    );
    return materials.map(function (material) {
      const names = byMaterial[material] || [];
      if (!names.length) return material + ': none';
      return material + ': ' + names.join(', ');
    }).join(' | ');
  }

  function buildInventoryAnnouncement(action, name, material, inventory, actorName) {
    const verb = action === 'removed' ? 'Removed' : 'Added';
    const who = actorName || 'Staff';
    const summary = summarizeInventory(inventory);
    return 'Inventory ' + verb + ' by ' + who + ': ' + name + ' (' + material + '). Now available — ' + summary;
  }

  // Post to the shared Flask inventory topic so localhost admin edits still
  // announce where production devices listen (not local-only Flask).
  async function announceInventoryChange(action, item, actor) {
    if (!item) {
      return { ok: false, reason: 'no-item' };
    }
    const user = currentUser();
    if (!user) {
      return { ok: false, reason: 'not-signed-in' };
    }
    const state = readState();
    const text = buildInventoryAnnouncement(
      action,
      item.name,
      item.material,
      state.inventory,
      (actor && actor.name) || user.name
    );

    if (API_BASE) {
      try {
        const data = await apiFetchWithRetry('/api/inventory-feed', {
          method: 'POST',
          body: JSON.stringify({ message: text, topic: inventoryTopic() })
        }, 1);
        if (data && data.ok) return { ok: true };
        return { ok: false, reason: 'flask-rejected' };
      } catch (error) {
        console.warn('Inventory feed proxy announcement failed.', error);
        return { ok: false, reason: (error && error.code) || 'network' };
      }
    }

    if (!directFlaskAllowed()) {
      return { ok: false, reason: 'no-api' };
    }

    const mb = microblogChat();
    if (!mb || !mb.sendMessageToTopic) {
      return { ok: false, reason: 'chat-unavailable' };
    }
    try {
      const sent = await mb.sendMessageToTopic(
        inventoryTopic(),
        text,
        (actor && actor.name) || user.name || 'Inventory',
        user
      );
      if (sent) return { ok: true };
      return { ok: false, reason: 'flask-rejected' };
    } catch (error) {
      console.warn('Inventory microblog announcement failed:', error);
      return { ok: false, reason: 'network' };
    }
  }

  function inventoryAnnounceLabel(result) {
    if (result && result.ok) {
      return 'Announcement posted to the shared stock chat.';
    }
    if (!result) return 'Announcement skipped.';
    if (result.reason === 'not-signed-in') {
      return 'Announcement skipped — sign in with your makerspace account first.';
    }
    if (result.reason === 'no-api') {
      return 'Announcement skipped — shared server not configured. Hard-refresh the page.';
    }
    if (result.reason === 'NETWORK') {
      return 'Announcement failed — shared server unreachable (may be waking up). Tap Retry connection above.';
    }
    if (result.reason === 'chat-unavailable') {
      return 'Announcement skipped — stock chat script not loaded (hard-refresh the page).';
    }
    return 'Announcement failed — check network / makerspace API, then try again.';
  }

  async function loadInventoryAnnouncements() {
    const user = currentUser();
    if (!user) return { ok: false, messages: [], reason: 'not-signed-in' };

    // Production/github.io: only the makerspace API proxy (Flask CORS will fail).
    if (API_BASE) {
      try {
        const data = await apiFetchWithRetry('/api/inventory-feed?topic=' + encodeURIComponent(inventoryTopic()), null, 1);
        return { ok: true, messages: (data && data.messages) || [] };
      } catch (error) {
        console.warn('Inventory feed proxy load failed.', error);
        return { ok: false, messages: [], reason: (error && error.code) || 'network' };
      }
    }

    if (!directFlaskAllowed()) {
      return { ok: false, messages: [], reason: 'no-api' };
    }

    const mb = microblogChat();
    if (!mb || !mb.loadMessagesForTopic) return { ok: false, messages: [], reason: 'chat-unavailable' };
    try {
      return await mb.loadMessagesForTopic(inventoryTopic(), user);
    } catch (error) {
      return { ok: false, messages: [], reason: 'network' };
    }
  }

  function setInventoryFeedStatus(message, type) {
    const status = document.getElementById('inventoryFeedStatus');
    if (!status) return;
    status.textContent = message || '';
    status.classList.remove('is-success', 'is-error');
    if (type === 'success') status.classList.add('is-success');
    if (type === 'error') status.classList.add('is-error');
  }

  function renderInventoryFeed() {
    const container = document.getElementById('inventoryFeed');
    if (!container) return;

    const user = currentUser();
    const form = document.getElementById('inventoryFeedForm');
    const input = document.getElementById('inventoryFeedInput');
    if (form) form.hidden = !user;

    if (!user) {
      container.innerHTML = '<div class="makerspace-empty">Sign in with your makerspace account to read and post inventory updates.</div>';
      setInventoryFeedStatus('');
      return;
    }

    loadInventoryAnnouncements().then(function (result) {
      const target = document.getElementById('inventoryFeed');
      if (!target) return;
      if (!result.ok) {
        const reason = result.reason || '';
        if (reason === 'NETWORK') {
          target.innerHTML = `
            <div class="makerspace-empty">Couldn’t reach the shared stock chat.</div>
            <p class="request-hint">It may still be waking up, or school Wi-Fi is blocking the makerspace server. Tap Retry connection at the top of the page, wait ~30s, then try again.</p>
            <button type="button" class="makerspace-action-button" data-api-retry>Retry connection</button>
          `;
          setApiStatus('waking', 'Inventory updates could not load — shared server unreachable.');
          setInventoryFeedStatus('Server unreachable — tap Retry connection.', 'error');
          return;
        }
        if (reason === 'not-signed-in' || reason === 'no-api') {
          target.innerHTML = '<div class="makerspace-empty">Sign in with your makerspace account to read and post inventory updates.</div>';
          setInventoryFeedStatus('');
          return;
        }
        target.innerHTML = `
          <div class="makerspace-empty">Couldn’t load updates.</div>
          <button type="button" class="makerspace-action-button" data-api-retry>Retry connection</button>
        `;
        setInventoryFeedStatus('Load failed — tap Retry connection.', 'error');
        return;
      }
      if (!result.messages || !result.messages.length) {
        target.innerHTML = '<div class="makerspace-empty">No updates yet. Post the first stock note above.</div>';
        return;
      }
      const items = result.messages.slice().reverse().slice(0, 4);
      target.innerHTML = items.map(function (message) {
        const when = message.ts ? new Date(message.ts).toLocaleString() : '';
        return `
          <article class="inventory-feed-item">
            <div class="inventory-feed-meta">
              <strong>${escapeHtml(message.sender || 'Staff')}</strong>
              <span>${escapeHtml(when)}</span>
            </div>
            <p>${escapeHtml(message.text || '')}</p>
          </article>
        `;
      }).join('');
    }).catch(function () {
      const target = document.getElementById('inventoryFeed');
      if (!target) return;
      target.innerHTML = '<div class="makerspace-empty">Unable to load inventory updates right now.</div>';
      setInventoryFeedStatus('Load failed.', 'error');
    });
  }

  async function postInventoryUpdate(text) {
    const user = currentUser();
    if (!user) {
      return { ok: false, reason: 'not-signed-in' };
    }
    const trimmed = String(text || '').trim();
    if (!trimmed) {
      return { ok: false, reason: 'empty' };
    }

    // Production/github.io: only the makerspace API proxy (Flask CORS will fail).
    if (API_BASE) {
      try {
        const data = await apiFetchWithRetry('/api/inventory-feed', {
          method: 'POST',
          body: JSON.stringify({ message: trimmed, topic: inventoryTopic() })
        }, 1);
        if (data && data.ok) return { ok: true };
        return { ok: false, reason: 'flask-rejected' };
      } catch (error) {
        console.warn('Inventory feed proxy post failed.', error);
        return { ok: false, reason: (error && error.code) || 'network' };
      }
    }

    if (!directFlaskAllowed()) {
      return { ok: false, reason: 'no-api' };
    }

    const mb = microblogChat();
    if (!mb || !mb.sendMessageToTopic) {
      return { ok: false, reason: 'chat-unavailable' };
    }
    try {
      const sent = await mb.sendMessageToTopic(inventoryTopic(), trimmed, user.name || 'Staff', user);
      if (sent) return { ok: true };
      return { ok: false, reason: 'flask-rejected' };
    } catch (error) {
      console.warn('Inventory update post failed:', error);
      return { ok: false, reason: 'network' };
    }
  }

  function attachInventoryFeedForm() {
    const form = document.getElementById('inventoryFeedForm');
    const input = document.getElementById('inventoryFeedInput');
    if (!form || !input) return;

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      const user = currentUser();
      if (!user) {
        setInventoryFeedStatus('Sign in first.', 'error');
        return;
      }

      const text = input.value;
      const result = await postInventoryUpdate(text);
      if (!result.ok) {
        if (result.reason === 'not-signed-in') {
          setInventoryFeedStatus('Sign in first.', 'error');
        } else if (result.reason === 'chat-unavailable') {
          setInventoryFeedStatus('Chat script missing — hard-refresh (?v=ms26).', 'error');
        } else if (result.reason === 'empty') {
          setInventoryFeedStatus('Type an update first.', 'error');
        } else if (result.reason === 'NETWORK') {
          setInventoryFeedStatus('Cannot reach the shared server — tap Retry connection at the top, or wait ~30s and post again.', 'error');
          setApiStatus('waking', 'Inventory post failed — shared server unreachable.');
        } else if (result.reason === 'no-api') {
          setInventoryFeedStatus('Shared server not configured — hard-refresh the page, then try again.', 'error');
        } else if (result.reason === 'flask-rejected') {
          setInventoryFeedStatus('Server rejected the post. Check network / makerspace API, then try again.', 'error');
        } else {
          setInventoryFeedStatus('Post failed — check network / makerspace API, then try again.', 'error');
        }
        return;
      }

      input.value = '';
      setInventoryFeedStatus('Posted — synced to the shared inventory chat.', 'success');
      renderInventoryFeed();
    });
  }

  function springChat() {
    return (typeof window !== 'undefined' && window.MakerspaceSpringChat) || null;
  }

  function chatBackendLabel() {
    // Production + localhost with makerspace API configured: chats go through
    // makerspace_backend (Render) → Flask microblog server-side (no CORS).
    if (API_BASE) return 'api';
    const mb = microblogChat();
    if (mb && mb.isAvailable && mb.isAvailable()) return 'chat';
    const spring = springChat();
    if (spring && spring.isConnected && spring.isConnected()) return 'spring';
    return 'device';
  }

  function upsertLocalChatMessage(requestId, message) {
    const state = readState();
    state.chats = state.chats || [];
    let chat = state.chats.find((c) => c.requestId === requestId);
    if (!chat) {
      const request = (state.requests || []).find((item) => item.id === requestId);
      chat = {
        id: `chat-${requestId}`,
        requestId,
        participants: withAdminParticipants(state, request ? [request.email] : []),
        messages: []
      };
      state.chats.unshift(chat);
    }
    const key = `${message.sender}|${message.ts}|${message.text}`;
    const exists = (chat.messages || []).some((m) => `${m.sender}|${m.ts}|${m.text}` === key);
    if (!exists) chat.messages.push(message);
    writeState(state);
    return chat;
  }

  function mergeRemoteChatMessages(requestId, messages) {
    (messages || []).forEach((m) => {
      upsertLocalChatMessage(requestId, {
        sender: m.sender,
        senderEmail: m.senderEmail || null,
        text: m.text,
        ts: m.ts
      });
    });
  }

  function requestChatTopic(requestId) {
    return 'makerspace-request-' + String(requestId || '').replace(/[^\w.-]/g, '');
  }

  async function loadSharedChatForRequest(requestId) {
    const user = currentUser();
    const topic = requestChatTopic(requestId);

    // Production/github.io: only the makerspace API proxy (Flask CORS will fail).
    if (API_BASE) {
      try {
        const data = await apiFetchWithRetry('/api/microblog?topic=' + encodeURIComponent(topic), null, 1);
        if (data && Array.isArray(data.messages)) {
          mergeRemoteChatMessages(requestId, data.messages);
          return true;
        }
      } catch (error) {
        console.warn('Makerspace chat proxy load failed.', error);
        return false;
      }
    }

    if (!directFlaskAllowed()) return false;

    const mb = microblogChat();
    if (mb && mb.loadMessagesForRequest) {
      try {
        const result = await mb.loadMessagesForRequest(requestId, user);
        if (result && result.ok) {
          mergeRemoteChatMessages(requestId, result.messages);
          return true;
        }
      } catch (error) { /* fall through */ }
    }
    const spring = springChat();
    if (spring && spring.loadMessagesForRequest) {
      try {
        const result = await spring.loadMessagesForRequest(requestId);
        if (result && result.ok) {
          mergeRemoteChatMessages(requestId, result.messages);
          return true;
        }
      } catch (error) { /* fall through */ }
    }
    return false;
  }

  async function ensureSharedChatReady() {
    const user = currentUser();
    // API path does proxy auth server-side; only warm Flask on localhost.
    if (API_BASE) return true;
    if (!directFlaskAllowed()) return false;
    let ready = false;
    const mb = microblogChat();
    if (mb && mb.ensureGuestAuth) {
      try {
        if (await mb.ensureGuestAuth(user)) ready = true;
      } catch (error) { /* try spring */ }
    }
    const spring = springChat();
    if (spring && spring.connect) {
      try {
        if (await spring.connect()) ready = true;
      } catch (error) { /* already have microblog */ }
    }
    return ready;
  }

  async function sendSharedChatMessage(requestId, text, user) {
    const topic = requestChatTopic(requestId);

    // Production/github.io: only the makerspace API proxy (Flask CORS will fail).
    // Server dual-writes Flask (school shared chat) + makerspace_backend chats.
    if (API_BASE) {
      try {
        const data = await apiFetchWithRetry('/api/microblog', {
          method: 'POST',
          body: JSON.stringify({
            topic,
            message: text,
            sender: user.name
          })
        }, 1);
        if (data && data.ok) return true;
      } catch (error) {
        console.warn('Makerspace chat proxy send failed.', error);
        return false;
      }
    }

    if (!directFlaskAllowed()) return false;

    const mb = microblogChat();
    if (mb && mb.sendMessage) {
      try {
        if (await mb.sendMessage(requestId, text, user.name, user)) return true;
      } catch (error) { /* fall through */ }
    }
    const spring = springChat();
    if (spring && spring.isConnected && spring.isConnected() && spring.sendMessage) {
      if (spring.sendMessage(requestId, text, user.name)) return true;
    }
    return false;
  }

  function adminEmails(state) {
    return (state.users || [])
      .filter((user) => user && user.role === 'admin')
      .map((user) => user.email)
      .filter(Boolean);
  }

  function withAdminParticipants(state, emails) {
    return Array.from(new Set([...(emails || []), ...adminEmails(state)]));
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>\"]/g, function (s) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[s];
    });
  }

  function buildRequestMarkup(item, options) {
    const opts = options || {};
    const status = item.status || 'Pending';
    const statusClass = status.toLowerCase();
    const chatLabel = opts.history ? 'Message admin' : 'Chat with admin';
    const scope = opts.scope || 'user';
    const colorLabel = item.color || item.dimensions || 'See uploaded file';
    return `
      <article class="request-item${opts.history ? ' is-history' : ''}" data-request-card data-request-id="${item.id}" tabindex="0" role="button" aria-label="Open admin chat for ${escapeHtml(item.projectName || 'print request')}">
        <div class="request-item-header">
          <h3>${escapeHtml(item.projectName || 'Unnamed request')}</h3>
          <span class="makerspace-badge ${statusClass}">${escapeHtml(status)}</span>
        </div>
        <div class="request-meta">
          <span>By: ${escapeHtml(item.name || '')}</span>
          <span>Material: ${escapeHtml(item.material || '')}</span>
          <span>Color: ${escapeHtml(colorLabel)}</span>
        </div>
        <p>${escapeHtml(item.description || 'No description provided.')}</p>
        <div class="request-meta">
          <span>Upload: ${escapeHtml(item.fileName || 'No file uploaded')}</span>
          <span>Needed by: ${escapeHtml(item.deadline || 'Flexible')}</span>
        </div>
        <div class="request-actions">
          <button type="button" class="makerspace-link-button request-chat-btn" data-chat-toggle data-request-id="${item.id}">${chatLabel}</button>
          <span class="request-hint">Click the request to open chat</span>
        </div>
        <div class="chat-area" data-chat-area="${item.id}" data-chat-scope="${scope}" hidden></div>
      </article>
    `;
  }

  function renderAdminRequests() {
    const container = document.getElementById('adminRequestList');
    if (!container) return;

    const state = readState();
    const openJobs = state.requests.filter((item) => isActiveStatus(item.status));
    const chatSnaps = snapshotOpenChats();

    if (!openJobs.length) {
      container.innerHTML = '<div class="makerspace-empty">There are no open print jobs right now.</div>';
      restoreOpenChats(chatSnaps);
      return;
    }

    container.innerHTML = openJobs.map((item) => {
      const status = item.status || 'Pending';
      const statusClass = status.toLowerCase();
      const normalized = normalizeStatus(status);
      const canAccept = normalized === 'pending';
      const canComplete = normalized === 'approved';
      const canClose = normalized === 'pending' || normalized === 'approved';
      const canReject = normalized === 'pending' || normalized === 'approved';
      return `
        <article class="admin-item" data-request-card data-request-id="${item.id}">
          <div class="admin-item-header">
            <h3>${escapeHtml(item.projectName || 'Unnamed request')}</h3>
            <span class="makerspace-badge ${statusClass}">${escapeHtml(status)}</span>
          </div>
          <div class="admin-meta">
            <span>${escapeHtml(item.name || '')}</span>
            <span>${escapeHtml(item.email || '')}</span>
            <span>${escapeHtml(item.material || '')}</span>
            <span>${escapeHtml(item.color || item.dimensions || '')}</span>
          </div>
          <p>${escapeHtml(item.description || 'No description provided.')}</p>
          <div class="admin-actions">
            ${canAccept ? `<button type="button" class="approve" data-action="accept" data-request-id="${item.id}">Accept request</button>` : ''}
            ${canComplete ? `<button type="button" class="complete" data-action="complete" data-request-id="${item.id}">Mark completed</button>` : ''}
            ${canClose ? `<button type="button" class="close" data-action="close" data-request-id="${item.id}">Close request</button>` : ''}
            ${canReject ? `<button type="button" class="reject" data-action="reject" data-request-id="${item.id}">Reject</button>` : ''}
          </div>
          <div class="request-actions">
            <button type="button" class="makerspace-link-button request-chat-btn" data-chat-toggle data-request-id="${item.id}">Chat with student</button>
            <span class="request-hint">Click the request to open chat</span>
          </div>
          <div class="chat-area" data-chat-area="${item.id}" data-chat-scope="admin" hidden></div>
        </article>
      `;
    }).join('');
    restoreOpenChats(chatSnaps);
  }

  function renderRequestLists() {
    const listEl = document.getElementById('requestList');
    if (!listEl) return;

    const historyEl = document.getElementById('printHistory');
    const emptyEl = document.getElementById('requestsEmpty');
    const state = readState();
    const user = currentUser();
    const chatSnaps = snapshotOpenChats();

    if (!user) {
      listEl.innerHTML = '';
      if (historyEl) historyEl.innerHTML = '';
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = 'Sign in with your school email to view and submit print requests.';
      }
      return;
    }

    if (emptyEl) {
      emptyEl.hidden = true;
      emptyEl.textContent = '';
    }

    const visible = state.requests.filter((item) => canViewRequest(item, user));
    const active = visible.filter((item) => isActiveStatus(item.status));
    const history = visible.filter((item) => isHistoryStatus(item.status));

    listEl.innerHTML = active.length
      ? active.map((item) => buildRequestMarkup(item, { history: false, scope: 'active' })).join('')
      : '<div class="makerspace-empty">No active print requests.</div>';

    if (historyEl) {
      historyEl.innerHTML = history.length
        ? history.map((item) => buildRequestMarkup(item, { history: true, scope: 'history' })).join('')
        : '<div class="makerspace-empty">No print history yet.</div>';
    }
    restoreOpenChats(chatSnaps);
  }

  function updateSignedInState() {
    const user = currentUser();
    const isSignedIn = !!user;
    const isAdmin = !!(user && user.role === 'admin');

    document.querySelectorAll('[data-auth-area]').forEach((el) => {
      const role = el.dataset.authArea;
      const shouldShow = role === 'signed-in' ? isSignedIn : !isSignedIn;
      el.hidden = !shouldShow;
    });

    document.querySelectorAll('[data-role]').forEach((el) => {
      const requiredRole = el.dataset.role;
      const shouldShow = !!(user && user.role === requiredRole);
      el.hidden = !shouldShow;
    });

    document.querySelectorAll('[data-user-name]').forEach((el) => {
      if (user) el.textContent = user.name;
    });

    const requestLink = document.getElementById('requestLink');
    if (requestLink) requestLink.hidden = !isSignedIn;

    const adminLink = document.getElementById('adminLink');
    if (adminLink) adminLink.hidden = !isAdmin;

    const footerAdminLink = document.getElementById('footerAdminLink');
    if (footerAdminLink) footerAdminLink.hidden = !isAdmin;

    const nav = document.querySelector('.makerspace-nav');
    if (nav) {
      let pill = document.getElementById('signedInInfo');
      if (isSignedIn) {
        if (!pill) {
          pill = document.createElement('div');
          pill.id = 'signedInInfo';
          pill.className = 'signedin-pill';
          nav.appendChild(pill);
        }
        pill.innerHTML = `${escapeHtml(user.name)} <button class="makerspace-link-button" data-signout type="button">Sign out</button>`;
      } else if (pill) {
        pill.remove();
      }
    }
  }

  function attachNavToggle() {
    const toggle = document.querySelector('[data-nav-toggle]');
    const nav = document.getElementById('makerspaceNav');
    if (!toggle || !nav) return;

    toggle.addEventListener('click', function () {
      const open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', function () {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  function isValidStudentEmail(email) {
    return /^[^\s@]+@stu\.powayusd\.com$/i.test(email);
  }

  function isValidSchoolId(schoolId) {
    return /^19\d{5}$/.test(schoolId);
  }

  function handleApiError(error, alertSelector, fallbackMessage) {
    const raw = (error && error.message) || fallbackMessage || 'Something went wrong.';
    if (error && error.code === 'NO_API') {
      showAlert(alertSelector, 'Shared makerspace server is not configured for this page yet. Hard-refresh (Ctrl+Shift+R / Cmd+Shift+R) and try again.', 'error');
      return;
    }
    if (error && error.code === 'NETWORK') {
      showAlert(alertSelector, raw + ' If this is the first visit in a while, wait ~30s and tap Retry connection at the top of the page.', 'error');
      return;
    }
    if (/failed to fetch|networkerror|load failed|cannot reach/i.test(raw)) {
      showAlert(alertSelector, 'Cannot reach the shared makerspace server. Wait ~30 seconds (it may be waking up), then tap Retry connection at the top of the page.', 'error');
      return;
    }
    showAlert(alertSelector, raw, 'error');
  }

  function attachSignup() {
    const form = document.getElementById('signupForm');
    if (!form) return;

    form.addEventListener('submit', async function (event) {
      event.preventDefault();

      const data = new FormData(form);
      const name = (data.get('name') || '').toString().trim();
      const email = (data.get('email') || '').toString().trim();
      const schoolId = (data.get('schoolId') || '').toString().trim();
      const password = (data.get('password') || '').toString();

      if (!name || !email || !schoolId || !password) {
        showAlert('#signupAlert', 'Please complete every required field.', 'error');
        return;
      }

      if (!isValidStudentEmail(email) && email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        showAlert('#signupAlert', 'Use a valid Poway school email ending in @stu.powayusd.com.', 'error');
        return;
      }

      if (!isValidSchoolId(schoolId)) {
        showAlert('#signupAlert', 'School ID must be 7 digits and start with 19.', 'error');
        return;
      }

      if (password.length < 4) {
        showAlert('#signupAlert', 'Password must be at least 4 characters.', 'error');
        return;
      }

      if (!API_BASE) {
        // Offline/local fallback: previous browser-only behavior
        const state = readState();
        if (state.users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
          showAlert('#signupAlert', 'An account with that email already exists.', 'error');
          return;
        }
        if (state.users.some((user) => (user.schoolId || '').toLowerCase() === schoolId.toLowerCase())) {
          showAlert('#signupAlert', 'That school ID is already in use.', 'error');
          return;
        }
        const user = {
          id: `user-${Date.now()}`,
          name,
          email,
          schoolId,
          password,
          role: email.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? 'admin' : 'member'
        };
        state.users.push(user);
        state.session = { email: user.email, role: user.role, name: user.name };
        writeState(state);
        showAlert('#signupAlert', 'Account created on this device only (shared server offline). Redirecting...', 'success');
        setTimeout(() => { window.location.href = msUrl('/requests'); }, 700);
        return;
      }

      try {
        const data2 = await apiFetch('/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ name, email, schoolId, password })
        });
        setSessionToken(data2.token);
        applyApiPayload(data2);
        showAlert('#signupAlert', 'Account created. Redirecting to your request dashboard...', 'success');
        setTimeout(() => { window.location.href = msUrl('/requests'); }, 700);
      } catch (error) {
        handleApiError(error, '#signupAlert', 'Unable to create account.');
      }
    });
  }

  function attachSignin() {
    const form = document.getElementById('signinForm');
    if (!form) return;

    form.addEventListener('submit', async function (event) {
      event.preventDefault();

      const data = new FormData(form);
      const email = (data.get('email') || '').toString().trim();
      const password = (data.get('password') || '').toString().trim();

      if (!email) {
        showAlert('#signinAlert', 'Enter your school email.', 'error');
        return;
      }
      if (!password) {
        showAlert('#signinAlert', 'Enter your password.', 'error');
        return;
      }

      if (!isValidStudentEmail(email) && email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        showAlert('#signinAlert', 'Use your Poway school email (ending in @stu.powayusd.com).', 'error');
        return;
      }

      if (!API_BASE) {
        const state = readState();
        const user = state.users.find(
          (item) => item.email.toLowerCase() === email.toLowerCase() && item.password === password
        );
        if (!user) {
          showAlert('#signinAlert', 'Incorrect email or password.', 'error');
          return;
        }
        state.session = { email: user.email, role: user.role, name: user.name };
        writeState(state);
        updateSignedInState();
        initializeWelcome();
        showAlert('#signinAlert', 'Welcome back! Redirecting...', 'success');
        setTimeout(() => { window.location.href = msUrl('/requests'); }, 600);
        return;
      }

      try {
        const result = await apiFetchWithRetry('/api/auth/signin', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        }, 1);
        setSessionToken(result.token);
        applyApiPayload(result);
        updateSignedInState();
        initializeWelcome();
        showAlert('#signinAlert', 'Welcome back! Redirecting...', 'success');
        setTimeout(() => { window.location.href = msUrl('/requests'); }, 600);
      } catch (error) {
        handleApiError(error, '#signinAlert', 'Unable to sign in.');
      }
    });
  }

  function outOfStockByMaterial(state) {
    const catalog = defaultInventory();
    const stocked = new Set(
      (state.inventory || [])
        .filter((item) => item && item.name)
        .map((item) => `${item.material || ''}|${item.name}`)
    );
    const byMaterial = new Map();

    catalog.forEach((entry) => {
      const key = `${entry.material || ''}|${entry.name}`;
      if (stocked.has(key)) return;
      if (!byMaterial.has(entry.material)) byMaterial.set(entry.material, []);
      byMaterial.get(entry.material).push(entry.name);
    });

    ALLOWED_MATERIALS.forEach((material) => {
      const stockedForMaterial = (state.inventory || []).some(
        (item) => item && item.material === material && item.name
      );
      if (stockedForMaterial) return;
      const listed = byMaterial.get(material) || [];
      if (!listed.length) byMaterial.set(material, ['All colors']);
    });

    return byMaterial;
  }

  function renderOutOfStockColors() {
    const panel = document.getElementById('outOfStockPanel');
    const list = document.getElementById('outOfStockList');
    const note = document.getElementById('outOfStockNote');
    if (!panel || !list) return;

    const byMaterial = outOfStockByMaterial(readState());
    const groups = [...byMaterial.entries()].filter(([, names]) => names && names.length);

    if (!groups.length) {
      panel.hidden = true;
      list.innerHTML = '';
      return;
    }

    panel.hidden = false;
    if (note && !note.dataset.defaultText) {
      note.dataset.defaultText = note.textContent.trim();
    }
    if (note && note.dataset.defaultText) {
      note.textContent = note.dataset.defaultText;
    }

    list.innerHTML = groups.map(([material, names]) => `
      <div class="out-of-stock-group">
        <span class="out-of-stock-material">${escapeHtml(material || '')}</span>
        ${names.map((name) => `<span class="out-of-stock-chip">${escapeHtml(name)}</span>`).join('')}
      </div>
    `).join('');
  }

  function inventoryForMaterial(state, material) {
    return (state.inventory || []).filter((item) => item && item.material === material);
  }

  function populateColorOptions(material, selectedValue) {
    const select = document.getElementById('requestColor');
    const hint = document.getElementById('requestColorHint');
    if (!select) return;

    const state = readState();
    const items = inventoryForMaterial(state, material || select.dataset.material || '');
    const current = selectedValue != null ? selectedValue : select.value;

    select.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'No colors in stock for this material';
      select.appendChild(empty);
      select.disabled = true;
      if (hint) {
        hint.textContent = 'Staff haven’t added any inventory for this material yet. Ask a Makerspace admin.';
      }
      return;
    }

    select.disabled = false;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a color in stock';
    select.appendChild(placeholder);

    items.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.name;
      option.textContent = item.name;
      select.appendChild(option);
    });

    const stillValid = current && items.some((item) => item.name === current);
    select.value = stillValid ? current : '';
    if (hint) {
      hint.textContent = `Showing ${items.length} color${items.length === 1 ? '' : 's'} currently stocked for ${material || 'this material'}.`;
    }
  }

  function renderInventoryList() {
    const container = document.getElementById('inventoryList');
    if (!container) return;

    const state = readState();
    const items = state.inventory || [];
    if (!items.length) {
      container.innerHTML = '<div class="makerspace-empty">No inventory yet. Add colors we stock so students can choose them.</div>';
      return;
    }

    container.innerHTML = items.map((item) => `
      <div class="inventory-item">
        <div class="inventory-item-main">
          <strong>${escapeHtml(item.name || 'Unnamed')}</strong>
          <span class="makerspace-badge">${escapeHtml(item.material || '')}</span>
        </div>
        <button type="button" class="inventory-delete" data-inventory-delete="${escapeHtml(item.id || '')}">Remove</button>
      </div>
    `).join('');
  }

  function memberMatchesQuery(user, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    const fields = [
      user.name,
      user.email,
      user.schoolId,
      user.role
    ];
    return fields.some((value) => (value || '').toString().toLowerCase().includes(q));
  }

  let openMemberEmail = '';

  function isAdminActor() {
    const user = currentUser();
    return !!(user && user.role === 'admin');
  }

  function memberRequestHistory(state, email) {
    return (state.requests || []).filter((item) => item.email === email);
  }

  function renderMemberRequestHistory(state, email) {
    const items = memberRequestHistory(state, email);
    if (!items.length) {
      return '<div class="makerspace-empty">No print requests on file for this member.</div>';
    }
    return `
      <div class="member-history">
        ${items.map((item) => {
          const status = item.status || 'Pending';
          return `
            <div class="member-history-item">
              <div class="member-history-main">
                <strong>${escapeHtml(item.projectName || 'Unnamed request')}</strong>
                <span class="makerspace-badge ${status.toLowerCase()}">${escapeHtml(status)}</span>
              </div>
              <div class="member-history-meta">
                <span>${escapeHtml(item.material || '')}</span>
                <span>${escapeHtml(item.color || item.dimensions || '')}</span>
                <span>${escapeHtml(item.fileName || '')}</span>
                <span>${escapeHtml(item.deadline || 'Flexible')}</span>
              </div>
              <p>${escapeHtml(item.description || 'No description provided.')}</p>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderMemberList(query) {
    const container = document.getElementById('memberList');
    if (!container) return;

    if (!isAdminActor()) {
      container.innerHTML = '';
      return;
    }

    const state = readState();
    const users = (state.users || []).filter((item) => memberMatchesQuery(item, query));

    if (!users.length) {
      container.innerHTML = '<div class="makerspace-empty">No members match that search.</div>';
      return;
    }

    const openForm = openMemberEmail
      ? document.querySelector(`[data-member-edit="${CSS.escape(openMemberEmail)}"]`)
      : null;
    const editSnapshot = openForm ? {
      email: (openForm.querySelector('[name="email"]') || {}).value || '',
      schoolId: (openForm.querySelector('[name="schoolId"]') || {}).value || '',
      password: (openForm.querySelector('[name="password"]') || {}).value || '',
      role: (openForm.querySelector('[name="role"]') || {}).value || 'member'
    } : null;

    container.innerHTML = users.map((item) => {
      const email = item.email || '';
      const isOpen = openMemberEmail && openMemberEmail.toLowerCase() === email.toLowerCase();
      const requestCount = memberRequestHistory(state, email).length;
      const emailVal = isOpen && editSnapshot ? editSnapshot.email : email;
      const schoolVal = isOpen && editSnapshot ? editSnapshot.schoolId : (item.schoolId || '');
      const passVal = isOpen && editSnapshot ? editSnapshot.password : (item.password || '');
      const roleVal = isOpen && editSnapshot ? editSnapshot.role : (item.role || 'member');
      return `
        <article class="member-card${isOpen ? ' is-open' : ''}" data-member-email="${escapeHtml(email)}">
          <div class="member-card-header">
            <h4>${escapeHtml(item.name || 'Unnamed')}</h4>
            <span class="makerspace-badge ${item.role === 'admin' ? 'approved' : ''}">${escapeHtml(item.role || 'member')}</span>
          </div>
          <dl class="member-details">
            <div>
              <dt>School ID</dt>
              <dd>${escapeHtml(item.schoolId || '—')}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>${escapeHtml(email || '—')}</dd>
            </div>
            <div>
              <dt>Password</dt>
              <dd>${item.password ? escapeHtml(item.password) : '••••••••'}</dd>
            </div>
            <div>
              <dt>Requests</dt>
              <dd>${requestCount}</dd>
            </div>
          </dl>
          <div class="member-card-actions">
            <button type="button" class="makerspace-link-button" data-member-toggle="${escapeHtml(email)}">
              ${isOpen ? 'Hide details' : 'View history & edit'}
            </button>
          </div>
          <div class="member-panel" ${isOpen ? '' : 'hidden'}>
            <h5>Print history</h5>
            ${renderMemberRequestHistory(state, email)}

            <h5>Edit account</h5>
            <form class="member-edit-form" data-member-edit="${escapeHtml(email)}">
              <div class="form-grid">
                <label class="field">
                  Email
                  <input type="email" name="email" value="${escapeHtml(emailVal)}" required pattern="^[^@\\s]+@stu\\.powayusd\\.com$" title="Use a Poway school email ending in @stu.powayusd.com">
                </label>
                <label class="field">
                  School ID
                  <input type="text" name="schoolId" value="${escapeHtml(schoolVal)}" required pattern="^19\\d{5}$" title="Enter a 7-digit ID starting with 19">
                </label>
                <label class="field">
                  Password
                  <input type="text" name="password" value="${escapeHtml(passVal)}" minlength="4" placeholder="Leave blank to keep current password">
                </label>
                <label class="field">
                  Role
                  <select name="role" required>
                    <option value="member" ${roleVal === 'member' ? 'selected' : ''}>Member</option>
                    <option value="admin" ${roleVal === 'admin' ? 'selected' : ''}>Admin</option>
                  </select>
                  <span class="field-hint">Admins can review requests, manage inventory, and edit members.</span>
                </label>
              </div>
              <div class="member-panel-alert alert" aria-live="polite"></div>
              <div class="form-actions">
                <button type="submit" class="makerspace-action-button">Save changes</button>
              </div>
            </form>

            <div class="member-danger">
              <p>Deleting removes this account from the site. Their old requests stay in admin history unless you remove them separately.</p>
              <button type="button" class="inventory-delete" data-member-delete="${escapeHtml(email)}">Delete account</button>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function refreshMemberListFromSearch() {
    const input = document.getElementById('memberSearch');
    renderMemberList(input ? input.value.trim() : '');
  }

  function memberPanelAlert(deleteBtn, message, type) {
    const panel = deleteBtn.closest('.member-panel');
    const alertEl = panel ? panel.querySelector('.member-panel-alert') : null;
    if (!alertEl) return;
    alertEl.textContent = message;
    alertEl.className = `member-panel-alert alert show ${type || 'error'}`;
  }

  function attachMemberSearch() {
    const input = document.getElementById('memberSearch');
    if (!input) return;

    input.addEventListener('input', function () {
      renderMemberList(input.value.trim());
    });

    document.addEventListener('click', async function (event) {
      if (!isAdminActor()) return;

      const toggle = event.target.closest('[data-member-toggle]');
      if (toggle) {
        const email = toggle.dataset.memberToggle || '';
        openMemberEmail = openMemberEmail.toLowerCase() === email.toLowerCase() ? '' : email;
        refreshMemberListFromSearch();
        return;
      }

      const deleteBtn = event.target.closest('[data-member-delete]');
      if (deleteBtn) {
        const email = (deleteBtn.dataset.memberDelete || '').toLowerCase();
        if (!email) return;

        if (email === ADMIN_EMAIL.toLowerCase()) {
          memberPanelAlert(deleteBtn, 'The primary admin account cannot be deleted.', 'error');
          return;
        }

        if (!window.confirm(`Delete account ${email}? This cannot be undone.`)) return;

        if (!API_BASE) {
          const state = readState();
          state.users = state.users.filter((item) => (item.email || '').toLowerCase() !== email);
          if (state.session && (state.session.email || '').toLowerCase() === email) {
            state.session = null;
          }
          if (openMemberEmail.toLowerCase() === email) openMemberEmail = '';
          writeState(state);
          updateSignedInState();
          refreshMemberListFromSearch();
          renderRequestLists();
          renderAdminRequests();
          return;
        }

        try {
          const result = await apiFetch(`/api/members/${encodeURIComponent(email)}`, { method: 'DELETE' });
          applyApiPayload(result);
          if (openMemberEmail.toLowerCase() === email) openMemberEmail = '';
          updateSignedInState();
          refreshMemberListFromSearch();
          renderRequestLists();
          renderAdminRequests();
        } catch (error) {
          memberPanelAlert(deleteBtn, (error && error.message) || 'Unable to delete account.', 'error');
        }
        return;
      }
    });

    document.addEventListener('submit', async function (event) {
      const form = event.target.closest('[data-member-edit]');
      if (!form) return;
      event.preventDefault();

      if (!isAdminActor()) return;

      const originalEmail = (form.dataset.memberEdit || '').toLowerCase();
      const data = new FormData(form);
      const email = (data.get('email') || '').toString().trim();
      const schoolId = (data.get('schoolId') || '').toString().trim();
      const password = (data.get('password') || '').toString();
      const role = (data.get('role') || '').toString().trim() === 'admin' ? 'admin' : 'member';

      const alertEl = form.querySelector('.member-panel-alert');
      const fail = (message) => {
        if (!alertEl) return;
        alertEl.textContent = message;
        alertEl.className = 'member-panel-alert alert show error';
      };
      const ok = (message) => {
        if (!alertEl) return;
        alertEl.textContent = message;
        alertEl.className = 'member-panel-alert alert show success';
      };

      if (!email || !schoolId) {
        fail('Email and school ID are required.');
        return;
      }
      // Empty password keeps the existing one (server ignores blank password).
      if (password && password.length < 4) {
        fail('Password must be at least 4 characters, or leave it blank to keep the current password.');
        return;
      }
      if (!isValidStudentEmail(email) && email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        fail('Use a valid Poway school email ending in @stu.powayusd.com.');
        return;
      }
      if (!isValidSchoolId(schoolId)) {
        fail('School ID must be 7 digits and start with 19.');
        return;
      }

      if (!API_BASE) {
        const state = readState();
        const target = state.users.find((item) => (item.email || '').toLowerCase() === originalEmail);
        if (!target) {
          fail('Account not found. It may have been deleted.');
          return;
        }
        const emailTaken = state.users.some((item) => {
          const other = (item.email || '').toLowerCase();
          return other === email.toLowerCase() && other !== originalEmail;
        });
        if (emailTaken) {
          fail('Another account already uses that email.');
          return;
        }
        const idTaken = state.users.some((item) => {
          const otherId = (item.schoolId || '').toLowerCase();
          return otherId === schoolId.toLowerCase() && (item.email || '').toLowerCase() !== originalEmail;
        });
        if (idTaken) {
          fail('That school ID is already in use.');
          return;
        }
        target.email = email;
        target.schoolId = schoolId;
        if (password) target.password = password;
        target.role = originalEmail === ADMIN_EMAIL.toLowerCase() ? 'admin' : role;
        if (state.session && (state.session.email || '').toLowerCase() === originalEmail) {
          state.session.email = email;
          state.session.role = target.role;
        }
        state.requests = (state.requests || []).map((item) => {
          if ((item.email || '').toLowerCase() === originalEmail) return { ...item, email };
          return item;
        });
        state.chats = (state.chats || []).map((chat) => {
          const participants = (chat.participants || []).map((p) => {
            if ((p || '').toLowerCase() === originalEmail) return email;
            return p;
          });
          return {
            ...chat,
            participants: Array.from(new Set([...participants, email, ADMIN_EMAIL]))
          };
        });
        writeState(state);
        openMemberEmail = email;
        updateSignedInState();
        refreshMemberListFromSearch();
        renderRequestLists();
        renderAdminRequests();
        const roleNote = target.role === 'admin' ? ' Role updated to admin.' : ' Role updated to member.';
        ok(`Saved changes for ${email}.${roleNote}`);
        return;
      }

      try {
        const result = await apiFetch(`/api/members/${encodeURIComponent(originalEmail)}`, {
          method: 'PATCH',
          body: JSON.stringify({ email, schoolId, password, role })
        });
        applyApiPayload(result);
        openMemberEmail = email;
        updateSignedInState();
        refreshMemberListFromSearch();
        renderRequestLists();
        renderAdminRequests();
        const nextRole = result.user && result.user.role === 'admin' ? 'admin' : 'member';
        const roleNote = nextRole === role
          ? ''
          : role === 'admin'
            ? ' Role updated to admin.'
            : ' Role updated to member.';
        ok(`Saved changes for ${email}.${roleNote}`);
      } catch (error) {
        const message = (error && error.message) || 'Unable to save member changes.';
        if (error && (error.status === 404 || /account not found/i.test(message))) {
          // Stale browser cache or shared-server reset — resync from the API.
          await hydrateFromApi();
          refreshMemberListFromSearch();
          fail('Account not found on the shared server. The list was refreshed — pick an account that still exists.');
          return;
        }
        fail(message);
      }
    });
  }

  function refreshColorOptionsFromForm() {
    const materialSelect = document.getElementById('requestMaterial');
    populateColorOptions((materialSelect || {}).value || 'PLA');
    renderOutOfStockColors();
  }

  function attachInventoryForm() {
    const form = document.getElementById('inventoryForm');
    if (form) {
      form.addEventListener('submit', async function (event) {
        event.preventDefault();

        const actor = currentUser();
        if (!actor || actor.role !== 'admin') {
          showAlert('#inventoryAlert', 'Only admin accounts can update inventory.', 'error');
          return;
        }

        const data = new FormData(form);
        const name = (data.get('name') || '').toString().trim();
        const material = (data.get('material') || '').toString().trim();

        if (!name || !material) {
          showAlert('#inventoryAlert', 'Enter a color/stock name and choose a material.', 'error');
          return;
        }

        if (!ALLOWED_MATERIALS.includes(material)) {
          showAlert('#inventoryAlert', 'Material must be PLA, PETG, or SILK+.', 'error');
          return;
        }

        if (!API_BASE) {
          const state = readState();
          state.inventory = state.inventory || [];
          const duplicate = state.inventory.some(
            (item) => item.name.toLowerCase() === name.toLowerCase() && item.material === material
          );
          if (duplicate) {
            showAlert('#inventoryAlert', 'That color is already listed for this material.', 'error');
            return;
          }
          state.inventory.push({
            id: `inv-${Date.now()}`,
            name,
            material,
            createdBy: actor.email,
            createdAt: Date.now()
          });
          writeState(state);
          form.reset();
          renderInventoryList();
          refreshColorOptionsFromForm();
          const announce = await announceInventoryChange('added', { name, material }, actor);
          renderInventoryFeed();
          showAlert('#inventoryAlert', `Added ${name} to ${material} inventory on this device only (shared server offline). ${inventoryAnnounceLabel(announce)}`, announce && announce.ok ? 'success' : 'error');
          return;
        }

        try {
          const result = await apiFetch('/api/inventory', {
            method: 'POST',
            body: JSON.stringify({ name, material })
          });
          applyApiPayload(result);
          form.reset();
          renderInventoryList();
          refreshColorOptionsFromForm();
          const announce = await announceInventoryChange('added', { name, material }, actor);
          renderInventoryFeed();
          showAlert('#inventoryAlert', `Added ${name} to ${material} inventory. ${inventoryAnnounceLabel(announce)}`, announce && announce.ok ? 'success' : 'error');
        } catch (error) {
          handleApiError(error, '#inventoryAlert', 'Unable to add inventory.');
        }
      });
    }

    document.addEventListener('click', async function (event) {
      const target = event.target.closest('[data-inventory-delete]');
      if (!target) return;

      const actor = currentUser();
      if (!actor || actor.role !== 'admin') return;

      const id = target.dataset.inventoryDelete;
      if (!id) return;

      if (!API_BASE) {
        const state = readState();
        const before = (state.inventory || []).length;
        const removed = (state.inventory || []).find((item) => item.id === id) || null;
        state.inventory = (state.inventory || []).filter((item) => item.id !== id);
        if (state.inventory.length === before) return;
        writeState(state);
        renderInventoryList();
        refreshColorOptionsFromForm();
        let announce = { ok: false, reason: 'no-item' };
        if (removed) {
          announce = await announceInventoryChange('removed', { name: removed.name, material: removed.material }, actor);
          renderInventoryFeed();
        }
        showAlert('#inventoryAlert', `Inventory item removed on this device only (shared server offline). ${inventoryAnnounceLabel(announce)}`, announce && announce.ok ? 'success' : 'error');
        return;
      }

      try {
        const removed = (readState().inventory || []).find((item) => item.id === id) || null;
        const result = await apiFetch(`/api/inventory/${encodeURIComponent(id)}`, { method: 'DELETE' });
        applyApiPayload(result);
        renderInventoryList();
        refreshColorOptionsFromForm();
        let announce = { ok: false, reason: 'no-item' };
        if (removed) {
          announce = await announceInventoryChange('removed', { name: removed.name, material: removed.material }, actor);
          renderInventoryFeed();
        }
        showAlert('#inventoryAlert', `Inventory item removed. ${inventoryAnnounceLabel(announce)}`, announce && announce.ok ? 'success' : 'error');
      } catch (error) {
        handleApiError(error, '#inventoryAlert', 'Unable to remove inventory item.');
      }
    });
  }

  function isValidModelFile(fileName) {
    return /\.stl$/i.test(fileName) || /\.3mf$/i.test(fileName);
  }

  function attachRequestForm() {
    const form = document.getElementById('requestForm');
    if (!form) return;

    const materialSelect = document.getElementById('requestMaterial');
    if (materialSelect) {
      materialSelect.addEventListener('change', function () {
        populateColorOptions(materialSelect.value);
      });
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();

      const user = currentUser();
      if (!user) {
        showAlert('#requestAlert', 'Please sign in before submitting a request.', 'error');
        return;
      }

      const data = new FormData(form);
      const file = data.get('file');
      const fileName = file && typeof file.name === 'string' ? file.name : '';
      const projectName = (data.get('projectName') || '').toString().trim();
      const material = (data.get('material') || '').toString().trim();
      const color = (data.get('color') || '').toString().trim();
      const description = (data.get('description') || '').toString().trim();
      const deadline = (data.get('deadline') || '').toString().trim();

      if (!projectName) {
        showAlert('#requestAlert', 'Please enter a project name.', 'error');
        return;
      }

      if (!ALLOWED_MATERIALS.includes(material)) {
        showAlert('#requestAlert', 'Choose PLA, PETG, or SILK+ — those are the only materials we stock.', 'error');
        return;
      }

      const state = readState();
      const stocked = inventoryForMaterial(state, material);
      if (!stocked.length) {
        showAlert('#requestAlert', `We don’t have ${material} inventory stocked right now. Pick another material or ask staff.`, 'error');
        return;
      }

      if (!color || !stocked.some((item) => item.name === color)) {
        showAlert('#requestAlert', 'Choose a color from the list stocked for your selected material.', 'error');
        return;
      }

      if (!description) {
        showAlert('#requestAlert', 'Please describe the part. Include dimensions here only if they aren’t clear from the model file.', 'error');
        return;
      }

      if (!file || !fileName) {
        showAlert('#requestAlert', 'Please upload your 3D model file (STL or 3MF).', 'error');
        return;
      }
      if (!isValidModelFile(fileName)) {
        showAlert('#requestAlert', 'File must be an STL (.stl) or 3MF (.3mf).', 'error');
        return;
      }

      if (!API_BASE) {
        const request = {
          id: `request-${Date.now()}`,
          name: user.name,
          email: user.email,
          projectName,
          material,
          color,
          dimensions: 'See uploaded file',
          description,
          deadline: deadline || 'Flexible',
          fileName,
          status: 'Pending',
          createdAt: Date.now()
        };
        state.requests.unshift(request);
        state.chats = state.chats || [];
        state.chats.unshift({
          id: `chat-${request.id}`,
          requestId: request.id,
          participants: withAdminParticipants(state, [user.email]),
          messages: [
            {
              sender: user.name,
              senderEmail: user.email,
              text: 'Request created. Waiting for admin review.',
              ts: Date.now()
            },
            {
              sender: 'Makerspace',
              senderEmail: ADMIN_EMAIL,
              text: 'Thanks! Once we review this request, we’ll message you here to confirm the price before printing begins.',
              ts: Date.now()
            }
          ]
        });
        writeState(state);
        form.reset();
        refreshColorOptionsFromForm();
        renderRequestLists();
        renderAdminRequests();
        showAlert('#requestAlert', 'Request saved on this device only (shared server offline). Start the makerspace API to sync across computers.', 'success');
        setTimeout(() => {
          openChatForRequest(request.id, true);
        }, 80);
        return;
      }

      try {
        const result = await apiFetch('/api/requests', {
          method: 'POST',
          body: JSON.stringify({
            projectName,
            material,
            color,
            description,
            deadline: deadline || 'Flexible',
            fileName
          })
        });
        applyApiPayload(result);
        form.reset();
        refreshColorOptionsFromForm();
        renderRequestLists();
        renderAdminRequests();
        showAlert('#requestAlert', 'Your request has been submitted. Check the print request chat — we’ll confirm the price before printing begins.', 'success');
        const requestId = result.request && result.request.id;
        if (requestId) {
          setTimeout(() => {
            openChatForRequest(requestId, true);
            const chatArea = document.querySelector(`[data-chat-area="${requestId}"]:not([hidden])`);
            if (chatArea) chatArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 80);
        }
      } catch (error) {
        handleApiError(error, '#requestAlert', 'Unable to submit print request.');
      }
    });
  }

  function attachSignout() {
    document.addEventListener('click', async function (event) {
      const button = event.target.closest('[data-signout]');
      if (!button) return;
      event.preventDefault();
      await clearSession();
      window.location.href = msUrl('/signout');
    });
  }

  function springChatSourceLabel() {
    const backend = chatBackendLabel();
    if (backend === 'api') {
      return 'Live chat via makerspace server — syncs across devices (school shared chat).';
    }
    if (backend === 'chat') {
      return 'Live chat via school server — syncs across devices (no OCS login).';
    }
    if (backend === 'spring') {
      return 'Live chat via school OCS — syncs across devices.';
    }
    return 'Chat on this device only — shared server offline.';
  }

  function renderChatInArea(area, requestId, user, chat) {
    if (!area) return;
    if (!user) {
      area.innerHTML = '<div class="makerspace-empty">Sign in to chat with admin.</div>';
      return;
    }

    // Keep draft text + focus across re-renders (poll / message refresh).
    const existingInput = area.querySelector('.chatForm input[name="message"]');
    const draft = existingInput ? existingInput.value : '';
    const wasFocused = !!(existingInput && document.activeElement === existingInput);

    const sourceLabel = springChatSourceLabel();

    if (!chat || !(chat.messages || []).length) {
      area.innerHTML = `
        <div class="makerspace-empty">No messages yet.</div>
        <p class="request-hint">${escapeHtml(sourceLabel)}</p>
        <form class="chatForm" data-request-id="${requestId}">
          <input type="text" name="message" placeholder="${user.role === 'admin' ? 'Message the student...' : 'Message the admin about this print...'}" required />
          <button type="submit" class="makerspace-action-button">Send</button>
        </form>
      `;
      restoreChatDraft(area, draft, wasFocused);
      return;
    }

    const messagesHtml = (chat.messages || []).map((m) => `
      <div class="chat-message ${m.senderEmail === user.email || (!m.senderEmail && m.sender === user.name) ? 'mine' : 'theirs'}">
        <div class="chat-meta"><strong>${escapeHtml(m.sender)}</strong> <span class="chat-ts">${new Date(m.ts).toLocaleString()}</span></div>
        <div class="chat-text">${escapeHtml(m.text)}</div>
      </div>
    `).join('');

    const placeholder = user.role === 'admin'
      ? 'Message the student...'
      : 'Message the admin about this print...';

    area.innerHTML = `
      <div class="chat-messages">${messagesHtml}</div>
      <p class="request-hint">${escapeHtml(sourceLabel)}</p>
      <form class="chatForm" data-request-id="${requestId}">
        <input type="text" name="message" placeholder="${placeholder}" required />
        <button type="submit" class="makerspace-action-button">Send</button>
      </form>
    `;
    restoreChatDraft(area, draft, wasFocused);
  }

  function restoreChatDraft(area, draft, wasFocused) {
    if (!area) return;
    const input = area.querySelector('.chatForm input[name="message"]');
    if (!input) return;
    if (draft) input.value = draft;
    if (wasFocused) input.focus();
  }

  function snapshotOpenChats() {
    const snaps = [];
    document.querySelectorAll('[data-chat-area]').forEach((area) => {
      const id = area.getAttribute('data-chat-area');
      if (!id) return;
      const input = area.querySelector('.chatForm input[name="message"]');
      snaps.push({
        id,
        hidden: area.hasAttribute('hidden'),
        draft: input ? input.value : '',
        focused: !!(input && document.activeElement === input)
      });
    });
    return snaps;
  }

  function restoreOpenChats(snaps) {
    (snaps || []).forEach((snap) => {
      const area = document.querySelector(`[data-chat-area="${snap.id}"]`);
      if (!area) return;
      if (snap.hidden) area.setAttribute('hidden', '');
      else area.removeAttribute('hidden');
      restoreChatDraft(area, snap.draft, snap.focused);
    });
  }

  function isUserTyping() {
    const el = document.activeElement;
    if (!el || el === document.body) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function isChatAreaFocused(area) {
    if (!area) return false;
    const active = document.activeElement;
    return !!(active && area.contains(active));
  }

  function renderChat(requestId) {
    const user = currentUser();
    const chat = findChatByRequest(requestId);
    document.querySelectorAll(`[data-chat-area="${requestId}"]`).forEach((area) => {
      // Never clobber a chat the user is actively typing into.
      if (isChatAreaFocused(area)) return;
      renderChatInArea(area, requestId, user, chat);
    });
  }

  async function openChatForRequest(requestId, forceOpen) {
    const areas = Array.from(document.querySelectorAll(`[data-chat-area="${requestId}"]`));
    if (!areas.length) return;

    const user = currentUser();
    if (!user) {
      const alertEl = document.querySelector('#requestAlert') || document.querySelector('#signinAlert');
      if (alertEl) showAlert(`#${alertEl.id}`, 'Sign in to chat with admin about this request.', 'error');
      return;
    }

    const state = readState();
    const request = state.requests.find((item) => item.id === requestId);
    if (request && !canViewRequest(request, user)) {
      areas.forEach((area) => {
        area.innerHTML = '<div class="makerspace-empty">You do not have access to this request.</div>';
        area.removeAttribute('hidden');
      });
      return;
    }

    // Primary: makerspace API proxy → Flask direct → Spring (shared chat).
    const sharedLoaded = await loadSharedChatForRequest(requestId);
    await ensureSharedChatReady();

    // Fallback history: makerspace API chats when shared chat did not load.
    if (!sharedLoaded && API_BASE) {
      try {
        const result = await apiFetch(`/api/chats/${encodeURIComponent(requestId)}`);
        if (result.chat) {
          const chats = (readState().chats || []).filter((c) => c.requestId !== requestId);
          writeState({ ...readState(), chats: [result.chat, ...chats] });
        }
      } catch (error) {
        // Chat may not exist yet; message send will create it server-side.
      }
    }

    areas.forEach((area) => {
      const isOpen = !area.hasAttribute('hidden');
      // If the user is typing in this open chat, leave it alone.
      if (isOpen && isChatAreaFocused(area)) return;
      if (forceOpen || !isOpen) {
        area.removeAttribute('hidden');
        renderChatInArea(area, requestId, user, findChatByRequest(requestId));
      } else {
        area.setAttribute('hidden', '');
      }
    });
  }

  function attachChatHandlers() {
    document.addEventListener('click', function (ev) {
      const toggleBtn = ev.target.closest('[data-chat-toggle]');
      if (toggleBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        openChatForRequest(toggleBtn.dataset.requestId, true);
        return;
      }

      const card = ev.target.closest('[data-request-card]');
      if (!card) return;
      if (ev.target.closest('a, button, input, textarea, select, label, form, .chat-area')) return;
      openChatForRequest(card.dataset.requestId, true);
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const card = ev.target.closest('[data-request-card]');
      if (!card || ev.target !== card) return;
      ev.preventDefault();
      openChatForRequest(card.dataset.requestId, true);
    });

    document.addEventListener('submit', async function (ev) {
      const form = ev.target.closest('.chatForm');
      if (!form) return;
      ev.preventDefault();
      const requestId = form.dataset.requestId;
      const input = form.querySelector('input[name="message"]');
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;

      const user = currentUser();
      if (!user) {
        showAlert('#requestAlert', 'Unable to send message. Make sure you are signed in.', 'error');
        return;
      }

      const state = readState();
      const request = state.requests.find((item) => item.id === requestId);
      if (!request || !canViewRequest(request, user)) {
        showAlert('#requestAlert', 'Unable to send message for this request.', 'error');
        return;
      }

      // Primary: makerspace API proxy (Flask direct only on localhost).
      if (await sendSharedChatMessage(requestId, text, user)) {
        upsertLocalChatMessage(requestId, {
          sender: user.name,
          senderEmail: user.email,
          text,
          ts: Date.now()
        });
        renderChat(requestId);
        return;
      }

      // Fallback: makerspace API chats / localStorage.
      if (!API_BASE) {
        if (!directFlaskAllowed()) {
          showAlert('#requestAlert', 'Cannot send chat — shared makerspace server unreachable. Tap Retry connection at the top, or wait ~30s and try again.', 'error');
          setApiStatus('waking', 'Chat send failed — shared server unreachable.');
          return;
        }
        state.chats = state.chats || [];
        let chat = state.chats.find((c) => c.requestId === requestId);
        if (!chat) {
          chat = {
            id: `chat-${request.id}`,
            requestId: request.id,
            participants: withAdminParticipants(state, [request.email, user.email]),
            messages: []
          };
          state.chats.unshift(chat);
        }
        chat.messages.push({ sender: user.name, senderEmail: user.email, text, ts: Date.now() });
        chat.participants = withAdminParticipants(state, [
          ...(chat.participants || []),
          request.email,
          user.email
        ]);
        writeState(state);
        renderChat(requestId);
        return;
      }

      try {
        const result = await apiFetch(`/api/chats/${encodeURIComponent(requestId)}/messages`, {
          method: 'POST',
          body: JSON.stringify({ text })
        });
        applyApiPayload(result);
        renderChat(requestId);
      } catch (error) {
        showAlert('#requestAlert', (error && error.message) || 'Unable to send message.', 'error');
      }
    });
  }

  function attachAdminActions() {
    document.addEventListener('click', async function (event) {
      const target = event.target.closest('[data-action]');
      if (!target) return;

      const action = target.dataset.action;
      const requestId = target.dataset.requestId;
      if (!requestId) return;

      const user = currentUser();
      if (!user || user.role !== 'admin') return;

      if (!API_BASE && !microblogChat() && !springChat()) {
        const state = readState();
        const request = state.requests.find((item) => item.id === requestId);
        if (!request) return;

        const normalized = normalizeStatus(request.status);
        const STATUS_CHAT_NOTES = {
          accepted: 'Request accepted. We’re moving ahead with the print.',
          completed: 'Print marked completed. It’s now in your print history.',
          closed: 'Request closed. It’s now in your print history.',
          rejected: 'Request rejected. We won’t print this job.'
        };
        let noteKey = null;

        if (action === 'accept' || action === 'approve') {
          if (normalized !== 'pending') return;
          request.status = 'Approved';
          noteKey = 'accepted';
        } else if (action === 'complete') {
          if (normalized !== 'approved') return;
          request.status = 'Completed';
          noteKey = 'completed';
        } else if (action === 'close') {
          if (normalized !== 'pending' && normalized !== 'approved') return;
          request.status = 'Closed';
          noteKey = 'closed';
        } else if (action === 'reject') {
          if (normalized !== 'pending' && normalized !== 'approved') return;
          request.status = 'Rejected';
          noteKey = 'rejected';
        } else {
          return;
        }

        state.chats = state.chats || [];
        let chat = state.chats.find((c) => c.requestId === requestId);
        if (!chat) {
          chat = {
            id: `chat-${request.id}`,
            requestId: request.id,
            participants: withAdminParticipants(state, [request.email, user.email]),
            messages: []
          };
          state.chats.unshift(chat);
        }
        chat.messages.push({
          sender: user.name,
          senderEmail: user.email,
          text: `${request.projectName || 'Request'} status → ${request.status}. ${STATUS_CHAT_NOTES[noteKey] || ''}`.trim(),
          ts: Date.now()
        });
        chat.participants = withAdminParticipants(state, [
          ...(chat.participants || []),
          request.email,
          user.email
        ]);
        writeState(state);
        renderAdminRequests();
        renderRequestLists();
        renderChat(requestId);
        return;
      }

      try {
        // Status note → shared chat when available (so it syncs across devices).
        const noteMap = {
          accept: 'Request accepted. We’re moving ahead with the print.',
          approve: 'Request accepted. We’re moving ahead with the print.',
          complete: 'Print marked completed. It’s now in your print history.',
          close: 'Request closed. It’s now in your print history.',
          reject: 'Request rejected. We won’t print this job.'
        };
        const note = noteMap[action];
        if (note) {
          await ensureSharedChatReady();
          const req = readState().requests.find((item) => item.id === requestId);
          const noteText = `${(req && req.projectName) || 'Request'} — ${note}`;
          if (await sendSharedChatMessage(requestId, noteText, user)) {
            upsertLocalChatMessage(requestId, {
              sender: user.name,
              senderEmail: user.email,
              text: noteText,
              ts: Date.now()
            });
          }
        }

        const result = await apiFetch(`/api/requests/${encodeURIComponent(requestId)}/status`, {
          method: 'POST',
          body: JSON.stringify({ action })
        });
        applyApiPayload(result);
        renderAdminRequests();
        renderRequestLists();
        renderChat(requestId);
      } catch (error) {
        console.warn('Status update failed', error);
      }
    });
  }

  function attachAdminCreateForm() {
    const form = document.getElementById('adminCreateForm');
    if (!form) return;

    form.addEventListener('submit', async function (event) {
      event.preventDefault();

      const actor = currentUser();
      if (!actor || actor.role !== 'admin') {
        showAlert('#adminCreateAlert', 'Only admin accounts can create other admins.', 'error');
        return;
      }

      const data = new FormData(form);
      const name = (data.get('name') || '').toString().trim();
      const email = (data.get('email') || '').toString().trim();
      const schoolId = (data.get('schoolId') || '').toString().trim();
      const password = (data.get('password') || '').toString();

      if (!name || !email || !schoolId || !password) {
        showAlert('#adminCreateAlert', 'Please complete every required field.', 'error');
        return;
      }

      if (!isValidStudentEmail(email) && email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        showAlert('#adminCreateAlert', 'Use a valid Poway school email ending in @stu.powayusd.com.', 'error');
        return;
      }

      if (!isValidSchoolId(schoolId)) {
        showAlert('#adminCreateAlert', 'School ID must be 7 digits and start with 19.', 'error');
        return;
      }

      if (password.length < 4) {
        showAlert('#adminCreateAlert', 'Password must be at least 4 characters.', 'error');
        return;
      }

      if (!API_BASE) {
        const state = readState();
        if (state.users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
          showAlert('#adminCreateAlert', 'An account with that email already exists.', 'error');
          return;
        }
        if (state.users.some((user) => (user.schoolId || '').toLowerCase() === schoolId.toLowerCase())) {
          showAlert('#adminCreateAlert', 'That school ID is already in use.', 'error');
          return;
        }
        const newAdmin = {
          id: `admin-${Date.now()}`,
          name,
          email,
          schoolId,
          password,
          role: 'admin',
          createdBy: actor.email
        };
        state.users.push(newAdmin);
        state.chats = (state.chats || []).map((chat) => ({
          ...chat,
          participants: Array.from(new Set([...(chat.participants || []), newAdmin.email]))
        }));
        writeState(state);
        form.reset();
        showAlert('#adminCreateAlert', `Admin account created on this device only (shared server offline) for ${name}.`, 'success');
        renderMemberList((document.getElementById('memberSearch') || {}).value || '');
        return;
      }

      try {
        const result = await apiFetch('/api/members', {
          method: 'POST',
          body: JSON.stringify({ name, email, schoolId, password })
        });
        applyApiPayload(result);
        form.reset();
        showAlert('#adminCreateAlert', `Admin account created for ${name}. They can sign in with ${email}.`, 'success');
        renderMemberList((document.getElementById('memberSearch') || {}).value || '');
      } catch (error) {
        handleApiError(error, '#adminCreateAlert', 'Unable to create admin account.');
      }
    });
  }

  function initializeWelcome() {
    const user = currentUser();
    const welcome = document.getElementById('welcomeUser');
    if (!welcome) return;
    welcome.textContent = user ? `Welcome back, ${user.name}` : 'Sign in to start printing';
  }

  function renderAll() {
    updateSignedInState();
    initializeWelcome();
    renderRequestLists();
    renderAdminRequests();
    renderInventoryList();
    renderMemberList((document.getElementById('memberSearch') || {}).value || '');
    populateColorOptions('PLA');
    renderOutOfStockColors();
    renderInventoryFeed();
  }

  async function init() {
    attachNavToggle();
    attachSignup();
    attachSignin();
    attachRequestForm();
    attachSignout();
    attachAdminActions();
    attachAdminCreateForm();
    attachInventoryForm();
    attachInventoryFeedForm();
    attachMemberSearch();
    attachChatHandlers();
    attachApiStatusHandlers();

    // Paint immediately from cache, then hydrate makerspace API state.
    renderAll();
    await hydrateFromApi();
    renderAll();
    keepApiWarm();

    // Re-warm when the tab becomes visible again (Render may have slept).
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && !apiHealthy) {
        keepApiWarm();
      }
    });

    // Shared chat: re-poll open request chats when live messages arrive (Spring).
    const spring = springChat();
    if (spring && spring.onMessage) {
      spring.onMessage(function (event) {
        if (!event || event.context !== 'sendMessageServer') return;
        const raw = event.message || '';
        const match = /^\s*\[\[request:([^\]]+)\]\]\s?/.exec(raw);
        if (!match) return;
        const requestId = match[1];
        const text = raw.replace(/^\s*\[\[request:[^\]]+\]\]\s?/, '');
        upsertLocalChatMessage(requestId, {
          sender: event.sender || event.name || 'Unknown',
          senderEmail: null,
          text,
          ts: event.date ? new Date(event.date).getTime() : Date.now()
        });
        renderChat(requestId);
      });
    }

    // Light poll for makerspace API state + shared chat history + stock feed.
    if (API_BASE || microblogChat()) {
      const hasRequestUi = !!(document.getElementById('requestList') || document.getElementById('adminRequestList'));
      const hasInventoryFeed = !!document.getElementById('inventoryFeed');
      if (hasRequestUi || hasInventoryFeed) {
        setInterval(async function () {
          // Never rebuild lists while the user is typing — that wipes open
          // chat inputs and member-edit forms under the cursor.
          if (isUserTyping()) return;
          if (API_BASE) {
            const ok = await hydrateFromApi();
            if (ok && !isUserTyping()) renderAll();
          }
          if (hasInventoryFeed && !isUserTyping()) renderInventoryFeed();
          // Refresh chats that are currently visible (renderChat skips focused areas).
          const openAreas = document.querySelectorAll('[data-chat-area]:not([hidden])');
          openAreas.forEach(async function (area) {
            const requestId = area.getAttribute('data-chat-area');
            if (!requestId) return;
            if (isChatAreaFocused(area)) return;
            if (await loadSharedChatForRequest(requestId)) renderChat(requestId);
          });
        }, 20000);
      }
    }

    // Best-effort shared chat connect on pages that show chat.
    if (document.getElementById('requestList') || document.getElementById('adminRequestList')) {
      ensureSharedChatReady().catch(function () { /* UI already has fallback copy */ });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
