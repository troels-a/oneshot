const { Router } = require('express');
const router = Router();

router.get('/stats', (req, res) => {
  const runs = req.runManager.listRuns({});
  const active = runs.filter((r) => r.status === 'running').length;
  const completed = runs.filter((r) => r.status === 'completed').length;
  const failed = runs.filter((r) => r.status === 'failed').length;
  const timedOut = runs.filter((r) => r.status === 'timed_out').length;
  const pending = runs.filter((r) => r.status === 'pending').length;
  const total = runs.length;
  const finished = completed + failed + timedOut;
  const successRate = finished > 0 ? Math.round((completed / finished) * 1000) / 10 : 0;

  res.json({ active, total, completed, failed, timedOut, pending, successRate });
});

module.exports = router;
