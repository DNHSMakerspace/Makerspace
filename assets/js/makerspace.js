(function () {
  const STORAGE_KEY = 'makerspace-demo-state';
  const ADMIN_EMAIL = 'krishk27411@stu.powayusd.com';
  const ACTIVE_STATUSES = ['pending', 'approved'];
  const HISTORY_STATUSES = ['rejected', 'completed', 'closed'];

  // Resolve site baseurl so redirects never drop a path prefix (e.g. /Makerspace).
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

  // Build a site-absolute path with optional baseurl + pretty trailing slash.
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
      // Avoid doubling the base if a caller already included it.
      if (clean === base + '/' || clean.startsWith(base + '/')) {
        return clean + hash;
      }
    }
    if (clean === '/') return (base || '') + '/' + hash;
    return base + clean + hash;
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

  function readState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState()));
      return defaultState();
    }

    try {
      const parsed = JSON.parse(raw);
      const seed = defaultState();
      if (!Array.isArray(parsed.users)) parsed.users = seed.users;
      if (!Array.isArray(parsed.requests)) parsed.requests = [];
      if (!Array.isArray(parsed.chats)) parsed.chats = [];
      if (!Array.isArray(parsed.inventory)) parsed.inventory = seed.inventory;
      if (!parsed.session || typeof parsed.session !== 'object') parsed.session = null;

      // One-time cleanup: keep only the primary admin (Krish). Other legacy/demo
      // accounts are removed. Admin accounts created after this flag is set remain.
      if (!parsed.purgedDemoAccounts) {
        parsed.users = parsed.users.filter(
          (user) => user && user.role === 'admin' && user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
        );
        if (!parsed.users.length) {
          parsed.users = seed.users.slice();
        } else {
          // Reset primary admin to current seed credentials
          parsed.users = [{ ...seed.users[0] }];
        }
        parsed.purgedDemoAccounts = true;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      }

      // Always ensure the primary admin account exists
      if (!parsed.users.some(item => item.email === ADMIN_EMAIL)) {
        parsed.users.unshift({ ...seed.users[0] });
      }

      // Drop session if the signed-in user no longer exists
      if (parsed.session && !parsed.users.some(item => item.email === parsed.session.email)) {
        parsed.session = null;
      }

      // Force primary admin to current role
      const primary = parsed.users.find(item => item.email === ADMIN_EMAIL);
      if (primary) primary.role = 'admin';

      // Seed a demo student + active print request for chat testing
      return ensureDemoChatSeed(parsed);
    } catch (error) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState()));
      return defaultState();
    }
  }

  function writeState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function currentUser() {
    const state = readState();
    return state.session ? state.users.find(user => user.email === state.session.email) || null : null;
  }

  function clearSession() {
    const state = readState();
    state.session = null;
    writeState(state);
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
    return (state.chats || []).find(c => c.requestId === requestId) || null;
  }

  function ensureChatForRequest(request, user) {
    const state = readState();
    state.chats = state.chats || [];
    let chat = state.chats.find(c => c.requestId === request.id);
    if (!chat) {
      chat = {
        id: `chat-${request.id}`,
        requestId: request.id,
        participants: withAdminParticipants(state, [request.email, user.email]),
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
      };
      state.chats.unshift(chat);
      writeState(state);
    }
    return chat;
  }

  function adminEmails(state) {
    return (state.users || [])
      .filter(user => user && user.role === 'admin')
      .map(user => user.email)
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
    // Admin review queue: open jobs only (history lives in print history)
    const openJobs = state.requests.filter(item => isActiveStatus(item.status));

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

    // Regular users only see their own requests; admins see all.
    const visible = state.requests.filter(item => canViewRequest(item, user));
    const active = visible.filter(item => isActiveStatus(item.status));
    const history = visible.filter(item => isHistoryStatus(item.status));

    listEl.innerHTML = active.length
      ? active.map(item => buildRequestMarkup(item, { history: false, scope: 'active' })).join('')
      : '<div class="makerspace-empty">No active print requests.</div>';

    if (historyEl) {
      historyEl.innerHTML = history.length
        ? history.map(item => buildRequestMarkup(item, { history: true, scope: 'history' })).join('')
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

    // Role-gated UI (e.g. admin-only create-admin panel)
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

  function attachSignup() {
    const form = document.getElementById('signupForm');
    if (!form) return;

    form.addEventListener('submit', function (event) {
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

      if (!isValidStudentEmail(email)) {
        showAlert('#signupAlert', 'Use a valid Poway school email ending in @stu.powayusd.com.', 'error');
        return;
      }

      if (!isValidSchoolId(schoolId)) {
        showAlert('#signupAlert', 'School ID must be 7 digits and start with 19.', 'error');
        return;
      }

      const state = readState();
      if (state.users.some(user => user.email.toLowerCase() === email.toLowerCase())) {
        showAlert('#signupAlert', 'An account with that email already exists.', 'error');
        return;
      }

      if (state.users.some(user => user.schoolId.toLowerCase() === schoolId.toLowerCase())) {
        showAlert('#signupAlert', 'That school ID is already in use.', 'error');
        return;
      }

      const user = {
        id: `user-${Date.now()}`,
        name,
        email,
        schoolId,
        password,
        role: email === ADMIN_EMAIL ? 'admin' : 'member'
      };

      state.users.push(user);
      state.session = { email: user.email, role: user.role, name: user.name };
      writeState(state);
      showAlert('#signupAlert', 'Account created. Redirecting to your request dashboard...', 'success');
      setTimeout(() => { window.location.href = msUrl('/requests'); }, 700);
    });
  }

  function attachSignin() {
    const form = document.getElementById('signinForm');
    if (!form) return;

    form.addEventListener('submit', function (event) {
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

      const state = readState();
      const user = state.users.find(item => item.email.toLowerCase() === email.toLowerCase() && item.password === password);

      if (!user) {
        showAlert('#signinAlert', 'Incorrect email or password.', 'error');
        return;
      }

      state.session = { email: user.email, role: user.role, name: user.name };
      writeState(state);
      showAlert('#signinAlert', 'Welcome back! Redirecting...', 'success');
      updateSignedInState();
      setTimeout(() => { window.location.href = msUrl('/requests'); }, 600);
    });
  }

  const ALLOWED_MATERIALS = ['PLA', 'PETG', 'SILK+'];

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

  const DEMO_STUDENT_EMAIL = 'teststudent@stu.powayusd.com';
  const DEMO_STUDENT_ID = 'demo-request-1';

  function demoStudentUser() {
    return {
      id: 'demo-student-1',
      name: 'Test Student',
      email: DEMO_STUDENT_EMAIL,
      schoolId: '1999999',
      password: 'test1234',
      role: 'member'
    };
  }

  function demoActiveRequest() {
    return {
      id: DEMO_STUDENT_ID,
      name: 'Test Student',
      email: DEMO_STUDENT_EMAIL,
      projectName: 'Robotics Gear Mount',
      material: 'PLA',
      color: 'Orange PLA basic',
      dimensions: 'See uploaded file',
      description: 'Mount plate for the FTC gear assembly. Keep walls 3 mm thick. Size is in the STL (about 80 x 40 x 12 mm).',
      deadline: 'Flexible',
      fileName: 'gear-mount-v2.stl',
      status: 'Pending',
      createdAt: Date.now() - 1000 * 60 * 42
    };
  }

  function demoChatForRequest(request) {
    const t = Date.now() - 1000 * 60 * 40;
    return {
      id: `chat-${request.id}`,
      requestId: request.id,
      participants: [DEMO_STUDENT_EMAIL, ADMIN_EMAIL],
      messages: [
        {
          sender: 'Test Student',
          senderEmail: DEMO_STUDENT_EMAIL,
          text: 'Hi! I submitted a gear mount for robotics. Can you check if PLA Orange works for this?',
          ts: t
        },
        {
          sender: 'Makerspace',
          senderEmail: ADMIN_EMAIL,
          text: 'Looks good — Orange PLA basic should work. Before we print, I’ll confirm the price here. Rough estimate is about $4–$6 depending on infill.',
          ts: t + 1000 * 60 * 8
        },
        {
          sender: 'Test Student',
          senderEmail: DEMO_STUDENT_EMAIL,
          text: 'That works for me. Thanks!',
          ts: t + 1000 * 60 * 12
        }
      ]
    };
  }

  function ensureDemoChatSeed(state) {
    if (state.seededDemoChat) return state;

    const student = demoStudentUser();
    if (!state.users.some((user) => user.email === DEMO_STUDENT_EMAIL)) {
      state.users.push(student);
    }

    const request = demoActiveRequest();
    if (!state.requests.some((item) => item.id === DEMO_STUDENT_ID)) {
      state.requests.unshift(request);
    }

    const existing = (state.chats || []).find((chat) => chat.requestId === DEMO_STUDENT_ID);
    if (!existing) {
      state.chats = state.chats || [];
      state.chats.unshift(demoChatForRequest(request));
    }

    state.seededDemoChat = true;
    return state;
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
      user.password,
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
              <dd>${escapeHtml(item.password || '—')}</dd>
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

  function attachMemberSearch() {
    const input = document.getElementById('memberSearch');
    if (!input) return;

    input.addEventListener('input', function () {
      renderMemberList(input.value.trim());
    });

    document.addEventListener('click', function (event) {
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

        const state = readState();
        const target = state.users.find((item) => (item.email || '').toLowerCase() === email);
        if (!target) return;

        // Never delete the primary seeded admin
        if (email === ADMIN_EMAIL.toLowerCase()) {
          const panel = deleteBtn.closest('.member-panel');
          const alertEl = panel ? panel.querySelector('.member-panel-alert') : null;
          if (alertEl) {
            alertEl.textContent = 'The primary admin account cannot be deleted.';
            alertEl.className = 'member-panel-alert alert show error';
          }
          return;
        }

        if (!window.confirm(`Delete account ${target.email}? This cannot be undone.`)) return;

        state.users = state.users.filter((item) => (item.email || '').toLowerCase() !== email);
        // Clear session if this was the signed-in user
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

      const editForm = event.target.closest('[data-member-edit]');
      // handled on submit below
      void editForm;
    });

    document.addEventListener('submit', function (event) {
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

      const oldEmail = target.email;
      const previousRole = target.role || 'member';
      target.email = email;
      target.schoolId = schoolId;
      target.password = password;
      target.role = role;

      // Keep session, requests, and chats consistent after email changes
      if (state.session && (state.session.email || '').toLowerCase() === originalEmail) {
        state.session.email = email;
        state.session.role = role;
      }
      state.requests = (state.requests || []).map((item) => {
        if ((item.email || '').toLowerCase() === originalEmail) {
          return { ...item, email };
        }
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
      renderAdminRequests();
      const roleNote = previousRole === role
        ? ''
        : role === 'admin'
          ? ' Role updated to admin.'
          : ' Role updated to member.';
      ok(`Saved changes for ${email}.${roleNote}`);
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
      form.addEventListener('submit', function (event) {
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
        showAlert('#inventoryAlert', `Added ${name} to ${material} inventory.`, 'success');
      });
    }

    document.addEventListener('click', function (event) {
      const target = event.target.closest('[data-inventory-delete]');
      if (!target) return;

      const actor = currentUser();
      if (!actor || actor.role !== 'admin') return;

      const id = target.dataset.inventoryDelete;
      const state = readState();
      const before = (state.inventory || []).length;
      state.inventory = (state.inventory || []).filter((item) => item.id !== id);
      if (state.inventory.length === before) return;

      writeState(state);
      renderInventoryList();
      refreshColorOptionsFromForm();
      showAlert('#inventoryAlert', 'Inventory item removed.', 'success');
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

    form.addEventListener('submit', function (event) {
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
      showAlert('#requestAlert', 'Your request has been submitted. Check the print request chat — we’ll confirm the price before printing begins.', 'success');

      // Open the admin chat for the new request
      setTimeout(() => {
        openChatForRequest(request.id, true);
        const chatArea = document.querySelector(`[data-chat-area="${request.id}"]:not([hidden])`);
        if (chatArea) chatArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 80);
    });
  }

  function attachSignout() {
    document.addEventListener('click', function (event) {
      const button = event.target.closest('[data-signout]');
      if (!button) return;
      event.preventDefault();
      clearSession();
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

    const messagesHtml = (chat.messages || []).map(m => `
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

  function openChatForRequest(requestId, forceOpen) {
    const areas = Array.from(document.querySelectorAll(`[data-chat-area="${requestId}"]`));
    if (!areas.length) return;

    const user = currentUser();
    if (!user) {
      const alertEl = document.querySelector('#requestAlert') || document.querySelector('#signinAlert');
      if (alertEl) showAlert(`#${alertEl.id}`, 'Sign in to chat with admin about this request.', 'error');
      return;
    }

    const state = readState();
    const request = state.requests.find(item => item.id === requestId);
    if (request && !canViewRequest(request, user)) {
      areas.forEach((area) => {
        area.innerHTML = '<div class="makerspace-empty">You do not have access to this request.</div>';
        area.removeAttribute('hidden');
      });
      return;
    }

    if (request) ensureChatForRequest(request, user);

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

      // Clicking a request card opens the admin chat
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

    document.addEventListener('submit', function (ev) {
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
      const request = state.requests.find(item => item.id === requestId);
      if (!request || !canViewRequest(request, user)) {
        showAlert('#requestAlert', 'Unable to send message for this request.', 'error');
        return;
      }

      state.chats = state.chats || [];
      let chat = state.chats.find(c => c.requestId === requestId);
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
    });
  }

  function attachAdminActions() {
    const STATUS_CHAT_NOTES = {
      accepted: 'Request accepted. We’re moving ahead with the print.',
      completed: 'Print marked completed. It’s now in your print history.',
      closed: 'Request closed. It’s now in your print history.',
      rejected: 'Request rejected. We won’t print this job.'
    };

    document.addEventListener('click', function (event) {
      const target = event.target.closest('[data-action]');
      if (!target) return;

      const action = target.dataset.action;
      const requestId = target.dataset.requestId;
      if (!requestId) return;

      const user = currentUser();
      if (!user || user.role !== 'admin') return;

      const state = readState();
      const request = state.requests.find(item => item.id === requestId);
      if (!request) return;

      const normalized = normalizeStatus(request.status);
      let noteKey = null;

      // Accept pending jobs
      if (action === 'accept' || action === 'approve') {
        if (normalized !== 'pending') return;
        request.status = 'Approved';
        noteKey = 'accepted';
      } else if (action === 'complete') {
        // Finish an accepted job → history
        if (normalized !== 'approved') return;
        request.status = 'Completed';
        noteKey = 'completed';
      } else if (action === 'close') {
        // Close open jobs without requiring completion → history
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

      // Log status change in the request chat
      state.chats = state.chats || [];
      let chat = state.chats.find(c => c.requestId === requestId);
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
    });
  }

  function attachAdminCreateForm() {
    const form = document.getElementById('adminCreateForm');
    if (!form) return;

    form.addEventListener('submit', function (event) {
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

      if (!isValidStudentEmail(email)) {
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

      const state = readState();
      if (state.users.some(user => user.email.toLowerCase() === email.toLowerCase())) {
        showAlert('#adminCreateAlert', 'An account with that email already exists.', 'error');
        return;
      }

      if (state.users.some(user => (user.schoolId || '').toLowerCase() === schoolId.toLowerCase())) {
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
      // Existing chats stay visible to every admin
      state.chats = (state.chats || []).map((chat) => ({
        ...chat,
        participants: Array.from(new Set([...(chat.participants || []), newAdmin.email]))
      }));
      writeState(state);
      form.reset();
      showAlert('#adminCreateAlert', `Admin account created for ${name}. They can sign in with ${email}.`, 'success');
      renderMemberList((document.getElementById('memberSearch') || {}).value || '');
    });
  }

  function initializeWelcome() {
    const user = currentUser();
    const welcome = document.getElementById('welcomeUser');
    if (!welcome) return;
    welcome.textContent = user ? `Welcome back, ${user.name}` : 'Sign in to start printing';
  }

  function init() {
    // Ensure demo chat seed is written even on first paint
    writeState(readState());
    attachNavToggle();
    updateSignedInState();
    initializeWelcome();
    attachSignup();
    attachSignin();
    attachRequestForm();
    attachSignout();
    attachAdminActions();
    attachAdminCreateForm();
    attachInventoryForm();
    attachMemberSearch();
    attachChatHandlers();
    renderRequestLists();
    renderAdminRequests();
    renderInventoryList();
    renderMemberList('');
    populateColorOptions('PLA');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
