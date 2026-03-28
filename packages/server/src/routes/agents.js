const { Router } = require('express');
const { discoverAgents } = require('@oneshot/core');
const validateParams = require('../middleware/validate-params');
const { validateBody } = require('../lib/validate-dispatch-options');

const router = Router();

router.get('/agents', (req, res) => {
  const agents = discoverAgents(req.agentsDir).map(a => ({
    name: a.name,
    entrypoint: a.config.entrypoint,
    args: a.config.args,
  }));
  res.json({ agents });
});

router.post('/agents/:agent/dispatch', validateParams, async (req, res, next) => {
  try {
    const { agent } = req.params;
    const manager = req.jobManager;

    const body = req.body || {};
    const errors = validateBody(body);
    if (errors.length) {
      return res.status(400).json({ error: errors.join('; ') });
    }

    const existing = manager.getRunningJob(agent);
    if (existing) {
      return res.status(409).json({ error: 'Agent already running', jobId: existing.id });
    }

    const job = await manager.dispatchJob(agent, body);
    res.status(201).json({ jobId: job.id, status: job.status });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Agent not found' });
    }
    next(err);
  }
});

module.exports = router;
