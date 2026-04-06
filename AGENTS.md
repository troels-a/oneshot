# Oneshot — Agent Authoring Guide

This document tells coding agents (Claude, Copilot, etc.) how to create and modify oneshot agents.

## Project Overview

Oneshot is a run scheduling and execution platform for autonomous agents. Agents are CLI programs (Claude prompts, Node.js scripts, or Bash scripts) that can be run on-demand or on a cron schedule via a REST API and web dashboard.

## Monorepo Structure

- `packages/core` — Agent discovery, parsing, validation, execution (shared library)
- `packages/cli` — CLI tool (`oneshot list|info|run`)
- `packages/server` — Express REST API with run management and cron scheduling
- `packages/dashboard` — React web UI for monitoring runs and schedules

## Creating an Agent

Agents live in the `agents/` directory (configurable via `ONESHOT_AGENTS_DIR`). Each agent is a subdirectory containing an `agent.md` file.

### Directory Structure

```
agents/
  my-agent/
    agent.md          # Required — defines the agent (config + code)
    helpers.js        # Optional — supporting files (any runtime)
```

Each agent is a single `agent.md` file. The body of the file is the program: a prompt for `claude`, JavaScript for `node`, or a shell script for `bash`. Supporting files can be added to the directory for `require()` or `source` usage.

### agent.md Format

The file uses YAML frontmatter followed by a body:

```yaml
---
runtime: claude|node|bash
args:
  - name: arg_name
    description: What this argument does
    required: true
    default: fallback_value
commands:
  - name: cmd_name
    run: "shell command to execute at prep time"
---

Body text goes here. Use {{ args.arg_name }} and {{ commands.cmd_name }}
to interpolate values.
```

### Runtimes

**`claude`** — The body becomes the prompt passed to `claude -p`. Best for tasks that need an AI coding agent with full tool access.

```yaml
---
runtime: claude
args:
  - name: task
    description: What to work on
    required: true
commands:
  - name: date
    run: "date +%Y-%m-%d"
---

Today is {{ commands.date }}. Please {{ args.task }}.
```

**`node`** — The body is JavaScript, executed via `node`. Args are passed as `--key value` flags. Best for programmatic tasks.

```yaml
---
runtime: node
args:
  - name: url
    description: URL to fetch
    required: true
---

const [,, ...argv] = process.argv;
const url = argv[argv.indexOf('--url') + 1];
const res = await fetch(url);
console.log(await res.text());
```

**`bash`** — The body is a shell script, executed via `bash`. Args are passed as `--key value` flags. Best for shell automation.

```yaml
---
runtime: bash
args:
  - name: target
    description: Deploy target
    default: staging
---

#!/usr/bin/env bash
echo "Deploying to {{ args.target }}..."
```

### Args

Each arg has:
- `name` (required) — used as `{{ args.name }}` in templates and `--name` in CLI flags
- `description` — documents the argument
- `required` — if true, dispatch fails without it
- `default` — fallback value when not provided

### Commands

Commands run shell commands at agent preparation time. Results are available as `{{ commands.name }}` in the body template. Useful for injecting dynamic context (dates, git info, system state).

### Running Agents

```bash
# CLI
oneshot list
oneshot info my-agent
oneshot run my-agent --arg_name=value

# API
curl -X POST http://localhost:3000/agents/my-agent/dispatch \
  -H "Authorization: Bearer $ONESHOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"args": {"arg_name": "value"}}'
```

### Scheduling

Agents can be scheduled via the API with cron expressions:

```bash
curl -X POST http://localhost:3000/agents/my-agent/schedules \
  -H "Authorization: Bearer $ONESHOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cron": "0 9 * * 1-5", "args": {"arg_name": "value"}}'
```

Only one instance of an agent runs at a time. Scheduled runs are skipped if the previous run is still executing.

### Spawning

Agents can spawn follow-up agents by writing JSON files to `$ONESHOT_SPAWN_DIR`. This environment variable is set automatically for every run and points to a run-specific directory (`<logDir>/spawns/`). After the current run completes and its worktree is cleaned up, the run manager reads all `.json` files from the spawn dir and dispatches each one.

```bash
cat > "$ONESHOT_SPAWN_DIR/next-agent.json" << 'SPAWN'
{
  "agent": "next-agent-name",
  "args": { "key": "value" },
  "path": "repo-name"
}
SPAWN
```

- `agent` (required) — name of the agent to dispatch next
- `args` — arguments to pass to the spawned agent
- `path` — working directory path (defaults to the current run's path)
- `timeout` — optional timeout in seconds

Multiple spawn files can be written to dispatch multiple agents. Both `path` and `branch` must be explicitly set — nothing is inherited from the parent run. Use `$ONESHOT_PATH` and `$ONESHOT_BRANCH` env vars to pass them through. The spawned run records `spawnedBy` and the parent records `spawned` for traceability.

### Run Environment Variables

Every agent run receives these environment variables:

- `ONESHOT_SPAWN_DIR` — path to the run-specific spawns directory
- `ONESHOT_RUN_ID` — the current run's ID
- `ONESHOT_AGENT` — the current agent's name
- `ONESHOT_PATH` — the resolved path option (if set)
- `ONESHOT_BRANCH` — the worktree branch (if worktree mode is active)

## Development

```bash
npm run setup             # First-time setup
npm run api               # Start API server (port 3000)
npm run dashboard         # Start dashboard (port 5173)
npm run start             # Start both
npm test                  # Run all tests
```

## Environment

Configure in `.env` (see `.env.example`):
- `ONESHOT_API_KEY` — Bearer token for API auth (required for server)
- `ONESHOT_DASHBOARD_PASSWORD` — Password for dashboard login (required for server)
- `ONESHOT_API_PORT` — Server port (default: 3000)
- `ONESHOT_AGENTS_DIR` — Path to agents directory (default: ./agents)
- `ONESHOT_WORKSPACE_DIR` — Base directory for resolving relative `--path` values in dispatch requests
