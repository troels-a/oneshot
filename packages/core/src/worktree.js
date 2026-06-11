const { execFileSync } = require('child_process');
const { rmSync } = require('fs');
const path = require('path');
const { DATA_DIR } = require('./paths');

// Resolve the remote's default branch (e.g. `main` or `master`) by reading
// origin/HEAD's symref. Repos don't all use `main`, so basing worktrees on a
// hardcoded `main` breaks `master`-default repos. Falls back to `main`.
function resolveDefaultBranch(repoRoot) {
  try {
    const out = execFileSync('git', ['-C', repoRoot, 'ls-remote', '--symref', 'origin', 'HEAD'], { stdio: 'pipe' })
      .toString();
    const match = out.match(/^ref:\s+refs\/heads\/(\S+)\s+HEAD$/m);
    if (match) return match[1];
  } catch {
    // Fall through to default.
  }
  return 'main';
}

function createWorktree(cwd, runId, agentName, dataDir, branch) {
  try {
    execFileSync('git', ['-C', cwd, 'rev-parse', '--git-dir'], { stdio: 'pipe' });
  } catch {
    throw new Error('worktree mode requires a git repository at the resolved working directory');
  }

  const repoRoot = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { stdio: 'pipe' })
    .toString().trim();

  const baseBranch = resolveDefaultBranch(repoRoot);

  // Fetch latest from origin without touching the parent repo's checkout
  execFileSync('git', ['-C', repoRoot, 'fetch', 'origin', baseBranch], { stdio: 'pipe' });

  const worktreeDir = path.join(dataDir || DATA_DIR, 'worktrees', runId);

  if (branch) {
    // Check if branch exists on origin
    const lsRemote = execFileSync('git', ['-C', repoRoot, 'ls-remote', '--heads', 'origin', branch], { stdio: 'pipe' })
      .toString().trim();

    if (lsRemote) {
      // Branch exists remotely — fetch it and base worktree on it
      execFileSync('git', ['-C', repoRoot, 'fetch', 'origin', branch], { stdio: 'pipe' });
      execFileSync('git', ['-C', repoRoot, 'worktree', 'add', '-B', branch, worktreeDir, `origin/${branch}`], { stdio: 'pipe' });
    } else {
      // Branch doesn't exist remotely — create (or reset) from the default branch
      execFileSync('git', ['-C', repoRoot, 'worktree', 'add', '-B', branch, worktreeDir, `origin/${baseBranch}`], { stdio: 'pipe' });
    }
  } else {
    // No branch arg — default behavior, branch from the default branch
    const defaultBranch = `oneshot/${agentName}/${runId}`;
    execFileSync('git', ['-C', repoRoot, 'worktree', 'add', '-B', defaultBranch, worktreeDir, `origin/${baseBranch}`], { stdio: 'pipe' });
    branch = defaultBranch;
  }

  return { worktreeDir, branch, repoRoot };
}

function removeWorktree(repoRoot, worktreeDir) {
  try {
    execFileSync('git', ['-C', repoRoot, 'worktree', 'remove', worktreeDir, '--force'], { stdio: 'pipe' });
  } catch {
    try {
      rmSync(worktreeDir, { recursive: true, force: true });
      execFileSync('git', ['-C', repoRoot, 'worktree', 'prune'], { stdio: 'pipe' });
    } catch {
      // best-effort cleanup
    }
  }
}

module.exports = { createWorktree, removeWorktree };
