const path = require('path');
const { REPO_ROOT, DATA_DIR } = require('./paths');

function resolveLogsDir() {
  const dir = process.env.ONESHOT_LOGS_DIR || path.join(DATA_DIR, 'logs');
  return path.resolve(REPO_ROOT, dir);
}

module.exports = resolveLogsDir;
