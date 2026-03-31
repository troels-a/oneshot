const { execFileSync } = require('child_process');
const { rmSync } = require('fs');
const path = require('path');

function createWorktree(cwd, runId, agentName) {
  try {
    execFileSync('git', ['-C', cwd, 'rev-parse', '--git-dir'], { stdio: 'pipe' });
  } catch {
    throw new Error('worktree mode requires a git repository at the resolved working directory');
  }

  const repoRoot = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { stdio: 'pipe' })
    .toString().trim();

  const worktreeDir = path.join(repoRoot, '.oneshot', 'worktrees', runId);
  const branch = `oneshot/${agentName}/${runId}`;

  execFileSync('git', ['-C', repoRoot, 'worktree', 'add', '-b', branch, worktreeDir, 'HEAD'], { stdio: 'pipe' });

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
