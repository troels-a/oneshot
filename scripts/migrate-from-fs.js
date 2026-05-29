#!/usr/bin/env node
// Backfill SQLite from the legacy filesystem layout.
//
//   .oneshot/schedules.json       -> schedules table
//   .oneshot/logs/<id>/run.json   -> runs table
//   .oneshot/logs/<id>/stdout.log -> log_lines (stream='stdout')
//   .oneshot/logs/<id>/stderr.log -> log_lines (stream='stderr')
//
// Idempotent: INSERT OR IGNORE on every row. Re-running resumes cleanly.
// Legacy files are left in place; the user can remove them after verification.
//
// Flags:
//   --auto      Silent if nothing to migrate. Exit 0 either way.
//   --verbose   Per-run progress.
//   --dry-run   Report counts; no writes.

const path = require('path');
const { existsSync, readFileSync, readdirSync, statSync, createReadStream } = require('fs');
const { createInterface } = require('readline');
const { openDb, createRepos } = require('../packages/core/src/db');

const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.ONESHOT_DATA_DIR
  ? path.resolve(process.env.ONESHOT_DATA_DIR)
  : path.join(REPO_ROOT, '.oneshot');
const LOGS_DIR = path.join(DATA_DIR, 'logs');
const SCHEDULES_FILE = path.join(DATA_DIR, 'schedules.json');

const BATCH_SIZE = 500;

const args = new Set(process.argv.slice(2));
const AUTO = args.has('--auto');
const VERBOSE = args.has('--verbose');
const DRY_RUN = args.has('--dry-run');

function log(...a) { if (!AUTO || VERBOSE) console.log(...a); }
function verbose(...a) { if (VERBOSE) console.log(...a); }

function hasLegacyData() {
  if (existsSync(SCHEDULES_FILE)) return true;
  if (!existsSync(LOGS_DIR)) return false;
  for (const entry of readdirSync(LOGS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const runJson = path.join(LOGS_DIR, entry.name, 'run.json');
    const jobJson = path.join(LOGS_DIR, entry.name, 'job.json');
    if (existsSync(runJson) || existsSync(jobJson)) return true;
  }
  return false;
}

async function streamLines(filePath, onBatch) {
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let batch = [];
  let total = 0;
  for await (const line of rl) {
    batch.push(line);
    if (batch.length >= BATCH_SIZE) {
      await onBatch(batch);
      total += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    await onBatch(batch);
    total += batch.length;
  }
  return total;
}

function loadSchedules() {
  if (!existsSync(SCHEDULES_FILE)) return [];
  let raw;
  try {
    raw = JSON.parse(readFileSync(SCHEDULES_FILE, 'utf8'));
  } catch (err) {
    log(`  ! could not parse schedules.json: ${err.message}`);
    return [];
  }
  if (!raw.schedules || typeof raw.schedules !== 'object') return [];
  return Object.values(raw.schedules);
}

function listRunDirs() {
  if (!existsSync(LOGS_DIR)) return [];
  return readdirSync(LOGS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(LOGS_DIR, e.name));
}

function readRunJson(dir) {
  const candidates = [path.join(dir, 'run.json'), path.join(dir, 'job.json')];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`invalid JSON at ${file}: ${err.message}`);
    }
  }
  return null;
}

function normalizeRun(raw) {
  if (!raw.id || !raw.agentName || !raw.startedAt) return null;
  return {
    id: raw.id,
    agentName: raw.agentName,
    runtime: raw.runtime ?? null,
    source: raw.source || 'server',
    status: raw.status || 'completed',
    pid: raw.pid ?? null,
    startedAt: raw.startedAt,
    completedAt: raw.completedAt ?? null,
    exitCode: raw.exitCode ?? null,
    signal: raw.signal ?? null,
    options: raw.options || {},
    cwd: raw.cwd ?? null,
    logDir: raw.logDir ?? null,
    worktree: raw.worktree ?? null,
    result: raw.result ?? null,
    resultMeta: raw.resultMeta ?? null,
    spawnedBy: raw.spawnedBy ?? null,
    spawned: Array.isArray(raw.spawned) ? raw.spawned : undefined,
  };
}

