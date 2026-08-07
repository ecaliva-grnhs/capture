# Thought Capture

A personal, single-user thought-capture app. Jot a thought from an Apple
Shortcut or the PWA; Claude auto-tags it and writes a one-line summary; the
body is embedded for semantic search. Browse a reverse-chronological feed,
search by meaning *or* keyword, and filter by tag.

**Stack:** Next.js (App Router) on Vercel · Supabase (Postgres + pgvector) ·
Claude API for auto-tagging · Voyage AI for embeddings.

## Design guarantees

Two properties drive most of the code:

**A capture is never lost to someone else's outage.** Tagging and embedding run
concurrently and are settled independently — if Claude is overloaded or Voyage
times out, the entry is still written, flagged `needs_enrichment`, and repaired
later by the backfill pass. If the *network* is down, the PWA writes the thought
to an IndexedDB outbox and replays it on reconnect. The only way to lose a
thought is for Postgres itself to be unreachable, which answers 503 so the
client can retry.

**The API fails closed.** Every route requires `CAPTURE_TOKEN`. If it is unset,
requests are refused rather than served openly — "single user, no auth" means
no accounts, not an open database. The Supabase service-role key bypasses RLS,
so this token is the real access control.

## How it works

```
Apple Shortcut / PWA
        │  POST /api/entries  { body, source?, url? }
        │  x-capture-token: <CAPTURE_TOKEN>
        ▼
   dedupe (sha256 of body, within DEDUPE_WINDOW_SEC)
        │
        ▼
   ┌──────────────────────────────────────────────┐
   │ Claude  → tags[] + one-line summary          │  concurrent,
   │ Voyage  → 1024-dim embedding                 │  independently settled
   └──────────────────────────────────────────────┘
        │  insert (always — a failed arm degrades to null)
        ▼
   Supabase `entries` (Postgres + pgvector + tsvector)
        ▲
        │  GET  /api/entries   reverse-chron feed, tag filter, cursor paging
        │  GET  /api/search    hybrid: vector + full-text, fused with RRF
        │  GET  /api/tags      filter-aware tag counts
        │  PATCH/DELETE /api/entries/:id
        │  GET/POST /api/maintenance/backfill   repair degraded entries
        ▼
   Responsive PWA feed (installable, offline-capable)
```

## Setup

### 1. Database

Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor. It
is idempotent — safe on a fresh project or over an earlier version.

> The embedding column is `vector(1024)` to match Voyage `voyage-3.5`. Changing
> the embedding model means changing the column and `search_entries()` together;
> `npm test` asserts the schema and the client agree.

### 2. Environment

Copy `.env.example` to `.env.local` and fill it in.

| Var | Required | What |
| --- | --- | --- |
| `CAPTURE_TOKEN` | **yes** | Shared secret for every API route. `openssl rand -base64 32` |
| `SUPABASE_URL` | **yes** | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Service-role key (server-only) |
| `ANTHROPIC_API_KEY` | **yes** | Claude API key |
| `VOYAGE_API_KEY` | **yes** | Voyage AI key (embeddings) |
| `CRON_SECRET` | no | Set by Vercel Cron; also accepted by the backfill route |
| `CLAUDE_MODEL`, `VOYAGE_MODEL` | no | Model overrides |
| `ENRICH_TIMEOUT_MS` | no | Per-call enrichment budget (default 9000) |
| `MAX_BODY_CHARS` | no | Ingest size cap (default 20000) |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_SEC` | no | Default 60 per 60s |
| `DEDUPE_WINDOW_SEC` | no | Duplicate collapse window (default 300) |

`GET /api/health` is unauthenticated and lists which required variables are
missing (names only, never values) — that's how you tell a misconfigured deploy
apart from a wrong token.

### 3. Run

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 44 unit tests, no network or database needed
npm run lint
```

The PWA asks for the capture token once and stores it in `localStorage`.

### 4. Deploy

Import the repo into Vercel and add the same environment variables. The
included `vercel.json` schedules the hourly backfill; set `CRON_SECRET` in
Vercel so the cron can authenticate.

## API

All routes require `x-capture-token: <CAPTURE_TOKEN>` (or
`Authorization: Bearer <CAPTURE_TOKEN>`), except `GET /api/health`.

### `POST /api/entries`

Ingest a thought — this is what the Apple Shortcut calls.

```jsonc
// Request — only "body" is required
{ "body": "text of the thought", "source": "shortcut", "url": "https://…" }

// 201 Created (200 if it collapsed into a recent duplicate)
{ "entry": { … }, "duplicate": false, "degraded": false }
```

`degraded: true` means the entry saved but tagging or embedding failed; the
backfill pass will repair it. `url` must be `http(s)` — other schemes are
rejected, since the feed renders it as a link.

### `GET /api/entries?tag=…&limit=30&before=<iso>`

Reverse-chronological feed. Repeat `tag` to require **all** of them. `before`
is a `created_at` cursor; the response carries `nextCursor`.

### `GET /api/search?q=…&tag=…&limit=20&offset=0`

Hybrid search. The query is embedded for semantic matching *and* passed as text
for full-text matching; the two rankings are fused with Reciprocal Rank Fusion,
so "that thing about deadlines slipping" and an exact error string both find
their entry. Tag filtering is AND, matching the feed. `semantic: false` in the
response means the embedding provider was unavailable and results are
keyword-only.

### `PATCH /api/entries/:id` · `DELETE /api/entries/:id`

Edit or remove an entry. Changing `body` re-runs tagging and re-embeds, so
search stays consistent with the text; explicitly supplied `tags`/`summary`
override the regenerated values.

### `GET /api/tags?tag=…`

Tag counts for the filter chips, scoped to any tags already selected.

### `GET|POST /api/maintenance/backfill?limit=10`

Repair entries saved while enrichment was unavailable. Processes a small batch
per call and reports `remaining`; the Vercel cron runs it hourly.

## Apple Shortcut

Create a Shortcut with a **Get Contents of URL** action:

- **URL:** `https://<your-app>.vercel.app/api/entries`
- **Method:** `POST`
- **Headers:**
  - `Content-Type: application/json`
  - `x-capture-token: <your CAPTURE_TOKEN>`
- **Request Body (JSON):**
  - `body` → Shortcut Input / dictated text
  - `source` → `"shortcut"` (optional)
  - `url` → the current Safari URL when sharing a page (optional)

Add it to the Share Sheet and/or Home Screen to capture from anywhere.

## Notes

- **Embeddings come from Voyage, not Claude** — Anthropic ships no embeddings
  endpoint, and Voyage is its recommended provider. That is a third vendor in
  the write path, which is exactly why enrichment is failure-tolerant.
- **Rate limiting lives in Postgres**, not in process memory: serverless
  instances don't share state, so an in-process counter would only limit
  whichever instance happened to answer.
- **The service worker is network-first for navigations.** A cache-first HTML
  shell goes stale on deploy and points at hashed chunks that no longer exist,
  which shows up as a blank screen. Only immutable `/_next/static/*` is
  cache-first.
