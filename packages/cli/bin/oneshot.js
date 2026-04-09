#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });
const { discoverAgents, parseAgentMd, RunManager, Scheduler, resolveAgentsDir, resolveLogsDir, DATA_DIR } = require('@oneshot/core');

const agentsDir = resolveAgentsDir();
const schedulesFile = path.join(DATA_DIR, 'schedules.json');
const [,, command, ...rest] = process.argv;

if (!command || command === 'help' || command === '--help') {
  console.log(`Usage:
  oneshot list                         List available agents
  oneshot info <agent>                 Show agent details
  oneshot run <agent> [--key=value] [--path=dir]    Run an agent
  oneshot schedule <agent> <cron>      Create a schedule for an agent
  oneshot schedules                    List all schedules
  oneshot clear                        Clear completed and failed runs`);
  process.exit(0);
}

if (command === 'list') {
  const agents = discoverAgents(agentsDir);
  if (!agents.length) {
    console.log('No agents found in', agentsDir);
    process.exit(0);
  }
  const nameWidth = Math.max(...agents.map(a => a.name.length), 4);
  console.log('NAME'.padEnd(nameWidth + 2) + 'RUNTIME');
  for (const agent of agents) {
    console.log(agent.name.padEnd(nameWidth + 2) + agent.config.runtime);
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
    console.log(`Runtime: ${config.runtime}`);
    console.log(`Worktree: ${config.worktree}`);
    if (config.runtimeOptions && Object.keys(config.runtimeOptions).length) {
      console.log('\nRuntime options:');
      for (const [key, value] of Object.entries(config.runtimeOptions)) {
        console.log(`  ${key}: ${value}`);
      }
    }
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

if (command === 'clear') {
  const manager = new RunManager({ logsDir: resolveLogsDir(), agentsDir });
  const runs = manager.listRuns({});
  const clearable = runs.filter(r => r.status !== 'running' && r.status !== 'pending');

  if (clearable.length === 0) {
    console.log('No completed or failed runs to clear.');
    process.exit(0);
  }

  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(`Clear ${clearable.length} completed/failed runs? (y/n) `, async (answer) => {
    rl.close();
    if (answer.toLowerCase() !== 'y') {
      console.log('Cancelled.');
      process.exit(0);
    }
    const cleared = await manager.clearRuns();
    console.log(`Cleared ${cleared} runs.`);
    process.exit(0);
  });
} else if (command === 'run') {
  const name = rest[0];
  if (!name) { console.error('Usage: oneshot run <agent> [--key=value ...]'); process.exit(1); }

  // Parse --key=value and --key value pairs
  const providedArgs = {};
  let timeout = null;
  let runPath = null;
  for (let i = 1; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      let key, value;
      if (eqIndex !== -1) {
        key = arg.slice(2, eqIndex);
        value = arg.slice(eqIndex + 1);
      } else {
        key = arg.slice(2);
        value = rest[++i] || '';
      }
      if (key === 'timeout') { timeout = Number(value); }
      else if (key === 'path') { runPath = value; }
      else { providedArgs[key] = value; }
    }
  }

  (async () => {
    const manager = new RunManager({ logsDir: resolveLogsDir(), agentsDir });
    const { run, child, done } = await manager.dispatchRun(name, {
      args: providedArgs,
      timeout,
      path: runPath,
      source: 'cli',
    });

    process.stderr.write(`[oneshot] Run ${run.id} \u2014 logs: ${run.logDir}\n`);

    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);

    const result = await done;
    process.exit(result.exitCode ?? 1);
  })().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
} else if (command === 'schedule') {
  const name = rest[0];
  const cronExpr = rest[1];
  if (!name || !cronExpr) {
    console.error('Usage: oneshot schedule <agent> "<cron>"');
    process.exit(1);
  }

  const agents = discoverAgents(agentsDir);
  if (!agents.find(a => a.name === name)) {
    console.error(`Agent not found: ${name}`);
    process.exit(1);
  }

  const manager = new RunManager({ logsDir: resolveLogsDir(), agentsDir });
  const scheduler = new Scheduler({ runManager: manager, schedulesFile, agentsDir });
  scheduler.loadFromDisk();

  const schedule = scheduler.createSchedule(name, { cron: cronExpr });
  scheduler.stopAll();
  console.log(`Schedule ${schedule.id} created for ${name} with cron "${cronExpr}"`);
  process.exit(0);

} else if (command === 'schedules') {
  const manager = new RunManager({ logsDir: resolveLogsDir(), agentsDir });
  const scheduler = new Scheduler({ runManager: manager, schedulesFile, agentsDir });
  scheduler.loadFromDisk();

  const agents = discoverAgents(agentsDir);
  const all = agents.flatMap(a => scheduler.listSchedules(a.name));
  scheduler.stopAll();

  if (!all.length) {
    console.log('No schedules found.');
    process.exit(0);
  }

  const nameWidth = Math.max(...all.map(s => s.agent.length), 5);
  const cronWidth = Math.max(...all.map(s => s.cron.length), 4);
  console.log('AGENT'.padEnd(nameWidth + 2) + 'CRON'.padEnd(cronWidth + 2) + 'ENABLED');
  for (const s of all) {
    console.log(s.agent.padEnd(nameWidth + 2) + s.cron.padEnd(cronWidth + 2) + (s.enabled ? 'Yes' : 'No'));
  }
  process.exit(0);

} else {
  console.error(`Unknown command: ${command}. Run "oneshot help" for usage.`);
  process.exit(1);
}
