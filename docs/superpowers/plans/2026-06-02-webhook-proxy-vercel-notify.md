# Webhook Proxy + Vercel Deploy-Notify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generic webhook proxy that turns an authenticated-free inbound POST into an agent dispatch, plus a `vercel-deploy-notify` agent and a dashboard panel to manage routes.

**Architecture:** A `webhooks` SQLite table + repo + `WebhookStore` in `@oneshot/core` (mirroring schedules). The server exposes a public ingest endpoint (`POST /webhooks/:id`, mounted before auth, signature-verified) and an authenticated CRUD surface. A node agent parses the forwarded Vercel payload and calls the `notify` CLI on `deployment.error`. The React dashboard gains a Webhooks panel.

**Tech Stack:** Node `node:sqlite`, Express, React 19/Vite, `node:test` + supertest.

---

## File Structure

- Create `packages/core/src/db/migrations/0002_webhooks.sql` — schema.
- Create `packages/core/src/db/webhooks.js` — `createWebhooksRepo(db)`.
- Modify `packages/core/src/db/index.js` — register repo in `createRepos`.
- Create `packages/core/src/webhook-store.js` — `WebhookStore` class + `verifyVercelSignature`.
- Modify `packages/core/src/index.js` — export `WebhookStore`, `verifyVercelSignature`.
- Create `packages/core/test/webhook-store.test.js`.
- Create `packages/server/src/routes/webhooks.js` — `{ createIngestRouter, adminRouter }`.
- Modify `packages/server/src/index.js` — rawBody capture, construct store, mount routers, inject `req.webhooks`.
- Create `packages/server/test/webhooks-route.test.js`.
- Create `agents/vercel-deploy-notify/agent.md`.
- Create `agents/vercel-deploy-notify/__test__.js` (agent behavior test).
- Modify `packages/dashboard/src/api.js` — webhook client helpers.
- Create `packages/dashboard/src/components/WebhookForm.jsx`.
- Create `packages/dashboard/src/components/WebhookCard.jsx`.
- Modify `packages/dashboard/src/components/Dashboard.jsx` — webhooks tab.
- Modify `packages/dashboard/src/App.jsx` — nav pill + help text.
- Modify `CLAUDE.md` — Webhooks section.

---

## Task 1: Migration + repo (core)

**Files:** Create migration, `db/webhooks.js`; modify `db/index.js`.

- [ ] Migration `0002_webhooks.sql`: `webhooks` table with columns `id, agent, name, signing_secret, static_args_json, enabled, created_at, last_triggered_at, last_run_id` + index on `agent`.
- [ ] `createWebhooksRepo(db)` mirroring `createSchedulesRepo`: `insertWebhook`, `getWebhook`, `listWebhooks(agent)`, `listAllWebhooks`, `updateWebhook(id, fields)` (field-wise, `UPDATABLE_FIELDS` = name/signingSecret/staticArgs/enabled/lastTriggeredAt/lastRunId), `deleteWebhook`. `rowToWebhook` maps snake→camel and parses `static_args_json` → `staticArgs` (default `{}`).
- [ ] Register `webhooks: createWebhooksRepo(db)` in `createRepos`.
- [ ] Verify: `npm test --workspace=packages/core` still green (migration applies).

## Task 2: WebhookStore + HMAC (core)

**Files:** Create `webhook-store.js`, `test/webhook-store.test.js`; modify `index.js`.

- [ ] `verifyVercelSignature(rawBody, secret, signature)`: `HMAC-SHA1(rawBody, secret)` hex, timing-safe compare to `signature`; false on missing/length-mismatch.
- [ ] `WebhookStore` class: constructor `{ db }` builds repo + in-memory `Map`; `loadFromDb`, `createWebhook(agent, {name, signingSecret, staticArgs})` (id = `randomBytes(16).toString('hex')`), `getWebhook`, `listWebhooks(agent)`, `listAll`, `updateWebhook(id, updates)`, `deleteWebhook(id)`, `recordTrigger(id, runId)`.
- [ ] Test: repo CRUD round-trip; `updateWebhook` keeps `id`; `verifyVercelSignature` against a known vector.
- [ ] Export `WebhookStore` + `verifyVercelSignature` from core `index.js`.
- [ ] Verify: `npm test --workspace=packages/core` green.