async function main() {
  if (!hasLegacyData()) {
    if (!AUTO) log('No legacy filesystem data found at .oneshot/. Nothing to migrate.');
    return;
  }

  if (AUTO) log('Backfilling SQLite from legacy .oneshot/ files...');
  else log(`Backfilling SQLite from ${DATA_DIR}${DRY_RUN ? ' (dry run)' : ''}`);

  const db = openDb(DATA_DIR);
  const { runs, schedules, logs } = createRepos(db);

  let schedulesMigrated = 0;
  let schedulesAlreadyPresent = 0;
  let runsMigrated = 0;
  let runsAlreadyPresent = 0;
  let runsSkipped = 0;
  let logLines = 0;

  // Schedules
  for (const schedule of loadSchedules()) {
    if (!schedule.id || !schedule.agent || !schedule.cron) {
      log(`  ! schedule missing required fields, skipping: ${JSON.stringify(schedule).slice(0, 80)}`);
      continue;
    }
    const normalized = {
      id: schedule.id,
      agent: schedule.agent,
      name: schedule.name ?? null,
      cron: schedule.cron,
      options: schedule.options || {},
      enabled: !!schedule.enabled,
      createdAt: schedule.createdAt || new Date().toISOString(),
      lastRunAt: schedule.lastRunAt ?? null,
      lastRunResult: schedule.lastRunResult ?? null,
      nextRunAt: schedule.nextRunAt ?? null,
    };
    if (DRY_RUN) { schedulesMigrated += 1; continue; }
    const inserted = schedules.insertScheduleOrIgnore(normalized);
    if (inserted) { schedulesMigrated += 1; verbose(`  + schedule ${normalized.id} (${normalized.agent})`); }
    else schedulesAlreadyPresent += 1;
  }

  // Runs + log lines
  for (const dir of listRunDirs()) {
    const id = path.basename(dir);
    let raw;
    try {
      raw = readRunJson(dir);
    } catch (err) {
      log(`  ! ${id}: ${err.message}, skipping`);
      runsSkipped += 1;
      continue;
    }
    if (!raw) { runsSkipped += 1; verbose(`  - ${id}: no run.json, skipping`); continue; }

    const run = normalizeRun(raw);
    if (!run) { runsSkipped += 1; log(`  ! ${id}: missing required fields, skipping`); continue; }

    let inserted;
    if (DRY_RUN) {
      inserted = true;
      runsMigrated += 1;
    } else {
      inserted = runs.insertRunOrIgnore(run);
      if (inserted) { runsMigrated += 1; verbose(`  + run ${run.id} (${run.agentName})`); }
      else runsAlreadyPresent += 1;
    }

    // Log lines — skip if the run already has any lines for this stream.
    for (const [filename, stream] of [['stdout.log', 'stdout'], ['stderr.log', 'stderr']]) {
      const filePath = path.join(dir, filename);
      if (!existsSync(filePath)) continue;
      const size = statSync(filePath).size;
      if (size === 0) continue;

      if (!DRY_RUN && logs.getStreamCount(run.id, stream) > 0) {
        verbose(`    ${filename}: already in DB, skipping`);
        continue;
      }

      let startLine = 0;
      const onBatch = async (batch) => {
        if (DRY_RUN) { logLines += batch.length; return; }
        startLine = logs.appendLogLinesIgnore(run.id, stream, batch, startLine);
        logLines += batch.length;
      };
      try {
        const lineCount = await streamLines(filePath, onBatch);
        verbose(`    ${filename}: ${lineCount} lines`);
      } catch (err) {
        log(`  ! ${id}/${filename}: ${err.message}`);
      }
    }
  }

  log('');
  log(`Schedules: ${schedulesMigrated} migrated, ${schedulesAlreadyPresent} already present`);
  log(`Runs:      ${runsMigrated} migrated, ${runsAlreadyPresent} already present, ${runsSkipped} skipped`);
  log(`Log lines: ${logLines} inserted`);
  if (!DRY_RUN && (schedulesMigrated || runsMigrated || logLines)) {
    log('');
    log('Legacy files preserved at .oneshot/logs/ and .oneshot/schedules.json — remove manually once verified.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
