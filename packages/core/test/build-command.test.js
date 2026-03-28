const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const buildCommand = require('../src/build-command');

describe('buildCommand', () => {
  const agentDir = '/tmp/test-agent';

  it('builds claude command', () => {
    const { cmd, args } = buildCommand('claude', agentDir, 'do stuff', {});
    assert.strictEqual(cmd, 'claude');
    assert.ok(args.includes('-p'));
    assert.ok(args.includes('do stuff'));
    assert.ok(args.includes('--dangerously-skip-permissions'));
    assert.ok(args.includes('--output-format'));
  });

  it('builds node command', () => {
    const { cmd, args } = buildCommand('node', agentDir, '', { foo: 'bar' });
    assert.strictEqual(cmd, 'node');
    assert.strictEqual(args[0], path.join(agentDir, 'index.js'));
    assert.ok(args.includes('--foo'));
    assert.ok(args.includes('bar'));
  });

  it('builds bash command', () => {
    const { cmd, args } = buildCommand('bash', agentDir, '', { x: '1' });
    assert.strictEqual(cmd, 'bash');
    assert.strictEqual(args[0], path.join(agentDir, 'main.sh'));
    assert.ok(args.includes('--x'));
    assert.ok(args.includes('1'));
  });

  it('throws on unknown entrypoint', () => {
    assert.throws(() => buildCommand('python', agentDir, '', {}), /Unknown entrypoint/);
  });
});
