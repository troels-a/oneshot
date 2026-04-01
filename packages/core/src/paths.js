const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA_DIR = path.join(REPO_ROOT, '.oneshot');

module.exports = { REPO_ROOT, DATA_DIR };
