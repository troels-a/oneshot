const { readdirSync } = require('fs');
const path = require('path');
const parseAgentMd = require('./parse-agent-md');

function discoverAgents(agentsDir) {
  let entries;
  try {
    entries = readdirSync(agentsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const agents = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;

    try {
      const config = parseAgentMd(path.join(agentsDir, entry.name, 'agent.md'));
      agents.push({ name: entry.name, dir: path.join(agentsDir, entry.name), config });
    } catch {
      // Not a valid agent directory — skip
    }
  }

  return agents;
}

module.exports = discoverAgents;
