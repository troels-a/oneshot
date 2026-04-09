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
};
