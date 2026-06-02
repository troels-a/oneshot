const express = require('express');
const path = require('path');
const { mkdirSync } = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const { RunManager, Scheduler, WebhookStore, resolveAgentsDir, resolveLogsDir, DATA_DIR, checkRuntimeAvailability, openDb } = require('@oneshot/core');
const { loadOrCreateSecret } = require('./lib/sessions');
const createAuthMiddleware = require('./middleware/auth');
const healthRouter = require('./routes/health');
const agentsRouter = require('./routes/agents');
const runtimesRouter = require('./routes/runtimes');
const runsRouter = require('./routes/runs');
const schedulesRouter = require('./routes/schedules');
const statsRouter = require('./routes/stats');
const filesRouter = require('./routes/files');
const { createIngestRouter, adminRouter: webhooksAdminRouter } = require('./routes/webhooks');
const createAuthRouter = require('./routes/auth');

function createApp(options = {}) {
  const agentsDir = options.agentsDir || resolveAgentsDir();
  const logsDir = options.logsDir || resolveLogsDir();
  const apiKey = process.env.ONESHOT_API_KEY;
  const dashboardPassword = process.env.ONESHOT_DASHBOARD_PASSWORD;
  const sessionSecret = options.sessionSecret || loadOrCreateSecret(DATA_DIR);

  mkdirSync(logsDir, { recursive: true });
  const db = options.db || openDb(options.dataDir || DATA_DIR);

  const manager = new RunManager({ db, logsDir, agentsDir, dataDir: options.dataDir || DATA_DIR });
  manager.recoverInflightRuns();
  const scheduler = new Scheduler({ db, runManager: manager, agentsDir });
  scheduler.loadFromDb();
  const webhooks = new WebhookStore({ db });
  webhooks.loadFromDb();

  const app = express();
  // Capture the raw body so webhook signature verification can HMAC the exact
  // received bytes; existing JSON routes are unaffected.
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

  // Health + login + public webhook ingest — no auth
  app.use(healthRouter);
  app.use(createAuthRouter({ dashboardPassword, sessionSecret }));
  app.use(createIngestRouter({ runManager: manager, webhooks, agentsDir }));

  // Auth for everything else
  app.use(createAuthMiddleware(apiKey, sessionSecret));

  // Inject dependencies
  const checkAvailability = options.checkRuntimeAvailability || checkRuntimeAvailability;
  app.use((req, res, next) => {
    req.agentsDir = agentsDir;
    req.runManager = manager;
    req.scheduler = scheduler;
    req.webhooks = webhooks;
    req.checkRuntimeAvailability = checkAvailability;
    next();
  });

  app.use(agentsRouter);
  app.use(runtimesRouter);
  app.use(schedulesRouter);
  app.use(webhooksAdminRouter);
  app.use(runsRouter);
  app.use(statsRouter);
  app.use(filesRouter);

  // Error handler
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return { app, manager, scheduler, webhooks };
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
