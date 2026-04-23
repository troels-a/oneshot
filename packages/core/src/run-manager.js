const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { existsSync, readdirSync, readFileSync, writeFileSync, statSync, rmSync, mkdirSync } = require('fs');
const { rm } = require('fs/promises');
const prepareAgent = require('./prepare-agent');
const resolveCwd = require('./resolve-cwd');
const createRunLogger = require('./run-logger');
const extractResult = require('./extract-result');
const { createWorktree, removeWorktree } = require('./worktree');
const {
  DEFAULT_TIMEOUT_SEC,
  DISPATCH_OPTION_KEYS,
  pickDispatchOptions,
} = require('./dispatch-options');

const MAX_COMPLETED_RUNS = 1000;
const DEFAULT_KILL_GRACE_MS = 10_000;
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'timed_out']);

// Send a signal to a process group, falling back to the single PID if the
// group is gone (or detached spawn was disabled). Swallows ESRCH so callers
// don't have to.
function killGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch {
    try { process.kill(pid, signal); } catch {}
  }
}

class RunManager {
  constructor({ logsDir, agentsDir, dataDir, killGraceMs }) {
    this.logsDir = logsDir;
    this.agentsDir = agentsDir;
    this.dataDir = dataDir || require('./paths').DATA_DIR;
    this.killGraceMs = killGraceMs ?? DEFAULT_KILL_GRACE_MS;
    this.runs = new Map();
    this.processes = new Map();
  }

  getRun(id) {
    const run = this.runs.get(id);
    if (run) return run;
    return this._loadDiskRun(id);
  }

  listRuns(filters = {}) {
    this._loadDiskRuns();
    let runs = Array.from(this.runs.values());
    if (filters.status) runs = runs.filter(r => r.status === filters.status);
    if (filters.agent) runs = runs.filter(r => r.agentName === filters.agent);
    return runs;
  }

  getRunningRun(agentName) {
    for (const run of this.runs.values()) {
      if (run.agentName === agentName && run.status === 'running') {
        return run;
      }
    }
    return null;
  }

