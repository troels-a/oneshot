const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const { mkdtempSync, rmSync, writeFileSync } = require('fs');
const extractResult = require('../src/extract-result');

describe('extractResult', () => {
  const tempDirs = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('extracts codex result text and token usage from jsonl stdout', () => {
    const logDir = mkdtempSync(path.join(os.tmpdir(), 'oneshot-extract-result-'));
    tempDirs.push(logDir);

    writeFileSync(path.join(logDir, 'stdout.log'), [
      '{"type":"thread.started","thread_id":"abc"}',
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"structured ok"}}',
      '{"type":"turn.completed","usage":{"input_tokens":10,"cached_input_tokens":3,"output_tokens":2}}',
      '',
    ].join('\n'));

    const { result, meta } = extractResult(logDir, 'codex');

    assert.strictEqual(result, 'structured ok');
    assert.deepStrictEqual(meta, {
      input_tokens: 10,
      cached_input_tokens: 3,
      output_tokens: 2,
    });
  });

  it('ignores non-json lines in codex stdout', () => {
    const logDir = mkdtempSync(path.join(os.tmpdir(), 'oneshot-extract-result-'));
    tempDirs.push(logDir);

    writeFileSync(path.join(logDir, 'stdout.log'), [
      'Reading additional input from stdin...',
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"ok"}}',
      '',
    ].join('\n'));

    const { result, meta } = extractResult(logDir, 'codex');

    assert.strictEqual(result, 'ok');
    assert.strictEqual(meta, null);
  });
});
