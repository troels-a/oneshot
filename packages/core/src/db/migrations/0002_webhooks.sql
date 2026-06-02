CREATE TABLE webhooks (
  id                TEXT PRIMARY KEY,
  agent             TEXT NOT NULL,
  name              TEXT,
  signing_secret    TEXT,
  static_args_json  TEXT NOT NULL DEFAULT '{}',
  enabled           INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL,
  last_triggered_at TEXT,
  last_run_id       TEXT
);
CREATE INDEX idx_webhooks_agent ON webhooks(agent);
