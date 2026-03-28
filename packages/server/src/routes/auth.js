const { Router } = require('express');

function createAuthRouter({ apiKey, dashboardPassword }) {
  const router = Router();

  router.post('/auth/login', (req, res) => {
    const { password } = req.body || {};
    if (!password || password !== dashboardPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    res.json({ token: apiKey });
  });

  return router;
}

module.exports = createAuthRouter;
