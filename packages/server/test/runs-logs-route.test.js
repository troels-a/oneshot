const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const path = require('path');
const os = require('os');
const { mkdirSync, rmSync } = require('fs');
const runsRouter = require('../src/routes/runs');
const { openDb, RunManager } = require('@oneshot/core');
const { createRepos } = require('@oneshot/core/src/db');

const TMP = path.join(os.tmpdir(), 'oneshot-runs-logs-route-test');

function makeContext(suffix) {
  const root = path.join(TMP, suffix);
  const logsDir = path.join(root, 'logs');
  const agentsDir = path.join(root, 'agents');
  const dataDir = path.join(root, 'data');
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  const db = openDb(dataDir);
  const manager = new RunManager({ db, logsDir, agentsDir, dataDir });

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.runManager = manager; next(); });
  app.use(runsRouter);

  return { app, manager, db };
}

function seedRun(db, id) {
  createRepos(db).runs.insertRun({
    id, agentName: 'a', source: 'server', status: 'completed',
    pid: 1, startedAt: '2026-05-29T10:00:00Z', completedAt: '2026-05-29T10:00:01Z',
    exitCode: 0, options: {}, cwd: '/tmp', logDir: '/tmp/x',
  });
}

describe('/runs/:id/logs routes (DB-backed)', () => {
  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('lists stdout.log and stderr.log with line counts', async () => {
    const { app, db } = makeContext('list');
    seedRun(db, 'r1');
    const logs = createRepos(db).logs;
    logs.appendLogLines('r1', 'stdout', ['a', 'b', 'c'], 0);
    logs.appendLogLines('r1', 'stderr', ['err'], 0);

    const res = await request(app).get('/runs/r1/logs');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.runId, 'r1');
    assert.strictEqual(res.body.files.length, 2);
    const stdout = res.body.files.find((f) => f.name === 'stdout.log');
    const stderr = res.body.files.find((f) => f.name === 'stderr.log');
    assert.strictEqual(stdout.lines, 3);
    assert.strictEqual(stdout.size, 3);
    assert.strictEqual(stderr.lines, 1);
  });

  it('reads stdout.log lines with offset and limit', async () => {
    const { app, db } = makeContext('offset');
    seedRun(db, 'r2');
    createRepos(db).logs.appendLogLines('r2', 'stdout', ['l1', 'l2', 'l3', 'l4', 'l5'], 0);

    const res = await request(app).get('/runs/r2/logs/stdout.log?offset=1&limit=2');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.lines, ['l2', 'l3']);
    assert.strictEqual(res.body.hasMore, true);
    assert.strictEqual(res.body.offset, 1);
  });

  it('tails after a cursor', async () => {
    const { app, db } = makeContext('tail');
    seedRun(db, 'r3');
    createRepos(db).logs.appendLogLines('r3', 'stdout', ['a', 'b', 'c'], 0);

    const res = await request(app).get('/runs/r3/logs/stdout.log/tail?after=1');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.lines, ['b', 'c']);
    assert.strictEqual(res.body.lastLine, 3);
  });

  it('404s for unknown filename', async () => {
    const { app, db } = makeContext('unknown-file');
    seedRun(db, 'r4');
    const res = await request(app).get('/runs/r4/logs/banana.log');
    assert.strictEqual(res.status, 404);
  });

  it('404s for unknown run', async () => {
    const { app } = makeContext('unknown-run');
    const res = await request(app).get('/runs/does-not-exist/logs');
    assert.strictEqual(res.status, 404);
  });
});
