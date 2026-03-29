const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');

function resolveWorkspaceDir() {
  let dir = process.env.ONESHOT_WORKSPACE_DIR;
  if (!dir) return null;
  if (dir.startsWith('~/') || dir === '~') {
    dir = path.join(require('os').homedir(), dir.slice(1));
  }
  return path.resolve(repoRoot, dir);
}

module.exports = resolveWorkspaceDir;
