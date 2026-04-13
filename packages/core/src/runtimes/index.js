const bash = require('./bash');
const claude = require('./claude');
const codex = require('./codex');
const node = require('./node');

const runtimeMap = new Map([bash, claude, codex, node].map(runtime => [runtime.name, runtime]));

function getRuntime(name) {
  return runtimeMap.get(name) || null;
}

function listRuntimes() {
  return Array.from(runtimeMap.values());
}

function listRuntimeMetadata() {
  return listRuntimes().map(runtime => ({
    name: runtime.name,
    label: runtime.label,
    editor: runtime.editor,
    runtimeOptions: runtime.runtimeOptions || [],
  }));
}

function isValidRuntime(name) {
  return runtimeMap.has(name);
}

async function checkRuntimeAvailability(name) {
  if (name) {
    const runtime = runtimeMap.get(name);
    if (!runtime) return null;
    return runtime.checkAvailability();
  }
  const results = {};
  const all = listRuntimes();
  await Promise.all(all.map(async (runtime) => {
    results[runtime.name] = await runtime.checkAvailability();
  }));
  return results;
}

function normalizeRuntimeOptions(name, runtimeOptions = {}) {
  const runtime = getRuntime(name);
  if (!runtime) {
    throw new Error(`Unknown runtime: ${name}`);
  }
  return runtime.normalizeRuntimeOptions(runtimeOptions);
}

module.exports = {
  getRuntime,
  listRuntimes,
  listRuntimeMetadata,
  isValidRuntime,
  normalizeRuntimeOptions,
  checkRuntimeAvailability,
};
