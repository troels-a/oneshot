#!/usr/bin/env node

const readline = require('readline');
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { randomBytes } = require('crypto');
const path = require('path');
const { execSync } = require('child_process');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, fallback) =>
  new Promise((resolve) =>
    rl.question(q, (answer) => resolve(answer.trim() || fallback))
  );

const ROOT = __dirname;

async function main() {
  console.log('\n  oneshot setup\n  ─────────────\n');

  // 1. Check Node version
  const major = parseInt(process.versions.node.split('.')[0], 10);
  if (major < 18) {
    console.error(`  Node.js >= 18 required (you have ${process.versions.node}).`);
    process.exit(1);
  }
  console.log(`  Node.js ${process.versions.node} ✓\n`);

  // 2. .env setup — read existing values and only prompt for missing ones
  const envPath = path.join(ROOT, '.env');
  const existing = {};

  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) existing[m[1]] = m[2].trim();
    }
  }

  const missing = [];
  if (!existing.API_KEY) missing.push('API_KEY');
  if (!existing.DASHBOARD_PASSWORD) missing.push('DASHBOARD_PASSWORD');
  if (!existing.PORT) missing.push('PORT');
  if (!existing.ONESHOT_AGENTS_DIR) missing.push('ONESHOT_AGENTS_DIR');
  if (!existing.ONESHOT_WORKSPACE_DIR) missing.push('ONESHOT_WORKSPACE_DIR');

  if (missing.length === 0) {
    console.log('  .env already configured ✓');
  } else {
    if (Object.keys(existing).length > 0) {
      console.log(`  .env exists but missing: ${missing.join(', ')}\n`);
    }

    if (!existing.API_KEY) {
      const genKey = randomBytes(24).toString('base64url');
      existing.API_KEY = await ask(`  API key [${genKey}]: `, genKey);
    }
    if (!existing.DASHBOARD_PASSWORD) {
      const genPassword = randomBytes(16).toString('base64url');
      existing.DASHBOARD_PASSWORD = await ask(`  Dashboard password [${genPassword}]: `, genPassword);
    }
    if (!existing.PORT) {
      existing.PORT = await ask('  Server port [3000]: ', '3000');
    }
    if (!existing.ONESHOT_AGENTS_DIR) {
      existing.ONESHOT_AGENTS_DIR = await ask('  Agents directory [./agents]: ', './agents');
    }
    if (!existing.ONESHOT_WORKSPACE_DIR) {
      existing.ONESHOT_WORKSPACE_DIR = await ask('  Workspace directory (base for dispatch --path) []: ', '');
    }

    writeFileSync(envPath, `API_KEY=${existing.API_KEY}\nDASHBOARD_PASSWORD=${existing.DASHBOARD_PASSWORD}\nPORT=${existing.PORT}\nONESHOT_AGENTS_DIR=${existing.ONESHOT_AGENTS_DIR}\nONESHOT_WORKSPACE_DIR=${existing.ONESHOT_WORKSPACE_DIR}\n`);
    console.log('\n  .env written ✓');
  }

  const agentsDir = existing.ONESHOT_AGENTS_DIR || './agents';

  // 3. Create .oneshot runtime directory
  const oneshotDir = path.join(ROOT, '.oneshot', 'logs');
  if (!existsSync(oneshotDir)) {
    mkdirSync(oneshotDir, { recursive: true });
    console.log('  Created .oneshot/ ✓');
  }

  // 4. Create agents directory
  const resolvedAgentsDir = path.resolve(ROOT, agentsDir);
  if (!existsSync(resolvedAgentsDir)) {
    mkdirSync(resolvedAgentsDir, { recursive: true });
    console.log(`  Created ${agentsDir}/ ✓`);
  }

  // 5. npm install if needed
  if (!existsSync(path.join(ROOT, 'node_modules'))) {
    console.log('\n  Running npm install...');
    execSync('npm install', { cwd: ROOT, stdio: 'inherit' });
    console.log('  Dependencies installed ✓');
  } else {
    console.log('  Dependencies already installed ✓');
  }

  // 6. Done
  console.log(`
  ───────────────────────────────────────
  Setup complete! Next steps:

  Start the API server:
    npm run api

  Start the dashboard:
    npm run dashboard

  Or start both:
    npm run start

  Create your own agents in ${agentsDir}/
  See AGENTS.md for the full authoring guide.
  ───────────────────────────────────────
`);

  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
