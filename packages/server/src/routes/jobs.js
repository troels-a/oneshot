const { Router } = require('express');
const { readdirSync, statSync, existsSync, createReadStream } = require('fs');
const { createInterface } = require('readline');
const path = require('path');
const router = Router();

router.get('/jobs', (req, res) => {
  const jobs = req.jobManager.listJobs({
    status: req.query.status,
    agent: req.query.agent,
  });
  res.json(jobs);
});

router.get('/jobs/:id', (req, res) => {
  const job = req.jobManager.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

router.get('/jobs/:id/logs', (req, res) => {
  const job = req.jobManager.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  if (!existsSync(job.logDir)) {
    return res.status(404).json({ error: 'No logs found' });
  }

  const entries = readdirSync(job.logDir);
  const files = [];
  for (const name of entries) {
    const stat = statSync(path.join(job.logDir, name));
    if (!stat.isFile()) continue;
    files.push({ name, size: stat.size, modifiedAt: stat.mtime.toISOString() });
  }

  res.json({ jobId: job.id, files });
});

router.get('/jobs/:id/logs/:filename', async (req, res) => {
  const job = req.jobManager.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const filename = path.basename(req.params.filename);
  const filePath = path.join(job.logDir, filename);

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

router.post('/jobs/:id/stop', (req, res) => {
  const result = req.jobManager.stopJob(req.params.id);
  if (result.error === 'not_found') return res.status(404).json({ error: 'Job not found' });
  if (result.error === 'not_running') return res.status(409).json({ error: 'Job is not running' });
  res.json({ stopped: true, id: req.params.id });
});

module.exports = router;
