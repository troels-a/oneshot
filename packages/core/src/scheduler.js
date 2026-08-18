const { randomUUID } = require('crypto');
const path = require('path');
const cron = require('node-cron');
const parseAgentMd = require('./parse-agent-md');
const cronParser = require('cron-parser');
const { createSchedulesRepo } = require('./db/schedules');
const { SCHEDULE_RESULT } = require('./constants');

const parseCronExpression = (cronParser.CronExpressionParser || cronParser.default || cronParser).parse.bind(
  cronParser.CronExpressionParser || cronParser.default || cronParser
);

const MAX_SCHEDULES_PER_AGENT = 50;

class Scheduler {
  constructor({ db, runManager, agentsDir }) {
    if (!db) throw new Error('Scheduler requires a db connection');
    this.db = db;
    this.repo = createSchedulesRepo(db);
    this.runManager = runManager;
    this.agentsDir = agentsDir;
    this.schedules = new Map();
    this.tasks = new Map();
  }

  _computeNextRun(cronExpr) {
    try {
      return parseCronExpression(cronExpr).next().toISOString();
    } catch {
      return null;
    }
  }

  createSchedule(agent, { cron: cronExpr, options, enabled, name }) {
    const agentSchedules = this.listSchedules(agent);
    if (agentSchedules.length >= MAX_SCHEDULES_PER_AGENT) {
      throw new Error(`Maximum ${MAX_SCHEDULES_PER_AGENT} schedules per agent`);
    }

    const id = randomUUID();
    const isEnabled = enabled !== undefined ? enabled : true;
    const schedule = {
      id,
      agent,
      name: name || null,
      cron: cronExpr,
      options: options || {},
      enabled: isEnabled,
      createdAt: new Date().toISOString(),
      lastRunAt: null,
      lastRunResult: null,
      nextRunAt: isEnabled ? this._computeNextRun(cronExpr) : null,
    };

    this.repo.insertSchedule(schedule);
    this.schedules.set(id, schedule);
    if (isEnabled) this._startTask(schedule);
    return schedule;
  }

  getSchedule(id) {
    return this.schedules.get(id);
  }

  listSchedules(agent) {
    return Array.from(this.schedules.values()).filter(s => s.agent === agent);
  }

  updateSchedule(id, updates) {
    const schedule = this.schedules.get(id);
    if (!schedule) return undefined;

    const dbUpdates = {};
    if (updates.cron !== undefined) {
      schedule.cron = updates.cron;
      dbUpdates.cron = updates.cron;
    }
    if (updates.options !== undefined) {
      schedule.options = { ...schedule.options, ...updates.options };
      dbUpdates.options = schedule.options;
    }
    if (updates.enabled !== undefined) {
      schedule.enabled = updates.enabled;
      dbUpdates.enabled = updates.enabled;
    }
    if (updates.name !== undefined) {
      schedule.name = updates.name || null;
      dbUpdates.name = schedule.name;
    }

    if (updates.cron !== undefined || updates.enabled !== undefined) {
      this._stopTask(id);
      if (schedule.enabled) {
        schedule.nextRunAt = this._computeNextRun(schedule.cron);
        this._startTask(schedule);
      } else {
        schedule.nextRunAt = null;
      }
      dbUpdates.nextRunAt = schedule.nextRunAt;
    }

    this.repo.updateSchedule(id, dbUpdates);
    return schedule;
  }

  deleteSchedule(id) {
    this._stopTask(id);
    const removed = this.schedules.delete(id);
    if (removed) this.repo.deleteSchedule(id);
    return removed;
  }

  _startTask(schedule) {
    const task = cron.schedule(schedule.cron, async () => {
      await this._onTick(schedule);
    });
    this.tasks.set(schedule.id, task);
  }

  _stopTask(id) {
    const task = this.tasks.get(id);
    if (task) {
      task.stop();
      this.tasks.delete(id);
    }
  }

  async _onTick(schedule) {
    const agentMdPath = path.join(this.agentsDir, schedule.agent, 'agent.md');
    let config;
    try {
      config = parseAgentMd(agentMdPath);
    } catch {
      config = {};
    }

    schedule.lastRunAt = new Date().toISOString();
    schedule.nextRunAt = this._computeNextRun(schedule.cron);

    const persistTickFields = () => {
      this.repo.updateSchedule(schedule.id, {
        lastRunAt: schedule.lastRunAt,
        lastRunResult: schedule.lastRunResult,
        nextRunAt: schedule.nextRunAt,
      });
    };

    if (!config.multi_instance) {
      const running = this.runManager.getRunningRun(schedule.agent);
      if (running) {
        schedule.lastRunResult = SCHEDULE_RESULT.SKIPPED;
        persistTickFields();
        return;
      }
    }

    try {
      // Tag provenance so a scheduled run is distinguishable from a manual
      // API dispatch in the UI. Set last so a stored option cannot override it.
      await this.runManager.dispatchRun(schedule.agent, { ...schedule.options, source: 'schedule' });
      schedule.lastRunResult = SCHEDULE_RESULT.DISPATCHED;
    } catch (err) {
      console.error(`Schedule ${schedule.id} dispatch error:`, err.message);
      schedule.lastRunResult = SCHEDULE_RESULT.ERROR;
    }

    persistTickFields();
  }

  loadFromDb() {
    for (const schedule of this.repo.listAllSchedules()) {
      if (!schedule.cron || !cron.validate(schedule.cron)) {
        console.warn(`Skipping invalid schedule ${schedule.id}: bad cron expression`);
        continue;
      }
      this.schedules.set(schedule.id, schedule);
      if (schedule.enabled) {
        schedule.nextRunAt = this._computeNextRun(schedule.cron);
        this.repo.updateSchedule(schedule.id, { nextRunAt: schedule.nextRunAt });
        this._startTask(schedule);
      }
    }
  }

  stopAll() {
    for (const [, task] of this.tasks) {
      task.stop();
    }
    this.tasks.clear();
  }
}

module.exports = Scheduler;
