const { describe, it } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const runtimesRouter = require('../src/routes/runtimes');

function makeApp(checkRuntimeAvailability) {
  const app = express();
  app.use((req, res, next) => {
    req.checkRuntimeAvailability = checkRuntimeAvailability || (async () => ({}));
    next();
  });
  app.use(runtimesRouter);
  return app;
}

describe('GET /runtimes', () => {
  it('returns runtime metadata from the shared registry', async () => {
    const app = makeApp();
    const res = await request(app).get('/runtimes');

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.runtimes));
    assert.ok(res.body.runtimes.some(runtime => runtime.name === 'codex'));
    const codex = res.body.runtimes.find(runtime => runtime.name === 'codex');
    assert.ok(codex.runtimeOptions.some(option => option.name === 'sandboxMode'));
    const vibe = res.body.runtimes.find(runtime => runtime.name === 'vibe');
    assert.ok(vibe);
    assert.strictEqual(vibe.label, 'Mistral Vibe');
    assert.ok(vibe.runtimeOptions.some(option => option.name === 'maxTurns'));
    assert.ok(vibe.runtimeOptions.some(option => option.name === 'enabledTools'));
  });

  it('includes available and availabilityReason fields on each runtime', async () => {
    const app = makeApp(async () => ({
      bash: { available: true },
      claude: { available: false, reason: 'claude CLI not found in PATH' },
      codex: { available: true },
      node: { available: true },
      vibe: { available: false, reason: 'vibe CLI not found in PATH' },
    }));

    const res = await request(app).get('/runtimes');

    assert.strictEqual(res.status, 200);
    for (const runtime of res.body.runtimes) {
      assert.strictEqual(typeof runtime.available, 'boolean', `${runtime.name} missing available field`);
      assert.ok('availabilityReason' in runtime, `${runtime.name} missing availabilityReason field`);
    }
    const claude = res.body.runtimes.find(r => r.name === 'claude');
    assert.strictEqual(claude.available, false);
    assert.strictEqual(claude.availabilityReason, 'claude CLI not found in PATH');
    const vibe = res.body.runtimes.find(r => r.name === 'vibe');
    assert.strictEqual(vibe.available, false);
    assert.strictEqual(vibe.availabilityReason, 'vibe CLI not found in PATH');
  });
});
