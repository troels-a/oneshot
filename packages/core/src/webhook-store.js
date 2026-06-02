const crypto = require('crypto');
const { createWebhooksRepo } = require('./db/webhooks');

const MAX_WEBHOOKS_PER_AGENT = 50;

/**
 * Verify a Vercel webhook signature.
 *
 * Vercel signs the raw request body with HMAC-SHA1 using the webhook's signing
 * secret and sends the hex digest in the `x-vercel-signature` header.
 * See https://vercel.com/docs/webhooks#securing-webhooks
 */
function verifyVercelSignature(rawBody, secret, signature) {
  if (!secret || !signature) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody ?? '', 'utf8');
  const expected = crypto.createHmac('sha1', secret).update(body).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

class WebhookStore {
  constructor({ db }) {
    if (!db) throw new Error('WebhookStore requires a db connection');
    this.db = db;
    this.repo = createWebhooksRepo(db);
    this.webhooks = new Map();
  }

  loadFromDb() {
    for (const webhook of this.repo.listAllWebhooks()) {
      this.webhooks.set(webhook.id, webhook);
    }
  }

  createWebhook(agent, { name, signingSecret, staticArgs } = {}) {
    const existing = this.listWebhooks(agent);
    if (existing.length >= MAX_WEBHOOKS_PER_AGENT) {
      throw new Error(`Maximum ${MAX_WEBHOOKS_PER_AGENT} webhooks per agent`);
    }

    const webhook = {
      id: crypto.randomBytes(16).toString('hex'),
      agent,
      name: name || null,
      signingSecret: signingSecret || null,
      staticArgs: staticArgs && typeof staticArgs === 'object' ? staticArgs : {},
      enabled: true,
      createdAt: new Date().toISOString(),
      lastTriggeredAt: null,
      lastRunId: null,
    };

    this.repo.insertWebhook(webhook);
    this.webhooks.set(webhook.id, webhook);
    return webhook;
  }

  getWebhook(id) {
    return this.webhooks.get(id);
  }

  listWebhooks(agent) {
    return Array.from(this.webhooks.values()).filter((w) => w.agent === agent);
  }

  listAll() {
    return Array.from(this.webhooks.values());
  }

  updateWebhook(id, updates) {
    const webhook = this.webhooks.get(id);
    if (!webhook) return undefined;

    const dbUpdates = {};
    if (updates.name !== undefined) {
      webhook.name = updates.name || null;
      dbUpdates.name = webhook.name;
    }
    if (updates.enabled !== undefined) {
      webhook.enabled = !!updates.enabled;
      dbUpdates.enabled = webhook.enabled;
    }
    if (updates.signingSecret !== undefined) {
      // "" or null clears the secret (disables HMAC); a value rotates it.
      webhook.signingSecret = updates.signingSecret || null;
      dbUpdates.signingSecret = webhook.signingSecret;
    }
    if (updates.staticArgs !== undefined) {
      webhook.staticArgs = updates.staticArgs && typeof updates.staticArgs === 'object'
        ? updates.staticArgs
        : {};
      dbUpdates.staticArgs = webhook.staticArgs;
    }

    this.repo.updateWebhook(id, dbUpdates);
    return webhook;
  }

  deleteWebhook(id) {
    const removed = this.webhooks.delete(id);
    if (removed) this.repo.deleteWebhook(id);
    return removed;
  }

  recordTrigger(id, runId) {
    const webhook = this.webhooks.get(id);
    if (!webhook) return;
    webhook.lastTriggeredAt = new Date().toISOString();
    webhook.lastRunId = runId ?? null;
    this.repo.updateWebhook(id, {
      lastTriggeredAt: webhook.lastTriggeredAt,
      lastRunId: webhook.lastRunId,
    });
  }
}

module.exports = { WebhookStore, verifyVercelSignature, MAX_WEBHOOKS_PER_AGENT };
