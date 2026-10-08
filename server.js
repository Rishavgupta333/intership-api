const express = require('express');
const db = require('./db');
const { validateInternship } = require('./validate');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '100kb' }));

// Simple CORS so the front-end board can call this API from another port
app.use((req, res, next) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---- helpers ----
const toRecord = (row) => ({ ...row, skills: JSON.parse(row.skills) });

const sendError = (res, status, code, message, details) =>
  res.status(status).json({ error: { code, message, ...(details && { details }) } });

function nextId() {
  const ids = db.prepare('SELECT id FROM internships').all();
  const max = ids.reduce((m, { id }) => Math.max(m, parseInt(id.replace(/\D/g, ''), 10) || 0), 100);
  return `INT-${max + 1}`;
}

const findById = (id) => db.prepare('SELECT * FROM internships WHERE id = ?').get(id);

// ---- routes ----
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// List with pagination + optional filters: ?page=1&limit=10&q=sql&domain=UI/UX&mode=Remote
app.get('/api/internships', (req, res) => {
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const limit = req.query.limit === undefined ? 10 : Number(req.query.limit);

  if (!Number.isInteger(page) || page < 1) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'page must be a whole number, 1 or more');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'limit must be a whole number from 1 to 50');
  }

  const where = [];
  const params = [];
  const { q, domain, mode } = req.query;
  if (q) {
    where.push('(title LIKE ? OR location LIKE ? OR domain LIKE ? OR skills LIKE ?)');
    params.push(...Array(4).fill(`%${q}%`));
  }
  if (domain) { where.push('domain = ?'); params.push(domain); }
  if (mode) { where.push('mode = ?'); params.push(mode); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM internships ${clause}`).get(...params);
  const rows = db
    .prepare(`SELECT * FROM internships ${clause} ORDER BY rowid LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit);

  res.json({
    data: rows.map(toRecord),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

app.get('/api/internships/:id', (req, res) => {
  const row = findById(req.params.id);
  if (!row) return sendError(res, 404, 'NOT_FOUND', `Internship ${req.params.id} not found`);
  res.json({ data: toRecord(row) });
});

app.post('/api/internships', (req, res) => {
  const { errors, clean } = validateInternship(req.body);
  if (errors.length) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid internship data', errors);

  const now = new Date().toISOString();
  const id = nextId();
  db.prepare(`
    INSERT INTO internships (id, title, domain, mode, location, skills, openings, created_at, updated_at)
    VALUES (@id, @title, @domain, @mode, @location, @skills, @openings, @now, @now)
  `).run({ ...clean, id, skills: JSON.stringify(clean.skills), now });

  res.status(201).location(`/api/internships/${id}`).json({ data: toRecord(findById(id)) });
});

function update(partial) {
  return (req, res) => {
    const existing = findById(req.params.id);
    if (!existing) return sendError(res, 404, 'NOT_FOUND', `Internship ${req.params.id} not found`);

    const { errors, clean } = validateInternship(req.body, { partial });
    if (errors.length) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid internship data', errors);

    const merged = { ...toRecord(existing), ...clean };
    db.prepare(`
      UPDATE internships
      SET title=@title, domain=@domain, mode=@mode, location=@location,
          skills=@skills, openings=@openings, updated_at=@now
      WHERE id=@id
    `).run({ ...merged, skills: JSON.stringify(merged.skills), now: new Date().toISOString() });

    res.json({ data: toRecord(findById(req.params.id)) });
  };
}

app.put('/api/internships/:id', update(false));   // replace: all fields required
app.patch('/api/internships/:id', update(true));  // partial: only sent fields change

app.delete('/api/internships/:id', (req, res) => {
  const result = db.prepare('DELETE FROM internships WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return sendError(res, 404, 'NOT_FOUND', `Internship ${req.params.id} not found`);
  res.sendStatus(204);
});

// ---- fallbacks ----
app.use((req, res) => sendError(res, 404, 'NOT_FOUND', `Route ${req.method} ${req.path} does not exist`));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return sendError(res, 400, 'INVALID_JSON', 'Request body is not valid JSON');
  }
  console.error(err);
  sendError(res, 500, 'SERVER_ERROR', 'Something went wrong on the server');
});

app.listen(PORT, () => console.log(`API running at http://localhost:${PORT}`));