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
  function seedThree() {
    runs.insertRun(makeRun({ id: 'r1', agentName: 'a', status: 'completed', startedAt: '2026-01-01T00:00:01Z' }));
    runs.insertRun(makeRun({ id: 'r2', agentName: 'b', status: 'failed', startedAt: '2026-01-01T00:00:02Z' }));
    runs.insertRun(makeRun({ id: 'r3', agentName: 'a', status: 'completed', startedAt: '2026-01-01T00:00:03Z' }));
  }

  it('lists all runs when no limit is given', () => {
    seedThree();
    assert.deepStrictEqual(runs.listRuns({}).map((r) => r.id), ['r3', 'r2', 'r1']);
    closeDb(dir);
  });

  it('applies limit and offset in started_at DESC order', () => {
    seedThree();
    assert.deepStrictEqual(runs.listRuns({ limit: 2 }).map((r) => r.id), ['r3', 'r2']);
    assert.deepStrictEqual(runs.listRuns({ limit: 2, offset: 2 }).map((r) => r.id), ['r1']);
    assert.deepStrictEqual(runs.listRuns({ limit: 2, offset: 99 }).map((r) => r.id), []);
    closeDb(dir);
  });

  it('applies limit and offset alongside status and agent filters', () => {
    seedThree();
    assert.deepStrictEqual(runs.listRuns({ status: 'completed', limit: 1 }).map((r) => r.id), ['r3']);
    assert.deepStrictEqual(runs.listRuns({ agent: 'a', limit: 1, offset: 1 }).map((r) => r.id), ['r1']);
    assert.deepStrictEqual(
      runs.listRuns({ status: 'completed', agent: 'a', limit: 1 }).map((r) => r.id),
      ['r3'],
    );
    closeDb(dir);
  });

  it('counts runs honouring the same filters', () => {
    seedThree();
    assert.strictEqual(runs.countRuns({}), 3);
    assert.strictEqual(runs.countRuns({ status: 'completed' }), 2);
    assert.strictEqual(runs.countRuns({ agent: 'a' }), 2);
    assert.strictEqual(runs.countRuns({ status: 'failed', agent: 'a' }), 0);
    closeDb(dir);
  });

  it('counts runs grouped by status', () => {
    seedThree();
    assert.deepStrictEqual(runs.countRunsByStatus(), { completed: 2, failed: 1 });
    closeDb(dir);
  });
});
