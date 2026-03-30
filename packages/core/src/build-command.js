const path = require('path');

function argsToFlags(args) {
  const flags = [];
  for (const [key, value] of Object.entries(args)) {
    flags.push(`--${key}`, String(value));
  }
  return flags;
}

function buildCommand(runtime, agentDir, renderedPrompt, args) {
  switch (runtime) {
    case 'claude':
      return {
        cmd: 'claude',
        args: ['-p', renderedPrompt, '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose'],
      };

    case 'node':
      return {
        cmd: 'node',
        args: [path.join(agentDir, 'index.js'), ...argsToFlags(args)],
      };

    case 'bash':
      return {
        cmd: 'bash',
        args: [path.join(agentDir, 'main.sh'), ...argsToFlags(args)],
      };

    default:
      throw new Error(`Unknown runtime: ${runtime}`);
  }
}

module.exports = buildCommand;
