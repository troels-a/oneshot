const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');

function resolveLogsDir() {
  const dir = process.env.ONESHOT_LOGS_DIR || path.join(repoRoot, '.oneshot', 'logs');
  return path.resolve(repoRoot, dir);
}

module.exports = resolveLogsDir;
