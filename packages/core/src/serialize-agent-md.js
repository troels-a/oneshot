const YAML = require('yaml');

function serializeAgentMd({ runtime, args, commands, body, worktree, multi_instance, runtimeOptions }) {
  const frontmatter = { runtime };

  if (Array.isArray(args) && args.length > 0) {
    frontmatter.args = args;
  }

  if (Array.isArray(commands) && commands.length > 0) {
    frontmatter.commands = commands;
  }

  if (worktree) {
    frontmatter.worktree = true;
  }

  if (multi_instance) {
    frontmatter.multi_instance = true;
  }

  if (runtimeOptions && Object.keys(runtimeOptions).length > 0) {
    frontmatter.runtimeOptions = runtimeOptions;
  }

  const yamlStr = YAML.stringify(frontmatter).trimEnd();
  const normalizedBody = (body || '').replace(/^\n+/, '');

  return `---\n${yamlStr}\n---\n${normalizedBody}\n`;
}

module.exports = serializeAgentMd;
