const express = require('express');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const { JobManager, resolveAgentsDir } = require('@oneshot/core');
const Scheduler = require('./lib/scheduler');
const createAuthMiddleware = require('./middleware/auth');
const healthRouter = require('./routes/health');
const agentsRouter = require('./routes/agents');
const jobsRouter = require('./routes/jobs');
const schedulesRouter = require('./routes/schedules');

function createApp(options = {}) {
  const agentsDir = options.agentsDir || resolveAgentsDir();
  const logsDir = options.logsDir || path.join(__dirname, '..', 'logs');
  const apiKey = process.env.API_KEY;

  const manager = new JobManager({ logsDir, agentsDir });
  const schedulesFile = options.schedulesFile || path.join(__dirname, '..', 'schedules.json');
  const scheduler = new Scheduler({ jobManager: manager, schedulesFile, agentsDir });
  scheduler.loadFromDisk();

  const app = express();
  app.use(express.json());

  // Health — no auth
  app.use(healthRouter);

  // Auth for everything else
  app.use(createAuthMiddleware(apiKey));

  // Inject dependencies
  app.use((req, res, next) => {
    req.agentsDir = agentsDir;
    req.jobManager = manager;
    req.scheduler = scheduler;
    next();
  });

  app.use(agentsRouter);
  app.use(schedulesRouter);
  app.use(jobsRouter);

  // Error handler
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return { app, manager, scheduler };
}

if (require.main === module) {
  const { app, manager, scheduler } = createApp();
  const PORT = process.env.PORT || 3000;

  const server = app.listen(PORT, () => {
    console.log(`oneshot server listening on port ${PORT}`);
  });

  manager.cleanupLogs();
  const cleanupInterval = setInterval(() => manager.cleanupLogs(), 24 * 60 * 60 * 1000);

  const shutdown = () => {
    console.log('Shutting down...');
    clearInterval(cleanupInterval);
    scheduler.stopAll();
    manager.shutdownAll();
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { createApp };
