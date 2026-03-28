function createAuthMiddleware(apiKey) {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || header !== `Bearer ${apiKey}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  };
}

module.exports = createAuthMiddleware;
