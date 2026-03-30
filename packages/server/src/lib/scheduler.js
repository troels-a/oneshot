const { randomUUID } = require('crypto');
const { readFileSync, writeFileSync } = require('fs');
const cron = require('node-cron');
const cronParser = require('cron-parser');
const parseCronExpression = (cronParser.CronExpressionParser || cronParser.default || cronParser).parse.bind(
  cronParser.CronExpressionParser || cronParser.default || cronParser
);

const MAX_SCHEDULES_PER_AGENT = 50;

class Scheduler {
  constructor({ runManager, schedulesFile, agentsDir }) {
    this.runManager = runManager;
    this.schedulesFile = schedulesFile;
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

  createSchedule(agent, { cron: cronExpr, options, enabled }) {
    const agentSchedules = this.listSchedules(agent);
    if (agentSchedules.length >= MAX_SCHEDULES_PER_AGENT) {
      throw new Error(`Maximum ${MAX_SCHEDULES_PER_AGENT} schedules per agent`);
    }

    const id = randomUUID();
    const isEnabled = enabled !== undefined ? enabled : true;
    const schedule = {
      id,
      agent,
      cron: cronExpr,
      options: options || {},
      enabled: isEnabled,
      createdAt: new Date().toISOString(),
      lastRunAt: null,
      lastRunResult: null,
      nextRunAt: isEnabled ? this._computeNextRun(cronExpr) : null,
    };

    this.schedules.set(id, schedule);
    if (isEnabled) this._startTask(schedule);
    this.saveToDisk();
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

    if (updates.cron !== undefined) schedule.cron = updates.cron;
    if (updates.options !== undefined) schedule.options = { ...schedule.options, ...updates.options };
    if (updates.enabled !== undefined) schedule.enabled = updates.enabled;

    if (updates.cron !== undefined || updates.enabled !== undefined) {
      this._stopTask(id);
      if (schedule.enabled) {
        schedule.nextRunAt = this._computeNextRun(schedule.cron);
        this._startTask(schedule);
      } else {
        schedule.nextRunAt = null;
      }
    }

    this.saveToDisk();
    return schedule;
  }

  deleteSchedule(id) {
    this._stopTask(id);
    const deleted = this.schedules.delete(id);
    if (deleted) this.saveToDisk();
    return deleted;
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
    const running = this.runManager.getRunningRun(schedule.agent);

    schedule.lastRunAt = new Date().toISOString();
    schedule.nextRunAt = this._computeNextRun(schedule.cron);

    if (running) {
      schedule.lastRunResult = 'skipped';
    } else {
      try {
        await this.runManager.dispatchRun(schedule.agent, schedule.options);
        schedule.lastRunResult = 'dispatched';
      } catch (err) {
        console.error(`Schedule ${schedule.id} dispatch error:`, err.message);
        schedule.lastRunResult = 'error';
      }
    }

    this.saveToDisk();
  }

  saveToDisk() {
    const data = {};
    for (const [id, schedule] of this.schedules) {
      data[id] = schedule;
    }
    writeFileSync(this.schedulesFile, JSON.stringify({ schedules: data }, null, 2));
  }

  loadFromDisk() {
    let raw;
    try {
      raw = JSON.parse(readFileSync(this.schedulesFile, 'utf8'));
    } catch {
      return;
    }

    if (!raw.schedules || typeof raw.schedules !== 'object') return;

    for (const [id, schedule] of Object.entries(raw.schedules)) {
      if (!schedule.cron || !cron.validate(schedule.cron)) {
        console.warn(`Skipping invalid schedule ${id}: bad cron expression`);
        continue;
      }
      this.schedules.set(id, schedule);
      if (schedule.enabled) {
        schedule.nextRunAt = this._computeNextRun(schedule.cron);
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
