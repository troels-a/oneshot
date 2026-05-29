const { Router } = require('express');
const { STREAM_FILENAMES, streamForFilename } = require('@oneshot/core/src/constants');
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

  const summary = req.runManager.getLogSummary(run.id);
  const files = [
    { name: STREAM_FILENAMES.stdout, size: summary.stdout, lines: summary.stdout },
    { name: STREAM_FILENAMES.stderr, size: summary.stderr, lines: summary.stderr },
  ];
  res.json({ runId: run.id, files });
});

router.get('/runs/:id/logs/:filename', (req, res) => {
  const run = req.runManager.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });

  const stream = streamForFilename(req.params.filename);
  if (!stream) return res.status(404).json({ error: 'Log file not found' });

  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const limit = req.query.limit != null ? Math.max(1, parseInt(req.query.limit, 10) || 50) : 0;

  const result = req.runManager.getLogLines(run.id, stream, { offset, limit });
  res.json({
    lines: result.lines,
    offset: result.offset,
    limit,
    hasMore: result.hasMore,
  });
});

router.get('/runs/:id/logs/:filename/tail', (req, res) => {
  const run = req.runManager.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });

  const stream = streamForFilename(req.params.filename);
  if (!stream) return res.status(404).json({ error: 'Log file not found' });

  const after = Math.max(0, parseInt(req.query.after, 10) || 0);
  const result = req.runManager.getLogLinesAfter(run.id, stream, after);
  res.json({ lines: result.lines, lastLine: result.lastLine });
});

router.post('/runs/:id/stop', (req, res) => {
  const result = req.runManager.stopRun(req.params.id);
  if (result.error === 'not_found') return res.status(404).json({ error: 'Run not found' });
  if (result.error === 'not_running') return res.status(409).json({ error: 'Run is not running' });
  res.json({ stopped: true, id: req.params.id });
});

router.delete('/runs', async (req, res) => {
  const cleared = await req.runManager.clearRuns();
  res.json({ cleared });
});

module.exports = router;
