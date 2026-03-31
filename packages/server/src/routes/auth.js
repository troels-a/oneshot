const { Router } = require('express');
const crypto = require('crypto');
const { createSessionToken } = require('../lib/sessions');

function createAuthRouter({ dashboardPassword, sessionSecret }) {
  const router = Router();

  router.post('/auth/login', (req, res) => {
    const { password } = req.body || {};
    const pwBuf = Buffer.from(String(password || ''));
    const expectedBuf = Buffer.from(dashboardPassword);
    if (pwBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(pwBuf, expectedBuf)) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    const token = createSessionToken(sessionSecret);
    res.json({ token });
  });

  return router;
}

module.exports = createAuthRouter;
