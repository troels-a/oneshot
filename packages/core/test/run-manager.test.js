const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const { mkdirSync, rmSync, writeFileSync } = require('fs');
const { execFileSync } = require('child_process');
const RunManager = require('../src/run-manager');

const TMP = path.join(os.tmpdir(), 'oneshot-run-manager-test');

function initBareOrigin(dir) {
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '--bare', '--initial-branch=main', dir], { stdio: 'pipe' });
}

function initGitRepo(dir, originDir) {
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '--initial-branch=main', dir], { stdio: 'pipe' });
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@test.com'], { stdio: 'pipe' });
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test'], { stdio: 'pipe' });
  execFileSync('git', ['-C', dir, 'config', 'core.hooksPath', '/dev/null'], { stdio: 'pipe' });
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-m', 'init'], { stdio: 'pipe' });
  execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', originDir], { stdio: 'pipe' });
  execFileSync('git', ['-C', dir, 'push', 'origin', 'main'], { stdio: 'pipe' });
}

function writeAgent(agentsDir, name, content) {
  const dir = path.join(agentsDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'agent.md'), content);
}

function makeManager(suffix, extraOpts = {}) {
  const root = path.join(TMP, suffix);
  const logsDir = path.join(root, 'logs');
  const agentsDir = path.join(root, 'agents');
  const dataDir = path.join(root, 'data');
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  return {
    manager: new RunManager({ logsDir, agentsDir, dataDir, ...extraOpts }),
    root, logsDir, agentsDir, dataDir,
  };
}

