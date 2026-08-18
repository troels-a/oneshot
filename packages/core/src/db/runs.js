const RUN_COLUMNS = [
  'id', 'agent_name', 'runtime', 'source', 'status',
  'pid', 'exit_code', 'signal',
  'started_at', 'completed_at',
  'cwd', 'log_dir',
  'worktree_json', 'options_json',
  'result', 'result_meta_json',
  'spawned_by', 'spawned_json',
];

const SELECT_RUN = `SELECT ${RUN_COLUMNS.join(', ')} FROM runs`;

function rowToRun(row) {
  if (!row) return null;
  const run = {
    id: row.id,
    agentName: row.agent_name,
    runtime: row.runtime ?? null,
    source: row.source,
    status: row.status,
    pid: row.pid ?? null,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? null,
    exitCode: row.exit_code ?? null,
    signal: row.signal ?? null,
    options: row.options_json ? JSON.parse(row.options_json) : {},
    cwd: row.cwd ?? null,
    logDir: row.log_dir ?? null,
    worktree: row.worktree_json ? JSON.parse(row.worktree_json) : null,
    result: row.result ?? null,
    resultMeta: row.result_meta_json ? JSON.parse(row.result_meta_json) : null,
    spawnedBy: row.spawned_by ?? null,
  };
  if (row.spawned_json) run.spawned = JSON.parse(row.spawned_json);
  return run;
}

function runToInsertParams(run) {
  return {
    id: run.id,
    agent_name: run.agentName,
    runtime: run.runtime ?? null,
    source: run.source,
    status: run.status,
    pid: run.pid ?? null,
    exit_code: run.exitCode ?? null,
    signal: run.signal ?? null,
    started_at: run.startedAt,
    completed_at: run.completedAt ?? null,
    cwd: run.cwd ?? null,
    log_dir: run.logDir ?? null,
    worktree_json: run.worktree ? JSON.stringify(run.worktree) : null,
    options_json: JSON.stringify(run.options ?? {}),
    result: run.result ?? null,
    result_meta_json: run.resultMeta ? JSON.stringify(run.resultMeta) : null,
    spawned_by: run.spawnedBy ?? null,
    spawned_json: run.spawned ? JSON.stringify(run.spawned) : null,
  };
}

