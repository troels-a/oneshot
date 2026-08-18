const { Router } = require('express');
const path = require('path');
const { existsSync } = require('fs');
const { parseAgentMd, verifyVercelSignature } = require('@oneshot/core');
const validateParams = require('../middleware/validate-params');

// Shape returned by the authenticated CRUD API. The raw signing secret is never
// echoed back — callers get a boolean instead.
//
// `ingestPath` is always the relative route. `ingestUrl` is the full, public,
// ready-to-paste URL when the deployment has configured its public base via
// ONESHOT_PUBLIC_URL; otherwise it is null and the client falls back to the
// page origin.
function serializeWebhook(w, baseUrl) {
  const ingestPath = `/webhooks/${w.id}`;
  const base = typeof baseUrl === 'string' ? baseUrl.replace(/\/+$/, '') : '';
  return {
    id: w.id,
    agent: w.agent,
    name: w.name ?? null,
    enabled: !!w.enabled,
    hasSigningSecret: !!w.signingSecret,
    staticArgs: w.staticArgs || {},
    ingestPath,
    ingestUrl: base ? `${base}${ingestPath}` : null,
    createdAt: w.createdAt,
    lastTriggeredAt: w.lastTriggeredAt ?? null,
    lastRunId: w.lastRunId ?? null,
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateWebhookBody(body, { partial } = {}) {
  if (body.name !== undefined && body.name !== null) {
    if (typeof body.name !== 'string' || body.name.length > 200) {
      return 'name must be a string up to 200 characters';
    }
  }
  if (body.signingSecret !== undefined && body.signingSecret !== null) {
    if (typeof body.signingSecret !== 'string' || body.signingSecret.length > 500) {
      return 'signingSecret must be a string up to 500 characters';
    }
  }
  if (body.staticArgs !== undefined && body.staticArgs !== null) {
    if (!isPlainObject(body.staticArgs)) {
      return 'staticArgs must be an object';
    }
  }
  if (partial && body.enabled !== undefined && typeof body.enabled !== 'boolean') {
    return 'enabled must be a boolean';
  }
  return null;
}

function agentExists(agentsDir, agent) {
  return existsSync(path.join(agentsDir, agent, 'agent.md'));
}

/**
 * Public, unauthenticated ingest endpoint. Mounted BEFORE the auth middleware.
 * Dependencies are passed in by closure (not via req) because the request-level
 * dependency injection runs after auth.
 */
function createIngestRouter({ runManager, webhooks, agentsDir }) {
  const router = Router();

  router.post('/webhooks/:id', async (req, res, next) => {
    try {
      const webhook = webhooks.getWebhook(req.params.id);
      // Unknown and disabled are indistinguishable, to avoid leaking valid ids.
      if (!webhook || !webhook.enabled) {
        return res.status(404).json({ error: 'Webhook not found' });
      }

      if (webhook.signingSecret) {
        const signature = req.headers['x-vercel-signature'];
        if (!verifyVercelSignature(req.rawBody, webhook.signingSecret, signature)) {
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }

      const agentMdPath = path.join(agentsDir, webhook.agent, 'agent.md');
      if (!existsSync(agentMdPath)) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      const config = parseAgentMd(agentMdPath);

      const payloadString = req.rawBody
        ? req.rawBody.toString('utf8')
        : JSON.stringify(req.body ?? {});
      const event = req.body && typeof req.body === 'object' ? req.body.type : undefined;

      const args = { ...(webhook.staticArgs || {}) };
      if (event) args.event = event;
      args.payload = payloadString;

      if (!config.multi_instance) {
        const running = runManager.getRunningRun(webhook.agent);
        if (running) {
          // Return 2xx so the provider does not retry; the event is dropped by
          // the single-instance lock.
          return res.status(200).json({ skipped: true, runId: running.id });
        }
      }

      const { run } = await runManager.dispatchRun(webhook.agent, { args, source: 'webhook' });
      webhooks.recordTrigger(webhook.id, run.id);
      res.status(202).json({ runId: run.id });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// Authenticated CRUD. Mounted after auth + the req.webhooks injection.
const adminRouter = Router();

adminRouter.get('/webhooks', (req, res) => {
  res.json({ webhooks: req.webhooks.listAll().map((w) => serializeWebhook(w, req.publicUrl)) });
});

adminRouter.get('/agents/:agent/webhooks', validateParams, (req, res) => {
  res.json({ webhooks: req.webhooks.listWebhooks(req.params.agent).map((w) => serializeWebhook(w, req.publicUrl)) });
});

adminRouter.post('/agents/:agent/webhooks', validateParams, (req, res, next) => {
  try {
    const { agent } = req.params;
    if (!agentExists(req.agentsDir, agent)) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    const body = req.body || {};
    const error = validateWebhookBody(body, { partial: false });
    if (error) return res.status(400).json({ error });

    const webhook = req.webhooks.createWebhook(agent, {
      name: typeof body.name === 'string' ? body.name.trim() : undefined,
      signingSecret: body.signingSecret || undefined,
      staticArgs: body.staticArgs || undefined,
    });
    res.status(201).json(serializeWebhook(webhook, req.publicUrl));
  } catch (err) {
    if (err.message && /maximum/i.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

adminRouter.get('/agents/:agent/webhooks/:id', validateParams, (req, res) => {
  const webhook = req.webhooks.getWebhook(req.params.id);
  if (!webhook || webhook.agent !== req.params.agent) {
    return res.status(404).json({ error: 'Webhook not found' });
  }
  res.json(serializeWebhook(webhook, req.publicUrl));
});

adminRouter.patch('/agents/:agent/webhooks/:id', validateParams, (req, res, next) => {
  try {
    const webhook = req.webhooks.getWebhook(req.params.id);
    if (!webhook || webhook.agent !== req.params.agent) {
      return res.status(404).json({ error: 'Webhook not found' });
    }
    const body = req.body || {};
    const error = validateWebhookBody(body, { partial: true });
    if (error) return res.status(400).json({ error });

    const updates = {};
    if (body.name !== undefined) updates.name = body.name === null ? null : String(body.name).trim();
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.signingSecret !== undefined) updates.signingSecret = body.signingSecret;
    if (body.staticArgs !== undefined) updates.staticArgs = body.staticArgs;

    const updated = req.webhooks.updateWebhook(req.params.id, updates);
    res.json(serializeWebhook(updated, req.publicUrl));
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/agents/:agent/webhooks/:id', validateParams, (req, res) => {
  const webhook = req.webhooks.getWebhook(req.params.id);
  if (!webhook || webhook.agent !== req.params.agent) {
    return res.status(404).json({ error: 'Webhook not found' });
  }
  req.webhooks.deleteWebhook(req.params.id);
  res.status(204).end();
});

module.exports = { createIngestRouter, adminRouter, serializeWebhook };
