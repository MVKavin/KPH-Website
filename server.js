require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const isVercel = Boolean(process.env.VERCEL);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOAD_DIR = isVercel ? path.join('/tmp', 'uploads') : path.join(ROOT, 'uploads');
const DATA_DIR = isVercel ? path.join('/tmp', 'data') : path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'resources.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'KPHAdmin2026!';
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 8;

for (const dir of [UPLOAD_DIR, DATA_DIR]) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
}
if (isVercel && !fs.existsSync(DB_FILE)) {
  const seedFile = path.join(ROOT, 'data', 'resources.json');
  if (fs.existsSync(seedFile)) {
    try { fs.copyFileSync(seedFile, DB_FILE); } catch (_) {}
  }
}
if (!fs.existsSync(DB_FILE)) {
  try { fs.writeFileSync(DB_FILE, '[]', 'utf8'); } catch (_) {}
}
if (isProduction && !isVercel && (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 14 || !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  console.error('Refusing to start in production: set ADMIN_PASSWORD (14+ characters) and SESSION_SECRET (32+ characters) in .env.');
  process.exit(1);
}

const ALLOWED = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt', '.md', '.jpg', '.jpeg', '.png', '.webp', '.xlsx', '.csv']);
const MIME_BY_EXT = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword', 'application/octet-stream'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/octet-stream'],
  '.ppt': ['application/vnd.ms-powerpoint', 'application/octet-stream'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip', 'application/octet-stream'],
  '.txt': ['text/plain', 'application/octet-stream'],
  '.md': ['text/markdown', 'text/plain', 'application/octet-stream'],
  '.jpg': ['image/jpeg', 'application/octet-stream'],
  '.jpeg': ['image/jpeg', 'application/octet-stream'],
  '.png': ['image/png', 'application/octet-stream'],
  '.webp': ['image/webp', 'application/octet-stream'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'application/octet-stream'],
  '.csv': ['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream']
};

function readResources() {
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Could not read resource database:', err.message);
    return [];
  }
}
function writeResources(items) {
  const temp = DB_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(items, null, 2), 'utf8');
  fs.renameSync(temp, DB_FILE);
}
function safeResource(r) {
  return {
    id: r.id,
    title: r.title,
    kind: r.kind,
    subject: r.subject,
    semester: r.semester,
    description: r.description || '',
    originalName: r.originalName,
    size: r.size,
    ext: r.ext,
    createdAt: r.createdAt
  };
}
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Please sign in as the site administrator to do that.' });
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
app.use(session({
  name: 'kph.sid',
  secret: process.env.SESSION_SECRET || 'kph-default-fallback-session-secret-key-32chars!',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProduction, maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

app.get('/', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});
const uploader = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED.has(ext)) return cb(new Error('That file type is not supported. Upload PDF, Office documents, images, text, CSV, or Markdown files.'));
    const knownMimes = MIME_BY_EXT[ext] || [];
    if (file.mimetype && knownMimes.length && !knownMimes.includes(file.mimetype)) {
      return cb(new Error('The file type does not match its extension. Please choose the original file.'));
    }
    cb(null, true);
  }
});

app.get('/owner', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'owner.html'));
});

app.get('/api/csrf-token', (req, res) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  res.json({ csrfToken: req.session.csrfToken });
});

function validateCsrf(req, res, next) {
  const token = req.headers['x-csrf-token'] || req.body?.csrfToken;
  if (!token || !req.session || !req.session.csrfToken || token !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token. Please refresh the page.' });
  }
  next();
}

