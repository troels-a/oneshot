const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const { mkdirSync, rmSync } = require('fs');
const { WebhookStore, verifyVercelSignature } = require('../src/webhook-store');
const { openDb, createRepos } = require('../src/db');

const TMP = path.join(require('fs').realpathSync(os.tmpdir()), 'oneshot-webhook-test');

function makeStore(suffix) {
  const dataDir = path.join(TMP, suffix);
  mkdirSync(dataDir, { recursive: true });
  const db = openDb(dataDir);
  const store = new WebhookStore({ db });
  store.loadFromDb();
  return { store, db, dataDir };
}

describe('WebhookStore', () => {
  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('creates a webhook with an unguessable hex id and persists it', () => {
    const { store, db } = makeStore('create');
    const w = store.createWebhook('my-agent', { name: 'vercel', signingSecret: 's3cr3t', staticArgs: { channel: 'ops' } });

    assert.match(w.id, /^[0-9a-f]{32}$/);
    assert.strictEqual(w.agent, 'my-agent');
    assert.strictEqual(w.enabled, true);

    const row = createRepos(db).webhooks.getWebhook(w.id);
    assert.strictEqual(row.name, 'vercel');
    assert.strictEqual(row.signingSecret, 's3cr3t');
    assert.deepStrictEqual(row.staticArgs, { channel: 'ops' });
  });

  it('updateWebhook patches fields without changing id', () => {
    const { store } = makeStore('update');
    const w = store.createWebhook('a', { name: 'one', signingSecret: 'old' });
    const updated = store.updateWebhook(w.id, { name: 'two', enabled: false });

    assert.strictEqual(updated.id, w.id);
    assert.strictEqual(updated.name, 'two');
    assert.strictEqual(updated.enabled, false);
    assert.strictEqual(updated.signingSecret, 'old');
  });

  it('clears the signing secret when given an empty string', () => {
    const { store } = makeStore('clear');
    const w = store.createWebhook('a', { signingSecret: 'old' });
    const updated = store.updateWebhook(w.id, { signingSecret: '' });
    assert.strictEqual(updated.signingSecret, null);
  });

  it('deleteWebhook removes from store and db', () => {
    const { store, db } = makeStore('delete');
    const w = store.createWebhook('a', {});
    assert.strictEqual(store.deleteWebhook(w.id), true);
    assert.strictEqual(store.getWebhook(w.id), undefined);
    assert.strictEqual(createRepos(db).webhooks.getWebhook(w.id), null);
  });

  it('survives a reload from the db', () => {
    const { store, dataDir } = makeStore('reload');
    const w = store.createWebhook('a', { name: 'keep' });
    const db = openDb(dataDir);
    const store2 = new WebhookStore({ db });
    store2.loadFromDb();
    assert.strictEqual(store2.getWebhook(w.id).name, 'keep');
  });
});

describe('verifyVercelSignature', () => {
  const secret = 'topsecret';
  const body = '{"type":"deployment.error"}';
  const sig = 'd91f2fc806848fe64451a9719d011412ec8edd49';

  it('accepts a valid signature', () => {
    assert.strictEqual(verifyVercelSignature(body, secret, sig), true);
  });

  it('accepts a valid signature over a Buffer body', () => {
    assert.strictEqual(verifyVercelSignature(Buffer.from(body, 'utf8'), secret, sig), true);
  });

  it('rejects a wrong signature', () => {
    assert.strictEqual(verifyVercelSignature(body, secret, 'deadbeef'), false);
  });

  it('rejects a tampered body', () => {
    assert.strictEqual(verifyVercelSignature('{"type":"deployment.succeeded"}', secret, sig), false);
  });

  it('rejects when secret or signature is missing', () => {
    assert.strictEqual(verifyVercelSignature(body, '', sig), false);
    assert.strictEqual(verifyVercelSignature(body, secret, ''), false);
  });
});
