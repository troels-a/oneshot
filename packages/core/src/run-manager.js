const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { readdirSync, readFileSync, rmSync, mkdirSync } = require('fs');
const { rm } = require('fs/promises');
const prepareAgent = require('./prepare-agent');
const resolveCwd = require('./resolve-cwd');
const createRunLogWriter = require('./run-log-writer');
const extractResult = require('./extract-result');
const { createWorktree, removeWorktree } = require('./worktree');
const { createRepos } = require('./db');
const {
  DEFAULT_TIMEOUT_SEC,
  DISPATCH_OPTION_KEYS,
  pickDispatchOptions,
} = require('./dispatch-options');
const { RUN_STATUS, TERMINAL_STATUSES } = require('./constants');

const DEFAULT_KILL_GRACE_MS = 10_000;

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
  constructor({ db, logsDir, agentsDir, dataDir, killGraceMs }) {
    if (!db) throw new Error('RunManager requires a db connection');
    this.db = db;
    const repos = createRepos(db);
    this._runs = repos.runs;
    this._logs = repos.logs;
    this.logsDir = logsDir;
    this.agentsDir = agentsDir;
    this.dataDir = dataDir || require('./paths').DATA_DIR;
    this.killGraceMs = killGraceMs ?? DEFAULT_KILL_GRACE_MS;
    this.runs = new Map();
    this.processes = new Map();
    this._worktreeRepoRoots = new Map();
  }

  getRun(id) {
    return this.runs.get(id) || this._runs.getRun(id);
  }

  listRuns(filters = {}) {
    const dbRuns = this._runs.listRuns(filters);
    if (!this.runs.size) return dbRuns;
    return dbRuns.map((row) => this.runs.get(row.id) || row);
  }

  countRuns(filters = {}) {
    return this._runs.countRuns(filters);
  }

  countRunsByStatus() {
    return this._runs.countRunsByStatus();
  }

  countRunsByAgent() {
    return this._runs.countRunsByAgent();
  }

  getRunningRun(agentName) {
    for (const run of this.runs.values()) {
      if (run.agentName === agentName && run.status === RUN_STATUS.RUNNING) return run;
    }
    return this._runs.getRunningRunByAgent(agentName);
  }

  // Called at server boot. Marks dead PIDs as failed.
  recoverInflightRuns() {
    for (const run of this._runs.listRunningRuns()) {
      this._checkPidAlive(run);
    }
  }

  // Log accessors — routes go through these instead of reaching into the repo.
  getLogSummary(runId) {
    const stdout = this._logs.getMaxLineNumber(runId, 'stdout');
    const stderr = this._logs.getMaxLineNumber(runId, 'stderr');
    return { stdout, stderr };
  }

  getLogLines(runId, stream, opts) {
    return this._logs.getLogLines(runId, stream, opts);
  }

  getLogLinesAfter(runId, stream, after) {
    return this._logs.getLogLinesAfter(runId, stream, after);
  }

  async dispatchRun(agentName, options = {}) {
    const agentDir = path.join(this.agentsDir, agentName);
    const providedArgs = options.args && typeof options.args === 'object' ? options.args : {};
    const cwd = resolveCwd(agentDir, options.path);
    const { config, command } = prepareAgent(agentDir, providedArgs, cwd);

    // Validate worktree requirements BEFORE creating the log dir / writer,
    // so a misconfigured schedule doesn't litter empty log directories.
    if (config.worktree && !options.path) {
      throw new Error('worktree agents require a path option pointing to the target repository');
    }

    const writer = createRunLogWriter({ logsRepo: this._logs, logsDir: this.logsDir });
    const id = writer.id;
    const logDir = writer.logDir;

    let worktreeInfo = null;
    let spawnCwd = cwd;
    if (config.worktree) {
      try {
        worktreeInfo = createWorktree(cwd, id, agentName, this.dataDir, options.branch);
        spawnCwd = worktreeInfo.worktreeDir;
      } catch (err) {
        // Safe to destroy without finalizing: nothing has been piped to the
        // writer yet, so its line buffer is provably empty.
        writer.stdout.destroy();
        writer.stderr.destroy();
        try { rmSync(logDir, { recursive: true, force: true }); } catch {}
        throw err;
      }
    }

    const persistedOptions = {};
    for (const key of DISPATCH_OPTION_KEYS) {
      persistedOptions[key] = options[key] ?? null;
    }
    persistedOptions.args = Object.keys(providedArgs).length ? providedArgs : null;
    if (persistedOptions.timeout == null) {
      persistedOptions.timeout = DEFAULT_TIMEOUT_SEC;
    }

    const run = {
      id,
      agentName,
      runtime: config.runtime,
      source: options.source || 'server',
      status: RUN_STATUS.PENDING,
      pid: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      exitCode: null,
      signal: null,
      options: persistedOptions,
      cwd,
      logDir,
      worktree: worktreeInfo ? { dir: worktreeInfo.worktreeDir, branch: worktreeInfo.branch } : null,
      result: null,
      resultMeta: null,
      spawnedBy: null,
    };
    this.runs.set(id, run);
    if (worktreeInfo) this._worktreeRepoRoots.set(id, worktreeInfo.repoRoot);

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

    child.stdout.pipe(writer.stdout);
    child.stderr.pipe(writer.stderr);

    run.status = RUN_STATUS.RUNNING;
    run.pid = child.pid;
    this.processes.set(run.id, child);
    this._runs.insertRun(run);

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
        if (timedOut) run.status = RUN_STATUS.TIMED_OUT;
        else run.status = (code === 0) ? RUN_STATUS.COMPLETED : RUN_STATUS.FAILED;
        this.processes.delete(run.id);

        const extract = () => {
          try {
            const { result, meta } = extractResult(this.db, run.id, run.runtime);
            run.result = result;
            run.resultMeta = meta;
          } catch {
            run.result = null;
            run.resultMeta = null;
          }
          command.cleanup?.();
          this._finalizeRun(run);
          this._runs.updateRunResult(run.id, run.result, run.resultMeta);
          if (run.status === RUN_STATUS.COMPLETED) {
            this._processSpawns(run, options);
          }
          resolve({ exitCode: code, signal: signal || null });
        };

        if (writer.stdout.writableFinished) extract();
        else writer.stdout.on('finish', extract);
      });

      child.on('error', (err) => {
        if (termTimer) clearTimeout(termTimer);
        if (killTimer) clearTimeout(killTimer);
        run.status = RUN_STATUS.FAILED;
        run.completedAt = new Date().toISOString();
        this.processes.delete(run.id);
        this._finalizeRun(run);
        resolve({ exitCode: null, signal: null, error: err });
      });
    });

    return { run, child, done };
  }

  _finalizeRun(run) {
    const repoRoot = this._worktreeRepoRoots.get(run.id);
    if (run.worktree && repoRoot) {
      try { removeWorktree(repoRoot, run.worktree.dir); } catch {}
      this._worktreeRepoRoots.delete(run.id);
    }
    this._runs.updateRunStatus(run.id, {
      status: run.status,
      pid: run.pid,
      completedAt: run.completedAt,
      exitCode: run.exitCode,
      signal: run.signal,
    });
    this.runs.delete(run.id);
  }

  _checkPidAlive(run) {
    try {
      process.kill(run.pid, 0);
    } catch {
      run.status = RUN_STATUS.FAILED;
      run.completedAt = run.completedAt || new Date().toISOString();
      if (run.worktree) {
        try {
          const repoRoot = this._worktreeRepoRoots.get(run.id)
            || execFileSync('git', ['-C', run.worktree.dir, 'rev-parse', '--show-toplevel'], { stdio: 'pipe' }).toString().trim();
          removeWorktree(repoRoot, run.worktree.dir);
        } catch {}
        this._worktreeRepoRoots.delete(run.id);
      }
      this._runs.updateRunStatus(run.id, {
        status: run.status,
        pid: run.pid,
        completedAt: run.completedAt,
        exitCode: run.exitCode ?? null,
        signal: run.signal ?? null,
      });
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

    // Spawn JSON written via Claude tools (not shell heredocs) lands here
    // with literal $ONESHOT_* refs that need substitution.
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
            this._runs.setSpawnedBy(spawnedRun.id, parentRun.id);
          })
          .catch((err) => {
            console.error(`[spawn] failed to dispatch ${req.agent} from ${parentRun.id}: ${err.message}`);
          });
        spawned.push({ agent: req.agent, file });
      } catch {}
    }
    if (spawned.length) {
      const names = spawned.map((s) => s.agent);
      parentRun.spawned = names;
      this._runs.setSpawned(parentRun.id, names);
    }
  }

  cleanupLogs(maxAgeMs) {
    let cutoffMs;
    if (maxAgeMs != null) {
      cutoffMs = maxAgeMs;
    } else if (process.env.ONESHOT_RUN_RETENTION_DAYS) {
      const days = parseFloat(process.env.ONESHOT_RUN_RETENTION_DAYS);
      if (!Number.isFinite(days) || days <= 0) return;
      cutoffMs = days * 24 * 60 * 60 * 1000;
    } else {
      return;
    }

    const cutoffIso = new Date(Date.now() - cutoffMs).toISOString();
    const { logDirs } = this._runs.deleteRunsOlderThan(cutoffIso);
    for (const dir of logDirs) {
      try { rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  }

  async clearRuns() {
    const { logDirs } = this._runs.deleteCompletedRuns();
    await Promise.all(
      logDirs.map((dir) => rm(dir, { recursive: true, force: true }).catch(() => {}))
    );
    return logDirs.length;
  }

  stopRun(id) {
    const run = this.getRun(id);
    if (!run) return { error: 'not_found' };
    if (run.status !== RUN_STATUS.RUNNING) return { error: 'not_running' };

    const child = this.processes.get(id);
    if (child && child.pid) killGroup(child.pid, 'SIGTERM');
    else if (run.pid) killGroup(run.pid, 'SIGTERM');

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
