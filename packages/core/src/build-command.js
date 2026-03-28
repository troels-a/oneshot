const path = require('path');

function argsToFlags(args) {
  const flags = [];
  for (const [key, value] of Object.entries(args)) {
    flags.push(`--${key}`, String(value));
  }
  return flags;
}

function buildCommand(entrypoint, agentDir, renderedPrompt, args) {
  switch (entrypoint) {
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
      throw new Error(`Unknown entrypoint: ${entrypoint}`);
  }
}

module.exports = buildCommand;
