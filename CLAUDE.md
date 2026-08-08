# CLAUDE.md

Guidance for future Claude Code sessions working in this repo. Read this first,
then `README.md` (user-facing setup) and `supabase/schema.sql` (the database
contract). This file documents how the system fits together, how it ships, and
the conventions to keep.

## What this is

**Thought Capture** — a personal, single-user thought-capture app. You jot a
thought (from an Apple Shortcut or the installable PWA); Claude auto-tags it and
writes a one-line summary; Voyage embeds the body for semantic search. The UI is
a reverse-chronological feed with hybrid (semantic + keyword) search and tag
filtering.

- **Live:** https://capture-sage-two.vercel.app
- **Deploy:** Vercel auto-deploys from `main` (see [Deploy flow](#deploy-flow)).
- **Repo:** `ecaliva-grnhs/capture`

## Stack

- **Next.js 15 (App Router)** on Vercel — **plain JavaScript, not TypeScript**,
  ESM throughout (`"type": "module"` in `package.json`).
- **Supabase** (Postgres + `pgvector` + `tsvector`) — the only datastore. The
  schema is already applied to the live project.
- **Claude API** (`@anthropic-ai/sdk`) — auto-tagging + summary.
- **Voyage AI** — text embeddings (Anthropic ships no embeddings endpoint).
- **React 18**, no component framework, no CSS framework (hand-written
  `app/globals.css`).

## Architecture

### Write path (ingest)

```
Apple Shortcut / PWA
      │  POST /api/entries  { body, source?, url? }   x-capture-token: <TOKEN>
      ▼
requireCaptureToken → rate limit → parse/validate payload
      ▼
createEntry (lib/ingest.js)
      ├─ dedupe: sha256(body) within DEDUPE_WINDOW_SEC → collapse to existing
      ▼
enrich (lib/enrich.js) — Promise.allSettled, settled independently:
      ├─ autoTag (lib/anthropic.js)  → tags[] + summary   (forced tool call)
      └─ embed   (lib/embeddings.js) → 1024-dim vector
      ▼
insert into Supabase `entries` (needs_enrichment = true if either arm failed)
```

**The core invariant: a capture is never lost to a third-party outage.**
`enrich()` never throws — a failed arm degrades to `null` and the row is flagged
`needs_enrichment`, to be repaired later by the backfill pass. The insert always
runs; the only way to lose a thought is Postgres itself being unreachable, which
answers `503` so the client retries. If the *network* is down, the PWA writes the
thought to an IndexedDB outbox and replays it on reconnect.

### Read path

- **Feed** — `GET /api/entries`, reverse-chron, tag-filtered (AND), cursor-paged
  on `created_at`.
- **Search** — `GET /api/search`, hybrid. The query is embedded (semantic) *and*
  passed as text (full-text); the two rankings are fused with Reciprocal Rank
  Fusion inside `search_entries()` in Postgres. Degrades to full-text if
  embedding is unavailable (`semantic: false` in the response), and to pure
  vector if there are no lexical hits.
- **Tags** — `GET /api/tags`, filter-aware counts for the chips.

### Repair path

- `GET|POST /api/maintenance/backfill` re-enriches rows where
  `needs_enrichment = true OR embedding IS NULL`, a small batch per call,
  reporting `remaining`. Run by the Vercel cron (see below) and callable
  manually.

## Security model

- **Fails closed.** Every route except `GET /api/health` requires `CAPTURE_TOKEN`
  (`lib/auth.js`, constant-time compare). If the token env var is unset,
  `required()` throws `503` and writes are refused — "single user, no auth" means
  no accounts, **not** an open database.
- The Supabase **service-role key bypasses RLS**, so `CAPTURE_TOKEN` is the real
  access control. The service-role key is server-only and never reaches the
  browser (`lib/supabase.js` runs on the server exclusively).
- Token is accepted as `x-capture-token: <TOKEN>` **or** `Authorization: Bearer
  <TOKEN>`. The cron endpoint additionally accepts `CRON_SECRET` (Vercel Cron can
  only issue a GET with a bearer token).
- Only `http(s)` URLs are storable (`lib/validate.js#safeUrl`) — the feed renders
  `url` as a link, so other schemes (`javascript:`) are rejected.
- `lib/http.js` ensures only `ApiError` messages reach the client; everything
  else is logged server-side and returned as a generic `500`.
- **Rate limiting lives in Postgres** (`check_rate_limit` RPC), not process
  memory — serverless instances don't share state. Fails *open* so a broken
  limiter never blocks a capture.

## Endpoints

All require the capture token except `GET /api/health`. Handlers live under
`app/api/**/route.js`; all are `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/entries` | Ingest a thought (Shortcut/PWA). `201` new, `200` deduped. |
| `GET` | `/api/entries?tag=&limit=&before=` | Reverse-chron feed; repeat `tag` for AND; `before` is a `created_at` cursor. |
| `PATCH` | `/api/entries/:id` | Edit. Changing `body` re-enriches; explicit `tags`/`summary` override. |
| `DELETE` | `/api/entries/:id` | Remove an entry. |
| `GET` | `/api/search?q=&tag=&limit=&offset=` | Hybrid semantic + full-text search. |
| `GET` | `/api/tags?tag=` | Filter-aware tag counts. |
| `GET|POST` | `/api/maintenance/backfill?limit=` | Repair degraded entries (cron + manual). |
| `GET` | `/api/health` | **Unauthenticated.** Lists missing required env var *names* only. |
| `GET` | `/manifest.webmanifest` | PWA manifest (route handler, not a static file). |

## Environment variables (names only — never commit values)

Defined and validated in `lib/env.js`. `.env.example` is the template; local dev
uses `.env.local`. Set the same names in the Vercel project.

**Required** (`REQUIRED_VARS`; a missing one fails closed and shows in
`/api/health`):

- `CAPTURE_TOKEN` — shared secret guarding every route.
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — service-role key, server-only.
- `ANTHROPIC_API_KEY`
- `VOYAGE_API_KEY`

**Optional:**

- `CRON_SECRET` — set by Vercel Cron; also accepted by the backfill route.
- `CLAUDE_MODEL` — default `claude-haiku-4-5-20251001`.
- `VOYAGE_MODEL` — default `voyage-3.5` (**1024-dim**, must match the schema).
- `ENRICH_TIMEOUT_MS` — per-call enrichment budget, default `9000`.
- `MAX_BODY_CHARS` — ingest size cap, default `20000`.
- `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_SEC` — default `60` per `60`s.
- `DEDUPE_WINDOW_SEC` — duplicate-collapse window, default `300`.

## Database

- Single source of truth: **`supabase/schema.sql`** — idempotent, safe to re-run.
  Already applied to the live project. Run it in the Supabase SQL editor after
  changes.
- Table `entries` plus `rate_limit_hits`. Key server-side functions:
  `search_entries()` (RRF hybrid search), `tag_counts()`, `check_rate_limit()`.
- **Embedding dimension is `vector(1024)` to match `voyage-3.5`.** Changing the
  embedding model means changing the column **and** `search_entries()` together;
  `npm test` (`tests/schema.test.js`) asserts the SQL and JS client agree.
- `body_hash` (generated) and `body_tsv` (trigger-maintained) have immutability
  constraints — see the comments in the SQL before touching them (a prior commit
  fixed a non-immutable generated column). `body_tsv` is trigger-maintained *by
  design* because `array_to_string`/`convert_to` are only `STABLE`.

## Deploy flow

- **Vercel auto-deploys every push to `main`** → https://capture-sage-two.vercel.app.
  There is no separate build/release step; a push is the deploy.
- After pushing, confirm Vercel picked it up (a new deployment tied to the commit
  SHA) and that `GET /api/health` returns `{ ok: true }` on the live URL.
- **`vercel.json`** schedules the maintenance cron: `path`
  `/api/maintenance/backfill`, `schedule` `0 9 * * *` (**once daily at 09:00
  UTC** — this is the Vercel Hobby-tier cron limit; earlier notes describing an
  "hourly" backfill are stale, the code and cron are daily). `CRON_SECRET` must
  be set in Vercel for the cron to authenticate.

## Conventions

- **Plain JS + ESM**, no TypeScript. Path alias `@/*` → repo root
  (`jsconfig.json`); use `@/lib/...` from app routes.
- **Dependency injection for testability.** `createEntry`, `enrich`, etc. accept
  their collaborators (`supabase`, `enrich`, `autoTag`, `embed`, `now`) as
  options so tests run with no network or database. Keep new logic testable the
  same way.
- **Error handling** goes through `lib/errors.js` / `lib/http.js`: throw an
  `ApiError` (or the `badRequest`/`unauthorized`/`notFound`/`tooManyRequests`/
  `unavailable` helpers) for anything client-facing; wrap handlers in `route()`.
- **Enrichment must never fail a capture.** Anything on the write path that calls
  a third party belongs behind the `enrich()` allSettled pattern, not inline in
  the request.
- **Tags** are normalized lowercase, `#`-stripped, deduped, ≤8, each ≤40 chars
  (`lib/anthropic.js#normalizeTags`, mirrored in the PATCH route).
- **Service worker is network-first for navigations** (`public/sw.js`); only
  immutable `/_next/static/*` is cache-first. A cache-first HTML shell goes stale
  on deploy and points at hashed chunks that 404 → blank screen. Don't change
  this without understanding why.
- **Client token** lives in `localStorage` (`lib/client/api.js`); the PWA prompts
  for it once via `TokenGate`. Offline captures queue in IndexedDB
  (`lib/client/outbox.js`) and replay on `online`/visibility — iOS Safari has no
  Background Sync, so the page drives the flush.
- **Commands:** `npm run dev`, `npm run build`, `npm test` (Node's built-in test
  runner, `tests/**/*.test.js`, no network/DB), `npm run lint`. Run `npm test`
  and `npm run lint` before pushing — a push to `main` is a production deploy.

## Design

Designs live in **Figma file `HbbMZ6R6dgsWt4lTNV9qa0`**, on the **"Capture App"**
page. Two directions are explored there:

- **Direction A — light / "Worklist":** light theme, worklist-style layout.
- **Direction B — dark mono:** dark, monochrome treatment.

The shipped UI (`app/`, `components/`, `app/globals.css`) is dark-themed
(`themeColor` `#0b0b0f`); reconcile against the current Figma direction before
larger UI work.

## Repo map

```
app/
  page.jsx                     feed + search + compose (client)
  layout.jsx                   metadata, PWA/apple-web-app config
  globals.css                  all styling (no framework)
  manifest.webmanifest/route.js
  api/
    entries/route.js           POST ingest, GET feed
    entries/[id]/route.js      PATCH, DELETE
    search/route.js            hybrid search
    tags/route.js              tag counts
    health/route.js            unauthenticated config check
    maintenance/backfill/route.js   repair pass (cron + manual)
components/                    EntryCard, ComposeSheet, TokenGate
lib/
  env.js                       env access + CONFIG tunables
  auth.js                      token guards (capture + cron)
  ingest.js                    createEntry (dedupe → enrich → insert)
  enrich.js                    failure-tolerant tag+embed
  anthropic.js                 Claude auto-tag (forced tool call)
  embeddings.js                Voyage embed
  supabase.js                  server client (service-role)
  ratelimit.js                 Postgres-backed limiter
  validate.js                  payload/URL/cursor/limit parsing
  http.js / errors.js          ApiError + route() wrapper
  client/api.js                browser fetch helper + token
  client/outbox.js             IndexedDB offline queue
public/sw.js                   service worker (network-first navigations)
supabase/schema.sql            full DB schema (idempotent)
tests/                         node:test unit tests (no network/DB)
vercel.json                    daily backfill cron
```
