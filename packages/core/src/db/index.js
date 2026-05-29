const path = require('path');
const { mkdirSync } = require('fs');

(function suppressSqliteExperimentalWarning() {
  const original = process.emit.bind(process);
  process.emit = function (event, payload, ...rest) {
    if (
      event === 'warning' &&
      payload &&
      payload.name === 'ExperimentalWarning' &&
      typeof payload.message === 'string' &&
      payload.message.includes('SQLite')
    ) {
      return false;
    }
    return original(event, payload, ...rest);
  };
})();

const { DatabaseSync } = require('node:sqlite');
const { applyMigrations } = require('./migrations/runner');

const cache = new Map();

function openDb(dataDir) {
  const resolved = path.resolve(dataDir);
  const cached = cache.get(resolved);
  if (cached && cached.isOpen) return cached;

  mkdirSync(resolved, { recursive: true });
  const dbPath = path.join(resolved, 'oneshot.db');
  const db = new DatabaseSync(dbPath);

  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA temp_store = MEMORY');

  applyMigrations(db);
  cache.set(resolved, db);
  return db;
}

function closeDb(dataDir) {
  const resolved = path.resolve(dataDir);
  const db = cache.get(resolved);
  if (db && db.isOpen) db.close();
  cache.delete(resolved);
}

function createRepos(db) {
  const { createRunsRepo } = require('./runs');
  const { createSchedulesRepo } = require('./schedules');
  const { createLogsRepo } = require('./logs');
  return {
    runs: createRunsRepo(db),
    schedules: createSchedulesRepo(db),
    logs: createLogsRepo(db),
  };
}

module.exports = { openDb, closeDb, createRepos };