function createRunsRepo(db) {
  const insertStmt = db.prepare(`INSERT INTO runs (
    id, agent_name, runtime, source, status,
    pid, exit_code, signal,
    started_at, completed_at,
    cwd, log_dir,
    worktree_json, options_json,
    result, result_meta_json,
    spawned_by, spawned_json
  ) VALUES (
    :id, :agent_name, :runtime, :source, :status,
    :pid, :exit_code, :signal,
    :started_at, :completed_at,
    :cwd, :log_dir,
    :worktree_json, :options_json,
    :result, :result_meta_json,
    :spawned_by, :spawned_json
  )`);

  const insertIgnoreStmt = db.prepare(`INSERT OR IGNORE INTO runs (
    id, agent_name, runtime, source, status,
    pid, exit_code, signal,
    started_at, completed_at,
    cwd, log_dir,
    worktree_json, options_json,
    result, result_meta_json,
    spawned_by, spawned_json
  ) VALUES (
    :id, :agent_name, :runtime, :source, :status,
    :pid, :exit_code, :signal,
    :started_at, :completed_at,
    :cwd, :log_dir,
    :worktree_json, :options_json,
    :result, :result_meta_json,
    :spawned_by, :spawned_json
  )`);

  const updateStatusStmt = db.prepare(`UPDATE runs
    SET status = ?, pid = ?, completed_at = ?, exit_code = ?, signal = ?
    WHERE id = ?`);

  const updateResultStmt = db.prepare(`UPDATE runs
    SET result = ?, result_meta_json = ?
    WHERE id = ?`);

  const updateSpawnedByStmt = db.prepare(`UPDATE runs SET spawned_by = ? WHERE id = ?`);
  const updateSpawnedStmt = db.prepare(`UPDATE runs SET spawned_json = ? WHERE id = ?`);

  const getByIdStmt = db.prepare(`${SELECT_RUN} WHERE id = ?`);
  const getRunningByAgentStmt = db.prepare(`${SELECT_RUN} WHERE agent_name = ? AND status = 'running' LIMIT 1`);
  const listRunningStmt = db.prepare(`${SELECT_RUN} WHERE status = 'running'`);

  const PAGE = 'ORDER BY started_at DESC LIMIT ? OFFSET ?';
  const listAllStmt = db.prepare(`${SELECT_RUN} ${PAGE}`);
  const listByStatusStmt = db.prepare(`${SELECT_RUN} WHERE status = ? ${PAGE}`);
  const listByAgentStmt = db.prepare(`${SELECT_RUN} WHERE agent_name = ? ${PAGE}`);
  const listByStatusAgentStmt = db.prepare(`${SELECT_RUN} WHERE status = ? AND agent_name = ? ${PAGE}`);

  const countAllStmt = db.prepare('SELECT COUNT(*) AS c FROM runs');
  const countByStatusStmt = db.prepare('SELECT COUNT(*) AS c FROM runs WHERE status = ?');
  const countByAgentStmt = db.prepare('SELECT COUNT(*) AS c FROM runs WHERE agent_name = ?');
  const countByStatusAgentStmt = db.prepare('SELECT COUNT(*) AS c FROM runs WHERE status = ? AND agent_name = ?');
  const countGroupedStmt = db.prepare('SELECT status, COUNT(*) AS c FROM runs GROUP BY status');

  const deleteCompletedStmt = db.prepare(`DELETE FROM runs WHERE status NOT IN ('running','pending')`);
  const listCompletedIdsLogDirsStmt = db.prepare(`SELECT id, log_dir FROM runs WHERE status NOT IN ('running','pending')`);
  const deleteOlderThanStmt = db.prepare(`DELETE FROM runs WHERE status NOT IN ('running','pending') AND started_at < ?`);
  const listOldIdsLogDirsStmt = db.prepare(`SELECT id, log_dir FROM runs WHERE status NOT IN ('running','pending') AND started_at < ?`);

  return {
    insertRun(run) {
      insertStmt.run(runToInsertParams(run));
    },

    insertRunOrIgnore(run) {
      const info = insertIgnoreStmt.run(runToInsertParams(run));
      return info.changes > 0;
    },

    updateRunStatus(id, fields) {
      updateStatusStmt.run(
        fields.status,
        fields.pid ?? null,
        fields.completedAt ?? null,
        fields.exitCode ?? null,
        fields.signal ?? null,
        id,
      );
    },

    updateRunResult(id, result, meta) {
      updateResultStmt.run(
        result ?? null,
        meta ? JSON.stringify(meta) : null,
        id,
      );
    },

    setSpawnedBy(id, parentId) {
      updateSpawnedByStmt.run(parentId, id);
    },

    setSpawned(id, names) {
      updateSpawnedStmt.run(JSON.stringify(names), id);
    },

    getRun(id) {
      return rowToRun(getByIdStmt.get(id));
    },

    getRunningRunByAgent(agent) {
      return rowToRun(getRunningByAgentStmt.get(agent));
    },

    listRunningRuns() {
      return listRunningStmt.all().map(rowToRun);
    },

    listRuns({ status, agent, limit, offset } = {}) {
      // SQLite reads a negative LIMIT as "no limit", so the same prepared
      // statement serves both the paged and unpaged callers.
      const lim = Number.isInteger(limit) && limit >= 0 ? limit : -1;
      const off = Number.isInteger(offset) && offset > 0 ? offset : 0;

      let rows;
      if (status && agent) rows = listByStatusAgentStmt.all(status, agent, lim, off);
      else if (status) rows = listByStatusStmt.all(status, lim, off);
      else if (agent) rows = listByAgentStmt.all(agent, lim, off);
      else rows = listAllStmt.all(lim, off);
      return rows.map(rowToRun);
    },

    countRuns({ status, agent } = {}) {
      if (status && agent) return countByStatusAgentStmt.get(status, agent).c;
      if (status) return countByStatusStmt.get(status).c;
      if (agent) return countByAgentStmt.get(agent).c;
      return countAllStmt.get().c;
    },

    countRunsByStatus() {
      const counts = {};
      for (const row of countGroupedStmt.all()) counts[row.status] = row.c;
      return counts;
    },

    deleteCompletedRuns() {
      const dirs = listCompletedIdsLogDirsStmt.all();
      const info = deleteCompletedStmt.run();
      return { deleted: info.changes, logDirs: dirs.map((r) => r.log_dir).filter(Boolean) };
    },

    deleteRunsOlderThan(isoCutoff) {
      const dirs = listOldIdsLogDirsStmt.all(isoCutoff);
      const info = deleteOlderThanStmt.run(isoCutoff);
      return { deleted: info.changes, logDirs: dirs.map((r) => r.log_dir).filter(Boolean) };
    },
  };
}

module.exports = { createRunsRepo, rowToRun };
