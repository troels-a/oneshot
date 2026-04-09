const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const { mkdirSync, rmSync, writeFileSync } = require('fs');
const Scheduler = require('../src/scheduler');

const TMP = path.join(require('fs').realpathSync(os.tmpdir()), 'oneshot-scheduler-test');

function writeAgent(agentsDir, name, content) {
  const dir = path.join(agentsDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'agent.md'), content);
}

function makeScheduler(suffix, managerOverrides = {}) {
  const root = path.join(TMP, suffix);
  const agentsDir = path.join(root, 'agents');
  mkdirSync(agentsDir, { recursive: true });

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

  const schedulesFile = path.join(root, 'schedules.json');
  writeFileSync(schedulesFile, JSON.stringify({ schedules: {} }));

  const scheduler = new Scheduler({ runManager, schedulesFile, agentsDir });
  return { scheduler, runManager, agentsDir };
}

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
