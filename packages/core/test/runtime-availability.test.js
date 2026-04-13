const { describe, it } = require('node:test');
const assert = require('node:assert');
const { checkBinary } = require('../src/runtimes/utils');
const { checkRuntimeAvailability, listRuntimes } = require('../src/runtimes');

describe('checkBinary', () => {
  it('returns available: true for node (always present)', async () => {
    const result = await checkBinary('node');
    assert.deepStrictEqual(result, { available: true });
  });

  it('returns available: false for nonexistent binary', async () => {
    const result = await checkBinary('nonexistent-binary-xyz');
    assert.strictEqual(result.available, false);
    assert.ok(result.reason.includes('nonexistent-binary-xyz'));
  });
});

describe('checkRuntimeAvailability', () => {
  it('returns an object keyed by runtime name with available boolean', async () => {
    const results = await checkRuntimeAvailability();
    const runtimeNames = listRuntimes().map(r => r.name);

    for (const name of runtimeNames) {
      assert.ok(name in results, `missing key: ${name}`);
      assert.strictEqual(typeof results[name].available, 'boolean');
    }
  });

  it('checks a single runtime when name is provided', async () => {
    const result = await checkRuntimeAvailability('node');
    assert.strictEqual(result.available, true);
  });

  it('returns null for unknown runtime name', async () => {
    const result = await checkRuntimeAvailability('nonexistent');
    assert.strictEqual(result, null);
  });
});

describe('runtime checkAvailability methods', () => {
  it('each runtime has a checkAvailability method', () => {
    const runtimes = listRuntimes();
    for (const runtime of runtimes) {
      assert.strictEqual(typeof runtime.checkAvailability, 'function', `${runtime.name} missing checkAvailability`);
    }
  });
});
