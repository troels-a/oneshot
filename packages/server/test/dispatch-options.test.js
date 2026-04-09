const { describe, it } = require('node:test');
const assert = require('node:assert');
const { validateBody, coerceDispatchBody } = require('../src/lib/validate-dispatch-options');

describe('server dispatch-options helpers', () => {
  describe('validateBody', () => {
    it('returns no errors for an empty options object', () => {
      assert.deepStrictEqual(validateBody({}), []);
    });

    it('accepts branch as a top-level option', () => {
      assert.deepStrictEqual(validateBody({ branch: 'feature/x' }), []);
    });

    it('rejects an empty branch', () => {
      assert.ok(validateBody({ branch: '' }).length > 0);
    });

    it('rejects a non-string branch', () => {
      assert.ok(validateBody({ branch: 123 }).length > 0);
    });

    it('still validates path and timeout', () => {
      assert.ok(validateBody({ path: '' }).length > 0);
      assert.ok(validateBody({ timeout: -1 }).length > 0);
    });
  });

  describe('coerceDispatchBody', () => {
    it('returns the body unchanged when it already uses the structured shape', () => {
      const body = { args: { task: 'go' }, path: 'repo', branch: 'feature/x', timeout: 60 };
      const result = coerceDispatchBody(body);
      assert.deepStrictEqual(result, body);
    });

    it('keeps an empty body empty', () => {
      assert.deepStrictEqual(coerceDispatchBody({}), {});
    });

    it('passes branch through as a top-level option in the loose shape', () => {
      const result = coerceDispatchBody({
        path: 'repo',
        branch: 'feature/from-loose',
        task: 'do thing',
      });
      assert.strictEqual(result.branch, 'feature/from-loose');
      assert.strictEqual(result.path, 'repo');
      assert.deepStrictEqual(result.args, { task: 'do thing' });
    });

    it('folds unknown top-level keys into args (loose REST shape)', () => {
      const result = coerceDispatchBody({
        path: 'repo',
        task: 'go',
        target: 'staging',
      });
      assert.strictEqual(result.path, 'repo');
      assert.deepStrictEqual(result.args, { task: 'go', target: 'staging' });
    });

    it('does not introduce an args key when no extras are present', () => {
      const result = coerceDispatchBody({ path: 'repo', branch: 'main' });
      assert.strictEqual('args' in result, false);
    });

    it('preserves existing args when body already has args key', () => {
      const result = coerceDispatchBody({
        args: { task: 'go' },
        path: 'repo',
        branch: 'feature/x',
      });
      assert.deepStrictEqual(result.args, { task: 'go' });
      assert.strictEqual(result.branch, 'feature/x');
    });
  });
});
