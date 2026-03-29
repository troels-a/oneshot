const path = require('path');
const resolveWorkspaceDir = require('./resolve-workspace-dir');

function resolveCwd(agentDir, requestedPath) {
  if (!requestedPath) return agentDir;

  const workspaceDir = resolveWorkspaceDir();

  if (path.isAbsolute(requestedPath)) {
    if (workspaceDir) {
      const rel = path.relative(workspaceDir, requestedPath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error('Path resolves outside workspace directory');
      }
    }
    return requestedPath;
  }

  if (!workspaceDir) {
    throw new Error('Relative path requires ONESHOT_WORKSPACE_DIR to be set');
  }

  const resolved = path.resolve(workspaceDir, requestedPath);
  const rel = path.relative(workspaceDir, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path resolves outside workspace directory');
  }

  return resolved;
}

module.exports = resolveCwd;
