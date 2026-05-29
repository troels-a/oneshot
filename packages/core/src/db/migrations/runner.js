const path = require('path');
const { readdirSync, readFileSync } = require('fs');

const MIGRATIONS_DIR = __dirname;

function listMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()
    .map((name) => ({
      version: parseInt(name.slice(0, 4), 10),
      name,
      path: path.join(MIGRATIONS_DIR, name),
    }));
}

function tableExists(db, tableName) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(tableName);
  return Boolean(row);
}

function appliedVersions(db) {
  const rows = db.prepare('SELECT version FROM schema_version').all();
  return new Set(rows.map((r) => r.version));
}

function applyMigrations(db) {
  if (!tableExists(db, 'schema_version')) {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT    NOT NULL
    );`);
  }

  const applied = appliedVersions(db);
  const pending = listMigrations().filter((m) => !applied.has(m.version));
  if (!pending.length) return [];

  const recorded = [];
  for (const migration of pending) {
    const sql = readFileSync(migration.path, 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
        .run(migration.version, new Date().toISOString());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    recorded.push(migration.version);
  }
  return recorded;
}

module.exports = { applyMigrations, listMigrations };
