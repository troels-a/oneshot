const { buildPromptEditor } = require('./utils');

module.exports = {
  name: 'claude',
  label: 'Claude',
  editor: buildPromptEditor(
    'Prompt',
    'Supports {{ args.* }} and {{ commands.* }} templates',
    'Enter the agent prompt...'
  ),
  runtimeOptions: [],
  normalizeRuntimeOptions() {
    return {};
  },
  buildCommand({ renderedPrompt }) {
    return {
      cmd: 'claude',
      args: ['-p', renderedPrompt, '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose'],
    };
  },
  extractResult(content) {
    const lines = content.trimEnd().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const obj = JSON.parse(lines[i]);
        if (obj.type === 'result') {
          return {
            result: obj.result || null,
            meta: {
              cost: obj.total_cost_usd ?? null,
              duration_ms: obj.duration_ms ?? null,
              num_turns: obj.num_turns ?? null,
              is_error: obj.is_error ?? false,
            },
          };
        }
      } catch {
        continue;
      }
    }
    return { result: null, meta: null };
  },
};
