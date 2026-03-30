const { randomUUID } = require('crypto');
const path = require('path');
const { mkdirSync, createWriteStream } = require('fs');

function createRunLogger(logsDir) {
  const id = randomUUID();
  const logDir = path.join(logsDir, id);
  mkdirSync(logDir, { recursive: true });

  const stdoutStream = createWriteStream(path.join(logDir, 'stdout.log'));
  const stderrStream = createWriteStream(path.join(logDir, 'stderr.log'));

  return { id, logDir, stdoutStream, stderrStream };
}

module.exports = createRunLogger;
