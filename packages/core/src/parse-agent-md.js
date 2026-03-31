const { readFileSync } = require('fs');
const YAML = require('yaml');

const VALID_RUNTIMES = new Set(['claude', 'node', 'bash']);

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

  if (!VALID_RUNTIMES.has(runtime)) {
    throw new Error(`Invalid runtime "${runtime}" in ${filePath}. Must be one of: ${[...VALID_RUNTIMES].join(', ')}`);
  }

  const args = Array.isArray(frontmatter.args) ? frontmatter.args.map(arg => {
    if (typeof arg === 'string') return { name: arg };
    return arg;
  }) : [];

  const commands = Array.isArray(frontmatter.commands) ? frontmatter.commands : [];
  const worktree = frontmatter.worktree === true;

  return {
    runtime,
    args,
    commands,
    body,
    worktree,
  };
}

module.exports = parseAgentMd;
