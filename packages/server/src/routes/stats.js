const { Router } = require('express');
const router = Router();

router.get('/stats', (req, res) => {
  // A single GROUP BY, not a full hydration of every run row.
  const counts = req.runManager.countRunsByStatus();
  const active = counts.running || 0;
  const completed = counts.completed || 0;
  const failed = counts.failed || 0;
  const timedOut = counts.timed_out || 0;
  const pending = counts.pending || 0;
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const finished = completed + failed + timedOut;
  const successRate = finished > 0 ? Math.round((completed / finished) * 1000) / 10 : 0;

  // Per-agent tallies come from SQL too — the agent cards must not derive counts
  // from whichever page of runs the client happens to be holding.
  const byAgent = req.runManager.countRunsByAgent();

  res.json({ active, total, completed, failed, timedOut, pending, successRate, byAgent });
});

module.exports = router;
