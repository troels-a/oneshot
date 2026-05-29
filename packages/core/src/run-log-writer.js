const { randomUUID } = require('crypto');
const path = require('path');
const { mkdirSync } = require('fs');
const { Writable } = require('stream');

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_FLUSH_MS = 200;

function createLineWriter({ logsRepo, runId, stream, batchSize, flushMs }) {
  let buffer = '';
  const pending = [];
  let lineCount = 0;
  let flushTimer = null;

  function clearFlushTimer() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  }

  function flushNow() {
    clearFlushTimer();
    if (!pending.length) return;
    const batch = pending.splice(0, pending.length);
    lineCount = logsRepo.appendLogLines(runId, stream, batch, lineCount);
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      try { flushNow(); } catch (err) { writable.destroy(err); }
    }, flushMs);
  }

  const writable = new Writable({
    write(chunk, encoding, callback) {
      try {
        buffer += chunk.toString('utf8');
        let idx;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          pending.push(buffer.slice(0, idx));
          buffer = buffer.slice(idx + 1);
        }
        if (pending.length >= batchSize) flushNow();
        else if (pending.length) scheduleFlush();
        callback();
      } catch (err) {
        callback(err);
      }
    },
    final(callback) {
      try {
        if (buffer.length) {
          pending.push(buffer);
          buffer = '';
        }
        flushNow();
        callback();
      } catch (err) {
        callback(err);
      }
    },
    destroy(err, callback) {
      clearFlushTimer();
      callback(err);
    },
  });

  Object.defineProperty(writable, 'finalLineNumber', {
    get() { return lineCount; },
  });

  return writable;
}

function createRunLogWriter({ logsRepo, logsDir, id, batchSize = DEFAULT_BATCH_SIZE, flushMs = DEFAULT_FLUSH_MS }) {
  const runId = id || randomUUID();
  const logDir = path.join(logsDir, runId);
  mkdirSync(logDir, { recursive: true });

  return {
    id: runId,
    logDir,
    stdout: createLineWriter({ logsRepo, runId, stream: 'stdout', batchSize, flushMs }),
    stderr: createLineWriter({ logsRepo, runId, stream: 'stderr', batchSize, flushMs }),
  };
}

module.exports = createRunLogWriter;
