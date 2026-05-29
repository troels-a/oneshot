const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const { mkdirSync, rmSync } = require('fs');
const { openDb, closeDb } = require('../../src/db');
const { createSchedulesRepo } = require('../../src/db/schedules');
const { makeSchedule } = require('../helpers/fixtures');

const TMP = path.join(os.tmpdir(), 'oneshot-schedules-repo-test');

describe('schedules repo', () => {
  let dir;
  let db;
  let schedules;

  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  beforeEach(() => {
    dir = path.join(TMP, 's-' + Math.random().toString(36).slice(2, 8));
    db = openDb(dir);
    schedules = createSchedulesRepo(db);
  });

  it('round-trips with options + enabled booleans', () => {
    const s = makeSchedule({ options: { path: 'foo', branch: 'main' }, enabled: false });
    schedules.insertSchedule(s);
    const got = schedules.getSchedule(s.id);
    assert.strictEqual(got.enabled, false);
    assert.deepStrictEqual(got.options, { path: 'foo', branch: 'main' });
    closeDb(dir);
  });

  it('updates only the fields passed in', () => {
    const s = makeSchedule();
    schedules.insertSchedule(s);
    schedules.updateSchedule(s.id, { lastRunAt: '2026-05-29T10:01:00Z', lastRunResult: 'dispatched' });
    const got = schedules.getSchedule(s.id);
    assert.strictEqual(got.lastRunResult, 'dispatched');
    assert.strictEqual(got.lastRunAt, '2026-05-29T10:01:00Z');
    assert.strictEqual(got.cron, s.cron); // unchanged
    closeDb(dir);
  });

  it('lists by agent and globally', () => {
    schedules.insertSchedule(makeSchedule({ id: 's1', agent: 'a' }));
    schedules.insertSchedule(makeSchedule({ id: 's2', agent: 'b' }));
    schedules.insertSchedule(makeSchedule({ id: 's3', agent: 'a' }));
    assert.deepStrictEqual(schedules.listSchedules('a').map((s) => s.id).sort(), ['s1', 's3']);
    assert.deepStrictEqual(schedules.listAllSchedules().map((s) => s.id).sort(), ['s1', 's2', 's3']);
    closeDb(dir);
  });

  it('delete reports whether anything was removed', () => {
    const s = makeSchedule();
    schedules.insertSchedule(s);
    assert.strictEqual(schedules.deleteSchedule(s.id), true);
    assert.strictEqual(schedules.deleteSchedule(s.id), false);
    closeDb(dir);
  });

  it('insertScheduleOrIgnore is idempotent', () => {
    const s = makeSchedule();
    assert.strictEqual(schedules.insertScheduleOrIgnore(s), true);
    assert.strictEqual(schedules.insertScheduleOrIgnore(s), false);
    closeDb(dir);
  });
});
