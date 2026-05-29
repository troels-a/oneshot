const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const { mkdirSync, mkdtempSync, rmSync } = require('fs');
const extractResult = require('../src/extract-result');
const { openDb, closeDb, createRepos } = require('../src/db');

const TMP = path.join(os.tmpdir(), 'oneshot-extract-result-test');

function seedRun(db, id) {
  createRepos(db).runs.insertRun({
    id, agentName: 'a', source: 'server', status: 'completed',
    startedAt: '2026-05-29T10:00:00Z', options: {},
  });
}

describe('extractResult', () => {
  const dirs = [];

  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    for (const dir of dirs) closeDb(dir);
    rmSync(TMP, { recursive: true, force: true });
  });

  function makeDb() {
    const dir = mkdtempSync(path.join(TMP, 'd-'));
    dirs.push(dir);
    return { dir, db: openDb(dir) };
  }

  it('extracts codex result text and token usage from jsonl stdout', () => {
    const { db } = makeDb();
    seedRun(db, 'r1');
    const lines = [
      '{"type":"thread.started","thread_id":"abc"}',
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"structured ok"}}',
      '{"type":"turn.completed","usage":{"input_tokens":10,"cached_input_tokens":3,"output_tokens":2}}',
    ];
    createRepos(db).logs.appendLogLines('r1', 'stdout', lines, 0);

    const { result, meta } = extractResult(db, 'r1', 'codex');
    assert.strictEqual(result, 'structured ok');
    assert.deepStrictEqual(meta, {
      input_tokens: 10,
      cached_input_tokens: 3,
      output_tokens: 2,
    });
  });

  it('ignores non-json lines in codex stdout', () => {
    const { db } = makeDb();
    seedRun(db, 'r2');
    const lines = [
      'Reading additional input from stdin...',
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"ok"}}',
    ];
    createRepos(db).logs.appendLogLines('r2', 'stdout', lines, 0);

    const { result, meta } = extractResult(db, 'r2', 'codex');
    assert.strictEqual(result, 'ok');
    assert.strictEqual(meta, null);
  });

  it('returns null when there is no stdout content', () => {
    const { db } = makeDb();
    seedRun(db, 'r3');
    const { result, meta } = extractResult(db, 'r3', 'codex');
    assert.strictEqual(result, null);
    assert.strictEqual(meta, null);
  });
});
