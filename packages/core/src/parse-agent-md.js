const { readFileSync } = require('fs');
const YAML = require('yaml');
const { isValidRuntime, normalizeRuntimeOptions, listRuntimes } = require('./runtimes');

function parseAgentMd(filePath) {
  const raw = readFileSync(filePath, 'utf8');

  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`Invalid agent.md: missing frontmatter delimiters in ${filePath}`);
  }

  const frontmatter = YAML.parse(match[1]);
  const body = match[2];

  const runtime = frontmatter && (frontmatter.runtime || frontmatter.entrypoint);
  if (!runtime) {
    throw new Error(`Invalid agent.md: missing runtime in ${filePath}`);
  }

  if (!isValidRuntime(runtime)) {
    const validRuntimes = listRuntimes().map(item => item.name);
    throw new Error(`Invalid runtime "${runtime}" in ${filePath}. Must be one of: ${validRuntimes.join(', ')}`);
  }

  const args = Array.isArray(frontmatter.args) ? frontmatter.args.map(arg => {
    if (typeof arg === 'string') return { name: arg };
    return arg;
  }) : [];

  const commands = Array.isArray(frontmatter.commands) ? frontmatter.commands : [];
  const worktree = frontmatter.worktree === true;
  const multi_instance = frontmatter.multi_instance === true;
  const runtimeOptions = normalizeRuntimeOptions(runtime, frontmatter.runtimeOptions || frontmatter.runtime_options || {});

  return {
    runtime,
    args,
    commands,
    body,
    worktree,
    multi_instance,
    runtimeOptions,
  };
}

module.exports = parseAgentMd;
