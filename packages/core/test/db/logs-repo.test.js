const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const { mkdirSync, rmSync } = require('fs');
const { openDb, closeDb } = require('../../src/db');
const { createRunsRepo } = require('../../src/db/runs');
const { createLogsRepo } = require('../../src/db/logs');

const TMP = path.join(os.tmpdir(), 'oneshot-logs-repo-test');

function seedRun(runs, id = 'r1') {
  runs.insertRun({
    id, agentName: 'a', source: 'server', status: 'running',
    startedAt: '2026-05-29T10:00:00Z', options: {},
  });
  return id;
}

describe('logs repo', () => {
  let dir;
  let db;
  let runs;
  let logs;

  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  beforeEach(() => {
    dir = path.join(TMP, 'l-' + Math.random().toString(36).slice(2, 8));
    db = openDb(dir);
    runs = createRunsRepo(db);
    logs = createLogsRepo(db);
  });

  it('appends in batches and returns the new line count', () => {
    const id = seedRun(runs);
    let n = logs.appendLogLines(id, 'stdout', ['a', 'b', 'c'], 0);
    assert.strictEqual(n, 3);
    n = logs.appendLogLines(id, 'stdout', ['d'], n);
    assert.strictEqual(n, 4);
    assert.strictEqual(logs.getStreamCount(id, 'stdout'), 4);
    closeDb(dir);
  });

  it('paginates with offset and limit', () => {
    const id = seedRun(runs);
    logs.appendLogLines(id, 'stdout', ['1', '2', '3', '4', '5'], 0);
    const page = logs.getLogLines(id, 'stdout', { offset: 1, limit: 2 });
    assert.deepStrictEqual(page.lines, ['2', '3']);
    assert.strictEqual(page.hasMore, true);
    assert.strictEqual(page.offset, 1);
    closeDb(dir);
  });

  it('tail returns lines after a cursor', () => {
    const id = seedRun(runs);
    logs.appendLogLines(id, 'stdout', ['a', 'b', 'c', 'd'], 0);
    const tail = logs.getLogLinesAfter(id, 'stdout', 2);
    assert.deepStrictEqual(tail.lines, ['c', 'd']);
    assert.strictEqual(tail.lastLine, 4);
    closeDb(dir);
  });

  it('getStreamContent joins all lines with \\n', () => {
    const id = seedRun(runs);
    logs.appendLogLines(id, 'stdout', ['one', 'two', 'three'], 0);
    assert.strictEqual(logs.getStreamContent(id, 'stdout'), 'one\ntwo\nthree');
    closeDb(dir);
  });

  it('stdout and stderr are independent streams', () => {
    const id = seedRun(runs);
    logs.appendLogLines(id, 'stdout', ['out 1', 'out 2'], 0);
    logs.appendLogLines(id, 'stderr', ['err 1'], 0);
    assert.strictEqual(logs.getStreamCount(id, 'stdout'), 2);
    assert.strictEqual(logs.getStreamCount(id, 'stderr'), 1);
    closeDb(dir);
  });

  it('appendLogLinesIgnore skips PK collisions and lets later batches resume', () => {
    const id = seedRun(runs);
    logs.appendLogLines(id, 'stdout', ['x', 'y', 'z'], 0);
    // Pretend a re-run tries to re-insert lines 1-3 and add line 4
    const n = logs.appendLogLinesIgnore(id, 'stdout', ['x', 'y', 'z'], 0);
    // The ignored inserts still increment startLine inside the helper, so n=3
    assert.strictEqual(n, 3);
    // Adding a genuinely new line:
    const m = logs.appendLogLinesIgnore(id, 'stdout', ['w'], 3);
    assert.strictEqual(m, 4);
    assert.strictEqual(logs.getStreamCount(id, 'stdout'), 4);
    closeDb(dir);
  });
});
