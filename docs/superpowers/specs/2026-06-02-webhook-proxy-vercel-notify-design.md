# Webhook Proxy Layer + Vercel Deploy-Notify Agent — Design

**Date:** 2026-06-02
**Status:** Approved (pending spec review)

## Problem

Agents are dispatched through `POST /agents/:agent/dispatch`, which sits behind
Bearer auth and is not publicly reachable. External services such as Vercel
cannot call it: they POST to a fixed public URL with no API key and sign the
body with their own secret. We want Vercel deployment webhooks (see
<https://vercel.com/docs/webhooks>) to trigger an agent that sends a `notify`
message when a deployment fails.

Rather than a one-off Vercel endpoint, we introduce a reusable **webhook proxy**
concept: a thin public layer that authenticates an inbound POST and turns it
into an authenticated agent dispatch. Vercel is the first consumer.

## Goals

- A generic, persisted "webhook route" concept that maps an inbound POST to a
  target agent + fixed args, modeled on the existing schedules feature.
- A public ingest endpoint secured by an unguessable URL, with optional HMAC
  signature verification (used for Vercel).
- A `vercel-deploy-notify` agent that calls the existing `notify` CLI on failed
  deployments and is silent otherwise.
- A dashboard panel for managing webhook routes (list / create / edit /
  delete), mirroring the existing schedules panel.
- Keep the proxy thin: it authenticates and dispatches; it never interprets
  payload semantics. All "is this deployment erroneous?" logic lives in the
  agent.

## Non-Goals

- No per-route field mapping / payload templating (the raw body is forwarded as
  one arg; the agent parses it).
- No provider-specific parsing in the proxy beyond reading the signature header.
- No replay/retry storage; Vercel's own retry behavior is relied upon.

## Architecture

Three pieces: the proxy (core + server), the agent, and the dashboard panel.

### A. Webhook proxy (core + server)

Modeled directly on the schedules implementation.

- **core:** a `webhooks` SQLite table (new migration), a `createWebhooksRepo(db)`
  (row↔object mapping + CRUD statements, including a field-wise `updateWebhook`)
  mirroring `createSchedulesRepo`, and a `WebhookStore` class mirroring
  `Scheduler` (in-memory `Map` hydrated from the repo on load, id generation,
  `createWebhook`/`updateWebhook`/`deleteWebhook`, HMAC verify helper). Exported
  from `@oneshot/core`.
- **server, public ingest:** `POST /webhooks/:id` — mounted **before** the auth
  middleware, alongside `/health`.
- **server, authenticated CRUD:** `GET/POST/PATCH/DELETE
  /agents/:agent/webhooks` (+ `/:id`), and a global `GET /webhooks` (list all,
  for the dashboard) — behind the existing Bearer/session auth, same pattern as
  `routes/schedules.js`.

The `WebhookStore` is constructed in `createApp()` next to the `Scheduler`,
loaded from the db, and injected onto requests as `req.webhooks` (alongside
`req.scheduler`).

### B. `vercel-deploy-notify` agent

A `node` runtime agent at `agents/vercel-deploy-notify/agent.md`,
`multi_instance: true`. Parses the forwarded Vercel payload and, on a failed
deployment, calls `execFileSync('notify', [message])` — the same mechanism used
by `domain-monitor` and `bynwr-cache-warmer`. Silent (exit 0, no notify) on all
other events.

### C. Dashboard panel

A new `webhooks` view in the React dashboard, mirroring the schedules panel:
a `WebhookCard` for each route and a `WebhookForm` for creating one, wired into
`Dashboard.jsx` and a new top-level nav pill. Details in the Dashboard UI
section below.

## Data Model

New migration `packages/core/src/db/migrations/0002_webhooks.sql` (auto-applied
by the existing numbered-file runner):

```sql
CREATE TABLE webhooks (
  id                TEXT PRIMARY KEY,   -- random 32-hex; also the unguessable URL segment
  agent             TEXT NOT NULL,
  name              TEXT,
  signing_secret    TEXT,               -- nullable; when set, HMAC is enforced
  static_args_json  TEXT,               -- JSON object merged into dispatch args
  enabled           INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL,
  last_triggered_at TEXT,
  last_run_id       TEXT
);
CREATE INDEX idx_webhooks_agent ON webhooks(agent);
```

In-memory/object shape returned by the repo and store:

```js
{
  id, agent, name,
  signingSecret,          // string | null
  staticArgs,             // object (parsed from static_args_json), default {}
  enabled,                // boolean
  createdAt,
  lastTriggeredAt,        // string | null
  lastRunId,              // string | null
}
```

`id` is generated with `crypto.randomBytes(16).toString('hex')` so the public
URL segment is unguessable and serves as baseline auth. `signingSecret` is never
returned in CRUD responses (write-only); responses include a boolean
`hasSigningSecret` instead.

## Request Flow — Ingest

`POST /webhooks/:id`:

1. **Lookup.** Find route by `id`. Unknown or `enabled = false` → `404`
   (indistinguishable, to avoid leaking which ids exist).
2. **Authenticate.** If the route has a `signingSecret`:
   - Read the `x-vercel-signature` header (hex string).
   - Compute `HMAC-SHA1(rawBody, signingSecret)` as hex.
   - Compare timing-safe (`crypto.timingSafeEqual`). Missing or mismatched →
     `401`.
   - If no `signingSecret`, the unguessable URL is the only gate (allowed).
3. **Build dispatch body:**
   ```js
   { args: { ...route.staticArgs, event, payload } }
   ```
   where `payload` is the raw JSON body as a string and `event` is taken from
   the parsed body's `type` field (Vercel sets `type`, e.g.
   `"deployment.error"`), falling back to a generic value if absent.
