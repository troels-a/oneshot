const path = require('path');

function loadLocalCore() {
  try {
    return require(path.resolve(__dirname, '../../../core/src'));
  } catch {
    return null;
  }
}

const localCore = loadLocalCore();

module.exports = localCore || require('@oneshot/core');
