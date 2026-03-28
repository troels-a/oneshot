const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');

function resolveAgentsDir() {
  const dir = process.env.ONESHOT_AGENTS_DIR || path.join(repoRoot, 'agents');
  return path.resolve(repoRoot, dir);
}

module.exports = resolveAgentsDir;
