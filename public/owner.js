(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const state = {
    authenticated: false,
    resources: [],
    csrfToken: '',
    toastTimer: null
  };

  const formatSize = (bytes) => {
    if (!Number.isFinite(Number(bytes))) return '';
    const n = Number(bytes);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  };

  const extLabel = (ext) => String(ext || '').replace('.', '').toUpperCase().slice(0, 5) || 'FILE';
  const escapeText = (value) => String(value ?? '');

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (state.csrfToken && !headers['X-CSRF-Token']) {
      headers['X-CSRF-Token'] = state.csrfToken;
    }
    const response = await fetch(path, { credentials: 'same-origin', ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) throw new Error(body?.error || `Request failed (${response.status})`);
    return body;
  }

  function showToast(message, isError = false) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove('show'), 3300);
  }

  function setView(view) {
    $('#ownerLoading').hidden = true;
    if (view === 'login') {
      $('#loginView').hidden = false;
      $('#dashboardView').hidden = true;
      $('#signOutButton').hidden = true;
      const pwd = $('#adminPassword');
      if (pwd) pwd.focus();
    } else if (view === 'dashboard') {
      $('#loginView').hidden = true;
      $('#dashboardView').hidden = false;
      $('#signOutButton').hidden = false;
    }
  }

  async function fetchCsrfToken() {
    try {
      const data = await api('/api/csrf-token');
      if (data?.csrfToken) state.csrfToken = data.csrfToken;
    } catch (_) {
      // CSRF token will be retried on login
    }
  }

  async function checkAuth() {
    try {
      await fetchCsrfToken();
      const me = await api('/api/me');
      state.authenticated = Boolean(me.authenticated);
      if (state.authenticated) {
        setView('dashboard');
        await loadOwnerResources();
      } else {
        setView('login');
      }
    } catch (err) {
      setView('login');
      showToast('Could not verify owner session.', true);
    }
  }

  function renderOwnerResourceItem(resource) {
    const item = document.createElement('div');
    item.className = 'owner-resource-item';

    const info = document.createElement('div');
    info.className = 'owner-resource-info';

    const top = document.createElement('div');
    top.className = 'owner-resource-top';

    const badge = document.createElement('span');
    badge.className = 'resource-badge' + (resource.kind === 'assignment' ? ' assignment' : '');
    badge.textContent = resource.kind === 'assignment' ? 'Assignment' : 'Notes';

    const fmt = document.createElement('span');
    fmt.className = 'file-format';
    fmt.textContent = extLabel(resource.ext);

    top.append(badge, fmt);

    const title = document.createElement('h3');
    title.className = 'owner-resource-title';
    title.textContent = escapeText(resource.title);

    const meta = document.createElement('div');
    meta.className = 'owner-resource-meta';
    meta.textContent = `${escapeText(resource.subject)}${resource.semester ? ' · ' + escapeText(resource.semester) : ''} · ${formatSize(resource.size)} · ${formatDate(resource.createdAt)}`;

    info.append(top, title, meta);

    const actions = document.createElement('div');
    actions.className = 'owner-resource-actions';

    const downloadLink = document.createElement('a');
    downloadLink.className = 'button button-quiet owner-action-btn';
    downloadLink.href = `/api/resources/${encodeURIComponent(resource.id)}/download`;
    downloadLink.textContent = 'Download';
    downloadLink.setAttribute('aria-label', `Download ${resource.title}`);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'button button-quiet owner-delete-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.setAttribute('aria-label', `Delete ${resource.title}`);
    deleteBtn.addEventListener('click', () => deleteOwnerResource(resource));

    actions.append(downloadLink, deleteBtn);
    item.append(info, actions);

    return item;
  }

  async function loadOwnerResources() {
    const list = $('#ownerResourceList');
    const countEl = $('#ownerResourceCount');
    try {
      countEl.textContent = 'Refreshing resources…';
      state.resources = await api('/api/resources');
      countEl.textContent = `${state.resources.length} resource${state.resources.length === 1 ? '' : 's'} in library`;
      list.replaceChildren();
      if (!state.resources.length) {
        const empty = document.createElement('p');
        empty.className = 'owner-empty';
        empty.textContent = 'No resources uploaded yet. Use the form above to add your first note or assignment.';
        list.append(empty);
      } else {
        state.resources.forEach(r => list.append(renderOwnerResourceItem(r)));
      }
    } catch (err) {
      countEl.textContent = 'Error loading resources';
      showToast('Could not load library resources.', true);
    }
  }

  async function deleteOwnerResource(resource) {
    const confirmDelete = window.confirm(`Delete "${resource.title}" from the library? This cannot be undone.`);
    if (!confirmDelete) return;

    try {
      await api(`/api/resources/${encodeURIComponent(resource.id)}`, { method: 'DELETE' });
      state.resources = state.resources.filter(r => r.id !== resource.id);
      showToast(`Deleted "${resource.title}"`);
      await loadOwnerResources();
    } catch (err) {
      showToast(err.message || 'Failed to delete resource.', true);
    }
  }

  // Login handler
  $('#loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('#loginError');
    errEl.textContent = '';
    const submitBtn = $('button[type="submit"]', e.currentTarget);
    const pwdInput = $('#adminPassword');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';

    try {
      const result = await api('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwdInput.value })
      });
      if (result.csrfToken) state.csrfToken = result.csrfToken;
      else await fetchCsrfToken();
      state.authenticated = true;
      pwdInput.value = '';
      setView('dashboard');
      showToast('Welcome back, owner.');
      await loadOwnerResources();
    } catch (err) {
      errEl.textContent = err.message || 'Incorrect password.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
    }
  });

  // Sign out handler
  $('#signOutButton')?.addEventListener('click', async () => {
    try {
      await api('/api/logout', { method: 'POST' });
      state.authenticated = false;
      setView('login');
      showToast('Signed out successfully.');
    } catch (err) {
      showToast(err.message || 'Error signing out.', true);
    }
  });

  // File upload dropzone & form
  const fileInput = $('#resourceFile');
  const fileNameLabel = $('#fileNameLabel');
  const dropZone = $('#dropZone');

  if (fileInput && fileNameLabel && dropZone) {
    fileInput.addEventListener('change', () => {
      fileNameLabel.textContent = fileInput.files[0] ? fileInput.files[0].name : 'Drop your file here, or browse';
    });

    ['dragenter', 'dragover'].forEach(name => {
      dropZone.addEventListener(name, (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      dropZone.addEventListener(name, (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer?.files;
      if (!files || !files.length) return;
      try {
        const transfer = new DataTransfer();
        transfer.items.add(files[0]);
        fileInput.files = transfer.files;
        fileInput.dispatchEvent(new Event('change'));
      } catch (_) {
        showToast('Please use browse to select the file.', true);
      }
    });
  }

  $('#uploadForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('#uploadError');
    errEl.textContent = '';
    const file = fileInput.files[0];
    if (!file) {
      errEl.textContent = 'Choose a file to upload.';
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      errEl.textContent = 'That file is over 25 MB. Choose a smaller file.';
      return;
    }

    const submitBtn = $('#submitUpload');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading…';

    try {
      const formData = new FormData(e.currentTarget);
      await api('/api/resources', {
        method: 'POST',
        body: formData
      });
      e.currentTarget.reset();
      fileNameLabel.innerHTML = 'Drop your file here, or <u>browse</u>';
      showToast('Resource uploaded successfully!');
      await loadOwnerResources();
    } catch (err) {
      errEl.textContent = err.message || 'Upload failed.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Upload resource';
    }
  });

  // Initial access check
  checkAuth();
})();
