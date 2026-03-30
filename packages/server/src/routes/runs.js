const { Router } = require('express');
const { readdirSync, statSync, existsSync, createReadStream } = require('fs');
const { createInterface } = require('readline');
const path = require('path');
const router = Router();

router.get('/runs', (req, res) => {
  const runs = req.runManager.listRuns({
    status: req.query.status,
    agent: req.query.agent,
  });
  res.json(runs);
});

router.get('/runs/:id', (req, res) => {
  const run = req.runManager.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

router.get('/runs/:id/logs', (req, res) => {
  const run = req.runManager.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });

  if (!existsSync(run.logDir)) {
    return res.status(404).json({ error: 'No logs found' });
  }

  const entries = readdirSync(run.logDir);
  const files = [];
  for (const name of entries) {
    if (name === 'run.json' || name === 'job.json') continue;
    const stat = statSync(path.join(run.logDir, name));
    if (!stat.isFile()) continue;
    files.push({ name, size: stat.size, modifiedAt: stat.mtime.toISOString() });
  }

  res.json({ runId: run.id, files });
});

router.get('/runs/:id/logs/:filename', async (req, res) => {
  const run = req.runManager.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });

  const filename = path.basename(req.params.filename);
  const filePath = path.join(run.logDir, filename);

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return res.status(404).json({ error: 'Log file not found' });
  }

  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));

  const rl = createInterface({ input: createReadStream(filePath, 'utf-8'), crlfDelay: Infinity });
  const lines = [];
  let lineNum = 0;
  let hasMore = false;

  for await (const line of rl) {
    if (lineNum >= offset && lines.length < limit) {
      lines.push(line);
    } else if (lines.length >= limit) {
      hasMore = true;
      rl.close();
      break;
    }
    lineNum++;
  }

  res.json({ lines, offset, limit, hasMore });
});

router.post('/runs/:id/stop', (req, res) => {
  const result = req.runManager.stopRun(req.params.id);
  if (result.error === 'not_found') return res.status(404).json({ error: 'Run not found' });
  if (result.error === 'not_running') return res.status(409).json({ error: 'Run is not running' });
  res.json({ stopped: true, id: req.params.id });
});

module.exports = router;
