const { execSync } = require('child_process');

const COMMAND_TIMEOUT = 30_000;

function runCommands(commands, cwd) {
  const results = {};

  for (const { name, run } of commands) {
    try {
      results[name] = execSync(run, { cwd, timeout: COMMAND_TIMEOUT, encoding: 'utf8' }).trimEnd();
    } catch (err) {
      results[name] = err.stdout ? String(err.stdout).trimEnd() : `[command failed: ${err.message}]`;
    }
  }

  return results;
}

module.exports = runCommands;
