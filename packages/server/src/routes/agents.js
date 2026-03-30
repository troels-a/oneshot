const { Router } = require('express');
const { discoverAgents } = require('@oneshot/core');
const validateParams = require('../middleware/validate-params');
const { validateBody } = require('../lib/validate-dispatch-options');

const RESERVED_KEYS = new Set(['args', 'path', 'timeout']);

function normalizeBody(body) {
  if (body.args || Object.keys(body).every(k => RESERVED_KEYS.has(k))) {
    return body;
  }
  const { path, timeout, ...args } = body;
  const normalized = {};
  if (path !== undefined) normalized.path = path;
  if (timeout !== undefined) normalized.timeout = timeout;
  if (Object.keys(args).length) normalized.args = args;
  return normalized;
}

const router = Router();

router.get('/agents', (req, res) => {
  const agents = discoverAgents(req.agentsDir).map(a => ({
    name: a.name,
    runtime: a.config.runtime,
    args: a.config.args,
  }));
  res.json({ agents });
});

router.post('/agents/:agent/dispatch', validateParams, async (req, res, next) => {
  try {
    const { agent } = req.params;
    const manager = req.runManager;

    const body = normalizeBody(req.body || {});
    const errors = validateBody(body);
    if (errors.length) {
      return res.status(400).json({ error: errors.join('; ') });
    }

    const existing = manager.getRunningRun(agent);
    if (existing) {
      return res.status(409).json({ error: 'Agent already running', runId: existing.id });
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

module.exports = router;
