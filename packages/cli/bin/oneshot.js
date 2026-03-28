#!/usr/bin/env node

const path = require('path');
const { spawn } = require('child_process');
const { discoverAgents, parseAgentMd, prepareAgent, resolveAgentsDir } = require('@oneshot/core');

const agentsDir = resolveAgentsDir();
const [,, command, ...rest] = process.argv;

if (!command || command === 'help' || command === '--help') {
  console.log(`Usage:
  oneshot list                         List available agents
  oneshot info <agent>                 Show agent details
  oneshot run <agent> [--key=value]    Run an agent`);
  process.exit(0);
}

if (command === 'list') {
  const agents = discoverAgents(agentsDir);
  if (!agents.length) {
    console.log('No agents found in', agentsDir);
    process.exit(0);
  }
  const nameWidth = Math.max(...agents.map(a => a.name.length), 4);
  console.log('NAME'.padEnd(nameWidth + 2) + 'ENTRYPOINT');
  for (const agent of agents) {
    console.log(agent.name.padEnd(nameWidth + 2) + agent.config.entrypoint);
  }
  process.exit(0);
}

if (command === 'info') {
  const name = rest[0];
  if (!name) { console.error('Usage: oneshot info <agent>'); process.exit(1); }
  const agentMdPath = path.join(agentsDir, name, 'agent.md');
  try {
    const config = parseAgentMd(agentMdPath);
    console.log(`Agent: ${name}`);
    console.log(`Entrypoint: ${config.entrypoint}`);
    if (config.args.length) {
      console.log('\nArguments:');
      for (const arg of config.args) {
        const parts = [`  ${arg.name}`];
        if (arg.required) parts.push('(required)');
        if (arg.default !== undefined) parts.push(`[default: ${arg.default}]`);
        if (arg.description) parts.push(`- ${arg.description}`);
        console.log(parts.join(' '));
      }
    }
    if (config.commands.length) {
      console.log('\nCommands:');
      for (const cmd of config.commands) {
        console.log(`  ${cmd.name}: ${cmd.run}`);
      }
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  process.exit(0);
}

if (command === 'run') {
  const name = rest[0];
  if (!name) { console.error('Usage: oneshot run <agent> [--key=value ...]'); process.exit(1); }

  // Parse --key=value and --key value pairs
  const providedArgs = {};
  let timeout = null;
  for (let i = 1; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      if (eqIndex !== -1) {
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        if (key === 'timeout') { timeout = Number(value); } else { providedArgs[key] = value; }
      } else {
        const key = arg.slice(2);
        const value = rest[++i] || '';
        if (key === 'timeout') { timeout = Number(value); } else { providedArgs[key] = value; }
      }
    }
  }

  const agentDir = path.join(agentsDir, name);

  try {
    const { command } = prepareAgent(agentDir, providedArgs);

    const child = spawn(command.cmd, command.args, {
      stdio: 'inherit',
      cwd: agentDir,
    });

    if (timeout) {
      setTimeout(() => child.kill('SIGTERM'), timeout * 1000);
    }

    child.on('close', (code) => process.exit(code ?? 1));
    child.on('error', (err) => {
      console.error(`Failed to start: ${err.message}`);
      process.exit(1);
    });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else {
  console.error(`Unknown command: ${command}. Run "oneshot help" for usage.`);
  process.exit(1);
}
