(function () {
  const STORAGE_KEY = 'makerspace-demo-state';
  const SESSION_TOKEN_KEY = 'makerspace-session-token';
  const ADMIN_EMAIL = 'krishk27411@stu.powayusd.com';
  const ACTIVE_STATUSES = ['pending', 'approved'];
  const HISTORY_STATUSES = ['rejected', 'completed', 'closed'];
  const ALLOWED_MATERIALS = ['PLA', 'PETG', 'SILK+'];

  // Shared API base. Layout injects window.MAKERSPACE_API in production;
  // localhost auto-points at makerspace_backend/server.py on :8787.
  function resolveApiBase() {
    if (typeof window !== 'undefined' && typeof window.MAKERSPACE_API === 'string' && window.MAKERSPACE_API) {
      return window.MAKERSPACE_API.replace(/\/$/, '');
    }
    if (typeof window === 'undefined') return '';
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:8787';
    return '';
  }

  const API_BASE = resolveApiBase();
  let stateCache = null;
  let apiHealthy = null;

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

    const res = await fetch(API_BASE + path, Object.assign({}, opts, { headers }));
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

  async function hydrateFromApi() {
    if (!API_BASE) {
      apiHealthy = false;
      return false;
    }
    try {
      const data = await apiFetch('/api/state');
      applyApiPayload(data);
      apiHealthy = true;
      return true;
    } catch (error) {
      apiHealthy = false;
      console.warn('Makerspace API hydrate failed; using local cache.', error);
      return false;
    }
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

    if (!openJobs.length) {
      container.innerHTML = '<div class="makerspace-empty">There are no open print jobs right now.</div>';
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
  }

  function renderRequestLists() {
    const listEl = document.getElementById('requestList');
    if (!listEl) return;

    const historyEl = document.getElementById('printHistory');
    const emptyEl = document.getElementById('requestsEmpty');
    const state = readState();
    const user = currentUser();

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
    const message = (error && error.message) || fallbackMessage || 'Something went wrong.';
    if (error && error.code === 'NO_API') {
      showAlert(alertSelector, 'The makerspace server is not reachable. Start it with `python3 makerspace_backend/server.py` or check MAKERSPACE_API.', 'error');
      return;
    }
    showAlert(alertSelector, message, 'error');
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
        const result = await apiFetch('/api/auth/signin', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });
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

    container.innerHTML = users.map((item) => {
      const email = item.email || '';
      const isOpen = openMemberEmail && openMemberEmail.toLowerCase() === email.toLowerCase();
      const requestCount = memberRequestHistory(state, email).length;
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
                  <input type="email" name="email" value="${escapeHtml(email)}" required pattern="^[^@\\s]+@stu\\.powayusd\\.com$" title="Use a Poway school email ending in @stu.powayusd.com">
                </label>
                <label class="field">
                  School ID
                  <input type="text" name="schoolId" value="${escapeHtml(item.schoolId || '')}" required pattern="^19\\d{5}$" title="Enter a 7-digit ID starting with 19">
                </label>
                <label class="field">
                  Password
                  <input type="text" name="password" value="${escapeHtml(item.password || '')}" required minlength="4">
                </label>
                <label class="field">
                  Role
                  <select name="role" required>
                    <option value="member" ${(item.role || 'member') === 'member' ? 'selected' : ''}>Member</option>
                    <option value="admin" ${item.role === 'admin' ? 'selected' : ''}>Admin</option>
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

      if (!email || !schoolId || password.length < 4) {
        fail('Email, school ID, and password (min 4 chars) are all required.');
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
        target.password = password;
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
        fail((error && error.message) || 'Unable to save member changes.');
      }
    });
  }

  function refreshColorOptionsFromForm() {
    const materialSelect = document.getElementById('requestMaterial');
    const material = materialSelect ? materialSelect.value : 'PLA';
    populateColorOptions(material);
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
          showAlert('#inventoryAlert', `Added ${name} to ${material} inventory on this device only (shared server offline).`, 'success');
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
          showAlert('#inventoryAlert', `Added ${name} to ${material} inventory.`, 'success');
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
        state.inventory = (state.inventory || []).filter((item) => item.id !== id);
        if (state.inventory.length === before) return;
        writeState(state);
        renderInventoryList();
        refreshColorOptionsFromForm();
        showAlert('#inventoryAlert', 'Inventory item removed on this device only (shared server offline).', 'success');
        return;
      }

      try {
        const result = await apiFetch(`/api/inventory/${encodeURIComponent(id)}`, { method: 'DELETE' });
        applyApiPayload(result);
        renderInventoryList();
        refreshColorOptionsFromForm();
        showAlert('#inventoryAlert', 'Inventory item removed.', 'success');
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

  function renderChatInArea(area, requestId, user, chat) {
    if (!area) return;
    if (!user) {
      area.innerHTML = '<div class="makerspace-empty">Sign in to chat with admin.</div>';
      return;
    }
    if (!chat) {
      area.innerHTML = '<div class="makerspace-empty">No chat available.</div>';
      return;
    }

    const messagesHtml = (chat.messages || []).map((m) => `
      <div class="chat-message ${m.senderEmail === user.email ? 'mine' : 'theirs'}">
        <div class="chat-meta"><strong>${escapeHtml(m.sender)}</strong> <span class="chat-ts">${new Date(m.ts).toLocaleString()}</span></div>
        <div class="chat-text">${escapeHtml(m.text)}</div>
      </div>
    `).join('');

    const placeholder = user.role === 'admin'
      ? 'Message the student...'
      : 'Message the admin about this print...';

    area.innerHTML = `
      <div class="chat-messages">${messagesHtml}</div>
      <form class="chatForm" data-request-id="${requestId}">
        <input type="text" name="message" placeholder="${placeholder}" required />
        <button type="submit" class="makerspace-action-button">Send</button>
      </form>
    `;
  }

  function renderChat(requestId) {
    const user = currentUser();
    const chat = findChatByRequest(requestId);
    document.querySelectorAll(`[data-chat-area="${requestId}"]`).forEach((area) => {
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

    if (API_BASE) {
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

      if (!API_BASE) {
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

      if (!API_BASE) {
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
    attachMemberSearch();
    attachChatHandlers();

    // Paint immediately from cache, then hydrate from the shared API.
    renderAll();
    await hydrateFromApi();
    renderAll();

    // Light poll so open request/admin pages pick up other devices' chats.
    if (API_BASE && (document.getElementById('requestList') || document.getElementById('adminRequestList'))) {
      setInterval(async function () {
        const ok = await hydrateFromApi();
        if (ok) renderAll();
      }, 20000);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
