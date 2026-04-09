const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const { existsSync, unlinkSync } = require('fs');
const buildCommand = require('../src/build-command');

describe('buildCommand', () => {
  const agentDir = '/tmp/test-agent';
  const tmpFiles = [];

  afterEach(() => {
    for (const f of tmpFiles) {
      try { unlinkSync(f); } catch {}
    }
    tmpFiles.length = 0;
  });

  it('builds claude command', () => {
    const { cmd, args } = buildCommand('claude', agentDir, 'do stuff', {});
    assert.strictEqual(cmd, 'claude');
    assert.ok(args.includes('-p'));
    assert.ok(args.includes('do stuff'));
    assert.ok(args.includes('--dangerously-skip-permissions'));
    assert.ok(args.includes('--output-format'));
  });

  it('builds codex exec command', () => {
    const { cmd, args } = buildCommand('codex', agentDir, 'do stuff', {});
    assert.strictEqual(cmd, 'codex');
    assert.deepStrictEqual(args, ['-a', 'never', 'exec', '--skip-git-repo-check', '--json', '-s', 'workspace-write', 'do stuff']);
  });

  it('builds node command with temp file', () => {
    const script = 'console.log("hello");';
    const { cmd, args, cleanup } = buildCommand('node', agentDir, script, { foo: 'bar' });
    tmpFiles.push(args[0]);
    assert.strictEqual(cmd, 'node');
    assert.ok(args[0].endsWith('.js'));
    assert.ok(existsSync(args[0]));
    assert.ok(args.includes('--foo'));
    assert.ok(args.includes('bar'));
    cleanup();
    assert.ok(!existsSync(args[0]));
  });

  it('builds bash command with temp file', () => {
    const script = 'echo "hello"';
    const { cmd, args, cleanup } = buildCommand('bash', agentDir, script, { x: '1' });
    tmpFiles.push(args[0]);
    assert.strictEqual(cmd, 'bash');
    assert.ok(args[0].endsWith('.sh'));
    assert.ok(existsSync(args[0]));
    assert.ok(args.includes('--x'));
    assert.ok(args.includes('1'));
    cleanup();
    assert.ok(!existsSync(args[0]));
  });

  it('builds codex command with runtime options', () => {
    const { cmd, args } = buildCommand('codex', agentDir, 'review the code', {}, {
      approvalPolicy: 'never',
      sandboxMode: 'danger-full-access',
      webSearch: true,
    });
    assert.strictEqual(cmd, 'codex');
    assert.deepStrictEqual(args, [
      '-a',
      'never',
      '--search',
      'exec',
      '--skip-git-repo-check',
      '--json',
      '-s',
      'danger-full-access',
      'review the code',
    ]);
  });

  it('throws on unknown runtime', () => {
    assert.throws(() => buildCommand('python', agentDir, '', {}), /Unknown runtime/);
  });
});
