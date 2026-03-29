const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');

function resolveWorkspaceDir() {
  const dir = process.env.ONESHOT_WORKSPACE_DIR;
  if (!dir) return null;
  return path.resolve(repoRoot, dir);
}

module.exports = resolveWorkspaceDir;
