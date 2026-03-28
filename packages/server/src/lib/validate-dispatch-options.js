function validateBody(body) {
  const errors = [];
  if (body.timeout !== undefined) {
    if (typeof body.timeout !== 'number' || !Number.isFinite(body.timeout) || body.timeout <= 0 || body.timeout > 86400) {
      errors.push('timeout must be a positive number (seconds), max 86400');
    }
  }
  if (body.args !== undefined) {
    if (typeof body.args !== 'object' || body.args === null || Array.isArray(body.args)) {
      errors.push('args must be a plain object');
    } else {
      for (const [key, value] of Object.entries(body.args)) {
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
          errors.push(`args.${key} must be a string, number, or boolean`);
        }
      }
    }
  }
  return errors;
}

module.exports = { validateBody };
