const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const { mkdirSync, rmSync, writeFileSync } = require('fs');
const Scheduler = require('../src/scheduler');
const { openDb } = require('../src/db');

const TMP = path.join(require('fs').realpathSync(os.tmpdir()), 'oneshot-scheduler-test');

function writeAgent(agentsDir, name, content) {
  const dir = path.join(agentsDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'agent.md'), content);
}

function makeScheduler(suffix, managerOverrides = {}) {
  const root = path.join(TMP, suffix);
  const agentsDir = path.join(root, 'agents');
  const dataDir = path.join(root, 'data');
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });

  const runManager = {
    dispatched: [],
    _runningRun: null,
    getRunningRun() { return this._runningRun; },
    async dispatchRun(agent, options) {
      this.dispatched.push({ agent, options });
      return { run: { id: 'fake-run', status: 'pending' } };
    },
    ...managerOverrides,
  };

  const db = openDb(dataDir);
  const scheduler = new Scheduler({ db, runManager, agentsDir });
  return { scheduler, runManager, agentsDir, db };
}

describe('Scheduler db persistence', () => {
  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('persists createSchedule to DB without rewriting the whole table', () => {
    const { scheduler, db } = makeScheduler('db-create');
    const s = scheduler.createSchedule('my-agent', { cron: '* * * * *', options: { path: 'foo' } });
    scheduler._stopTask(s.id);

    const { createRepos } = require('../src/db');
    const repo = createRepos(db).schedules;
    const row = repo.getSchedule(s.id);
    assert.strictEqual(row.cron, '* * * * *');
    assert.deepStrictEqual(row.options, { path: 'foo' });
    assert.strictEqual(row.enabled, true);
  });

  it('loadFromDb populates the in-memory cache', () => {
    const { scheduler, db } = makeScheduler('db-load');
    const { createRepos } = require('../src/db');
    const repo = createRepos(db).schedules;
    repo.insertSchedule({
      id: 'pre-existing',
      agent: 'my-agent',
      name: 'nightly',
      cron: '0 0 * * *',
      options: {},
      enabled: false,
      createdAt: '2026-05-29T00:00:00Z',
      lastRunAt: null,
      lastRunResult: null,
      nextRunAt: null,
    });
    scheduler.loadFromDb();
    const loaded = scheduler.getSchedule('pre-existing');
    assert.strictEqual(loaded.agent, 'my-agent');
    assert.strictEqual(loaded.enabled, false);
  });
});

describe('Scheduler multi_instance', () => {
  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('skips dispatch when agent is running and multi_instance is false', async () => {
    const { scheduler, runManager, agentsDir } = makeScheduler('skip-single');
    writeAgent(agentsDir, 'single', '---\nruntime: bash\n---\nbody');
    runManager._runningRun = { id: 'existing-run' };

    const schedule = scheduler.createSchedule('single', { cron: '* * * * *' });
    scheduler._stopTask(schedule.id);

    await scheduler._onTick(schedule);

    assert.strictEqual(runManager.dispatched.length, 0);
    assert.strictEqual(schedule.lastRunResult, 'skipped');
  });

  it('allows overlapping dispatch when multi_instance is true', async () => {
    const { scheduler, runManager, agentsDir } = makeScheduler('allow-multi');
    writeAgent(agentsDir, 'multi', '---\nruntime: bash\nmulti_instance: true\n---\nbody');
    runManager._runningRun = { id: 'existing-run' };

    const schedule = scheduler.createSchedule('multi', { cron: '* * * * *' });
    scheduler._stopTask(schedule.id);

    await scheduler._onTick(schedule);

    assert.strictEqual(runManager.dispatched.length, 1);
    assert.strictEqual(schedule.lastRunResult, 'dispatched');
  });

  it('falls back to single-instance when agent.md is missing', async () => {
    const { scheduler, runManager } = makeScheduler('missing-agent');
    runManager._runningRun = { id: 'existing-run' };

    const schedule = scheduler.createSchedule('nonexistent', { cron: '* * * * *' });
    scheduler._stopTask(schedule.id);

    await scheduler._onTick(schedule);

    assert.strictEqual(runManager.dispatched.length, 0);
    assert.strictEqual(schedule.lastRunResult, 'skipped');
  });
});

describe('Scheduler run provenance', () => {
  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('tags dispatched runs with source "schedule"', async () => {
    const { scheduler, runManager, agentsDir } = makeScheduler('source-tag');
    writeAgent(agentsDir, 'tagged', '---\nruntime: bash\n---\nbody');

    const schedule = scheduler.createSchedule('tagged', { cron: '* * * * *' });
    scheduler._stopTask(schedule.id);

    await scheduler._onTick(schedule);

    assert.strictEqual(runManager.dispatched.length, 1);
    assert.strictEqual(runManager.dispatched[0].options.source, 'schedule');
  });

  it('does not let a stored schedule option override the source', async () => {
    const { scheduler, runManager, agentsDir } = makeScheduler('source-override');
    writeAgent(agentsDir, 'spoof', '---\nruntime: bash\n---\nbody');

    const schedule = scheduler.createSchedule('spoof', {
      cron: '* * * * *',
      options: { source: 'cli' },
    });
    scheduler._stopTask(schedule.id);

    await scheduler._onTick(schedule);

    assert.strictEqual(runManager.dispatched[0].options.source, 'schedule');
  });
});
