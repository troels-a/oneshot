const { execFileSync } = require('child_process');
const { rmSync } = require('fs');
const path = require('path');
const { DATA_DIR } = require('./paths');

function createWorktree(cwd, runId, agentName, dataDir, branch) {
  try {
    execFileSync('git', ['-C', cwd, 'rev-parse', '--git-dir'], { stdio: 'pipe' });
  } catch {
    throw new Error('worktree mode requires a git repository at the resolved working directory');
  }

  const repoRoot = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { stdio: 'pipe' })
    .toString().trim();

  // Ensure main is up to date with origin
  execFileSync('git', ['-C', repoRoot, 'fetch', 'origin', 'main'], { stdio: 'pipe' });
  execFileSync('git', ['-C', repoRoot, 'checkout', 'main'], { stdio: 'pipe' });
  execFileSync('git', ['-C', repoRoot, 'reset', '--hard', 'origin/main'], { stdio: 'pipe' });

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
      // Branch doesn't exist yet — create from main
      execFileSync('git', ['-C', repoRoot, 'worktree', 'add', '-b', branch, worktreeDir, 'main'], { stdio: 'pipe' });
    }
  } else {
    // No branch arg — default behavior, branch from main
    const defaultBranch = `oneshot/${agentName}/${runId}`;
    execFileSync('git', ['-C', repoRoot, 'worktree', 'add', '-b', defaultBranch, worktreeDir, 'main'], { stdio: 'pipe' });
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
