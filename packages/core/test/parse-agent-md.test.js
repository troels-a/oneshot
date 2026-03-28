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
entrypoint: claude
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
    assert.strictEqual(result.entrypoint, 'claude');
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
entrypoint: bash
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

  it('throws on missing entrypoint', () => {
    const p = writeAgent(`---
args: []
commands: []
---
body`);

    assert.throws(() => parseAgentMd(p), /missing entrypoint/);
  });

  it('throws on invalid entrypoint', () => {
    const p = writeAgent(`---
entrypoint: python
---
body`);

    assert.throws(() => parseAgentMd(p), /Invalid entrypoint/);
  });

  it('throws on missing frontmatter', () => {
    const p = writeAgent('just a body');
    assert.throws(() => parseAgentMd(p), /missing frontmatter/);
  });
});
