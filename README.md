# Thought Capture

A personal, single-user thought-capture app. Jot a thought from an Apple
Shortcut or the PWA; Claude auto-tags it and writes a one-line summary; the
body is embedded for semantic search. Browse a reverse-chronological feed,
search by meaning, and filter by tag.

**Stack:** Next.js (App Router) on Vercel · Supabase (Postgres + pgvector) ·
Claude API for auto-tagging · Voyage AI for embeddings.

## How it works

```
Apple Shortcut / PWA
        │  POST /api/entries { body, source?, url? }
        ▼
   ┌─────────────────────────────────────────┐
   │ Claude  → tags[] + one-line summary      │  (parallel)
   │ Voyage  → 1024-dim embedding of body     │
   └─────────────────────────────────────────┘
        │  insert row
        ▼
   Supabase `entries` (Postgres + pgvector)
        ▲
        │  GET /api/entries  (reverse-chron feed, tag filter)
        │  GET /api/search   (embed query → cosine ranking via match_entries)
        │  GET /api/tags     (tag counts for filter chips)
        ▼
   Responsive PWA feed
```

## Setup

### 1. Database

In the Supabase SQL editor, run [`supabase/schema.sql`](supabase/schema.sql).
It creates the `entries` table, the pgvector index, and the `match_entries` /
`tag_counts` RPCs.

> The embedding column is `vector(1024)` to match Voyage `voyage-3.5`. If you
> change the embedding model/dimension, update both the schema and the RPC.

### 2. Environment

Copy `.env.example` to `.env.local` and fill in the values:

| Var | What |
| --- | --- |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (server-only) |
| `ANTHROPIC_API_KEY` | Claude API key |
| `VOYAGE_API_KEY` | Voyage AI key (embeddings) |
| `INGEST_SECRET` | Optional shared secret guarding `POST /api/entries` |
| `CLAUDE_MODEL` / `VOYAGE_MODEL` | Optional model overrides |

### 3. Run

```bash
npm install
npm run dev
```

### 4. Deploy

Push to a Git repo and import into Vercel. Add the same environment variables
in the Vercel project settings. No build config needed — Next.js is detected
automatically.

## API

### `POST /api/entries`

Ingest a thought. This is what the Apple Shortcut calls.

```jsonc
// Request
{ "body": "text of the thought", "source": "shortcut", "url": "https://…" }
// only "body" is required

// Response 201
{ "entry": { "id", "body", "tags", "summary", "source", "url", "created_at" } }
```

If `INGEST_SECRET` is set, send it as `Authorization: Bearer <secret>` (or an
`x-ingest-secret` header).

### `GET /api/entries?tag=…&limit=30&before=<iso>`

Reverse-chronological feed. Repeat `tag` to require multiple tags. `before` is
a `created_at` cursor for pagination; the response includes `nextCursor`.

### `GET /api/search?q=…&tag=…&limit=20`

Semantic search. Embeds `q` and ranks entries by cosine similarity, optionally
constrained to entries overlapping the given tags. Each result includes a
`similarity` score in `[0,1]`.

### `GET /api/tags`

Distinct tags with usage counts, most-used first.

## Apple Shortcut

Create a Shortcut with a **Get Contents of URL** action:

- **URL:** `https://<your-app>.vercel.app/api/entries`
- **Method:** `POST`
- **Headers:** `Content-Type: application/json` (and, if you set one,
  `Authorization: Bearer <INGEST_SECRET>`)
- **Request Body (JSON):**
  - `body` → Shortcut Input / dictated text
  - `source` → `"shortcut"` (optional)
  - `url` → the current Safari URL, when sharing a page (optional)

Add it to the Share Sheet and/or Home Screen to capture from anywhere.
```
