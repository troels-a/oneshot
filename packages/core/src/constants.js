const RUN_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  TIMED_OUT: 'timed_out',
});

const TERMINAL_STATUSES = new Set([RUN_STATUS.COMPLETED, RUN_STATUS.FAILED, RUN_STATUS.TIMED_OUT]);

const RUN_SOURCE = Object.freeze({
  SERVER: 'server',
  CLI: 'cli',
  SPAWN: 'spawn',
});

const SCHEDULE_RESULT = Object.freeze({
  DISPATCHED: 'dispatched',
  SKIPPED: 'skipped',
  ERROR: 'error',
});

const STREAM = Object.freeze({
  STDOUT: 'stdout',
  STDERR: 'stderr',
});

const STREAM_FILENAMES = Object.freeze({
  stdout: 'stdout.log',
  stderr: 'stderr.log',
});

function streamForFilename(filename) {
  if (filename === STREAM_FILENAMES.stdout) return STREAM.STDOUT;
  if (filename === STREAM_FILENAMES.stderr) return STREAM.STDERR;
  return null;
}

module.exports = {
  RUN_STATUS,
  TERMINAL_STATUSES,
  RUN_SOURCE,
  SCHEDULE_RESULT,
  STREAM,
  STREAM_FILENAMES,
  streamForFilename,
};
