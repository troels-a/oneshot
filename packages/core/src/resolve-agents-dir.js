const path = require('path');
const { REPO_ROOT } = require('./paths');

function resolveAgentsDir() {
  const dir = process.env.ONESHOT_AGENTS_DIR || path.join(REPO_ROOT, 'agents');
  return path.resolve(REPO_ROOT, dir);
}

module.exports = resolveAgentsDir;
