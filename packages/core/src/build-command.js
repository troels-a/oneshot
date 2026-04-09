const { getRuntime } = require('./runtimes');

function buildCommand(runtimeName, agentDir, renderedPrompt, args, runtimeOptions = {}) {
  const runtime = getRuntime(runtimeName);
  if (!runtime) {
    throw new Error(`Unknown runtime: ${runtimeName}`);
  }

  return runtime.buildCommand({
    agentDir,
    renderedPrompt,
    args,
    runtimeOptions,
  });
}

module.exports = buildCommand;
