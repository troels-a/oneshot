const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const crypto = require('crypto');
const path = require('path');
const os = require('os');
const { mkdirSync, rmSync, writeFileSync } = require('fs');
const { WebhookStore } = require('@oneshot/core');
const { openDb } = require('@oneshot/core');
const { createIngestRouter, adminRouter } = require('../src/routes/webhooks');

const TMP = path.join(os.tmpdir(), 'oneshot-webhooks-route-test');

function writeAgent(agentsDir, name, body) {
  const dir = path.join(agentsDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'agent.md'), body);
}

function fakeManager(overrides = {}) {
  return {
    dispatched: [],
    getRunningRun() { return null; },
    async dispatchRun(agent, options) {
      this.dispatched.push({ agent, options });
      return { run: { id: 'fake-run-id', status: 'pending' } };
    },
    ...overrides,
  };
}

let counter = 0;
function setup(options = {}) {
  const root = path.join(TMP, `s${counter++}`);
  const agentsDir = path.join(root, 'agents');
  const dataDir = path.join(root, 'data');
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  writeAgent(agentsDir, 'vercel-deploy-notify', '---\nruntime: node\nmulti_instance: true\n---\nbody');
  if (options.singleInstanceAgent) {
    writeAgent(agentsDir, 'single', '---\nruntime: bash\n---\nbody');
  }

  const db = openDb(dataDir);
  const webhooks = new WebhookStore({ db });
  webhooks.loadFromDb();
  const manager = options.manager || fakeManager();

  const app = express();
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use(createIngestRouter({ runManager: manager, webhooks, agentsDir }));
  app.use((req, res, next) => {
    req.webhooks = webhooks;
    req.agentsDir = agentsDir;
    req.publicUrl = options.publicUrl;
    next();
  });
  app.use(adminRouter);
  return { app, webhooks, manager, agentsDir };
}

function sign(body, secret) {
  return crypto.createHmac('sha1', secret).update(Buffer.from(body, 'utf8')).digest('hex');
}

describe('POST /webhooks/:id (ingest)', () => {
  before(() => { rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); });
  after(() => { rmSync(TMP, { recursive: true, force: true }); });

  it('dispatches with event + payload + static args (no secret)', async () => {
    const { app, webhooks, manager } = setup();
    const w = webhooks.createWebhook('vercel-deploy-notify', { staticArgs: { channel: 'ops' } });

    const res = await request(app)
      .post(`/webhooks/${w.id}`)
      .send({ type: 'deployment.error', payload: { name: 'site' } });

    assert.strictEqual(res.status, 202);
    assert.strictEqual(res.body.runId, 'fake-run-id');
    assert.strictEqual(manager.dispatched.length, 1);
    const args = manager.dispatched[0].options.args;
    assert.strictEqual(args.channel, 'ops');
    assert.strictEqual(args.event, 'deployment.error');
    assert.strictEqual(JSON.parse(args.payload).payload.name, 'site');
  });

  it('tags webhook-triggered runs with source "webhook"', async () => {
    const { app, webhooks, manager } = setup();
    const w = webhooks.createWebhook('vercel-deploy-notify', {});

    await request(app)
      .post(`/webhooks/${w.id}`)
      .send({ type: 'deployment.error' })
      .expect(202);

    assert.strictEqual(manager.dispatched[0].options.source, 'webhook');
  });

  it('accepts a valid HMAC signature', async () => {
    const { app, webhooks, manager } = setup();
    const secret = 'sek';
    const w = webhooks.createWebhook('vercel-deploy-notify', { signingSecret: secret });
    const body = JSON.stringify({ type: 'deployment.error' });

    const res = await request(app)
      .post(`/webhooks/${w.id}`)
      .set('Content-Type', 'application/json')
      .set('x-vercel-signature', sign(body, secret))
      .send(body);

    assert.strictEqual(res.status, 202);
    assert.strictEqual(manager.dispatched.length, 1);
  });

  it('rejects an invalid signature with 401', async () => {
    const { app, webhooks, manager } = setup();
    const w = webhooks.createWebhook('vercel-deploy-notify', { signingSecret: 'sek' });
    const body = JSON.stringify({ type: 'deployment.error' });

    const res = await request(app)
      .post(`/webhooks/${w.id}`)
      .set('Content-Type', 'application/json')
      .set('x-vercel-signature', 'wrong')
      .send(body);

    assert.strictEqual(res.status, 401);
    assert.strictEqual(manager.dispatched.length, 0);
  });

  it('rejects a missing signature when a secret is set', async () => {
    const { app, webhooks } = setup();
    const w = webhooks.createWebhook('vercel-deploy-notify', { signingSecret: 'sek' });
    const res = await request(app).post(`/webhooks/${w.id}`).send({ type: 'deployment.error' });
    assert.strictEqual(res.status, 401);
  });

  it('returns 404 for an unknown id', async () => {
    const { app } = setup();
    const res = await request(app).post('/webhooks/deadbeef').send({ type: 'x' });
    assert.strictEqual(res.status, 404);
  });

  it('returns 404 for a disabled webhook', async () => {
    const { app, webhooks } = setup();
    const w = webhooks.createWebhook('vercel-deploy-notify', {});
    webhooks.updateWebhook(w.id, { enabled: false });
    const res = await request(app).post(`/webhooks/${w.id}`).send({ type: 'x' });
    assert.strictEqual(res.status, 404);
  });

  it('returns 200 skipped when a single-instance agent is busy', async () => {
    const manager = fakeManager({ getRunningRun: () => ({ id: 'busy-run' }) });
    const { app, webhooks } = setup({ singleInstanceAgent: true, manager });
    const w = webhooks.createWebhook('single', {});
    const res = await request(app).post(`/webhooks/${w.id}`).send({ type: 'x' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.skipped, true);
    assert.strictEqual(manager.dispatched.length, 0);
  });
});

