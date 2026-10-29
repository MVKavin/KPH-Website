(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const state = {
    resources: [],
    type: 'all',
    subject: 'all',
    query: '',
    toastTimer: null
  };

  const grid = $('#resourceGrid');

  // Show the KPH identity animation once for each fresh tab/session.
  const intro = $('#introScreen');
  if (intro) {
    let alreadySeen = false;
    try {
      alreadySeen = sessionStorage.getItem('kph-intro-seen') === '1';
    } catch (_) {
      /* storage may be disabled */
    }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (alreadySeen || reduceMotion) {
      intro.classList.add('intro-hidden');
      intro.setAttribute('aria-hidden', 'true');
    } else {
      intro.setAttribute('aria-hidden', 'false');
      window.setTimeout(() => {
        intro.classList.add('intro-hidden');
        intro.setAttribute('aria-hidden', 'true');
        try {
          sessionStorage.setItem('kph-intro-seen', '1');
        } catch (_) {
          /* animation still completes */
        }
        window.setTimeout(() => intro.remove(), 650);
      }, 2450);
    }
  }

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
    const response = await fetch(path, { credentials: 'same-origin', ...options });
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

  function addSvgEmptyIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M4 6.5A2.5 2.5 0 0 1 6.5 4H14l6 6v7.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5Z M14 4v6h6 M8 14h8 M8 17h5');
    svg.append(path);
    return svg;
  }

  function emptyState(title, detail) {
    const el = document.createElement('div');
    el.className = 'empty-state';
    el.append(addSvgEmptyIcon());
    const h = document.createElement('h3');
    h.textContent = title;
    el.append(h);
    const p = document.createElement('p');
    p.textContent = detail;
    el.append(p);
    return el;
  }

  function makeCard(resource) {
    const article = document.createElement('article');
    article.className = 'resource-card';

    const top = document.createElement('div');
    top.className = 'resource-card-top';

    const badge = document.createElement('span');
    badge.className = 'resource-badge' + (resource.kind === 'assignment' ? ' assignment' : '');
    badge.textContent = resource.kind === 'assignment' ? 'Assignment' : 'Notes';

    const fmt = document.createElement('span');
    fmt.className = 'file-format';
    fmt.textContent = extLabel(resource.ext);

    top.append(badge, fmt);
    article.append(top);

    const title = document.createElement('h3');
    title.textContent = escapeText(resource.title);
    article.append(title);

    if (resource.description) {
      const desc = document.createElement('p');
      desc.className = 'resource-card-description';
      desc.textContent = escapeText(resource.description);
      article.append(desc);
    }

    const meta = document.createElement('div');
    meta.className = 'resource-meta';

    const date = document.createElement('span');
    date.textContent = formatDate(resource.createdAt);

    const dot = document.createElement('i');
    dot.className = 'meta-dot';

    const size = document.createElement('span');
    size.textContent = formatSize(resource.size);

    meta.append(date, dot, size);
    article.append(meta);

    const actions = document.createElement('div');
    actions.className = 'resource-card-actions';

    const subject = document.createElement('span');
    subject.className = 'resource-subject';
    subject.textContent = `${escapeText(resource.subject)}${resource.semester ? ' · ' + escapeText(resource.semester) : ''}`;
    subject.title = subject.textContent;

    const download = document.createElement('a');
    download.className = 'download-link';
    download.href = `/api/resources/${encodeURIComponent(resource.id)}/download`;
    download.textContent = 'Download';
    download.setAttribute('aria-label', `Download ${resource.title}`);

    actions.append(subject, download);
    article.append(actions);

    return article;
  }

  function renderSubjectChips() {
    const host = $('#subjectChips');
    if (!host) return;
    host.replaceChildren();

    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'subject-chip' + (state.subject === 'all' ? ' selected' : '');
    all.dataset.subject = 'all';
    all.textContent = 'All subjects';
    all.addEventListener('click', () => setSubject('all'));
    host.append(all);

    const subjects = [...new Set(state.resources.map(r => String(r.subject || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    subjects.forEach(subject => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'subject-chip' + (state.subject === subject ? ' selected' : '');
      b.dataset.subject = subject;
      b.textContent = subject;
      b.addEventListener('click', () => setSubject(subject));
      host.append(b);
    });
  }

  function setSubject(subject) {
    state.subject = subject;
    renderSubjectChips();
    renderResources();
  }

  function renderResources() {
    const allCount = state.resources.length;
    const notesCount = state.resources.filter(r => r.kind === 'note').length;
    const assignCount = state.resources.filter(r => r.kind === 'assignment').length;

    const countAll = $('#countAll');
    const countNotes = $('#countNotes');
    const countAssignments = $('#countAssignments');
    if (countAll) countAll.textContent = allCount;
    if (countNotes) countNotes.textContent = notesCount;
    if (countAssignments) countAssignments.textContent = assignCount;

    const q = state.query.trim().toLocaleLowerCase();
    const shown = state.resources.filter(r => {
      const typeMatch = state.type === 'all' || r.kind === state.type;
      const subjectMatch = state.subject === 'all' || r.subject === state.subject;
      const corpus = [r.title, r.subject, r.description, r.semester, r.originalName, r.kind].join(' ').toLocaleLowerCase();
      return typeMatch && subjectMatch && (!q || corpus.includes(q));
    });

    const caption = $('#resultsCaption');
    if (caption) caption.textContent = `Showing ${shown.length} of ${allCount} resource${allCount === 1 ? '' : 's'}`;

    const footnote = $('#libraryFootnote');
    if (footnote) footnote.textContent = allCount ? `${allCount} resource${allCount === 1 ? '' : 's'} in the library · newest first` : 'All study materials are carefully organized and verified.';

    const heroCount = $('#heroResourceCount');
    if (heroCount) heroCount.textContent = allCount ? `${allCount} resource${allCount === 1 ? '' : 's'} in the library and growing.` : 'Your study space, all in one place.';

    if (!grid) return;
    grid.replaceChildren();

    if (shown.length) {
      shown.forEach(r => grid.append(makeCard(r)));
    } else if (!allCount) {
      grid.append(emptyState('A fresh page, ready for notes.', 'The library is currently being updated with new notes and assignments.'));
    } else {
      grid.append(emptyState('Nothing in this corner yet.', 'Try another search or switch a filter to see more resources.'));
    }
  }

  async function loadResources() {
    try {
      state.resources = await api('/api/resources');
      renderSubjectChips();
      renderResources();
    } catch (err) {
      if (grid) {
        grid.replaceChildren(emptyState('The library could not load.', 'Start the website server with “npm start”, then refresh this page. If the server is already running, check its terminal for errors.'));
      }
      const caption = $('#resultsCaption');
      if (caption) caption.textContent = 'Server connection needed';
      showToast('Could not connect to the website server.', true);
    }
  }

  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const searchInput = $('#searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', event => {
      state.query = event.target.value;
      renderResources();
    });
  }

  $$('.filter-pill').forEach(btn => btn.addEventListener('click', () => {
    state.type = btn.dataset.filter;
    $$('.filter-pill').forEach(b => b.classList.toggle('active', b === btn));
    renderResources();
  }));

  const menuToggle = $('#menuToggle');
  const mainNav = $('.main-nav');
  if (menuToggle && mainNav) {
    menuToggle.addEventListener('click', () => {
      const open = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', String(!open));
      menuToggle.setAttribute('aria-label', open ? 'Open navigation' : 'Close navigation');
      mainNav.classList.toggle('open', !open);
    });

    $$('.main-nav a').forEach(a => a.addEventListener('click', () => {
      mainNav.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.setAttribute('aria-label', 'Open navigation');
    }));
  }

  // Initialize
  loadResources();
})();
