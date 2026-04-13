const { buildPromptEditor, normalizeOptionFields, checkBinary } = require('./utils');

const runtimeOptions = [
  {
    name: 'approvalPolicy',
    label: 'Approval Policy',
    description: 'When Codex should request approval before executing commands.',
    type: 'select',
    default: 'never',
    options: [
      { value: 'never', label: 'never' },
      { value: 'on-request', label: 'on-request' },
      { value: 'on-failure', label: 'on-failure' },
      { value: 'untrusted', label: 'untrusted' },
    ],
  },
  {
    name: 'sandboxMode',
    label: 'Sandbox Mode',
    description: 'How much filesystem/process access Codex gets for shell commands.',
    type: 'select',
    default: 'workspace-write',
    options: [
      { value: 'read-only', label: 'read-only' },
      { value: 'workspace-write', label: 'workspace-write' },
      { value: 'danger-full-access', label: 'danger-full-access' },
    ],
  },
  {
    name: 'webSearch',
    label: 'Enable Web Search',
    description: 'Enable web search',
    type: 'boolean',
    default: false,
  },
  {
    name: 'bypassApprovalsAndSandbox',
    label: 'Bypass Sandbox',
    description: 'Bypass sandbox',
    type: 'boolean',
    default: false,
  },
];

module.exports = {
  name: 'codex',
  label: 'Codex',
  async checkAvailability() {
    return checkBinary('codex');
  },
  editor: buildPromptEditor(
    'Prompt',
    'Supports {{ args.* }} and {{ commands.* }} templates',
    'Enter the agent prompt...'
  ),
  runtimeOptions,
  normalizeRuntimeOptions(options = {}) {
    return normalizeOptionFields(runtimeOptions, options);
  },
  extractResult(content) {
    const lines = content.trimEnd().split('\n');
    let result = null;
    let meta = null;

    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const obj = JSON.parse(lines[i]);
        if (!meta && obj.type === 'turn.completed' && obj.usage) {
          meta = {
            input_tokens: obj.usage.input_tokens ?? null,
            cached_input_tokens: obj.usage.cached_input_tokens ?? null,
            output_tokens: obj.usage.output_tokens ?? null,
          };
        }
        if (!result && obj.type === 'item.completed' && obj.item?.type === 'agent_message' && obj.item.text) {
          result = obj.item.text;
        }
        if (result && meta) {
          return { result, meta };
        }
      } catch {
        continue;
      }
    }

    return { result, meta };
  },
  buildCommand({ renderedPrompt, runtimeOptions: providedOptions = {} }) {
    const options = this.normalizeRuntimeOptions(providedOptions);
    const args = [];

    if (options.bypassApprovalsAndSandbox) {
      args.push('--dangerously-bypass-approvals-and-sandbox');
    } else {
      args.push('-a', options.approvalPolicy);
    }

    if (options.webSearch) {
      args.push('--search');
    }

    args.push('exec', '--skip-git-repo-check', '--json', '-s', options.sandboxMode);

    args.push(renderedPrompt);

    return {
      cmd: 'codex',
      args,
    };
  },
};
