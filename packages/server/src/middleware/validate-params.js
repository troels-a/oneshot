const VALID_NAME = /^[a-zA-Z0-9_-]+$/;

function validateParams(req, res, next) {
  if (req.params.agent) {
    if (!VALID_NAME.test(req.params.agent)) {
      return res.status(400).json({ error: 'Invalid agent name' });
    }
  }
  next();
}

module.exports = validateParams;
module.exports.VALID_NAME = VALID_NAME;
