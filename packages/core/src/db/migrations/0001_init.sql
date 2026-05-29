CREATE TABLE runs (
  id               TEXT PRIMARY KEY,
  agent_name       TEXT NOT NULL,
  runtime          TEXT,
  source           TEXT NOT NULL CHECK(source IN ('server','cli','spawn')),
  status           TEXT NOT NULL CHECK(status IN ('pending','running','completed','failed','timed_out')),
  pid              INTEGER,
  exit_code        INTEGER,
  signal           TEXT,
  started_at       TEXT NOT NULL,
  completed_at     TEXT,
  cwd              TEXT,
  log_dir          TEXT,
  worktree_json    TEXT,
  options_json     TEXT NOT NULL,
  result           TEXT,
  result_meta_json TEXT,
  spawned_by       TEXT,
  spawned_json     TEXT,
  FOREIGN KEY (spawned_by) REFERENCES runs(id) ON DELETE SET NULL
);
CREATE INDEX idx_runs_status        ON runs(status);
CREATE INDEX idx_runs_agent_started ON runs(agent_name, started_at DESC);
CREATE INDEX idx_runs_started       ON runs(started_at DESC);
CREATE INDEX idx_runs_spawned_by    ON runs(spawned_by);

CREATE TABLE schedules (
  id              TEXT PRIMARY KEY,
  agent           TEXT NOT NULL,
  name            TEXT,
  cron            TEXT NOT NULL,
  options_json    TEXT NOT NULL DEFAULT '{}',
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  last_run_at     TEXT,
  last_run_result TEXT CHECK(last_run_result IS NULL OR last_run_result IN ('dispatched','skipped','error')),
  next_run_at     TEXT
);
CREATE INDEX idx_schedules_agent ON schedules(agent);

CREATE TABLE log_lines (
  run_id      TEXT NOT NULL,
  stream      TEXT NOT NULL CHECK(stream IN ('stdout','stderr')),
  line_number INTEGER NOT NULL,
  written_at  TEXT NOT NULL,
  content     TEXT NOT NULL,
  PRIMARY KEY (run_id, stream, line_number),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
) WITHOUT ROWID;
