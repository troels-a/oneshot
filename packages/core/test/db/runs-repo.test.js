const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const { mkdirSync, rmSync } = require('fs');
const { openDb, closeDb } = require('../../src/db');
const { createRunsRepo } = require('../../src/db/runs');
const { createLogsRepo } = require('../../src/db/logs');
const { makeRun } = require('../helpers/fixtures');

const TMP = path.join(os.tmpdir(), 'oneshot-runs-repo-test');

describe('runs repo', () => {
  let dir;
  let db;
  let runs;

  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  beforeEach(() => {
    dir = path.join(TMP, 'r-' + Math.random().toString(36).slice(2, 8));
    db = openDb(dir);
    runs = createRunsRepo(db);
  });

  it('round-trips a run with JSON fields', () => {
    const run = makeRun({
      worktree: { dir: '/wt/abc', branch: 'feature/x' },
      options: { args: { task: 'go' }, branch: 'feature/x', timeout: 600 },
    });
    runs.insertRun(run);
    const got = runs.getRun(run.id);
    assert.strictEqual(got.id, run.id);
    assert.deepStrictEqual(got.options, run.options);
    assert.deepStrictEqual(got.worktree, run.worktree);
    assert.strictEqual(got.exitCode, null);
    closeDb(dir);
  });

  it('updates status and result independently', () => {
    const run = makeRun();
    runs.insertRun(run);
    runs.updateRunStatus(run.id, { status: 'completed', completedAt: '2026-05-29T10:01:00Z', exitCode: 0, pid: run.pid });
    runs.updateRunResult(run.id, 'all done', { cost: 0.5, duration_ms: 30 });
    const got = runs.getRun(run.id);
    assert.strictEqual(got.status, 'completed');
    assert.strictEqual(got.exitCode, 0);
    assert.strictEqual(got.result, 'all done');
    assert.deepStrictEqual(got.resultMeta, { cost: 0.5, duration_ms: 30 });
    closeDb(dir);
  });

  it('filters by status and agent', () => {
    runs.insertRun(makeRun({ id: 'a-running', agentName: 'a', status: 'running' }));
    runs.insertRun(makeRun({ id: 'a-done', agentName: 'a', status: 'completed' }));
    runs.insertRun(makeRun({ id: 'b-running', agentName: 'b', status: 'running' }));
    assert.deepStrictEqual(runs.listRuns({ status: 'running' }).map((r) => r.id).sort(), ['a-running', 'b-running']);
    assert.deepStrictEqual(runs.listRuns({ agent: 'a' }).map((r) => r.id).sort(), ['a-done', 'a-running']);
    assert.deepStrictEqual(runs.listRuns({ status: 'completed', agent: 'a' }).map((r) => r.id), ['a-done']);
    assert.strictEqual(runs.getRunningRunByAgent('b').id, 'b-running');
    closeDb(dir);
  });

  it('cascades log_lines on run delete', () => {
    const logs = createLogsRepo(db);
    const run = makeRun({ status: 'completed' });
    runs.insertRun(run);
    logs.appendLogLines(run.id, 'stdout', ['hi', 'there'], 0);
    assert.strictEqual(logs.getStreamCount(run.id, 'stdout'), 2);
    const { deleted } = runs.deleteCompletedRuns();
    assert.strictEqual(deleted, 1);
    assert.strictEqual(logs.getStreamCount(run.id, 'stdout'), 0);
    closeDb(dir);
  });

  it('insertRunOrIgnore is idempotent and reports inserted=false on repeat', () => {
    const run = makeRun();
    assert.strictEqual(runs.insertRunOrIgnore(run), true);
    assert.strictEqual(runs.insertRunOrIgnore(run), false);
    closeDb(dir);
  });
});
