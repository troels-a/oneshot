const path = require('path');
const os = require('os');
const { writeFileSync, unlinkSync } = require('fs');

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

    case 'codex':
      return {
        cmd: 'codex',
        args: ['exec', '--skip-git-repo-check', '--full-auto', '--json', renderedPrompt],
      };

    case 'node': {
      const tmpFile = path.join(os.tmpdir(), `oneshot-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);
      writeFileSync(tmpFile, renderedPrompt);
      return {
        cmd: 'node',
        args: [tmpFile, ...argsToFlags(args)],
        cleanup: () => { try { unlinkSync(tmpFile); } catch {} },
      };
    }

    case 'bash': {
      const tmpFile = path.join(os.tmpdir(), `oneshot-${Date.now()}-${Math.random().toString(36).slice(2)}.sh`);
      writeFileSync(tmpFile, renderedPrompt);
      return {
        cmd: 'bash',
        args: [tmpFile, ...argsToFlags(args)],
        cleanup: () => { try { unlinkSync(tmpFile); } catch {} },
      };
    }

    default:
      throw new Error(`Unknown runtime: ${runtime}`);
  }
}

module.exports = buildCommand;
