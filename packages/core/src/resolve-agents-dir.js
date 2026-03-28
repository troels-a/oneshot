const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');

function resolveAgentsDir() {
  return process.env.ONESHOT_AGENTS_DIR || path.join(repoRoot, 'agents');
}

module.exports = resolveAgentsDir;
