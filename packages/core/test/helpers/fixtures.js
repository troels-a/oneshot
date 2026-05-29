const { createRepos } = require('../../src/db');

function makeRun(overrides = {}) {
  return {
    id: overrides.id || 'r-' + Math.random().toString(36).slice(2, 10),
    agentName: 'my-agent',
    runtime: 'bash',
    source: 'server',
    status: 'running',
    pid: 1234,
    startedAt: '2026-05-29T10:00:00Z',
    options: { timeout: 60 },
    cwd: '/tmp',
    logDir: '/tmp/logs/x',
    worktree: null,
    ...overrides,
  };
}

function makeSchedule(overrides = {}) {
  return {
    id: overrides.id || 's-' + Math.random().toString(36).slice(2, 10),
    agent: 'my-agent',
    name: null,
    cron: '*/5 * * * *',
    options: {},
    enabled: true,
    createdAt: '2026-05-29T10:00:00Z',
    lastRunAt: null,
    lastRunResult: null,
    nextRunAt: null,
    ...overrides,
  };
}

function seedRun(db, overrides = {}) {
  const run = makeRun(overrides);
  createRepos(db).runs.insertRun(run);
  return run;
}

module.exports = { makeRun, makeSchedule, seedRun };
