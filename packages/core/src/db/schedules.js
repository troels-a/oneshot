const SCHEDULE_COLUMNS = [
  'id', 'agent', 'name', 'cron', 'options_json', 'enabled',
  'created_at', 'last_run_at', 'last_run_result', 'next_run_at',
];

const SELECT_SCHEDULE = `SELECT ${SCHEDULE_COLUMNS.join(', ')} FROM schedules`;

function rowToSchedule(row) {
  if (!row) return null;
  return {
    id: row.id,
    agent: row.agent,
    name: row.name ?? null,
    cron: row.cron,
    options: row.options_json ? JSON.parse(row.options_json) : {},
    enabled: !!row.enabled,
    createdAt: row.created_at,
    lastRunAt: row.last_run_at ?? null,
    lastRunResult: row.last_run_result ?? null,
    nextRunAt: row.next_run_at ?? null,
  };
}

const UPDATABLE_FIELDS = {
  name: 'name',
  cron: 'cron',
  options: 'options_json',
  enabled: 'enabled',
  lastRunAt: 'last_run_at',
  lastRunResult: 'last_run_result',
  nextRunAt: 'next_run_at',
};

function serializeFieldValue(field, value) {
  if (field === 'options') return JSON.stringify(value ?? {});
  if (field === 'enabled') return value ? 1 : 0;
  return value ?? null;
}

function createSchedulesRepo(db) {
  const insertStmt = db.prepare(`INSERT INTO schedules (
    id, agent, name, cron, options_json, enabled,
    created_at, last_run_at, last_run_result, next_run_at
  ) VALUES (
    :id, :agent, :name, :cron, :options_json, :enabled,
    :created_at, :last_run_at, :last_run_result, :next_run_at
  )`);

  const insertIgnoreStmt = db.prepare(`INSERT OR IGNORE INTO schedules (
    id, agent, name, cron, options_json, enabled,
    created_at, last_run_at, last_run_result, next_run_at
  ) VALUES (
    :id, :agent, :name, :cron, :options_json, :enabled,
    :created_at, :last_run_at, :last_run_result, :next_run_at
  )`);

  const deleteStmt = db.prepare(`DELETE FROM schedules WHERE id = ?`);
  const getByIdStmt = db.prepare(`${SELECT_SCHEDULE} WHERE id = ?`);
  const listByAgentStmt = db.prepare(`${SELECT_SCHEDULE} WHERE agent = ? ORDER BY created_at ASC`);
  const listAllStmt = db.prepare(`${SELECT_SCHEDULE} ORDER BY created_at ASC`);

  function scheduleToParams(schedule) {
    return {
      id: schedule.id,
      agent: schedule.agent,
      name: schedule.name ?? null,
      cron: schedule.cron,
      options_json: JSON.stringify(schedule.options ?? {}),
      enabled: schedule.enabled ? 1 : 0,
      created_at: schedule.createdAt,
      last_run_at: schedule.lastRunAt ?? null,
      last_run_result: schedule.lastRunResult ?? null,
      next_run_at: schedule.nextRunAt ?? null,
    };
  }

  return {
    insertSchedule(schedule) {
      insertStmt.run(scheduleToParams(schedule));
    },

    insertScheduleOrIgnore(schedule) {
      const info = insertIgnoreStmt.run(scheduleToParams(schedule));
      return info.changes > 0;
    },

    updateSchedule(id, fields) {
      const sets = [];
      const values = [];
      for (const [key, value] of Object.entries(fields)) {
        const column = UPDATABLE_FIELDS[key];
        if (!column) continue;
        sets.push(`${column} = ?`);
        values.push(serializeFieldValue(key, value));
      }
      if (!sets.length) return;
      values.push(id);
      db.prepare(`UPDATE schedules SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    },

    deleteSchedule(id) {
      const info = deleteStmt.run(id);
      return info.changes > 0;
    },

    getSchedule(id) {
      return rowToSchedule(getByIdStmt.get(id));
    },

    listSchedules(agent) {
      const rows = agent ? listByAgentStmt.all(agent) : listAllStmt.all();
      return rows.map(rowToSchedule);
    },

    listAllSchedules() {
      return listAllStmt.all().map(rowToSchedule);
    },
  };
}

module.exports = { createSchedulesRepo, rowToSchedule };
