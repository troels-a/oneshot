const { buildPromptEditor, normalizeOptionFields } = require('./utils');

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
    description: 'Expose Codex web search during the run.',
    type: 'boolean',
    default: false,
  },
  {
    name: 'bypassApprovalsAndSandbox',
    label: 'Bypass Sandbox',
    description: 'Run without approval prompts or sandboxing. Only use inside an external sandbox.',
    type: 'boolean',
    default: false,
  },
];

module.exports = {
  name: 'codex',
  label: 'Codex',
  editor: buildPromptEditor(
    'Prompt',
    'Supports {{ args.* }} and {{ commands.* }} templates',
    'Enter the agent prompt...'
  ),
  runtimeOptions,
  normalizeRuntimeOptions(options = {}) {
    return normalizeOptionFields(runtimeOptions, options);
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
