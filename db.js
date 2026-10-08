const path = require('path');
const Database = require('better-sqlite3');
const seed = require('./data/internships.json');

const db = new Database(process.env.DB_FILE || path.join(__dirname, 'internships.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS internships (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    domain     TEXT NOT NULL,
    mode       TEXT NOT NULL CHECK (mode IN ('Remote', 'Hybrid', 'On-site')),
    location   TEXT NOT NULL,
    skills     TEXT NOT NULL,
    openings   INTEGER NOT NULL CHECK (openings >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// Fill the table with sample records the first time only
const { count } = db.prepare('SELECT COUNT(*) AS count FROM internships').get();
if (count === 0) {
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO internships (id, title, domain, mode, location, skills, openings, created_at, updated_at)
    VALUES (@id, @title, @domain, @mode, @location, @skills, @openings, @now, @now)
  `);
  const seedAll = db.transaction((rows) => {
    for (const r of rows) insert.run({ ...r, skills: JSON.stringify(r.skills), now });
  });
  seedAll(seed.internships);
  console.log(`Seeded ${seed.internships.length} internships`);
}

module.exports = db;