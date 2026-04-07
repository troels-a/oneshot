// Canonical schema for run dispatch options.
//
// Adding a new top-level dispatch option is a one-line change here: add an
// entry to DISPATCH_OPTIONS and the run manager, REST routes, and schedules
// pick it up automatically.

// Default timeout when none is specified on dispatch (20 minutes).
const DEFAULT_TIMEOUT_SEC = 1200;

const nonEmptyString = (name) => (value) =>
  (typeof value !== 'string' || !value.length)
    ? `${name} must be a non-empty string`
    : null;

const DISPATCH_OPTIONS = {
  args: {
    validate(value) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return 'args must be a plain object';
      }
      for (const [key, v] of Object.entries(value)) {
        if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
          return `args.${key} must be a string, number, or boolean`;
        }
      }
      return null;
    },
  },
  path: { validate: nonEmptyString('path') },
  branch: { validate: nonEmptyString('branch') },
  timeout: {
    validate(value) {
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value <= 0 ||
        value > 86400
      ) {
        return 'timeout must be a positive number (seconds), max 86400';
      }
      return null;
    },
  },
};

const DISPATCH_OPTION_KEYS = Object.keys(DISPATCH_OPTIONS);

function validateDispatchOptions(options) {
  const errors = [];
  if (!options || typeof options !== 'object') return errors;
  for (const key of DISPATCH_OPTION_KEYS) {
    if (options[key] === undefined) continue;
    const error = DISPATCH_OPTIONS[key].validate(options[key]);
    if (error) errors.push(error);
  }
  return errors;
}

function pickDispatchOptions(input) {
  const result = {};
  if (!input || typeof input !== 'object') return result;
  for (const key of DISPATCH_OPTION_KEYS) {
    if (input[key] !== undefined) result[key] = input[key];
  }
  return result;
}

module.exports = {
  DEFAULT_TIMEOUT_SEC,
  DISPATCH_OPTIONS,
  DISPATCH_OPTION_KEYS,
  validateDispatchOptions,
  pickDispatchOptions,
};
