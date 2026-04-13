const path = require('path');
const os = require('os');
const { writeFileSync, unlinkSync } = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

function argsToFlags(args) {
  const flags = [];
  for (const [key, value] of Object.entries(args)) {
    flags.push(`--${key}`, String(value));
  }
  return flags;
}

function createTempExecutable(ext, content) {
  const tmpFile = path.join(os.tmpdir(), `oneshot-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  writeFileSync(tmpFile, content);
  return {
    filePath: tmpFile,
    cleanup: () => {
      try { unlinkSync(tmpFile); } catch {}
    },
  };
}

function normalizeOptionFields(fields = [], providedOptions = {}) {
  const normalized = {};
  for (const field of fields) {
    const rawValue = providedOptions[field.name];
    if (rawValue === undefined) {
      if (field.default !== undefined) normalized[field.name] = field.default;
      continue;
    }

    if (field.type === 'boolean') {
      normalized[field.name] = typeof rawValue === 'boolean' ? rawValue : rawValue === 'true';
      continue;
    }

    if (field.type === 'select') {
      const allowed = new Set((field.options || []).map(option => option.value));
      normalized[field.name] = allowed.has(rawValue) ? rawValue : field.default;
      continue;
    }

    normalized[field.name] = rawValue;
  }
  return normalized;
}

function buildPromptEditor(title, hint, placeholder) {
  return { title, hint, placeholder };
}

async function checkBinary(name) {
  try {
    await execFileAsync('which', [name]);
    return { available: true };
  } catch {
    return { available: false, reason: `${name} CLI not found in PATH` };
  }
}

module.exports = {
  argsToFlags,
  createTempExecutable,
  normalizeOptionFields,
  buildPromptEditor,
  checkBinary,
};
