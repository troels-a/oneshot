const { Router } = require('express');
const { existsSync } = require('fs');
const nodePath = require('path');
const cron = require('node-cron');
const validateParams = require('../middleware/validate-params');
const { validateBody } = require('../lib/validate-dispatch-options');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const router = Router();

function validateScheduleId(req, res, next) {
  if (req.params.scheduleId && !UUID_RE.test(req.params.scheduleId)) {
    return res.status(400).json({ error: 'Invalid schedule ID format' });
  }
  next();
}

router.post('/agents/:agent/schedules', validateParams, async (req, res, next) => {
  try {
    const { agent } = req.params;
    const agentMd = nodePath.join(req.agentsDir, agent, 'agent.md');
    if (!existsSync(agentMd)) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const body = req.body || {};

    if (!body.cron || typeof body.cron !== 'string') {
      return res.status(400).json({ error: 'cron is required' });
    }
    if (!cron.validate(body.cron)) {
      return res.status(400).json({ error: 'Invalid cron expression' });
    }

    if (body.options) {
      const errors = validateBody(body.options);
      if (errors.length) {
        return res.status(400).json({ error: errors.join('; ') });
      }
    }

    const schedule = req.scheduler.createSchedule(agent, {
      cron: body.cron,
      options: body.options,
      enabled: body.enabled,
    });

    res.status(201).json(schedule);
  } catch (err) {
    if (err.message && /maximum/i.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.get('/agents/:agent/schedules', validateParams, (req, res) => {
  res.json({ schedules: req.scheduler.listSchedules(req.params.agent) });
});

router.get('/agents/:agent/schedules/:scheduleId', validateParams, validateScheduleId, (req, res) => {
  const schedule = req.scheduler.getSchedule(req.params.scheduleId);
  if (!schedule || schedule.agent !== req.params.agent) {
    return res.status(404).json({ error: 'Schedule not found' });
  }
  res.json(schedule);
});

router.patch('/agents/:agent/schedules/:scheduleId', validateParams, validateScheduleId, (req, res, next) => {
  try {
    const schedule = req.scheduler.getSchedule(req.params.scheduleId);
    if (!schedule || schedule.agent !== req.params.agent) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const body = req.body || {};

    if (body.cron !== undefined) {
      if (typeof body.cron !== 'string' || !cron.validate(body.cron)) {
        return res.status(400).json({ error: 'Invalid cron expression' });
      }
    }

    if (body.options !== undefined) {
      const errors = validateBody(body.options);
      if (errors.length) {
        return res.status(400).json({ error: errors.join('; ') });
      }
    }

    const updates = {};
    if (body.cron !== undefined) updates.cron = body.cron;
    if (body.options !== undefined) updates.options = body.options;
    if (body.enabled !== undefined) updates.enabled = body.enabled;

    res.json(req.scheduler.updateSchedule(req.params.scheduleId, updates));
  } catch (err) {
    next(err);
  }
});

router.delete('/agents/:agent/schedules/:scheduleId', validateParams, validateScheduleId, (req, res) => {
  const schedule = req.scheduler.getSchedule(req.params.scheduleId);
  if (!schedule || schedule.agent !== req.params.agent) {
    return res.status(404).json({ error: 'Schedule not found' });
  }
  req.scheduler.deleteSchedule(req.params.scheduleId);
  res.status(204).end();
});

module.exports = router;
