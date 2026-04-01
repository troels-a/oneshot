const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const { mkdirSync, rmSync, existsSync } = require('fs');
const { execFileSync } = require('child_process');
const { createWorktree, removeWorktree } = require('../src/worktree');

const TMP = path.join(os.tmpdir(), 'oneshot-worktree-test');
const DATA = path.join(TMP, 'data');

function initGitRepo(dir) {
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', dir], { stdio: 'pipe' });
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@test.com'], { stdio: 'pipe' });
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test'], { stdio: 'pipe' });
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-m', 'init'], { stdio: 'pipe' });
}

describe('worktree', () => {
  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('creates worktree directory and branch', () => {
    const repoDir = path.join(TMP, 'repo-create');
    initGitRepo(repoDir);

    const result = createWorktree(repoDir, 'run-123', 'my-agent', DATA);

    assert.ok(existsSync(result.worktreeDir));
    assert.ok(result.worktreeDir.startsWith(DATA), 'worktree should be inside the data dir');
    assert.strictEqual(result.branch, 'oneshot/my-agent/run-123');
    assert.strictEqual(result.repoRoot, repoDir);

    // Verify branch exists
    const branches = execFileSync('git', ['-C', repoDir, 'branch'], { stdio: 'pipe' }).toString();
    assert.ok(branches.includes('oneshot/my-agent/run-123'));

    // Cleanup
    removeWorktree(repoDir, result.worktreeDir);
  });

  it('throws when cwd is not a git repo', () => {
    const nonGitDir = path.join(TMP, 'not-a-repo');
    mkdirSync(nonGitDir, { recursive: true });

    assert.throws(
      () => createWorktree(nonGitDir, 'run-456', 'test-agent'),
      /worktree mode requires a git repository/
    );
  });

  it('removes worktree directory on cleanup', () => {
    const repoDir = path.join(TMP, 'repo-remove');
    initGitRepo(repoDir);

    const result = createWorktree(repoDir, 'run-789', 'cleanup-agent', DATA);
    assert.ok(existsSync(result.worktreeDir));

    removeWorktree(repoDir, result.worktreeDir);
    assert.ok(!existsSync(result.worktreeDir));
  });
});
