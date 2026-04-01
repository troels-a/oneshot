const path = require('path');
const { REPO_ROOT } = require('./paths');

function resolveWorkspaceDir() {
  let dir = process.env.ONESHOT_WORKSPACE_DIR;
  if (!dir) return null;
  if (dir.startsWith('~/') || dir === '~') {
    dir = path.join(require('os').homedir(), dir.slice(1));
  }
  return path.resolve(REPO_ROOT, dir);
}

module.exports = resolveWorkspaceDir;
