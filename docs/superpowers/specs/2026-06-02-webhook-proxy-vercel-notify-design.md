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
- Keep the proxy thin: it authenticates and dispatches; it never interprets
  payload semantics. All "is this deployment erroneous?" logic lives in the
  agent.

## Non-Goals

- No per-route field mapping / payload templating (the raw body is forwarded as
  one arg; the agent parses it).
- No UI for managing webhooks in the dashboard in this iteration (REST only).
- No provider-specific parsing in the proxy beyond reading the signature header.
- No replay/retry storage; Vercel's own retry behavior is relied upon.

## Architecture

Two independent pieces.

### A. Webhook proxy (core + server)

Modeled directly on the schedules implementation.

- **core:** a `webhooks` SQLite table (new migration), a `createWebhooksRepo(db)`
  (row↔object mapping + CRUD statements) mirroring `createSchedulesRepo`, and a
  `WebhookStore` class mirroring `Scheduler` (in-memory `Map` hydrated from the
  repo on load, id generation, HMAC verify helper). Exported from
  `@oneshot/core`.
- **server, public ingest:** `POST /webhooks/:id` — mounted **before** the auth
  middleware, alongside `/health`.
- **server, authenticated CRUD:** `GET/POST/DELETE /agents/:agent/webhooks` and
  `GET /agents/:agent/webhooks/:id` — behind the existing Bearer/session auth,
  same pattern as `routes/schedules.js`.

The `WebhookStore` is constructed in `createApp()` next to the `Scheduler`,
loaded from the db, and injected onto requests as `req.webhooks` (alongside
`req.scheduler`).

### B. `vercel-deploy-notify` agent

A `node` runtime agent at `agents/vercel-deploy-notify/agent.md`,
`multi_instance: true`. Parses the forwarded Vercel payload and, on a failed
deployment, calls `execFileSync('notify', [message])` — the same mechanism used
by `domain-monitor` and `bynwr-cache-warmer`. Silent (exit 0, no notify) on all
other events.

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
- `DELETE /agents/:agent/webhooks/:id` → `204`.

(Update/PATCH is out of scope for v1 — delete and recreate. Add later if
needed.)

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
    and never the raw secret; delete → `204`.
- **agent:** invoke the script with a `deployment.error` payload (asserts a
  stubbed `notify` on `PATH` is called with the expected message) and a
  `deployment.succeeded` payload (asserts `notify` is not called); a no-payload
  invocation exits non-zero.

## Operational Notes

- After deploy, create the route via
  `POST /agents/vercel-deploy-notify/webhooks` with a `signingSecret` matching
  the secret configured in the Vercel dashboard, then register the returned
  `/webhooks/<id>` URL as the Vercel webhook endpoint.
- `CLAUDE.md` gets a short "Webhooks" section documenting the route concept and
  the ingest/CRUD endpoints, mirroring the existing "Scheduling" section.
