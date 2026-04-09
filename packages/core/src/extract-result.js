const path = require('path');
const { readFileSync, existsSync } = require('fs');
const { getRuntime } = require('./runtimes');

const MAX_RESULT_SIZE = 50000;

function defaultExtractResult(content) {
  const trimmed = content.length > MAX_RESULT_SIZE
    ? content.slice(-MAX_RESULT_SIZE)
    : content;
  return { result: trimmed, meta: null };
}

function extractResult(logDir, runtimeName) {
  const stdoutPath = path.join(logDir, 'stdout.log');
  if (!existsSync(stdoutPath)) return { result: null, meta: null };

  const content = readFileSync(stdoutPath, 'utf8');
  if (!content.trim()) return { result: null, meta: null };

  const runtime = getRuntime(runtimeName);
  if (runtime && typeof runtime.extractResult === 'function') {
    return runtime.extractResult(content);
  }

  return defaultExtractResult(content);
}

module.exports = extractResult;
