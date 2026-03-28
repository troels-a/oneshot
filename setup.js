#!/usr/bin/env node

const readline = require('readline');
const { writeFileSync, existsSync, mkdirSync } = require('fs');
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

  // 2. .env setup
  const envPath = path.join(ROOT, '.env');
  let skipEnv = false;

  if (existsSync(envPath)) {
    const overwrite = await ask('  .env already exists. Overwrite? [y/N] ', 'n');
    skipEnv = overwrite.toLowerCase() !== 'y';
  }

  let apiKey, port, agentsDir;

  if (!skipEnv) {
    const genKey = randomBytes(24).toString('base64url');
    apiKey = await ask(`  API key [${genKey}]: `, genKey);
    port = await ask('  Server port [3000]: ', '3000');
    agentsDir = await ask('  Agents directory [./agents]: ', './agents');

    writeFileSync(envPath, `API_KEY=${apiKey}\nPORT=${port}\nONESHOT_AGENTS_DIR=${agentsDir}\n`);
    console.log('\n  .env written ✓');
  } else {
    console.log('  Keeping existing .env ✓');
    agentsDir = './agents';
  }

  // 3. Create agents directory
  const resolvedAgentsDir = path.resolve(ROOT, agentsDir);
  if (!existsSync(resolvedAgentsDir)) {
    mkdirSync(resolvedAgentsDir, { recursive: true });
    console.log(`  Created ${agentsDir}/ ✓`);
  }

  // 4. npm install if needed
  if (!existsSync(path.join(ROOT, 'node_modules'))) {
    console.log('\n  Running npm install...');
    execSync('npm install', { cwd: ROOT, stdio: 'inherit' });
    console.log('  Dependencies installed ✓');
  } else {
    console.log('  Dependencies already installed ✓');
  }

  // 5. Done
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
