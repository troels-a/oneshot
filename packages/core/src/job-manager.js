const { randomUUID } = require('crypto');
const path = require('path');
const { spawn } = require('child_process');
const { mkdirSync, readdirSync, statSync, rmSync, createWriteStream } = require('fs');
const prepareAgent = require('./prepare-agent');
const resolveCwd = require('./resolve-cwd');

const MAX_COMPLETED_JOBS = 1000;

class JobManager {
  constructor({ logsDir, agentsDir }) {
    this.logsDir = logsDir;
    this.agentsDir = agentsDir;
    this.jobs = new Map();
    this.processes = new Map();
  }

  getJob(id) {
    return this.jobs.get(id);
  }

  listJobs(filters = {}) {
    let jobs = Array.from(this.jobs.values());
    if (filters.status) jobs = jobs.filter(j => j.status === filters.status);
    if (filters.agent) jobs = jobs.filter(j => j.agentName === filters.agent);
    return jobs;
  }

  getRunningJob(agentName) {
    for (const job of this.jobs.values()) {
      if (job.agentName === agentName && job.status === 'running') {
        return job;
      }
    }
    return null;
  }

  async dispatchJob(agentName, options = {}) {
    const agentDir = path.join(this.agentsDir, agentName);
    const providedArgs = options.args && typeof options.args === 'object' ? options.args : {};
    const cwd = resolveCwd(agentDir, options.path);
    const { config, command } = prepareAgent(agentDir, providedArgs, cwd);

    const id = randomUUID();
    const job = {
      id,
      agentName,
      entrypoint: config.entrypoint,
      status: 'pending',
      pid: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      exitCode: null,
      signal: null,
      options: {
        timeout: options.timeout ?? null,
        args: Object.keys(providedArgs).length ? providedArgs : null,
        path: options.path ?? null,
      },
      logDir: path.join(this.logsDir, id),
    };
    this.jobs.set(id, job);

    mkdirSync(job.logDir, { recursive: true });

    const { cmd, args } = command;
    const stdoutStream = createWriteStream(path.join(job.logDir, 'stdout.log'));
    const stderrStream = createWriteStream(path.join(job.logDir, 'stderr.log'));

    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd,
    });

    child.stdout.pipe(stdoutStream);
    child.stderr.pipe(stderrStream);

    job.status = 'running';
    job.pid = child.pid;
    this.processes.set(job.id, child);

    let timer;
    if (job.options.timeout) {
      timer = setTimeout(() => child.kill('SIGTERM'), job.options.timeout * 1000);
    }

    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      job.completedAt = new Date().toISOString();
      job.exitCode = code;
      job.signal = signal || null;
      job.status = (code === 0) ? 'completed' : 'failed';
      this.processes.delete(job.id);
      this._evictOldJobs();
    });

    child.on('error', () => {
      if (timer) clearTimeout(timer);
      job.status = 'failed';
      job.completedAt = new Date().toISOString();
      this.processes.delete(job.id);
    });

    return job;
  }

  _evictOldJobs() {
    const completed = Array.from(this.jobs.values())
      .filter(j => j.status !== 'running' && j.status !== 'pending');
    if (completed.length <= MAX_COMPLETED_JOBS) return;

    completed.sort((a, b) => (a.completedAt || a.startedAt).localeCompare(b.completedAt || b.startedAt));
    const toRemove = completed.length - MAX_COMPLETED_JOBS;
    for (let i = 0; i < toRemove; i++) {
      this.jobs.delete(completed[i].id);
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

  stopJob(id) {
    const job = this.jobs.get(id);
    if (!job) return { error: 'not_found' };
    if (job.status !== 'running') return { error: 'not_running' };

    const child = this.processes.get(id);
    if (child) child.kill('SIGTERM');

    return { ok: true };
  }

  shutdownAll() {
    for (const [, child] of this.processes) {
      child.kill('SIGTERM');
    }
  }
}

module.exports = JobManager;
