// Thin server-side wrappers around the canonical dispatch-options schema
// in @oneshot/core. The server adds the "loose REST shape" coercion that
// folds unknown top-level keys into args for ergonomic JSON dispatch bodies.

const {
  DISPATCH_OPTION_KEYS,
  validateDispatchOptions,
} = require('./core');

function validateBody(body) {
  return validateDispatchOptions(body || {});
}

// Coerce a request body into the structured dispatch-options shape.
//
// - Structured shape (`{ args: {...}, path, branch, timeout }`) is returned
//   unchanged.
// - Loose shape (`{ path, branch, foo, bar }`) extracts known dispatch
//   options and folds the remaining keys into `args`.
function coerceDispatchBody(body) {
  if (!body || typeof body !== 'object') return {};

  const isStructured =
    body.args !== undefined ||
    Object.keys(body).every((k) => DISPATCH_OPTION_KEYS.includes(k));

  if (isStructured) return { ...body };

  const result = {};
  const args = {};
  for (const [key, value] of Object.entries(body)) {
    if (DISPATCH_OPTION_KEYS.includes(key)) {
      result[key] = value;
    } else {
      args[key] = value;
    }
  }
  if (Object.keys(args).length) result.args = args;
  return result;
}

module.exports = { validateBody, coerceDispatchBody };