app.get('/api/health', (_req, res) => res.json({ ok: true, name: "KPH API" }));
app.get('/api/resources', (_req, res) => {
  const items = readResources().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.set('Cache-Control', 'no-store');
  res.json(items.map(safeResource));
});
app.get('/api/me', (req, res) => res.json({ authenticated: Boolean(req.session && req.session.isAdmin) }));
function limitAdminLoginAttempts(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (entry && entry.resetAt > now && entry.count >= MAX_LOGIN_ATTEMPTS) {
    res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    return res.status(429).json({ error: 'Too many sign-in attempts. Wait 15 minutes, then try again.' });
  }
  req.loginAttemptKey = key;
  next();
}
app.post('/api/login', limitAdminLoginAttempts, (req, res, next) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Admin login is not configured. Add ADMIN_PASSWORD to your .env file and restart the server.' });
  const supplied = String(req.body.password || '');
  const expected = Buffer.from(ADMIN_PASSWORD);
  const provided = Buffer.from(supplied);
  const valid = expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
  if (!valid) {
    const now = Date.now();
    const previous = loginAttempts.get(req.loginAttemptKey);
    if (!previous || previous.resetAt <= now) {
      loginAttempts.set(req.loginAttemptKey, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    } else {
      previous.count += 1;
    }
    return res.status(401).json({ error: 'That password did not match. Try again.' });
  }
  loginAttempts.delete(req.loginAttemptKey);
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.isAdmin = true;
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    req.session.save((saveErr) => {
      if (saveErr) return next(saveErr);
      res.json({ authenticated: true, csrfToken: req.session.csrfToken });
    });
  });
});
app.post('/api/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('kph.sid', { httpOnly: true, sameSite: 'lax', secure: isProduction });
    res.json({ ok: true });
  });
});
app.post('/api/resources', requireAdmin, validateCsrf, (req, res, next) => {
  uploader.single('file')(req, res, (err) => {
    if (err) {
      const status = err instanceof multer.MulterError ? (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400) : 400;
      return res.status(status).json({ error: err.message || 'Upload failed.' });
    }
    try {
      if (!req.file) return res.status(400).json({ error: 'Choose a file to upload.' });
      const title = String(req.body.title || '').trim().slice(0, 120);
      const subject = String(req.body.subject || '').trim().slice(0, 80);
      const description = String(req.body.description || '').trim().slice(0, 500);
      const semester = String(req.body.semester || '').trim().slice(0, 60);
      const kind = String(req.body.kind || '').toLowerCase();
      if (!title || !subject || !['note', 'assignment'].includes(kind)) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'Title, subject, and a valid resource type are required.' });
      }
      const resource = {
        id: crypto.randomUUID(), title, subject, description, semester,
        kind, originalName: path.basename(req.file.originalname).slice(0, 240),
        storedName: req.file.filename, ext: path.extname(req.file.originalname).toLowerCase(),
        size: req.file.size, createdAt: new Date().toISOString()
      };
      const items = readResources();
      items.push(resource);
      writeResources(items);
      res.status(201).json(safeResource(resource));
    } catch (writeErr) {
      if (req.file) fs.unlink(req.file.path, () => {});
      next(writeErr);
    }
  });
});
app.get('/api/resources/:id/download', (req, res) => {
  const resource = readResources().find(r => r.id === req.params.id);
  if (!resource) return res.status(404).json({ error: 'Resource not found.' });
  const target = path.join(UPLOAD_DIR, path.basename(resource.storedName || ''));
  if (!fs.existsSync(target)) return res.status(404).json({ error: 'The file is no longer available on the server.' });
  res.download(target, resource.originalName || 'resource');
});
app.delete('/api/resources/:id', requireAdmin, validateCsrf, (req, res, next) => {
  try {
    const items = readResources();
    const index = items.findIndex(r => r.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'Resource not found.' });
    const [resource] = items.splice(index, 1);
    writeResources(items);
    const target = path.join(UPLOAD_DIR, path.basename(resource.storedName || ''));
    fs.unlink(target, err => { if (err && err.code !== 'ENOENT') console.error('Could not remove uploaded file:', err.message); });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Check the terminal for details.' });
});

if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`KPH — Khalil's Play House running at http://localhost:${PORT}`);
    if (!ADMIN_PASSWORD) console.warn('Admin upload disabled until ADMIN_PASSWORD is set in .env.');
    if (!isProduction) console.log('Local development mode. Configure .env before deploying publicly.');
  });
}

module.exports = app;

