const { readFileSync } = require('fs');
const YAML = require('yaml');

const VALID_ENTRYPOINTS = new Set(['claude', 'node', 'bash']);

function parseAgentMd(filePath) {
  const raw = readFileSync(filePath, 'utf8');

  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`Invalid agent.md: missing frontmatter delimiters in ${filePath}`);
  }

  const frontmatter = YAML.parse(match[1]);
  const body = match[2];

  if (!frontmatter || !frontmatter.entrypoint) {
    throw new Error(`Invalid agent.md: missing entrypoint in ${filePath}`);
  }

  if (!VALID_ENTRYPOINTS.has(frontmatter.entrypoint)) {
    throw new Error(`Invalid entrypoint "${frontmatter.entrypoint}" in ${filePath}. Must be one of: ${[...VALID_ENTRYPOINTS].join(', ')}`);
  }

  const args = Array.isArray(frontmatter.args) ? frontmatter.args.map(arg => {
    if (typeof arg === 'string') return { name: arg };
    return arg;
  }) : [];

  const commands = Array.isArray(frontmatter.commands) ? frontmatter.commands : [];

  return {
    entrypoint: frontmatter.entrypoint,
    args,
    commands,
    body,
  };
}

module.exports = parseAgentMd;
