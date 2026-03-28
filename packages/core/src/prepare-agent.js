const path = require('path');
const parseAgentMd = require('./parse-agent-md');
const validateArgs = require('./validate-args');
const runCommands = require('./run-commands');
const renderTemplate = require('./render-template');
const buildCommand = require('./build-command');

function prepareAgent(agentDir, providedArgs = {}) {
  const config = parseAgentMd(path.join(agentDir, 'agent.md'));
  const mergedArgs = validateArgs(config.args, providedArgs);
  const commandResults = runCommands(config.commands, agentDir);
  const renderedPrompt = renderTemplate(config.body, mergedArgs, commandResults);
  const command = buildCommand(config.entrypoint, agentDir, renderedPrompt, mergedArgs);
  return { config, mergedArgs, renderedPrompt, command };
}

module.exports = prepareAgent;
