const express = require('express');
const path = require('path');
const { mkdirSync } = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const { RunManager, Scheduler, resolveAgentsDir, resolveLogsDir, DATA_DIR } = require('@oneshot/core');
const { loadOrCreateSecret } = require('./lib/sessions');
const createAuthMiddleware = require('./middleware/auth');
const healthRouter = require('./routes/health');
const agentsRouter = require('./routes/agents');
const runsRouter = require('./routes/runs');
const schedulesRouter = require('./routes/schedules');
const statsRouter = require('./routes/stats');
const filesRouter = require('./routes/files');
const createAuthRouter = require('./routes/auth');

function createApp(options = {}) {
  const agentsDir = options.agentsDir || resolveAgentsDir();
  const logsDir = options.logsDir || resolveLogsDir();
  const apiKey = process.env.ONESHOT_API_KEY;
  const dashboardPassword = process.env.ONESHOT_DASHBOARD_PASSWORD;
  const sessionSecret = options.sessionSecret || loadOrCreateSecret(DATA_DIR);

  mkdirSync(logsDir, { recursive: true });

  const manager = new RunManager({ logsDir, agentsDir, dataDir: DATA_DIR });
  const schedulesFile = options.schedulesFile || path.join(DATA_DIR, 'schedules.json');
  const scheduler = new Scheduler({ runManager: manager, schedulesFile, agentsDir });
  scheduler.loadFromDisk();

  const app = express();
  app.use(express.json());

  // Health + login — no auth
  app.use(healthRouter);
  app.use(createAuthRouter({ dashboardPassword, sessionSecret }));

  // Auth for everything else
  app.use(createAuthMiddleware(apiKey, sessionSecret));

  // Inject dependencies
  app.use((req, res, next) => {
    req.agentsDir = agentsDir;
    req.runManager = manager;
    req.scheduler = scheduler;
    next();
  });

  app.use(agentsRouter);
  app.use(schedulesRouter);
  app.use(runsRouter);
  app.use(statsRouter);
  app.use(filesRouter);

  // Error handler
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return { app, manager, scheduler };
}

if (require.main === module) {
  const { app, manager, scheduler } = createApp();
  const PORT = process.env.ONESHOT_API_PORT || 3000;

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
