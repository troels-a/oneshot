<p align="center">
  <img src="logo.png" alt="oneshot" width="80" />
</p>

<h3 align="center">oneshot</h3>

<p align="center">
  Agent execution platform for VPS environments — define agents as Markdown, run them via API or CLI.
</p>

---

Oneshot is built for running autonomous agents on remote servers. Define agents as simple Markdown files — Claude prompts, Node.js scripts, or Bash scripts — and fire them off on-demand or on a cron schedule through a REST API, CLI, or web dashboard. Deploy it on a VPS and use it as the backbone for your agent infrastructure.

MCP server support is coming.

## Install

```bash
git clone https://github.com/troels-a/oneshot.git
cd oneshot
npm run setup
```

The setup wizard creates your `.env` with generated credentials, installs dependencies, and links the `oneshot` CLI globally.

## Usage

```bash
npm run start   # Starts both the API server and dashboard
```

- **API** at `http://localhost:3000`
- **Dashboard** at `http://localhost:5173`

## Dashboard

![Runs](screenshots/runs.jpg)

![Agents](screenshots/agents.jpg)

![Schedules](screenshots/schedules.jpg)

![Agent Editor](screenshots/agent-editor.jpg)

## Creating an Agent

Agents live in the `agents/` directory. Each agent is a folder with an `agent.md` file:

```
agents/
  my-agent/
    agent.md
```

The file uses YAML frontmatter for config, and the body is the program:

```yaml
---
runtime: claude
args:
  - name: topic
    description: What to research
    required: true
commands:
  - name: date
    run: "date +%Y-%m-%d"
---

Today is {{ commands.date }}. Research {{ args.topic }} and write a summary.
```

### Runtimes

| Runtime | Body is | Best for |
|---------|---------|----------|
| `claude` | A prompt passed to `claude -p` | Tasks needing an AI agent with tool access |
| `node` | JavaScript executed via `node` | Programmatic / API tasks |
| `bash` | A shell script executed via `bash` | Shell automation |

### Args and Commands

**Args** are declared in frontmatter and interpolated with `{{ args.name }}`. They can be required, optional, or have defaults.

**Commands** run shell commands at prep time. Results are available as `{{ commands.name }}` — useful for injecting dates, git info, or system state.

## CLI

```bash
oneshot list                          # List all agents
oneshot info my-agent                 # Show agent details
oneshot run my-agent --topic=value    # Run an agent
oneshot clear                         # Clear completed/failed runs
```

## API

All endpoints require `Authorization: Bearer $ONESHOT_API_KEY`.

### Agents

```
GET    /agents                        # List agents
GET    /agents/:agent                 # Get agent details
POST   /agents                        # Create agent
PUT    /agents/:agent                 # Update agent
DELETE /agents/:agent                 # Delete agent
```

### Dispatch

```
POST   /agents/:agent/dispatch        # Run an agent
```

```bash
curl -X POST http://localhost:3000/agents/my-agent/dispatch \
  -H "Authorization: Bearer $ONESHOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"args": {"topic": "web frameworks"}}'
```

Only one instance of an agent runs at a time. Returns `409` if already running.

### Runs

```
GET    /runs                          # List runs (filter: ?status=running&agent=name)
GET    /runs/:id                      # Get run details
GET    /runs/:id/logs                 # List log files
GET    /runs/:id/logs/:file           # Stream log content (?offset=0&limit=50)
POST   /runs/:id/stop                 # Stop a running agent
DELETE /runs                          # Clear completed/failed runs
```

### Schedules

```
POST   /agents/:agent/schedules      # Create schedule
GET    /agents/:agent/schedules       # List schedules
PUT    /agents/:agent/schedules/:id   # Update schedule
DELETE /agents/:agent/schedules/:id   # Delete schedule
```

```bash
curl -X POST http://localhost:3000/agents/my-agent/schedules \
  -H "Authorization: Bearer $ONESHOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cron": "0 9 * * 1-5", "options": {"args": {"topic": "daily"}}}'
```

### Files

```
GET    /agents/:agent/files           # List agent files
GET    /agents/:agent/files/:file     # Get file content
POST   /agents/:agent/files           # Create file
PUT    /agents/:agent/files/:file     # Update file
DELETE /agents/:agent/files/:file     # Delete file
POST   /agents/:agent/files/upload    # Upload file (multipart, 5MB limit)
```

### Other

```
GET    /health                        # Health check (no auth)
POST   /auth/login                    # Dashboard login (returns JWT)
GET    /stats                         # Run statistics
```

## Project Structure

```
packages/
  core/         Shared library — agent discovery, parsing, execution
  cli/          CLI tool (oneshot list|info|run|clear)
  server/       Express REST API with cron scheduling
  dashboard/    React web UI (Vite)
agents/         Your agent definitions
```

## Environment

Configure in `.env` (created by `npm run setup`):

| Variable | Description | Default |
|----------|-------------|---------|
| `ONESHOT_API_KEY` | Bearer token for API auth | Generated |
| `ONESHOT_DASHBOARD_PASSWORD` | Password for dashboard login | Generated |
| `ONESHOT_API_PORT` | Server port | `3000` |
| `ONESHOT_AGENTS_DIR` | Path to agents directory | `./agents` |
| `ONESHOT_WORKSPACE_DIR` | Base directory for dispatch `--path` | — |

## Development

```bash
npm run api          # Start API server only
npm run dashboard    # Start dashboard only
npm run start        # Start both
npm test             # Run all tests
```
