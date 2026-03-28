const { describe, it } = require('node:test');
const assert = require('node:assert');
const validateArgs = require('../src/validate-args');

describe('validateArgs', () => {
  it('passes through provided args', () => {
    const defs = [{ name: 'foo' }];
    const result = validateArgs(defs, { foo: 'bar' });
    assert.strictEqual(result.foo, 'bar');
  });

  it('applies defaults for missing args', () => {
    const defs = [{ name: 'foo', default: 'baz' }];
    const result = validateArgs(defs, {});
    assert.strictEqual(result.foo, 'baz');
  });

  it('throws on missing required arg', () => {
    const defs = [{ name: 'foo', required: true }];
    assert.throws(() => validateArgs(defs, {}), /Missing required argument: foo/);
  });

  it('passes through extra args not in schema', () => {
    const defs = [{ name: 'foo' }];
    const result = validateArgs(defs, { foo: '1', extra: '2' });
    assert.strictEqual(result.extra, '2');
  });

  it('provided value overrides default', () => {
    const defs = [{ name: 'foo', default: 'default' }];
    const result = validateArgs(defs, { foo: 'override' });
    assert.strictEqual(result.foo, 'override');
  });
});
