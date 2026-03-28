const { Router } = require('express');
const router = Router();

router.get('/stats', (req, res) => {
  const jobs = req.jobManager.listJobs({});
  const activeJobs = jobs.filter((j) => j.status === 'running').length;
  const completedJobs = jobs.filter((j) => j.status === 'completed').length;
  const failedJobs = jobs.filter((j) => j.status === 'failed').length;
  const pendingJobs = jobs.filter((j) => j.status === 'pending').length;
  const totalJobs = jobs.length;
  const finished = completedJobs + failedJobs;
  const successRate = finished > 0 ? Math.round((completedJobs / finished) * 1000) / 10 : 0;

  res.json({ activeJobs, totalJobs, completedJobs, failedJobs, pendingJobs, successRate });
});

module.exports = router;
