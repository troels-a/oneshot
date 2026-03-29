const { describe, it } = require('node:test');
const assert = require('node:assert');
const runCommands = require('../src/run-commands');

describe('runCommands', () => {
  it('runs a simple command', () => {
    const results = runCommands([{ name: 'greeting', run: 'echo hello' }], process.cwd());
    assert.strictEqual(results.greeting, 'hello');
  });

  it('works without args (backward compat)', () => {
    const results = runCommands([{ name: 'x', run: 'echo ok' }], process.cwd());
    assert.strictEqual(results.x, 'ok');
  });

  it('interpolates args in run strings', () => {
    const results = runCommands(
      [{ name: 'out', run: 'echo {{ args.msg }}' }],
      process.cwd(),
      { msg: 'hi' }
    );
    assert.strictEqual(results.out, 'hi');
  });

  it('interpolates multiple args', () => {
    const results = runCommands(
      [{ name: 'out', run: 'echo {{ args.a }} {{ args.b }}' }],
      process.cwd(),
      { a: 'hello', b: 'world' }
    );
    assert.strictEqual(results.out, 'hello world');
  });

  it('leaves unknown arg placeholders intact', () => {
    const results = runCommands(
      [{ name: 'out', run: 'echo {{ args.missing }}' }],
      process.cwd(),
      {}
    );
    assert.strictEqual(results.out, '{{ args.missing }}');
  });

  it('handles whitespace variations in placeholders', () => {
    const results = runCommands(
      [{ name: 'out', run: 'echo {{args.x}} and {{  args.y  }}' }],
      process.cwd(),
      { x: 'A', y: 'B' }
    );
    assert.strictEqual(results.out, 'A and B');
  });

  it('coerces non-string arg values', () => {
    const results = runCommands(
      [{ name: 'out', run: 'echo {{ args.n }}' }],
      process.cwd(),
      { n: 42 }
    );
    assert.strictEqual(results.out, '42');
  });

  it('captures failed command output', () => {
    const results = runCommands(
      [{ name: 'fail', run: 'exit 1' }],
      process.cwd()
    );
    assert.ok(results.fail.startsWith('[command failed:'));
  });
});