4. **Dispatch.** Call `runManager.dispatchRun(agent, body)` — the same code path
   `routes/agents.js` uses. (Validation of args reuses `validateBody`.)
5. **Record.** Update `lastTriggeredAt` and `lastRunId`.
6. **Respond** `202 Accepted` with `{ runId }`. If the target agent is
   non-`multi_instance` and already running, respond `200` with
   `{ skipped: true, runId: <existing> }` instead (avoids Vercel retry storms).

### Raw-body capture

HMAC requires the exact received bytes, but the global `express.json()`
middleware consumes the stream. We add its `verify` hook once in
`createApp()`:

```js
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
```

This is non-invasive — existing routes are unaffected; only the webhook ingest
handler reads `req.rawBody`.

## Authenticated CRUD API

All behind existing auth, validated like schedules (agent must exist;
`validateParams` on `:agent`).

- `POST /agents/:agent/webhooks` — body `{ name?, signingSecret?, staticArgs? }`.
  Generates `id`, persists, returns the route (with `hasSigningSecret`, no
  secret) and the full ingest URL path `/webhooks/<id>`. → `201`.
- `GET /agents/:agent/webhooks` — list routes for the agent. → `200`.
- `GET /agents/:agent/webhooks/:id` — single route (404 if not owned by agent).
- `PATCH /agents/:agent/webhooks/:id` — body `{ name?, enabled?, signingSecret?,
  staticArgs? }`; updates only the provided fields. Passing `signingSecret: ""`
  (or `null`) clears the secret (disables HMAC); a non-empty value rotates it.
  The route `id`/ingest URL never changes. Returns the updated route (with
  `hasSigningSecret`, no raw secret). → `200`.
- `DELETE /agents/:agent/webhooks/:id` → `204`.
- `GET /webhooks` — list all routes across agents (powers the dashboard global
  view), mirroring `GET /schedules`. → `200`.

## Dashboard UI

A new `webhooks` view added to `VIEWS` in `App.jsx` (with a `VIEW_HELP` entry
and a nav pill), rendered by `Dashboard.jsx`. Follows the schedules panel
structure exactly.

**API client (`api.js`)** — add `fetchAllWebhooks()`, `fetchWebhooks(agent)`,
`createWebhook(agent, data)`, `updateWebhook(agent, id, data)`, and
`deleteWebhook(agent, id)`, mirroring the schedule helpers.

**Ingest URL note:** the public ingest route is served at the server root
(`/webhooks/<id>`), *not* under the dashboard's `/api` proxy prefix. The create
response returns `ingestPath` (`/webhooks/<id>`); the dashboard renders the full
URL by joining it with the API origin (same-origin in production behind the
proxy; in dev the operator uses the API host, e.g. `http://localhost:3000`).

**`WebhookCard.jsx`** — one card per route, modeled on `ScheduleCard`:
- Header: route `name` (with `agent` subtitle) and an active/disabled status
  pill.
- Body: the full ingest URL with a **copy-to-clipboard** button — shown in full
  because the dashboard is already authenticated and the operator needs the URL
  to paste into Vercel; an
  HMAC indicator (`signed` badge when `hasSigningSecret` is true); and the
  last-triggered timestamp via the existing `timeAgo` helper.
- Clicking the header toggles an inline edit form (same pattern as
  `ScheduleCard`); a delete button with a confirm dialog.