  async dispatchRun(agentName, options = {}) {
    const agentDir = path.join(this.agentsDir, agentName);
    const providedArgs = options.args && typeof options.args === 'object' ? options.args : {};
    const cwd = resolveCwd(agentDir, options.path);
    const { config, command } = prepareAgent(agentDir, providedArgs, cwd);

    const { id, logDir, stdoutStream, stderrStream } = createRunLogger(this.logsDir);

    let worktreeInfo = null;
    let spawnCwd = cwd;
    if (config.worktree) {
      if (!options.path) {
        throw new Error('worktree agents require a path option pointing to the target repository');
      }
      try {
        worktreeInfo = createWorktree(cwd, id, agentName, this.dataDir, options.branch);
        spawnCwd = worktreeInfo.worktreeDir;
      } catch (err) {
        stdoutStream.destroy();
        stderrStream.destroy();
        throw err;
      }
    }

    // Persist every known dispatch option (null when unset) so the on-disk
    // run record stays uniform as new options are added to the schema.
    const persistedOptions = {};
    for (const key of DISPATCH_OPTION_KEYS) {
      persistedOptions[key] = options[key] ?? null;
    }
    persistedOptions.args = Object.keys(providedArgs).length ? providedArgs : null;
    // Apply default timeout (every run gets a wall-clock ceiling).
    if (persistedOptions.timeout == null) {
      persistedOptions.timeout = DEFAULT_TIMEOUT_SEC;
    }

    const run = {
      id,
      agentName,
      runtime: config.runtime,
      source: options.source || 'server',
      status: 'pending',
      pid: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      exitCode: null,
      signal: null,
      options: persistedOptions,
      cwd,
      logDir,
      worktree: worktreeInfo ? { dir: worktreeInfo.worktreeDir, branch: worktreeInfo.branch } : null,
      _worktreeRepoRoot: worktreeInfo ? worktreeInfo.repoRoot : null,
    };
    this.runs.set(id, run);

    const { cmd, args } = command;

    const spawnDir = path.join(logDir, 'spawns');
    mkdirSync(spawnDir, { recursive: true });

    const runEnv = {
      ...process.env,
      ONESHOT_SPAWN_DIR: spawnDir,
      ONESHOT_RUN_ID: id,
      ONESHOT_AGENT: agentName,
    };
    if (options.path) runEnv.ONESHOT_PATH = options.path;
    if (worktreeInfo) runEnv.ONESHOT_BRANCH = worktreeInfo.branch;

    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: spawnCwd,
      env: runEnv,
      // Run in its own process group so we can kill any subprocesses the
      // agent spawns by signaling -pgid, not just the immediate child.
      detached: true,
    });

    child.stdout.pipe(stdoutStream);
    child.stderr.pipe(stderrStream);

    run.status = 'running';
    run.pid = child.pid;
    this.processes.set(run.id, child);
    this._persistRun(run);

    // Wall-clock timeout: SIGTERM the process group at `timeout` seconds, then
    // escalate to SIGKILL after `killGraceMs` if the agent ignores SIGTERM.
    let timedOut = false;
    let termTimer;
    let killTimer;
    if (run.options.timeout) {
      termTimer = setTimeout(() => {
        timedOut = true;
        killGroup(child.pid, 'SIGTERM');
        killTimer = setTimeout(() => {
          killGroup(child.pid, 'SIGKILL');
        }, this.killGraceMs);
      }, run.options.timeout * 1000);
    }

    const done = new Promise((resolve) => {
      child.on('close', (code, signal) => {
        if (termTimer) clearTimeout(termTimer);
        if (killTimer) clearTimeout(killTimer);
        run.completedAt = new Date().toISOString();
        run.exitCode = code;
        run.signal = signal || null;
        if (timedOut) {
          run.status = 'timed_out';
        } else {
          run.status = (code === 0) ? 'completed' : 'failed';
        }
        this.processes.delete(run.id);

        // Wait for stdout stream to flush before extracting result
        const extract = () => {
          try {
            const { result, meta } = extractResult(run.logDir, run.runtime);
            run.result = result;
            run.resultMeta = meta;
          } catch {
            run.result = null;
            run.resultMeta = null;
          }

          command.cleanup?.();
          if (run.worktree && run._worktreeRepoRoot) {
            try { removeWorktree(run._worktreeRepoRoot, run.worktree.dir); } catch {}
          }
          this._persistRun(run);
          this._evictOldRuns();

          // Process spawn requests after cleanup (worktree/branch freed)
          if (run.status === 'completed') {
            this._processSpawns(run, options);
          }

          resolve({ exitCode: code, signal: signal || null });
        };

        if (stdoutStream.writableFinished) {
          extract();
        } else {
          stdoutStream.on('finish', extract);
        }
      });

      child.on('error', (err) => {
        if (termTimer) clearTimeout(termTimer);
        if (killTimer) clearTimeout(killTimer);
        run.status = 'failed';
        run.completedAt = new Date().toISOString();
        this.processes.delete(run.id);
        if (run.worktree && run._worktreeRepoRoot) {
          try { removeWorktree(run._worktreeRepoRoot, run.worktree.dir); } catch {}
        }
        this._persistRun(run);
        resolve({ exitCode: null, signal: null, error: err });
      });
    });

    return { run, child, done };
  }

  _persistRun(run) {
    const filePath = path.join(run.logDir, 'run.json');
    const { _worktreeRepoRoot, ...serializable } = run;
    writeFileSync(filePath, JSON.stringify(serializable, null, 2));
  }

  _loadDiskRun(id) {
    const dir = path.join(this.logsDir, id);
    const filePath = existsSync(path.join(dir, 'run.json'))
      ? path.join(dir, 'run.json')
      : path.join(dir, 'job.json');
    try {
      const run = JSON.parse(readFileSync(filePath, 'utf8'));
      if (run.status === 'running') this._checkPidAlive(run);
      this.runs.set(id, run);
      return run;
    } catch {
      return null;
    }
  }

  _loadDiskRuns() {
    let entries;
    try {
      entries = readdirSync(this.logsDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const id = entry.name;
      const existing = this.runs.get(id);
      if (existing && TERMINAL_STATUSES.has(existing.status)) continue;
      const dir = path.join(this.logsDir, id);
      const filePath = existsSync(path.join(dir, 'run.json'))
        ? path.join(dir, 'run.json')
        : path.join(dir, 'job.json');
      try {
        const run = JSON.parse(readFileSync(filePath, 'utf8'));
        if (run.status === 'running' && !this.processes.has(id)) {
          this._checkPidAlive(run);
        }
        this.runs.set(id, run);
      } catch {
        // skip directories without valid run.json
      }
    }
  }

  _checkPidAlive(run) {
    try {
      process.kill(run.pid, 0);
    } catch {
      run.status = 'failed';
      run.completedAt = run.completedAt || new Date().toISOString();
      if (run.worktree) {
        try {
          const repoRoot = run._worktreeRepoRoot || execFileSync('git', ['-C', run.worktree.dir, 'rev-parse', '--show-toplevel'], { stdio: 'pipe' }).toString().trim();
          removeWorktree(repoRoot, run.worktree.dir);
        } catch {}
      }
      this._persistRun(run);
    }
  }

  _processSpawns(parentRun, parentOptions) {
    const spawnDir = path.join(parentRun.logDir, 'spawns');
    let files;
    try {
      files = readdirSync(spawnDir).filter(f => f.endsWith('.json'));
    } catch {
      return;
    }
    if (!files.length) return;

    // Build substitution map for $ONESHOT_* env var references that agents
    // may have written literally into spawn files (e.g. claude runtime agents
    // that write JSON via tools instead of shell heredocs).
    const envSubs = {
      $ONESHOT_PATH: parentRun.options?.path,
      $ONESHOT_BRANCH: parentRun.options?.branch || parentRun.worktree?.branch,
      $ONESHOT_RUN_ID: parentRun.id,
      $ONESHOT_AGENT: parentRun.agentName,
    };

    const spawned = [];
    for (const file of files) {
      try {
        const raw = readFileSync(path.join(spawnDir, file), 'utf8');
        // Substitute $ONESHOT_* references before parsing
        const resolved = raw.replace(/\$ONESHOT_\w+/g, (match) =>
          envSubs[match] != null ? envSubs[match] : match
        );
        const req = JSON.parse(resolved);
        if (!req.agent) continue;
        const opts = {
          ...pickDispatchOptions(req),
          source: 'spawn',
        };
        this.dispatchRun(req.agent, opts)
          .then(({ run: spawnedRun }) => {
            spawnedRun.spawnedBy = parentRun.id;
            this._persistRun(spawnedRun);
          })
          .catch((err) => {
            console.error(`[spawn] failed to dispatch ${req.agent} from ${parentRun.id}: ${err.message}`);
          });
        spawned.push({ agent: req.agent, file });
      } catch {}
    }
    if (spawned.length) {
      parentRun.spawned = spawned.map(s => s.agent);
      this._persistRun(parentRun);
    }
  }

  _evictOldRuns() {
    const completed = Array.from(this.runs.values())
      .filter(r => r.status !== 'running' && r.status !== 'pending');
    if (completed.length <= MAX_COMPLETED_RUNS) return;

    completed.sort((a, b) => (a.completedAt || a.startedAt).localeCompare(b.completedAt || b.startedAt));
    const toRemove = completed.length - MAX_COMPLETED_RUNS;
    for (let i = 0; i < toRemove; i++) {
      this.runs.delete(completed[i].id);
    }
  }

  cleanupLogs(maxAgeMs) {
    const cutoff = Date.now() - (maxAgeMs || 7 * 24 * 60 * 60 * 1000);
    let entries;
    try {
      entries = readdirSync(this.logsDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = path.join(this.logsDir, entry.name);
      const stat = statSync(dirPath);
      if (stat.mtimeMs < cutoff) {
        rmSync(dirPath, { recursive: true, force: true });
      }
    }
  }

  async clearRuns() {
    this._loadDiskRuns();
    const toClear = [];
    for (const [id, run] of this.runs) {
      if (run.status === 'running' || run.status === 'pending') continue;
      toClear.push({ id, logDir: run.logDir });
    }
    await Promise.all(
      toClear.map(({ id, logDir }) =>
        (logDir ? rm(logDir, { recursive: true, force: true }).catch(() => {}) : Promise.resolve())
          .then(() => this.runs.delete(id))
      )
    );
    return toClear.length;
  }

  stopRun(id) {
    const run = this.getRun(id);
    if (!run) return { error: 'not_found' };
    if (run.status !== 'running') return { error: 'not_running' };

    const child = this.processes.get(id);
    if (child && child.pid) {
      killGroup(child.pid, 'SIGTERM');
    } else if (run.pid) {
      killGroup(run.pid, 'SIGTERM');
    }

    return { ok: true };
  }

  shutdownAll() {
    for (const [, child] of this.processes) {
      if (child.pid) killGroup(child.pid, 'SIGTERM');
    }
  }
}

module.exports = RunManager;
module.exports.TERMINAL_STATUSES = TERMINAL_STATUSES;
