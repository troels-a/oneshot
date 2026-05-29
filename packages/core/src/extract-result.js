const { getRuntime } = require('./runtimes');
const { createLogsRepo } = require('./db/logs');

const MAX_RESULT_SIZE = 50000;

function defaultExtractResult(content) {
  const trimmed = content.length > MAX_RESULT_SIZE
    ? content.slice(-MAX_RESULT_SIZE)
    : content;
  return { result: trimmed, meta: null };
}

function extractResult(db, runId, runtimeName) {
  const logs = createLogsRepo(db);
  const content = logs.getStreamContent(runId, 'stdout');
  if (!content.trim()) return { result: null, meta: null };

  const runtime = getRuntime(runtimeName);
  if (runtime && typeof runtime.extractResult === 'function') {
    return runtime.extractResult(content);
  }

  return defaultExtractResult(content);
}

module.exports = extractResult;
