const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { writeFileSync, mkdirSync, rmSync } = require('fs');
const parseAgentMd = require('../src/parse-agent-md');

const TMP = path.join(__dirname, '.tmp-parse');

function writeAgent(content) {
  const p = path.join(TMP, 'agent.md');
  writeFileSync(p, content);
  return p;
}

describe('parseAgentMd', () => {
  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('parses a valid agent.md with all fields', () => {
    const p = writeAgent(`---
runtime: claude
args:
  - name: greeting
    description: A greeting
    required: true
  - name: target
    default: world
commands:
  - name: date
    run: date
---
Hello {{ args.greeting }} {{ args.target }}
{{ commands.date }}`);

    const result = parseAgentMd(p);
    assert.strictEqual(result.runtime, 'claude');
    assert.strictEqual(result.args.length, 2);
    assert.strictEqual(result.args[0].name, 'greeting');
    assert.strictEqual(result.args[0].required, true);
    assert.strictEqual(result.args[1].default, 'world');
    assert.strictEqual(result.commands.length, 1);
    assert.strictEqual(result.commands[0].name, 'date');
    assert.ok(result.body.includes('{{ args.greeting }}'));
  });

  it('accepts string-style args', () => {
    const p = writeAgent(`---
runtime: bash
args:
  - foo
  - bar
commands: []
---
body`);

    const result = parseAgentMd(p);
    assert.strictEqual(result.args[0].name, 'foo');
    assert.strictEqual(result.args[1].name, 'bar');
  });

  it('throws on missing runtime', () => {
    const p = writeAgent(`---
args: []
commands: []
---
body`);

    assert.throws(() => parseAgentMd(p), /missing runtime/);
  });

  it('throws on invalid runtime', () => {
    const p = writeAgent(`---
runtime: python
---
body`);

    assert.throws(() => parseAgentMd(p), /Invalid runtime/);
  });

  it('accepts legacy entrypoint field for backwards compat', () => {
    const p = writeAgent(`---
entrypoint: node
---
body`);

    const result = parseAgentMd(p);
    assert.strictEqual(result.runtime, 'node');
  });

  it('throws on missing frontmatter', () => {
    const p = writeAgent('just a body');
    assert.throws(() => parseAgentMd(p), /missing frontmatter/);
  });

  it('parses worktree: true from frontmatter', () => {
    const p = writeAgent(`---
runtime: claude
worktree: true
---
body`);

    const result = parseAgentMd(p);
    assert.strictEqual(result.worktree, true);
  });

  it('parses codex runtime', () => {
    const p = writeAgent(`---\nruntime: codex\n---\nDo something`);
    const result = parseAgentMd(p);
    assert.strictEqual(result.runtime, 'codex');
  });

  it('defaults worktree to false when omitted', () => {
    const p = writeAgent(`---
runtime: bash
---
body`);

    const result = parseAgentMd(p);
    assert.strictEqual(result.worktree, false);
  });
});
