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
    agent.md          # Required — defines the agent
    index.js          # Required if entrypoint: node
    main.sh           # Required if entrypoint: bash
```

### agent.md Format

The file uses YAML frontmatter followed by a body:

```yaml
---
entrypoint: claude|node|bash
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

### Entrypoints

**`claude`** — The body becomes the prompt passed to `claude -p`. Best for tasks that need an AI coding agent with full tool access.

```yaml
---
entrypoint: claude
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

**`node`** — Runs `node <agent-dir>/index.js` with args as `--key value` flags. Best for programmatic tasks.

```yaml
---
entrypoint: node
args:
  - name: url
    description: URL to fetch
    required: true
---
```

**`bash`** — Runs `bash <agent-dir>/main.sh` with args as `--key value` flags. Best for shell automation.

```yaml
---
entrypoint: bash
args:
  - name: target
    description: Deploy target
    default: staging
---
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
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"args": {"arg_name": "value"}}'
```

### Scheduling

Agents can be scheduled via the API with cron expressions:

```bash
curl -X POST http://localhost:3000/agents/my-agent/schedules \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cron": "0 9 * * 1-5", "args": {"arg_name": "value"}}'
```

Only one instance of an agent runs at a time. Scheduled runs are skipped if the previous run is still executing.

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
- `API_KEY` — Bearer token for API auth (required for server)
- `DASHBOARD_PASSWORD` — Password for dashboard login (required for server)
- `PORT` — Server port (default: 3000)
- `ONESHOT_AGENTS_DIR` — Path to agents directory (default: ./agents)
