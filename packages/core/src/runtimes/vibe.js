const { buildPromptEditor, normalizeOptionFields, checkBinary } = require('./utils');

const DEFAULT_MAX_TURNS = '5';
const TEXT_FIELDS = ['result', 'text', 'message', 'content', 'response', 'output'];
const META_FIELDS = ['turns', 'num_turns', 'cost', 'cost_usd', 'total_cost_usd', 'duration_ms'];

const runtimeOptions = [
  {
    name: 'maxTurns',
    label: 'Max Turns',
    description: 'Maximum assistant turns for the Vibe run.',
    type: 'text',
    default: DEFAULT_MAX_TURNS,
  },
  {
    name: 'agent',
    label: 'Agent',
    description: 'Approval behavior for programmatic Vibe runs.',
    type: 'select',
    default: 'auto-approve',
    options: [
      { value: 'auto-approve', label: 'auto-approve' },
      { value: 'plan', label: 'plan' },
      { value: 'accept-edits', label: 'accept-edits' },
    ],
  },
  {
    name: 'trust',
    label: 'Trust Folder',
    description: 'Temporarily trust the working directory for this invocation.',
    type: 'boolean',
    default: true,
  },
  {
    name: 'enabledTools',
    label: 'Enabled Tools',
    description: 'Comma or newline separated tool names, globs, or re: patterns.',
    type: 'text',
    default: '',
  },
];

function normalizeMaxTurns(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_MAX_TURNS;
  return String(parsed);
}

function normalizeEnabledTools(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }
  if (typeof value !== 'string') return [];
  return value.split(/[,\n]/).map(item => item.trim()).filter(Boolean);
}

function parseJsonLines(content) {
  const objects = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      objects.push(JSON.parse(trimmed));
    } catch {
      continue;
    }
  }
  return objects;
}

function findStringField(value) {
  if (!value || typeof value !== 'object') return null;
  for (const field of TEXT_FIELDS) {
    if (typeof value[field] === 'string' && value[field].trim()) {
      return value[field];
    }
  }
  for (const item of Object.values(value).reverse()) {
    if (item && typeof item === 'object') {
      const found = findStringField(item);
      if (found) return found;
    }
  }
  return null;
}

function collectMeta(value, meta) {
  if (!value || typeof value !== 'object') return false;

  let found = false;
  for (const field of META_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(value, field)) {
      meta[field] = value[field] ?? null;
      found = true;
    }
  }

  for (const item of Object.values(value)) {
    if (item && typeof item === 'object') {
      found = collectMeta(item, meta) || found;
    }
  }

  return found;
}

function extractFromObjects(objects) {
  let result = null;
  let meta = null;

  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (!result) {
      result = findStringField(obj);
    }
    if (!meta) {
      const candidate = Object.fromEntries(META_FIELDS.map(field => [field, null]));
      if (collectMeta(obj, candidate)) {
        meta = candidate;
      }
    }
    if (result && meta) break;
  }

  return { result, meta };
}

module.exports = {
  name: 'vibe',
  label: 'Mistral Vibe',
  editor: buildPromptEditor(
    'Prompt',
    'Supports {{ args.* }} and {{ commands.* }} templates',
    'Enter the Vibe prompt...'
  ),
  async checkAvailability() {
    return checkBinary('vibe');
  },
  runtimeOptions,
  normalizeRuntimeOptions(options = {}) {
    const normalized = normalizeOptionFields(runtimeOptions, options);
    normalized.maxTurns = normalizeMaxTurns(normalized.maxTurns);
    normalized.enabledTools = normalizeEnabledTools(normalized.enabledTools);
    return normalized;
  },
  buildCommand({ renderedPrompt, runtimeOptions: providedOptions = {} }) {
    const options = this.normalizeRuntimeOptions(providedOptions);
    const args = [
      '--prompt',
      renderedPrompt,
      '--max-turns',
      options.maxTurns,
      '--output',
      'json',
      '--agent',
      options.agent,
    ];

    if (options.trust) {
      args.push('--trust');
    }

    for (const tool of options.enabledTools) {
      args.push('--enabled-tools', tool);
    }

    return {
      cmd: 'vibe',
      args,
    };
  },
  extractResult(content) {
    const trimmed = content.trim();
    if (!trimmed) return { result: null, meta: null };

    let objects = [];
    try {
      objects = [JSON.parse(trimmed)];
    } catch {
      objects = parseJsonLines(content);
    }

    if (objects.length > 0) {
      const extracted = extractFromObjects(objects);
      if (extracted.result) return extracted;
      if (extracted.meta) return extracted;
    }

    return { result: trimmed, meta: null };
  },
};
