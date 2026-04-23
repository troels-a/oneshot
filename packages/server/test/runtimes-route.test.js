const { describe, it } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const runtimesRouter = require('../src/routes/runtimes');

describe('GET /runtimes', () => {
  it('returns runtime metadata from the shared registry', async () => {
    const app = express();
    app.use(runtimesRouter);

    const res = await request(app).get('/runtimes');

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.runtimes));
    assert.ok(res.body.runtimes.some(runtime => runtime.name === 'codex'));
    const codex = res.body.runtimes.find(runtime => runtime.name === 'codex');
    assert.ok(codex.runtimeOptions.some(option => option.name === 'sandboxMode'));
  });

  it('includes available and availabilityReason fields on each runtime', async () => {
    const app = express();
    app.use(runtimesRouter);

    const res = await request(app).get('/runtimes');

    assert.strictEqual(res.status, 200);
    for (const runtime of res.body.runtimes) {
      assert.strictEqual(typeof runtime.available, 'boolean', `${runtime.name} missing available field`);
      assert.ok('availabilityReason' in runtime, `${runtime.name} missing availabilityReason field`);
    }
  });
});