## Task 3: Server routes

**Files:** Create `routes/webhooks.js`, `test/webhooks-route.test.js`; modify `index.js`.

- [ ] `createIngestRouter({ runManager, webhooks, agentsDir })`: `POST /webhooks/:id` — lookup (unknown/disabled → 404); if `signingSecret`, verify `x-vercel-signature` over `req.rawBody` (→ 401); build `args = { ...staticArgs, event: body.type, payload: rawBody-string }`; if agent not `multi_instance` and running → 200 `{skipped}`; else `dispatchRun` → 202 `{runId}`; record trigger.
- [ ] `adminRouter`: `GET /webhooks` (all), `GET/POST/DELETE /agents/:agent/webhooks`, `GET/PATCH/DELETE /agents/:agent/webhooks/:id`. Responses use `serializeWebhook` (omit raw secret, add `hasSigningSecret`, `ingestPath`). PATCH: blank/omitted `signingSecret` unchanged, `""`/null clears, value rotates.
- [ ] `index.js`: `express.json({ verify })` captures `req.rawBody`; construct `WebhookStore`, `loadFromDb`; mount ingest router before auth middleware; inject `req.webhooks`; mount `adminRouter` after injection.
- [ ] Test (supertest + fake manager): valid/invalid/missing signature, no-secret route, unknown/disabled id, static-arg merge, 401 CRUD without bearer (covered by app-level auth — tested via router unit with injected store), PATCH rotate/clear, GET /webhooks list.
- [ ] Verify: `npm test --workspace=packages/server` green.

## Task 4: Agent

**Files:** Create `agents/vercel-deploy-notify/agent.md`, `agents/vercel-deploy-notify/__test__.js`.

- [ ] `agent.md`: `runtime: node`, `multi_instance: true`, args `event` (optional), `payload` (required). Body parses payload, notifies via `execFileSync('notify', [msg])` only on `deployment.error`, silent otherwise, graceful field extraction, exit non-zero only when payload missing.
- [ ] Test: stub `notify` on PATH; assert called for `deployment.error`, not for `deployment.succeeded`; no-payload exits non-zero.

## Task 5: Dashboard

**Files:** modify `api.js`, `Dashboard.jsx`, `App.jsx`; create `WebhookForm.jsx`, `WebhookCard.jsx`.

- [ ] `api.js`: `fetchAllWebhooks`, `fetchWebhooks(agent)`, `createWebhook(agent,data)`, `updateWebhook(agent,id,data)`, `deleteWebhook(agent,id)`.
- [ ] `WebhookForm.jsx`: create/edit modes; fields agent (create only), name, enabled (edit), signingSecret (password, blank=keep), staticArgs JSON textarea (client-validated); create surfaces ingest URL + copy.
- [ ] `WebhookCard.jsx`: header (name/agent + active pill, click to edit), ingest URL + copy button, `signed` badge, last-triggered; delete with confirm; embeds `WebhookForm` mode=edit.
- [ ] `Dashboard.jsx`: `webhooks` tab loads `fetchAllWebhooks`, "+ New Webhook", list of `WebhookCard`.
- [ ] `App.jsx`: add `'webhooks'` to `VIEWS` + `VIEW_HELP`.
- [ ] Verify: `npm run build:dashboard` clean.

## Task 6: Docs

- [ ] Add a "Webhooks" section to `CLAUDE.md` mirroring "Scheduling": ingest URL, CRUD endpoints, signature note.
- [ ] Verify: full `npm test` green; `npm run build:dashboard` clean.