describe('RunManager', () => {
  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  describe('dispatchRun', () => {
    it('honors options.branch when creating a worktree', async () => {
      const { manager, agentsDir } = makeManager('dispatch-branch');
      const originDir = path.join(TMP, 'dispatch-branch-origin');
      const repoDir = path.join(TMP, 'dispatch-branch-repo');
      initBareOrigin(originDir);
      initGitRepo(repoDir, originDir);

      writeAgent(agentsDir, 'noop', `---
runtime: bash
worktree: true
---
#!/usr/bin/env bash
exit 0
`);

      const { run, done } = await manager.dispatchRun('noop', {
        path: repoDir,
        branch: 'feature/from-options',
      });

      assert.strictEqual(run.worktree.branch, 'feature/from-options');
      await done;
    });

    it('persists branch in run.options', async () => {
      const { manager, agentsDir } = makeManager('persist-branch');
      const originDir = path.join(TMP, 'persist-branch-origin');
      const repoDir = path.join(TMP, 'persist-branch-repo');
      initBareOrigin(originDir);
      initGitRepo(repoDir, originDir);

      writeAgent(agentsDir, 'noop', `---
runtime: bash
worktree: true
---
#!/usr/bin/env bash
exit 0
`);

      const { run, done } = await manager.dispatchRun('noop', {
        path: repoDir,
        branch: 'feature/persist',
      });

      assert.strictEqual(run.options.branch, 'feature/persist');
      await done;
    });

    it('persists the resolved cwd on the run record', async () => {
      const { manager, agentsDir } = makeManager('persist-cwd');
      const originDir = path.join(TMP, 'persist-cwd-origin');
      const repoDir = path.join(TMP, 'persist-cwd-repo');
      initBareOrigin(originDir);
      initGitRepo(repoDir, originDir);

      writeAgent(agentsDir, 'noop', `---
runtime: bash
worktree: true
---
#!/usr/bin/env bash
exit 0
`);

      const { run, done } = await manager.dispatchRun('noop', { path: repoDir });

      assert.strictEqual(run.cwd, repoDir, 'run.cwd should be the resolved path');
      await done;
    });

    it('does not pass branch through as a CLI flag to the agent', async () => {
      const { manager, agentsDir } = makeManager('branch-not-flag');
      const originDir = path.join(TMP, 'branch-not-flag-origin');
      const repoDir = path.join(TMP, 'branch-not-flag-repo');
      initBareOrigin(originDir);
      initGitRepo(repoDir, originDir);

      // This bash agent fails (exit 1) if it receives --branch as a CLI arg
      writeAgent(agentsDir, 'rejects-branch-flag', `---
runtime: bash
worktree: true
---
#!/usr/bin/env bash
for arg in "$@"; do
  if [ "$arg" = "--branch" ]; then
    exit 42
  fi
done
exit 0
`);

      const { run, done } = await manager.dispatchRun('rejects-branch-flag', {
        path: repoDir,
        branch: 'feature/cli',
      });

      await done;
      assert.strictEqual(run.exitCode, 0, 'agent should not receive --branch as a CLI arg');
    });
  });

  describe('timeout', () => {
    it('applies the 1200s default when no timeout is given', async () => {
      const { manager, agentsDir } = makeManager('timeout-default');
      writeAgent(agentsDir, 'noop', `---
runtime: bash
---
#!/usr/bin/env bash
exit 0
`);

      const { run, done } = await manager.dispatchRun('noop', {});
      assert.strictEqual(run.options.timeout, 1200);
      await done;
    });

    it('respects an explicit timeout option', async () => {
      const { manager, agentsDir } = makeManager('timeout-explicit');
      writeAgent(agentsDir, 'noop', `---
runtime: bash
---
#!/usr/bin/env bash
exit 0
`);

      const { run, done } = await manager.dispatchRun('noop', { timeout: 42 });
      assert.strictEqual(run.options.timeout, 42);
      await done;
    });

    it('kills a long-running agent and marks it timed_out', async () => {
      const { manager, agentsDir } = makeManager('timeout-kill', { killGraceMs: 200 });
      writeAgent(agentsDir, 'sleeper', `---
runtime: bash
---
#!/usr/bin/env bash
sleep 30
`);

      const start = Date.now();
      const { run, done } = await manager.dispatchRun('sleeper', { timeout: 1 });
      await done;
      const elapsed = Date.now() - start;

      assert.strictEqual(run.status, 'timed_out');
      assert.ok(elapsed < 5000, `should have been killed quickly, took ${elapsed}ms`);
    });

    it('escalates to SIGKILL when the agent ignores SIGTERM', async () => {
      const { manager, agentsDir } = makeManager('timeout-escalate', { killGraceMs: 300 });
      writeAgent(agentsDir, 'stubborn', `---
runtime: bash
---
#!/usr/bin/env bash
trap '' TERM
sleep 30
`);

      const start = Date.now();
      const { run, done } = await manager.dispatchRun('stubborn', { timeout: 1 });
      await done;
      const elapsed = Date.now() - start;

      assert.strictEqual(run.status, 'timed_out');
      assert.strictEqual(run.signal, 'SIGKILL', 'should have been SIGKILLed after grace period');
      assert.ok(elapsed < 5000, `should have been killed within grace period, took ${elapsed}ms`);
    });

    it('kills the entire process group, not just the immediate child', async () => {
      const { manager, agentsDir } = makeManager('timeout-pgroup', { killGraceMs: 200 });
      const pidFile = path.join(TMP, 'timeout-pgroup-childpid.txt');
      try { rmSync(pidFile); } catch {}

      writeAgent(agentsDir, 'spawner', `---
runtime: bash
---
#!/usr/bin/env bash
sleep 30 &
echo $! > ${pidFile}
wait
`);

      const { run, done } = await manager.dispatchRun('spawner', { timeout: 1 });
      await done;

      assert.strictEqual(run.status, 'timed_out');

      // Read the subprocess PID written by the agent and verify it was killed.
      const pid = parseInt(require('fs').readFileSync(pidFile, 'utf8'), 10);
      assert.ok(Number.isFinite(pid), 'agent should have written a child PID');

      // Allow a brief moment for the kill signal to propagate
      await new Promise((r) => setTimeout(r, 200));
      let alive = true;
      try { process.kill(pid, 0); } catch { alive = false; }
      assert.strictEqual(alive, false, `subprocess pid ${pid} should have been killed`);
    });

    it('does not mark a normally-failing run as timed_out', async () => {
      const { manager, agentsDir } = makeManager('timeout-normal-fail', { killGraceMs: 200 });
      writeAgent(agentsDir, 'failer', `---
runtime: bash
---
#!/usr/bin/env bash
exit 7
`);

      const { run, done } = await manager.dispatchRun('failer', { timeout: 60 });
      await done;
      assert.strictEqual(run.status, 'failed');
      assert.strictEqual(run.exitCode, 7);
    });
  });

  describe('_processSpawns', () => {
    it('forwards branch from spawn JSON into dispatchRun options', async () => {
      const { manager, root } = makeManager('processSpawns-branch');
      const dispatched = [];
      manager.dispatchRun = (agent, opts) => {
        dispatched.push({ agent, opts });
        return Promise.resolve({ run: {}, child: null, done: Promise.resolve() });
      };

      const parentLogDir = path.join(root, 'fake-parent');
      const spawnDir = path.join(parentLogDir, 'spawns');
      mkdirSync(spawnDir, { recursive: true });
      writeFileSync(path.join(spawnDir, 'next.json'), JSON.stringify({
        agent: 'child-agent',
        path: 'some-repo',
        branch: 'brief/spawned-branch',
        args: { task: 'go' },
      }));

      const fakeParent = { id: 'parent-1', logDir: parentLogDir };
      manager._processSpawns(fakeParent, {});

      // _processSpawns kicks off async dispatchRun calls; let microtasks drain
      await new Promise((r) => setImmediate(r));

      assert.strictEqual(dispatched.length, 1);
      assert.strictEqual(dispatched[0].agent, 'child-agent');
      assert.strictEqual(dispatched[0].opts.branch, 'brief/spawned-branch');
      assert.strictEqual(dispatched[0].opts.path, 'some-repo');
      assert.deepStrictEqual(dispatched[0].opts.args, { task: 'go' });
      assert.strictEqual(dispatched[0].opts.source, 'spawn');
    });

    it('forwards timeout from spawn JSON', async () => {
      const { manager, root } = makeManager('processSpawns-timeout');
      const dispatched = [];
      manager.dispatchRun = (agent, opts) => {
        dispatched.push({ agent, opts });
        return Promise.resolve({ run: {}, child: null, done: Promise.resolve() });
      };

      const parentLogDir = path.join(root, 'fake-parent');
      const spawnDir = path.join(parentLogDir, 'spawns');
      mkdirSync(spawnDir, { recursive: true });
      writeFileSync(path.join(spawnDir, 'next.json'), JSON.stringify({
        agent: 'child',
        timeout: 600,
      }));

      manager._processSpawns({ id: 'parent-2', logDir: parentLogDir }, {});
      await new Promise((r) => setImmediate(r));

      assert.strictEqual(dispatched[0].opts.timeout, 600);
    });

    it('does not forward unknown keys from spawn JSON', async () => {
      const { manager, root } = makeManager('processSpawns-unknown');
      const dispatched = [];
      manager.dispatchRun = (agent, opts) => {
        dispatched.push({ agent, opts });
        return Promise.resolve({ run: {}, child: null, done: Promise.resolve() });
      };

      const parentLogDir = path.join(root, 'fake-parent');
      const spawnDir = path.join(parentLogDir, 'spawns');
      mkdirSync(spawnDir, { recursive: true });
      writeFileSync(path.join(spawnDir, 'next.json'), JSON.stringify({
        agent: 'child',
        path: 'repo',
        somethingUnknown: 'should-be-dropped',
      }));

      manager._processSpawns({ id: 'parent-3', logDir: parentLogDir }, {});
      await new Promise((r) => setImmediate(r));

      assert.strictEqual('somethingUnknown' in dispatched[0].opts, false);
    });
  });
});