describe('webhooks CRUD', () => {
  before(() => { rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); });
  after(() => { rmSync(TMP, { recursive: true, force: true }); });

  it('creates a webhook and never returns the raw secret', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/agents/vercel-deploy-notify/webhooks')
      .send({ name: 'prod', signingSecret: 'sek', staticArgs: { channel: 'ops' } });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.hasSigningSecret, true);
    assert.strictEqual(res.body.signingSecret, undefined);
    assert.match(res.body.ingestPath, /^\/webhooks\/[0-9a-f]{32}$/);
    assert.strictEqual(res.body.ingestUrl, null);
    assert.deepStrictEqual(res.body.staticArgs, { channel: 'ops' });
  });

  it('builds a full ingestUrl from the configured public base', async () => {
    const { app } = setup({ publicUrl: 'https://api.example.com/' });
    const res = await request(app).post('/agents/vercel-deploy-notify/webhooks').send({ name: 'p' });
    assert.strictEqual(res.status, 201);
    assert.match(res.body.ingestUrl, /^https:\/\/api\.example\.com\/webhooks\/[0-9a-f]{32}$/);
  });

  it('404s creating a webhook for a missing agent', async () => {
    const { app } = setup();
    const res = await request(app).post('/agents/nope/webhooks').send({});
    assert.strictEqual(res.status, 404);
  });

  it('lists all webhooks across agents', async () => {
    const { app, webhooks } = setup();
    webhooks.createWebhook('vercel-deploy-notify', { name: 'a' });
    webhooks.createWebhook('vercel-deploy-notify', { name: 'b' });
    const res = await request(app).get('/webhooks');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.webhooks.length, 2);
  });

  it('PATCH rotates the secret and updates only provided fields', async () => {
    const { app, webhooks } = setup();
    const w = webhooks.createWebhook('vercel-deploy-notify', { name: 'one', signingSecret: 'old' });
    const res = await request(app)
      .patch(`/agents/vercel-deploy-notify/webhooks/${w.id}`)
      .send({ name: 'two', signingSecret: 'new' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.name, 'two');
    assert.strictEqual(res.body.hasSigningSecret, true);
    assert.strictEqual(webhooks.getWebhook(w.id).signingSecret, 'new');
  });

  it('PATCH clears the secret with an empty string', async () => {
    const { app, webhooks } = setup();
    const w = webhooks.createWebhook('vercel-deploy-notify', { signingSecret: 'old' });
    const res = await request(app)
      .patch(`/agents/vercel-deploy-notify/webhooks/${w.id}`)
      .send({ signingSecret: '' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.hasSigningSecret, false);
    assert.strictEqual(webhooks.getWebhook(w.id).signingSecret, null);
  });

  it('deletes a webhook', async () => {
    const { app, webhooks } = setup();
    const w = webhooks.createWebhook('vercel-deploy-notify', {});
    const res = await request(app).delete(`/agents/vercel-deploy-notify/webhooks/${w.id}`);
    assert.strictEqual(res.status, 204);
    assert.strictEqual(webhooks.getWebhook(w.id), undefined);
  });

  it('rejects a non-object staticArgs', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/agents/vercel-deploy-notify/webhooks')
      .send({ staticArgs: [1, 2, 3] });
    assert.strictEqual(res.status, 400);
  });
});
