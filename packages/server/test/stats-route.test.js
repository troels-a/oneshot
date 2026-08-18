const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const path = require('path');
const os = require('os');
const { mkdirSync, rmSync } = require('fs');
const statsRouter = require('../src/routes/stats');
const { openDb, RunManager } = require('@oneshot/core');
const { createRepos } = require('@oneshot/core/src/db');

const TMP = path.join(os.tmpdir(), 'oneshot-stats-route-test');

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
  app.use((req, res, next) => { req.runManager = manager; next(); });
  app.use(statsRouter);

  return { app, db };
}

function seed(db, status, count) {
  const repo = createRepos(db).runs;
  for (let i = 1; i <= count; i++) {
    repo.insertRun({
      id: `${status}-${i}`, agentName: 'a', source: 'server', status,
      pid: i, startedAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`, completedAt: null,
      exitCode: 0, options: {}, cwd: '/tmp', logDir: '/tmp/x',
    });
  }
}

describe('GET /stats', () => {
  before(() => { rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); });
  after(() => { rmSync(TMP, { recursive: true, force: true }); });

  it('returns zeroes for an empty database', async () => {
    const { app } = makeContext('empty');
    const res = await request(app).get('/stats').expect(200);
    assert.deepStrictEqual(res.body, {
      active: 0, total: 0, completed: 0, failed: 0, timedOut: 0, pending: 0, successRate: 0,
      byAgent: {},
    });
  });

  it('counts each status and computes the success rate', async () => {
    const { app, db } = makeContext('counts');
    seed(db, 'completed', 3);
    seed(db, 'failed', 1);
    const res = await request(app).get('/stats').expect(200);
    assert.strictEqual(res.body.completed, 3);
    assert.strictEqual(res.body.failed, 1);
    assert.strictEqual(res.body.timedOut, 0);
    assert.strictEqual(res.body.total, 4);
    assert.strictEqual(res.body.successRate, 75);
  });
  it('tallies runs per agent independently of any page of results', async () => {
    const { app, db } = makeContext('by-agent');
    const repo = createRepos(db).runs;
    for (let i = 1; i <= 30; i++) {
      repo.insertRun({
        id: `bulk-${i}`, agentName: 'busy', source: 'server', status: 'completed',
        pid: i, startedAt: `2026-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        completedAt: null, exitCode: 0, options: {}, cwd: '/tmp', logDir: '/tmp/x',
      });
    }
    repo.insertRun({
      id: 'live-1', agentName: 'quiet', source: 'server', status: 'running',
      pid: 99, startedAt: '2026-01-01T01:00:00Z', completedAt: null,
      exitCode: null, options: {}, cwd: '/tmp', logDir: '/tmp/x',
    });

    const res = await request(app).get('/stats').expect(200);
    assert.deepStrictEqual(res.body.byAgent, {
      busy: { total: 30, running: 0 },
      quiet: { total: 1, running: 1 },
    });
    assert.strictEqual(res.body.active, 1);
  });
});
