const { Router } = require('express');
const path = require('path');
const { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } = require('fs');
const { discoverAgents, parseAgentMd, serializeAgentMd, isValidRuntime, listRuntimes, checkRuntimeAvailability } = require('@oneshot/core');
const validateParams = require('../middleware/validate-params');
const { validateBody, coerceDispatchBody } = require('../lib/validate-dispatch-options');

const VALID_NAME = /^[a-zA-Z0-9_-]+$/;

const router = Router();

router.get('/agents', (req, res) => {
  const agents = discoverAgents(req.agentsDir).map(a => ({
    name: a.name,
    runtime: a.config.runtime,
    args: a.config.args,
    worktree: a.config.worktree,
    multi_instance: a.config.multi_instance,
    runtimeOptions: a.config.runtimeOptions,
  }));
  res.json({ agents });
});

router.post('/agents/:agent/dispatch', validateParams, async (req, res, next) => {
  try {
    const { agent } = req.params;
    const manager = req.runManager;

    const body = coerceDispatchBody(req.body || {});
    const errors = validateBody(body);
    if (errors.length) {
      return res.status(400).json({ error: errors.join('; ') });
    }

    const agentMdPath = path.join(req.agentsDir, req.params.agent, 'agent.md');
    const config = parseAgentMd(agentMdPath);

    const runtimeStatus = await checkRuntimeAvailability(config.runtime);
    if (runtimeStatus && !runtimeStatus.available) {
      return res.status(400).json({
        error: `Runtime ${config.runtime} is not available: ${runtimeStatus.reason}`
      });
    }

    if (!config.multi_instance) {
      const existing = manager.getRunningRun(agent);
      if (existing) {
        return res.status(409).json({ error: 'Agent already running', runId: existing.id });
      }
    }

    const { run } = await manager.dispatchRun(agent, body);
    res.status(201).json({ runId: run.id, status: run.status });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Agent not found' });
    }
    if (err.message && err.message.startsWith('Missing required argument:')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.get('/agents/:agent', validateParams, (req, res) => {
  const { agent } = req.params;
  const agentMdPath = path.join(req.agentsDir, agent, 'agent.md');

  if (!existsSync(agentMdPath)) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  const config = parseAgentMd(agentMdPath);
  res.json({
    name: agent,
    runtime: config.runtime,
    args: config.args,
    commands: config.commands,
    body: config.body,
    worktree: config.worktree,
    multi_instance: config.multi_instance,
    runtimeOptions: config.runtimeOptions,
  });
});

router.post('/agents', (req, res) => {
  const { name, runtime, args, commands, body, worktree, multi_instance, runtimeOptions } = req.body;

  if (!name || !VALID_NAME.test(name)) {
    return res.status(400).json({ error: 'Invalid agent name. Must match /^[a-zA-Z0-9_-]+$/' });
  }
  if (!runtime || !isValidRuntime(runtime)) {
    const valid = listRuntimes().map(r => r.name).join(', ');
    return res.status(400).json({ error: `Invalid runtime. Must be one of: ${valid}` });
  }

  const agentDir = path.join(req.agentsDir, name);
  if (existsSync(agentDir)) {
    return res.status(409).json({ error: 'Agent already exists' });
  }

  const content = serializeAgentMd({ runtime, args: args || [], commands: commands || [], body: body || '', worktree: !!worktree, multi_instance: !!multi_instance, runtimeOptions: runtimeOptions || {} });
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(path.join(agentDir, 'agent.md'), content, 'utf8');

  res.status(201).json({ name, runtime, args: args || [], commands: commands || [], body: body || '', worktree: !!worktree, multi_instance: !!multi_instance, runtimeOptions: runtimeOptions || {} });
});

router.put('/agents/:agent', validateParams, (req, res) => {
  const { agent } = req.params;
  const agentDir = path.join(req.agentsDir, agent);

  if (!existsSync(agentDir)) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  const { runtime, args, commands, body, worktree, multi_instance, runtimeOptions } = req.body;
  if (!runtime || !isValidRuntime(runtime)) {
    const valid = listRuntimes().map(r => r.name).join(', ');
    return res.status(400).json({ error: `Invalid runtime. Must be one of: ${valid}` });
  }
  const content = serializeAgentMd({ runtime, args: args || [], commands: commands || [], body: body || '', worktree: !!worktree, multi_instance: !!multi_instance, runtimeOptions: runtimeOptions || {} });
  writeFileSync(path.join(agentDir, 'agent.md'), content, 'utf8');

  res.json({ name: agent, runtime, args: args || [], commands: commands || [], body: body || '', worktree: !!worktree, multi_instance: !!multi_instance, runtimeOptions: runtimeOptions || {} });
});

router.delete('/agents/:agent', validateParams, (req, res) => {
  const { agent } = req.params;
  const agentDir = path.join(req.agentsDir, agent);

  if (!existsSync(agentDir)) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  rmSync(agentDir, { recursive: true });
  res.status(204).end();
});

module.exports = router;
