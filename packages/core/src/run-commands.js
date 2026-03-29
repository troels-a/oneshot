const { execSync } = require('child_process');
const renderTemplate = require('./render-template');

const COMMAND_TIMEOUT = 30_000;

function runCommands(commands, cwd, args = {}) {
  const results = {};

  for (const { name, run } of commands) {
    const resolvedRun = renderTemplate(run, args, {});
    try {
      results[name] = execSync(resolvedRun, { cwd, timeout: COMMAND_TIMEOUT, encoding: 'utf8' }).trimEnd();
    } catch (err) {
      results[name] = err.stdout ? String(err.stdout).trimEnd() : `[command failed: ${err.message}]`;
    }
  }

  return results;
}

module.exports = runCommands;
