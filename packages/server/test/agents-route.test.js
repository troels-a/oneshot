const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const path = require('path');
const os = require('os');
const { mkdirSync, rmSync, writeFileSync } = require('fs');
const agentsRouter = require('../src/routes/agents');

const TMP = path.join(os.tmpdir(), 'oneshot-server-route-test');

function makeApp(manager, agentsDir) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.runManager = manager;
    req.agentsDir = agentsDir;
    next();
  });
  app.use(agentsRouter);
  return app;
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

function writeAgent(agentsDir, name, body) {
  const dir = path.join(agentsDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'agent.md'), body);
}

describe('POST /agents/:agent/dispatch', () => {
  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('forwards a top-level branch field to runManager.dispatchRun', async () => {
    const agentsDir = path.join(TMP, 'agents-branch');
    writeAgent(agentsDir, 'noop', '---\nruntime: bash\n---\nbody');
    const manager = fakeManager();
    const app = makeApp(manager, agentsDir);

    const res = await request(app)
      .post('/agents/noop/dispatch')
      .send({ path: 'my-repo', branch: 'feature/from-rest' });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(manager.dispatched.length, 1);
    assert.strictEqual(manager.dispatched[0].options.branch, 'feature/from-rest');
    assert.strictEqual(manager.dispatched[0].options.path, 'my-repo');
  });

  it('rejects an empty branch with 400', async () => {
    const agentsDir = path.join(TMP, 'agents-empty-branch');
    writeAgent(agentsDir, 'noop', '---\nruntime: bash\n---\nbody');
    const manager = fakeManager();
    const app = makeApp(manager, agentsDir);

    const res = await request(app)
      .post('/agents/noop/dispatch')
      .send({ branch: '' });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(manager.dispatched.length, 0);
  });

  it('still folds unknown top-level keys into args', async () => {
    const agentsDir = path.join(TMP, 'agents-loose');
    writeAgent(agentsDir, 'noop', '---\nruntime: bash\n---\nbody');
    const manager = fakeManager();
    const app = makeApp(manager, agentsDir);

    const res = await request(app)
      .post('/agents/noop/dispatch')
      .send({ path: 'repo', task: 'do thing', target: 'staging' });

    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual(manager.dispatched[0].options.args, { task: 'do thing', target: 'staging' });
  });

  it('keeps branch out of args when sent in the loose shape', async () => {
    const agentsDir = path.join(TMP, 'agents-loose-branch');
    writeAgent(agentsDir, 'noop', '---\nruntime: bash\n---\nbody');
    const manager = fakeManager();
    const app = makeApp(manager, agentsDir);

    const res = await request(app)
      .post('/agents/noop/dispatch')
      .send({ path: 'repo', branch: 'feature/x', task: 'go' });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(manager.dispatched[0].options.branch, 'feature/x');
    assert.deepStrictEqual(manager.dispatched[0].options.args, { task: 'go' });
  });
});

describe('agent CRUD runtime validation', () => {
  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  it('creates a codex agent with runtime options', async () => {
    const agentsDir = path.join(TMP, 'agents-create-codex');
    mkdirSync(agentsDir, { recursive: true });
    const app = makeApp(fakeManager(), agentsDir);

    const res = await request(app)
      .post('/agents')
      .send({
        name: 'codex-agent',
        runtime: 'codex',
        body: 'Review this branch.',
        runtimeOptions: {
          sandboxMode: 'danger-full-access',
          approvalPolicy: 'never',
          webSearch: true,
        },
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.runtime, 'codex');
    assert.strictEqual(res.body.runtimeOptions.sandboxMode, 'danger-full-access');
  });

  it('lists runtime metadata alongside agents', async () => {
    const agentsDir = path.join(TMP, 'agents-list-runtimes');
    writeAgent(agentsDir, 'noop', '---\nruntime: bash\n---\nbody');
    const app = makeApp(fakeManager(), agentsDir);

    const res = await request(app).get('/agents');

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.runtimes));
    assert.ok(res.body.runtimes.some(runtime => runtime.name === 'codex'));
  });
});
