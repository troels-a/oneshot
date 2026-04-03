const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const { mkdirSync, rmSync, existsSync, writeFileSync } = require('fs');
const { execFileSync } = require('child_process');
const { createWorktree, removeWorktree } = require('../src/worktree');

const TMP = path.join(os.tmpdir(), 'oneshot-worktree-test');
const DATA = path.join(TMP, 'data');

function initBareOrigin(dir) {
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '--bare', '--initial-branch=main', dir], { stdio: 'pipe' });
}

function initGitRepo(dir, originDir) {
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '--initial-branch=main', dir], { stdio: 'pipe' });
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@test.com'], { stdio: 'pipe' });
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test'], { stdio: 'pipe' });
  // Disable global hooks so tests aren't blocked by pre-push hooks
  execFileSync('git', ['-C', dir, 'config', 'core.hooksPath', '/dev/null'], { stdio: 'pipe' });
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-m', 'init'], { stdio: 'pipe' });
  if (originDir) {
    execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', originDir], { stdio: 'pipe' });
    execFileSync('git', ['-C', dir, 'push', 'origin', 'main'], { stdio: 'pipe' });
  }
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
    const originDir = path.join(TMP, 'origin-create');
    const repoDir = path.join(TMP, 'repo-create');
    initBareOrigin(originDir);
    initGitRepo(repoDir, originDir);

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
    const originDir = path.join(TMP, 'origin-remove');
    const repoDir = path.join(TMP, 'repo-remove');
    initBareOrigin(originDir);
    initGitRepo(repoDir, originDir);

    const result = createWorktree(repoDir, 'run-789', 'cleanup-agent', DATA);
    assert.ok(existsSync(result.worktreeDir));

    removeWorktree(repoDir, result.worktreeDir);
    assert.ok(!existsSync(result.worktreeDir));
  });

  it('creates worktree on existing remote branch', () => {
    const originDir = path.join(TMP, 'origin-existing');
    const repoDir = path.join(TMP, 'repo-existing');
    initBareOrigin(originDir);
    initGitRepo(repoDir, originDir);

    // Create a branch with a commit and push it
    execFileSync('git', ['-C', repoDir, 'checkout', '-b', 'feature/test'], { stdio: 'pipe' });
    writeFileSync(path.join(repoDir, 'feature.txt'), 'hello');
    execFileSync('git', ['-C', repoDir, 'add', 'feature.txt'], { stdio: 'pipe' });
    execFileSync('git', ['-C', repoDir, 'commit', '-m', 'feature commit'], { stdio: 'pipe' });
    execFileSync('git', ['-C', repoDir, 'push', 'origin', 'feature/test'], { stdio: 'pipe' });
    execFileSync('git', ['-C', repoDir, 'checkout', 'main'], { stdio: 'pipe' });

    const result = createWorktree(repoDir, 'run-branch-1', 'agent', DATA, 'feature/test');

    assert.strictEqual(result.branch, 'feature/test');
    assert.ok(existsSync(path.join(result.worktreeDir, 'feature.txt')), 'worktree should have the branch content');

    removeWorktree(repoDir, result.worktreeDir);
  });

  it('creates worktree with new branch from main when branch does not exist', () => {
    const originDir = path.join(TMP, 'origin-new');
    const repoDir = path.join(TMP, 'repo-new');
    initBareOrigin(originDir);
    initGitRepo(repoDir, originDir);

    const result = createWorktree(repoDir, 'run-branch-2', 'agent', DATA, 'feature/new');

    assert.strictEqual(result.branch, 'feature/new');
    assert.ok(existsSync(result.worktreeDir));

    // Verify branch exists
    const branches = execFileSync('git', ['-C', repoDir, 'branch'], { stdio: 'pipe' }).toString();
    assert.ok(branches.includes('feature/new'));

    removeWorktree(repoDir, result.worktreeDir);
  });

  it('pulls latest main before creating worktree', () => {
    const originDir = path.join(TMP, 'origin-pull');
    const repoDir = path.join(TMP, 'repo-pull');
    initBareOrigin(originDir);
    initGitRepo(repoDir, originDir);

    // Simulate a new commit on origin by cloning, committing, and pushing
    const otherClone = path.join(TMP, 'other-clone');
    execFileSync('git', ['clone', originDir, otherClone], { stdio: 'pipe' });
    execFileSync('git', ['-C', otherClone, 'config', 'user.email', 'test@test.com'], { stdio: 'pipe' });
    execFileSync('git', ['-C', otherClone, 'config', 'user.name', 'Test'], { stdio: 'pipe' });
    execFileSync('git', ['-C', otherClone, 'config', 'core.hooksPath', '/dev/null'], { stdio: 'pipe' });
    writeFileSync(path.join(otherClone, 'new.txt'), 'from origin');
    execFileSync('git', ['-C', otherClone, 'add', 'new.txt'], { stdio: 'pipe' });
    execFileSync('git', ['-C', otherClone, 'commit', '-m', 'origin commit'], { stdio: 'pipe' });
    execFileSync('git', ['-C', otherClone, 'push', 'origin', 'main'], { stdio: 'pipe' });

    // repoDir is now behind origin — createWorktree should pull first
    const result = createWorktree(repoDir, 'run-pull', 'agent', DATA);

    assert.ok(existsSync(path.join(result.worktreeDir, 'new.txt')), 'worktree should have the latest origin/main content');

    removeWorktree(repoDir, result.worktreeDir);
  });
});
