const crypto = require('crypto');
const { verifySessionToken } = require('../lib/sessions');

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function createAuthMiddleware(apiKey, sessionSecret) {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = header.slice(7);
    if (timingSafeEqual(token, apiKey) || verifySessionToken(token, sessionSecret)) {
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized' });
  };
}

module.exports = createAuthMiddleware;
