(function () {
  const STORAGE_KEY = 'makerspace-demo-state';
  const ADMIN_EMAIL = 'admin@stu.powayusd.com';

  function defaultState() {
    return {
      users: [
        {
          id: 'admin-1',
          name: 'Makerspace Admin',
          email: ADMIN_EMAIL,
          schoolId: '1900001',
          password: 'makerspace-admin',
          role: 'admin'
        }
      ],
      requests: [],
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
      if (!parsed.session || typeof parsed.session !== 'object') parsed.session = null;
      if (!parsed.users.some(item => item.email === ADMIN_EMAIL)) {
        parsed.users.unshift(seed.users[0]);
      }
      return parsed;
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

  function setSession(user) {
    const state = readState();
    state.session = { email: user.email, role: user.role, name: user.name };
    writeState(state);
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

  function buildRequestMarkup(item) {
    const statusClass = item.status ? item.status.toLowerCase() : 'pending';
    return `
      <div class="request-item">
        <div class="request-item-header">
          <h3>${item.projectName || 'Unnamed request'}</h3>
          <span class="makerspace-badge ${statusClass}">${item.status || 'Pending'}</span>
        </div>
        <div class="request-meta">
          <span>By: ${item.name}</span>
          <span>Material: ${item.material}</span>
          <span>Print size: ${item.dimensions}</span>
        </div>
        <p>${item.description || 'No description provided.'}</p>
        <div class="request-meta">
          <span>Upload: ${item.fileName || 'No file uploaded'}</span>
          <span>Needed by: ${item.deadline || 'Flexible'}</span>
        </div>
      </div>
    `;
  }

  function renderRequests() {
    const container = document.getElementById('requestList');
    if (!container) return;

    const state = readState();
    const current = currentUser();
    const visibleRequests = current && current.role === 'admin'
      ? state.requests
      : state.requests.filter(item => item.email === current?.email || item.name === current?.name);

    if (!visibleRequests.length) {
      container.innerHTML = '<div class="makerspace-empty">No print requests yet. Submit your first design for review.</div>';
      return;
    }

    container.innerHTML = visibleRequests.map(buildRequestMarkup).join('');
  }

  function renderAdminRequests() {
    const container = document.getElementById('adminRequestList');
    if (!container) return;

    const state = readState();
    if (!state.requests.length) {
      container.innerHTML = '<div class="makerspace-empty">There are no pending print jobs right now.</div>';
      return;
    }

    container.innerHTML = state.requests.map((item) => `
      <div class="admin-item">
        <div class="admin-item-header">
          <h3>${item.projectName || 'Unnamed request'}</h3>
          <span class="makerspace-badge ${item.status ? item.status.toLowerCase() : 'pending'}">${item.status || 'Pending'}</span>
        </div>
        <div class="admin-meta">
          <span>${item.name}</span>
          <span>${item.email}</span>
          <span>${item.material}</span>
          <span>${item.dimensions}</span>
        </div>
        <p>${item.description || 'No description provided.'}</p>
        <div class="admin-actions">
          <button class="approve" data-action="approve" data-request-id="${item.id}">Approve</button>
          <button class="reject" data-action="reject" data-request-id="${item.id}">Reject</button>
        </div>
      </div>
    `).join('');
  }

  function updateSignedInState() {
    const user = currentUser();
    const isSignedIn = !!user;

    document.querySelectorAll('[data-auth-area]').forEach((el) => {
      const role = el.dataset.authArea;
      const shouldShow = role === 'signed-in' ? isSignedIn : !isSignedIn;
      el.hidden = !shouldShow;
    });

    document.querySelectorAll('[data-user-name]').forEach((el) => {
      if (user) el.textContent = user.name;
    });

    const requestLink = document.getElementById('requestLink');
    if (requestLink) requestLink.hidden = !isSignedIn;

    const adminLink = document.getElementById('adminLink');
    if (adminLink) adminLink.hidden = !(isSignedIn && user && user.role === 'admin');
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
      setTimeout(() => { window.location.href = '/requests'; }, 700);
    });
  }

  function attachSignin() {
    const form = document.getElementById('signinForm');
    if (!form) return;

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      const data = new FormData(form);
      const email = (data.get('email') || '').toString().trim();
      const password = (data.get('password') || '').toString();

      if (!email || !password) {
        showAlert('#signinAlert', 'Enter both your email and password.', 'error');
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
      setTimeout(() => { window.location.href = '/requests'; }, 600);
    });
  }

  function attachRequestForm() {
    const form = document.getElementById('requestForm');
    if (!form) return;

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      const user = currentUser();
      if (!user) {
        showAlert('#requestAlert', 'Please sign in before submitting a request.', 'error');
        return;
      }

      const data = new FormData(form);
      const file = data.get('file');
      const fileName = file && typeof file.name === 'string' ? file.name : 'No file selected';

      const request = {
        id: `request-${Date.now()}`,
        name: user.name,
        email: user.email,
        projectName: (data.get('projectName') || '').toString().trim(),
        material: (data.get('material') || '').toString().trim(),
        dimensions: (data.get('dimensions') || '').toString().trim(),
        description: (data.get('description') || '').toString().trim(),
        deadline: (data.get('deadline') || '').toString().trim(),
        fileName,
        status: 'Pending'
      };

      const state = readState();
      state.requests.unshift(request);
      writeState(state);
      form.reset();
      renderRequests();
      renderAdminRequests();
      showAlert('#requestAlert', 'Your request has been submitted for review.', 'success');
    });
  }

  function attachSignout() {
    document.querySelectorAll('[data-signout]').forEach((button) => {
      button.addEventListener('click', function () {
        clearSession();
        window.location.href = '/signout';
      });
    });
  }

  function attachAdminActions() {
    document.addEventListener('click', function (event) {
      const target = event.target.closest('[data-action]');
      if (!target) return;

      const action = target.dataset.action;
      const requestId = target.dataset.requestId;
      if (!requestId) return;

      const state = readState();
      const request = state.requests.find(item => item.id === requestId);
      if (!request) return;

      request.status = action === 'approve' ? 'Approved' : 'Rejected';
      writeState(state);
      renderAdminRequests();
      renderRequests();
    });
  }

  function initializeWelcome() {
    const user = currentUser();
    const welcome = document.getElementById('welcomeUser');
    if (!welcome) return;
    welcome.textContent = user ? `Welcome back, ${user.name}` : 'Create an account to start printing';
  }

  function init() {
    updateSignedInState();
    initializeWelcome();
    attachSignup();
    attachSignin();
    attachRequestForm();
    attachSignout();
    attachAdminActions();
    renderRequests();
    renderAdminRequests();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
