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

  it('builds vibe command with defaults', () => {
    const { cmd, args } = buildCommand('vibe', agentDir, 'do stuff', {});
    assert.strictEqual(cmd, 'vibe');
    assert.deepStrictEqual(args, [
      '--prompt',
      'do stuff',
      '--max-turns',
      '5',
      '--output',
      'json',
      '--agent',
      'auto-approve',
      '--trust',
    ]);
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

  it('includes -m <model> when codex model runtime option is set', () => {
    const { args } = buildCommand('codex', agentDir, 'do stuff', {}, {
      model: 'gpt-5.1',
    });
    const modelIdx = args.indexOf('-m');
    assert.ok(modelIdx > -1, '-m should be present');
    assert.strictEqual(args[modelIdx + 1], 'gpt-5.1');
    assert.ok(modelIdx > args.indexOf('exec'), '-m should come after the exec subcommand');
  });

  it('omits -m when codex model is blank', () => {
    const { args } = buildCommand('codex', agentDir, 'do stuff', {}, { model: '' });
    assert.strictEqual(args.indexOf('-m'), -1);
  });

  it('builds vibe command with runtime options', () => {
    const { cmd, args } = buildCommand('vibe', agentDir, 'review the code', {}, {
      maxTurns: '12',
      agent: 'accept-edits',
      trust: false,
      enabledTools: 'bash*, re:^serena_.*$\nedit_file',
    });
    assert.strictEqual(cmd, 'vibe');
    assert.deepStrictEqual(args, [
      '--prompt',
      'review the code',
      '--max-turns',
      '12',
      '--output',
      'json',
      '--agent',
      'accept-edits',
      '--enabled-tools',
      'bash*',
      '--enabled-tools',
      're:^serena_.*$',
      '--enabled-tools',
      'edit_file',
    ]);
  });

  it('falls back to default vibe max turns when invalid', () => {
    const { args } = buildCommand('vibe', agentDir, 'do stuff', {}, { maxTurns: '-4' });
    assert.strictEqual(args[args.indexOf('--max-turns') + 1], '5');
  });

  it('falls back to default vibe max turns for partially numeric input', () => {
    const { args } = buildCommand('vibe', agentDir, 'do stuff', {}, { maxTurns: '5abc' });
    assert.strictEqual(args[args.indexOf('--max-turns') + 1], '5');
  });

  it('throws on unknown runtime', () => {
    assert.throws(() => buildCommand('python', agentDir, '', {}), /Unknown runtime/);
  });
});
