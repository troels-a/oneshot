function validateArgs(argDefs, provided = {}) {
  const merged = {};

  for (const def of argDefs) {
    const { name, required, default: defaultValue } = def;

    if (name in provided) {
      merged[name] = provided[name];
    } else if (defaultValue !== undefined) {
      merged[name] = defaultValue;
    } else if (required) {
      throw new Error(`Missing required argument: ${name}`);
    }
  }

  // Pass through any extra args not defined in the schema
  for (const [key, value] of Object.entries(provided)) {
    if (!(key in merged)) {
      merged[key] = value;
    }
  }

  return merged;
}

module.exports = validateArgs;
