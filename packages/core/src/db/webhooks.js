const WEBHOOK_COLUMNS = [
  'id', 'agent', 'name', 'signing_secret', 'static_args_json', 'enabled',
  'created_at', 'last_triggered_at', 'last_run_id',
];

const SELECT_WEBHOOK = `SELECT ${WEBHOOK_COLUMNS.join(', ')} FROM webhooks`;

function rowToWebhook(row) {
  if (!row) return null;
  return {
    id: row.id,
    agent: row.agent,
    name: row.name ?? null,
    signingSecret: row.signing_secret ?? null,
    staticArgs: row.static_args_json ? JSON.parse(row.static_args_json) : {},
    enabled: !!row.enabled,
    createdAt: row.created_at,
    lastTriggeredAt: row.last_triggered_at ?? null,
    lastRunId: row.last_run_id ?? null,
  };
}

const UPDATABLE_FIELDS = {
  name: 'name',
  signingSecret: 'signing_secret',
  staticArgs: 'static_args_json',
  enabled: 'enabled',
  lastTriggeredAt: 'last_triggered_at',
  lastRunId: 'last_run_id',
};

function serializeFieldValue(field, value) {
  if (field === 'staticArgs') return JSON.stringify(value ?? {});
  if (field === 'enabled') return value ? 1 : 0;
  return value ?? null;
}

function createWebhooksRepo(db) {
  const insertStmt = db.prepare(`INSERT INTO webhooks (
    id, agent, name, signing_secret, static_args_json, enabled,
    created_at, last_triggered_at, last_run_id
  ) VALUES (
    :id, :agent, :name, :signing_secret, :static_args_json, :enabled,
    :created_at, :last_triggered_at, :last_run_id
  )`);

  const deleteStmt = db.prepare(`DELETE FROM webhooks WHERE id = ?`);
  const getByIdStmt = db.prepare(`${SELECT_WEBHOOK} WHERE id = ?`);
  const listByAgentStmt = db.prepare(`${SELECT_WEBHOOK} WHERE agent = ? ORDER BY created_at ASC`);
  const listAllStmt = db.prepare(`${SELECT_WEBHOOK} ORDER BY created_at ASC`);

  function webhookToParams(webhook) {
    return {
      id: webhook.id,
      agent: webhook.agent,
      name: webhook.name ?? null,
      signing_secret: webhook.signingSecret ?? null,
      static_args_json: JSON.stringify(webhook.staticArgs ?? {}),
      enabled: webhook.enabled ? 1 : 0,
      created_at: webhook.createdAt,
      last_triggered_at: webhook.lastTriggeredAt ?? null,
      last_run_id: webhook.lastRunId ?? null,
    };
  }

  return {
    insertWebhook(webhook) {
      insertStmt.run(webhookToParams(webhook));
    },

    updateWebhook(id, fields) {
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
      db.prepare(`UPDATE webhooks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    },

    deleteWebhook(id) {
      const info = deleteStmt.run(id);
      return info.changes > 0;
    },

    getWebhook(id) {
      return rowToWebhook(getByIdStmt.get(id));
    },

    listWebhooks(agent) {
      const rows = agent ? listByAgentStmt.all(agent) : listAllStmt.all();
      return rows.map(rowToWebhook);
    },

    listAllWebhooks() {
      return listAllStmt.all().map(rowToWebhook);
    },
  };
}

module.exports = { createWebhooksRepo, rowToWebhook };
