const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const path = require('path');
const os = require('os');
const { mkdirSync, rmSync, writeFileSync } = require('fs');
const agentsRouter = require('../src/routes/agents');

const TMP = path.join(os.tmpdir(), 'oneshot-server-route-test');

function makeApp(manager, agentsDir, router = agentsRouter) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.runManager = manager;
    req.agentsDir = agentsDir;
    next();
  });
  app.use(router);
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

  it('rejects invalid runtime with descriptive error', async () => {
    const agentsDir = path.join(TMP, 'agents-invalid-runtime');
    mkdirSync(agentsDir, { recursive: true });
    const app = makeApp(fakeManager(), agentsDir);

    const res = await request(app)
      .post('/agents')
      .send({ name: 'bad-agent', runtime: 'python', body: 'test' });

    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('Must be one of:'));
    assert.ok(res.body.error.includes('claude'));
  });
});

describe('dispatch multi_instance guard', () => {
  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('returns 409 when agent is running and multi_instance is false', async () => {
    const agentsDir = path.join(TMP, 'agents-409');
    writeAgent(agentsDir, 'single', '---\nruntime: bash\n---\nbody');
    const manager = fakeManager({ getRunningRun: () => ({ id: 'existing-run' }) });
    const app = makeApp(manager, agentsDir);

    const res = await request(app)
      .post('/agents/single/dispatch')
      .send({});

    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.runId, 'existing-run');
  });

  it('returns 409 when agent is running and multi_instance is omitted', async () => {
    const agentsDir = path.join(TMP, 'agents-409-omitted');
    writeAgent(agentsDir, 'default', '---\nruntime: bash\n---\nbody');
    const manager = fakeManager({ getRunningRun: () => ({ id: 'existing-run' }) });
    const app = makeApp(manager, agentsDir);

    const res = await request(app)
      .post('/agents/default/dispatch')
      .send({});

    assert.strictEqual(res.status, 409);
  });

  it('allows concurrent dispatch when multi_instance is true', async () => {
    const agentsDir = path.join(TMP, 'agents-multi');
    writeAgent(agentsDir, 'multi', '---\nruntime: bash\nmulti_instance: true\n---\nbody');
    const manager = fakeManager({ getRunningRun: () => ({ id: 'existing-run' }) });
    const app = makeApp(manager, agentsDir);

    const res = await request(app)
      .post('/agents/multi/dispatch')
      .send({});

    assert.strictEqual(res.status, 201);
    assert.strictEqual(manager.dispatched.length, 1);
  });
});

describe('dispatch rejects unavailable runtime', () => {
  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('returns 400 when runtime is unavailable', async (t) => {
    const core = require('../src/lib/core');
    const originalFn = core.checkRuntimeAvailability;
    core.checkRuntimeAvailability = async (name) => {
      if (name !== 'bash') {
        throw new Error(`Unexpected runtime lookup: ${name}`);
      }
      return { available: false, reason: 'bash CLI not found in PATH' };
    };

    const routerPath = require.resolve('../src/routes/agents');
    delete require.cache[routerPath];
    const mockedRouter = require('../src/routes/agents');

    t.after(() => {
      core.checkRuntimeAvailability = originalFn;
      delete require.cache[routerPath];
    });

    const agentsDir = path.join(TMP, 'agents-unavailable');
    writeAgent(agentsDir, 'test-agent', '---\nruntime: bash\n---\nbody');
    const manager = fakeManager();
    const app = makeApp(manager, agentsDir, mockedRouter);

    const res = await request(app)
      .post('/agents/test-agent/dispatch')
      .send({});

    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('not available'));
    assert.ok(res.body.error.includes('bash'));
    assert.strictEqual(manager.dispatched.length, 0);
  });
});
