const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  DEFAULT_TIMEOUT_SEC,
  DISPATCH_OPTION_KEYS,
  validateDispatchOptions,
  pickDispatchOptions,
} = require('../src/dispatch-options');

describe('dispatch-options', () => {
  describe('DEFAULT_TIMEOUT_SEC', () => {
    it('is 1200 (20 minutes)', () => {
      assert.strictEqual(DEFAULT_TIMEOUT_SEC, 1200);
    });
  });

  describe('DISPATCH_OPTION_KEYS', () => {
    it('lists every known dispatch option', () => {
      assert.deepStrictEqual(
        [...DISPATCH_OPTION_KEYS].sort(),
        ['args', 'branch', 'path', 'timeout']
      );
    });
  });

  describe('validateDispatchOptions', () => {
    it('returns no errors for an empty object', () => {
      assert.deepStrictEqual(validateDispatchOptions({}), []);
    });

    it('accepts a fully populated valid options object', () => {
      const errors = validateDispatchOptions({
        args: { task: 'do thing', count: 3, flag: true },
        path: 'my-repo',
        branch: 'feature/test',
        timeout: 600,
      });
      assert.deepStrictEqual(errors, []);
    });

    it('rejects path that is not a non-empty string', () => {
      assert.ok(validateDispatchOptions({ path: '' }).length > 0);
      assert.ok(validateDispatchOptions({ path: 123 }).length > 0);
    });

    it('rejects branch that is not a non-empty string', () => {
      assert.ok(validateDispatchOptions({ branch: '' }).length > 0);
      assert.ok(validateDispatchOptions({ branch: 42 }).length > 0);
    });

    it('rejects timeout outside the allowed range', () => {
      assert.ok(validateDispatchOptions({ timeout: -1 }).length > 0);
      assert.ok(validateDispatchOptions({ timeout: 0 }).length > 0);
      assert.ok(validateDispatchOptions({ timeout: 86401 }).length > 0);
      assert.ok(validateDispatchOptions({ timeout: 'soon' }).length > 0);
    });

    it('rejects args that is not a plain object', () => {
      assert.ok(validateDispatchOptions({ args: null }).length > 0);
      assert.ok(validateDispatchOptions({ args: [] }).length > 0);
      assert.ok(validateDispatchOptions({ args: 'foo' }).length > 0);
    });

    it('rejects args containing non-scalar values', () => {
      const errors = validateDispatchOptions({ args: { obj: { nested: 1 } } });
      assert.ok(errors.length > 0);
    });
  });

  describe('pickDispatchOptions', () => {
    it('returns only known dispatch keys', () => {
      const result = pickDispatchOptions({
        args: { task: 'go' },
        path: 'repo',
        branch: 'main',
        timeout: 60,
        // unknown keys should be dropped
        agent: 'foo',
        random: 'value',
      });
      assert.deepStrictEqual(result, {
        args: { task: 'go' },
        path: 'repo',
        branch: 'main',
        timeout: 60,
      });
    });

    it('omits keys that are not present on the input', () => {
      const result = pickDispatchOptions({ path: 'repo' });
      assert.deepStrictEqual(result, { path: 'repo' });
    });

    it('returns an empty object for an empty input', () => {
      assert.deepStrictEqual(pickDispatchOptions({}), {});
    });
  });
});