**`WebhookForm.jsx`** — used for both create and edit (`mode` prop), modeled on
`ScheduleForm`:
- Fields: agent selector (create only; fixed in edit), `name`, `enabled`
  toggle (edit only), `signingSecret` (password input), and a `staticArgs` JSON
  textarea validated client-side before submit.
- In edit mode the secret field renders empty with a "leave blank to keep
  current" placeholder; submitting blank omits `signingSecret` from the PATCH
  (secret unchanged), and an explicit "clear secret" control sends
  `signingSecret: ""` to disable HMAC. The raw secret is never pre-filled
  because the API never returns it.
- On successful create, surfaces the returned ingest URL prominently with a
  copy button and a one-time note that the signing secret cannot be retrieved
  later.

**`Dashboard.jsx`** — add a `tab === 'webhooks'` branch that loads
`fetchAllWebhooks()`, renders a "+ New Webhook" affordance plus the list of
`WebhookCard`s, and refreshes on create/edit/delete — identical wiring to the
schedules branch.

No new dashboard test infrastructure exists (the package ships `eslint` +
`vite build` only), so UI verification is `npm run lint` + `npm run
build:dashboard` clean, plus manual smoke testing.

## Error Handling & Concurrency

- Vercel retries on non-2xx, so we return 2xx for any *valid* request even if
  the agent is busy (`200 {skipped}` rather than `409`).
- Invalid/missing signature → `401`. Unknown/disabled route → `404`. Malformed
  JSON body → `400` (from `express.json`).
- The Vercel agent is `multi_instance: true` so independent, quick deployment
  events are never dropped by the single-instance lock.

## The Agent — `agents/vercel-deploy-notify/agent.md`

```yaml
---
runtime: node
multi_instance: true
args:
  - name: event
    description: Vercel event type (e.g. deployment.error)
    required: false
  - name: payload
    description: Raw Vercel webhook JSON body
    required: true
---
```

Behavior:

- Parse `--payload` JSON; read `--event` (fall back to `payload.type`).
- **Erroneous event set: `deployment.error` only.** All other events log a line
  and exit 0 without notifying (a healthy deploy is silent).
- On an erroneous event, extract from the payload (Vercel `deployment.*` events
  carry a `payload.deployment` / `payload.project` / `payload.links` shape):
  project name, target/branch, and the inspector URL when available; build a
  message like:
  `❌ Vercel deployment failed: <project> (<target>) — <inspectorUrl>`
  and call `execFileSync('notify', [message], { stdio: 'inherit' })`, wrapped in
  try/catch that logs on failure (same as `domain-monitor`).
- Missing/unknown fields degrade gracefully (omit from message); never throw on
  shape variation.
- Exit 0 in all normal cases; non-zero only on a usage error (no payload).

## Testing

- **core (`packages/core/test`):**
  - `createWebhooksRepo` CRUD round-trip (insert → get → list → delete) against
    an in-memory db.
  - `WebhookStore`: id generation uniqueness/format; HMAC verify helper against a
    known `(secret, body, signature)` vector; `staticArgs` defaulting.
- **server (`packages/server/test`)** with supertest + injected mock
  `runManager`:
  - Ingest: valid signature → `202` and `dispatchRun` called with
    `{ args: { event, payload, ...static } }`; bad signature → `401`; missing
    signature when secret set → `401`; no-secret route → dispatch succeeds;
    unknown id → `404`; disabled route → `404`.
  - Static-arg merge present in dispatched args.
  - CRUD: `401` without Bearer; create returns ingest URL + `hasSigningSecret`
    and never the raw secret; PATCH updates only provided fields, rotates the
    secret on a non-empty value, and clears it on `""`; delete → `204`;
    `GET /webhooks` lists routes across agents.
  - Store unit test: `updateWebhook` patches fields without changing `id`.
- **agent:** invoke the script with a `deployment.error` payload (asserts a
  stubbed `notify` on `PATH` is called with the expected message) and a
  `deployment.succeeded` payload (asserts `notify` is not called); a no-payload
  invocation exits non-zero.
- **dashboard:** no unit-test infra in the package, so verification is a clean
  `npm run lint` and `npm run build:dashboard`, plus manual smoke testing of
  create → copy URL → edit (rename, rotate/clear secret, toggle enabled) →
  delete.

## Operational Notes

- After deploy, create the route — via the dashboard Webhooks panel or
  `POST /agents/vercel-deploy-notify/webhooks` — with a `signingSecret` matching
  the secret configured in the Vercel dashboard, then register the returned
  `/webhooks/<id>` URL as the Vercel webhook endpoint.
- `CLAUDE.md` gets a short "Webhooks" section documenting the route concept and
  the ingest/CRUD endpoints, mirroring the existing "Scheduling" section.
