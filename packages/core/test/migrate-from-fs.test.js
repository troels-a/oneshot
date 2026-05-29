const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const { mkdirSync, rmSync, writeFileSync } = require('fs');
const { execFileSync } = require('child_process');
const { openDb, closeDb, createRepos } = require('../src/db');

const TMP = path.join(os.tmpdir(), 'oneshot-migrate-from-fs-test');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'migrate-from-fs.js');

function seedLegacy(dir) {
  mkdirSync(path.join(dir, 'logs'), { recursive: true });

  // Two schedules: one enabled, one disabled.
  writeFileSync(path.join(dir, 'schedules.json'), JSON.stringify({
    schedules: {
      'sched-a': {
        id: 'sched-a', agent: 'agent-x', cron: '*/5 * * * *',
        options: { path: 'foo' }, enabled: true,
        createdAt: '2026-05-29T09:00:00Z',
        lastRunAt: '2026-05-29T09:30:00Z', lastRunResult: 'dispatched',
        nextRunAt: '2026-05-29T09:35:00Z',
      },
      'sched-b': {
        id: 'sched-b', agent: 'agent-y', cron: '0 0 * * *',
        options: {}, enabled: false,
        createdAt: '2026-05-29T09:00:00Z',
      },
    },
  }, null, 2));

  // Valid run: run.json + stdout.log + stderr.log
  const runId = 'r-valid-1';
  const runDir = path.join(dir, 'logs', runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(path.join(runDir, 'run.json'), JSON.stringify({
    id: runId,
    agentName: 'agent-x',
    runtime: 'bash',
    source: 'server',
    status: 'completed',
    pid: 12345,
    startedAt: '2026-05-29T09:00:00Z',
    completedAt: '2026-05-29T09:00:01Z',
    exitCode: 0,
    options: { timeout: 60 },
    cwd: '/tmp',
    logDir: runDir,
    worktree: null,
    result: 'done',
    resultMeta: { cost: 0.1 },
  }, null, 2));
  writeFileSync(path.join(runDir, 'stdout.log'), 'line one\nline two\nline three\n');
  writeFileSync(path.join(runDir, 'stderr.log'), 'warning A\n');

  // Ghost dir: empty stdout/stderr, no run.json (matches the brief-process bug)
  const ghostDir = path.join(dir, 'logs', 'r-ghost-2');
  mkdirSync(ghostDir, { recursive: true });
  writeFileSync(path.join(ghostDir, 'stdout.log'), '');
  writeFileSync(path.join(ghostDir, 'stderr.log'), '');

  // Corrupt dir: malformed run.json
  const corruptDir = path.join(dir, 'logs', 'r-corrupt-3');
  mkdirSync(corruptDir, { recursive: true });
  writeFileSync(path.join(corruptDir, 'run.json'), '{ not valid json');
}

function runScript(dir, extraArgs = []) {
  return execFileSync(
    process.execPath,
    ['--no-warnings', SCRIPT, ...extraArgs],
    { env: { ...process.env, ONESHOT_DATA_DIR: dir }, encoding: 'utf8' },
  );
}

describe('migrate-from-fs', () => {
  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('backfills schedules, runs, and log lines from legacy files', () => {
    const dir = path.join(TMP, 'first-run');
    seedLegacy(dir);
    const out = runScript(dir);
    assert.match(out, /Schedules: 2 migrated/);
    assert.match(out, /Runs:\s+1 migrated/);
    assert.match(out, /4 inserted/); // 3 stdout + 1 stderr

    const db = openDb(dir);
    const { runs, schedules, logs } = createRepos(db);

    assert.strictEqual(schedules.listAllSchedules().length, 2);
    assert.strictEqual(schedules.getSchedule('sched-a').lastRunResult, 'dispatched');
    assert.strictEqual(schedules.getSchedule('sched-b').enabled, false);

    const run = runs.getRun('r-valid-1');
    assert.strictEqual(run.status, 'completed');
    assert.strictEqual(run.exitCode, 0);
    assert.deepStrictEqual(run.resultMeta, { cost: 0.1 });

    assert.deepStrictEqual(
      logs.getLogLines('r-valid-1', 'stdout', {}).lines,
      ['line one', 'line two', 'line three'],
    );
    assert.deepStrictEqual(
      logs.getLogLines('r-valid-1', 'stderr', {}).lines,
      ['warning A'],
    );
    closeDb(dir);
  });

  it('is idempotent on a second run', () => {
    const dir = path.join(TMP, 'idempotent');
    seedLegacy(dir);
    runScript(dir);
    const second = runScript(dir);
    assert.match(second, /Schedules: 0 migrated, 2 already present/);
    assert.match(second, /Runs:\s+0 migrated, 1 already present/);

    const db = openDb(dir);
    const { logs } = createRepos(db);
    assert.strictEqual(logs.getStreamCount('r-valid-1', 'stdout'), 3);
    assert.strictEqual(logs.getStreamCount('r-valid-1', 'stderr'), 1);
    closeDb(dir);
  });

  it('skips dirs with no run.json and corrupt run.json', () => {
    const dir = path.join(TMP, 'skips');
    seedLegacy(dir);
    const out = runScript(dir);
    assert.match(out, /2 skipped/); // ghost + corrupt
  });

  it('--auto exits silently when no legacy data exists', () => {
    const dir = path.join(TMP, 'clean');
    mkdirSync(dir, { recursive: true });
    const out = runScript(dir, ['--auto']);
    assert.strictEqual(out, '');
  });
});
