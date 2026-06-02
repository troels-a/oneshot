const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const { mkdirSync, rmSync } = require('fs');
const { openDb, closeDb } = require('../../src/db');

const TMP = path.join(os.tmpdir(), 'oneshot-db-migrations-test');

describe('db migrations', () => {
  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('creates all expected tables on first open', () => {
    const dir = path.join(TMP, 'fresh');
    const db = openDb(dir);
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all().map((r) => r.name);
    assert.deepStrictEqual(tables, ['log_lines', 'runs', 'schedules', 'schema_version', 'webhooks']);
    closeDb(dir);
  });

  it('records the applied version', () => {
    const dir = path.join(TMP, 'records-version');
    const db = openDb(dir);
    const rows = db.prepare('SELECT version FROM schema_version ORDER BY version').all();
    assert.deepStrictEqual(rows.map((r) => r.version), [1, 2]);
    closeDb(dir);
  });

  it('is a no-op on subsequent opens', () => {
    const dir = path.join(TMP, 'idempotent');
    openDb(dir);
    closeDb(dir);
    const db = openDb(dir);
    const rows = db.prepare('SELECT COUNT(*) AS n FROM schema_version').get();
    assert.strictEqual(rows.n, 2);
    closeDb(dir);
  });

  it('caches the connection by data dir', () => {
    const dir = path.join(TMP, 'cached');
    const a = openDb(dir);
    const b = openDb(dir);
    assert.strictEqual(a, b);
    closeDb(dir);
  });
});
