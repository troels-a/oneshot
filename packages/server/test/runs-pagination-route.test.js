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

const TMP = path.join(os.tmpdir(), 'oneshot-runs-pagination-route-test');

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

  return { app, db };
}

function seed(db, count, agentName = 'a', status = 'completed') {
  const repo = createRepos(db).runs;
  for (let i = 1; i <= count; i++) {
    repo.insertRun({
      id: `${agentName}-${status}-${i}`, agentName, source: 'server', status,
      pid: i, startedAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
      completedAt: null, exitCode: 0, options: {}, cwd: '/tmp', logDir: '/tmp/x',
    });
  }
}

describe('GET /runs pagination', () => {
  before(() => { rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); });
  after(() => { rmSync(TMP, { recursive: true, force: true }); });

  it('defaults to 50 runs per page and reports the unpaged total', async () => {
    const { app, db } = makeContext('default');
    seed(db, 60);
    const res = await request(app).get('/runs').expect(200);
    assert.strictEqual(res.body.runs.length, 50);
    assert.strictEqual(res.body.total, 60);
    assert.strictEqual(res.body.limit, 50);
    assert.strictEqual(res.body.offset, 0);
    assert.strictEqual(res.body.runs[0].id, 'a-completed-60');
  });

  it('honours limit and offset', async () => {
    const { app, db } = makeContext('paged');
    seed(db, 5);
    const res = await request(app).get('/runs?limit=2&offset=2').expect(200);
    assert.deepStrictEqual(res.body.runs.map((r) => r.id), ['a-completed-3', 'a-completed-2']);
    assert.strictEqual(res.body.total, 5);
  });

  it('clamps out-of-range and non-numeric params', async () => {
    const { app, db } = makeContext('clamp');
    seed(db, 3);
    const big = await request(app).get('/runs?limit=9999').expect(200);
    assert.strictEqual(big.body.limit, 500);

    const junk = await request(app).get('/runs?limit=abc&offset=-4').expect(200);
    assert.strictEqual(junk.body.limit, 50);
    assert.strictEqual(junk.body.offset, 0);
  });

  it('counts only runs matching the status and agent filters', async () => {
    const { app, db } = makeContext('filters');
    seed(db, 4, 'a', 'completed');
    seed(db, 2, 'b', 'failed');

    const byStatus = await request(app).get('/runs?status=failed&limit=1').expect(200);
    assert.strictEqual(byStatus.body.total, 2);
    assert.strictEqual(byStatus.body.runs.length, 1);
    assert.strictEqual(byStatus.body.runs[0].status, 'failed');

    const byAgent = await request(app).get('/runs?agent=a').expect(200);
    assert.strictEqual(byAgent.body.total, 4);
    assert.ok(byAgent.body.runs.every((r) => r.agentName === 'a'));
  });
});
