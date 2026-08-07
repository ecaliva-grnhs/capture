-- Thought Capture — database schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- It is idempotent: safe to run on a fresh project or over an earlier version.
--
-- Embedding dimension is 1024 to match Voyage AI `voyage-3.5`. If you swap
-- embedding models, change vector(1024) here AND in search_entries() below.

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- entries
-- ---------------------------------------------------------------------------

create table if not exists entries (
  id          uuid primary key default gen_random_uuid(),
  body        text not null,
  tags        text[] not null default '{}',
  summary     text,
  source      text,
  url         text,
  created_at  timestamptz not null default now(),
  embedding   vector(1024)
);

-- Added after v1 — `add column if not exists` keeps upgrades painless.

-- Set when an entry was saved but enrichment (tagging/embedding) failed, so a
-- backfill pass can find and repair it.
alter table entries
  add column if not exists needs_enrichment boolean not null default false;

alter table entries
  add column if not exists updated_at timestamptz not null default now();

-- Stable hash of the body, used to collapse duplicate captures (a
-- double-tapped Shortcut) without a unique constraint that would hard-fail.
--
-- NOTE: `body::bytea`, not `convert_to(body, 'UTF8')`. convert_to() is marked
-- STABLE (its result depends on the database encoding), and a generated column
-- requires a strictly IMMUTABLE expression — Postgres rejects the table with
-- "ERROR: 42P17: generation expression is not immutable". The cast is
-- immutable and, on a UTF8 database (Supabase's default), produces identical
-- bytes, so this still matches Node's sha256(body, 'utf8') in lib/ingest.js.
alter table entries
  add column if not exists body_hash text
  generated always as (encode(sha256(body::bytea), 'hex')) stored;

-- Lexical search vector, weighted so summary/tags (A) outrank the body (B).
--
-- Trigger-maintained rather than GENERATED: flattening `tags` requires
-- array_to_string(), which is STABLE (array element output functions are not
-- guaranteed immutable), and every inline alternative — array_to_string,
-- tags::text — trips the same immutability check. A trigger has no such
-- restriction and keeps the weighting in one place.
alter table entries
  add column if not exists body_tsv tsvector;

-- Single source of truth for the search vector: used by both the trigger and
-- the backfill below. Plain functions carry no immutability requirement.
create or replace function entries_search_vector(
  p_summary text,
  p_tags    text[],
  p_body    text
)
returns tsvector
language sql
stable
as $$
  select setweight(to_tsvector('english', coalesce(p_summary, '')), 'A')
      || setweight(to_tsvector('english', coalesce(array_to_string(p_tags, ' '), '')), 'A')
      || setweight(to_tsvector('english', coalesce(p_body, '')), 'B');
$$;

create or replace function entries_set_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.body_tsv := entries_search_vector(new.summary, new.tags, new.body);
  return new;
end;
$$;

drop trigger if exists entries_tsv_update on entries;
create trigger entries_tsv_update
  before insert or update of body, summary, tags on entries
  for each row execute function entries_set_search_vector();

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists entries_set_updated_at on entries;
create trigger entries_set_updated_at
  before update on entries
  for each row execute function set_updated_at();

-- Populate the vector for any pre-existing rows. No-op once current, so
-- re-running the file costs nothing.
update entries
   set body_tsv = entries_search_vector(summary, tags, body)
 where body_tsv is null;

-- Reverse-chron feed
create index if not exists entries_created_at_idx
  on entries (created_at desc);

-- Tag filtering (array containment)
create index if not exists entries_tags_idx
  on entries using gin (tags);

-- Semantic search (cosine)
create index if not exists entries_embedding_idx
  on entries using hnsw (embedding vector_cosine_ops);

-- Full-text search
create index if not exists entries_tsv_idx
  on entries using gin (body_tsv);

-- Duplicate lookup on ingest
create index if not exists entries_body_hash_idx
  on entries (body_hash, created_at desc);

-- Backfill scans: tiny partial index over just the broken rows.
create index if not exists entries_needs_enrichment_idx
  on entries (created_at)
  where needs_enrichment;

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------

-- v1 shipped match_entries(); search_entries() supersedes it.
drop function if exists match_entries(vector, int, text[]);

-- Hybrid search: fuse semantic (cosine) and lexical (full-text) rankings with
-- Reciprocal Rank Fusion. RRF needs no score normalisation between the two
-- very differently-scaled systems — it only uses each result's rank.
--
-- Degrades in both directions: a null query_embedding (embedding provider
-- down) falls back to pure full-text, and a query with no lexical hits falls
-- back to pure vector.
--
-- Tag filter uses @> (entry must have ALL selected tags), matching the feed.
create or replace function search_entries(
  query_embedding vector(1024) default null,
  query_text      text    default '',
  match_count     int     default 20,
  match_offset    int     default 0,
  filter_tags     text[]  default null
)
returns table (
  id         uuid,
  body       text,
  tags       text[],
  summary    text,
  source     text,
  url        text,
  created_at timestamptz,
  similarity float,
  score      float
)
language sql
stable
as $$
  with filtered as (
    select e.*
    from entries e
    where filter_tags is null
       or cardinality(filter_tags) = 0
       or e.tags @> filter_tags
  ),
  -- Over-fetch each arm so fusion has depth to work with beyond the page.
  pool as (
    select (match_count + match_offset) * 4 + 20 as n
  ),
  vec as (
    select
      f.id,
      row_number() over (order by f.embedding <=> query_embedding) as rnk,
      1 - (f.embedding <=> query_embedding) as sim
    from filtered f, pool
    where query_embedding is not null
      and f.embedding is not null
    order by f.embedding <=> query_embedding
    limit (select n from pool)
  ),
  q as (
    select websearch_to_tsquery('english', nullif(trim(query_text), '')) as tsq
  ),
  fts as (
    select
      f.id,
      row_number() over (
        order by ts_rank_cd(f.body_tsv, q.tsq) desc, f.created_at desc
      ) as rnk
    from filtered f, q, pool
    where q.tsq is not null
      and f.body_tsv @@ q.tsq
    order by ts_rank_cd(f.body_tsv, q.tsq) desc, f.created_at desc
    limit (select n from pool)
  )
  select
    f.id,
    f.body,
    f.tags,
    f.summary,
    f.source,
    f.url,
    f.created_at,
    vec.sim as similarity,
    (coalesce(1.0 / (60 + vec.rnk), 0) + coalesce(1.0 / (60 + fts.rnk), 0))::float
      as score
  from filtered f
  left join vec on vec.id = f.id
  left join fts on fts.id = f.id
  where vec.id is not null or fts.id is not null
  order by score desc, f.created_at desc
  limit match_count
  offset match_offset;
$$;

-- Distinct tags with counts for the filter UI. When filter_tags is supplied,
-- counts are computed over the matching subset so the chips show what further
-- narrowing is actually available.
create or replace function tag_counts(filter_tags text[] default null)
returns table (tag text, count bigint)
language sql
stable
as $$
  select t.tag, count(*)::bigint as count
  from entries e
  cross join lateral unnest(e.tags) as t(tag)
  where filter_tags is null
     or cardinality(filter_tags) = 0
     or e.tags @> filter_tags
  group by t.tag
  order by count desc, t.tag asc;
$$;

-- ---------------------------------------------------------------------------
-- Rate limiting
-- ---------------------------------------------------------------------------
-- Serverless functions don't share memory, so the limiter lives in Postgres.

create table if not exists rate_limit_hits (
  bucket text        not null,
  hit_at timestamptz not null default now()
);

create index if not exists rate_limit_hits_idx
  on rate_limit_hits (bucket, hit_at desc);

-- Sliding-window limiter. Returns true when the call is allowed (and records
-- the hit), false when the bucket is over budget.
create or replace function check_rate_limit(
  bucket_key     text,
  max_hits       int,
  window_seconds int
)
returns boolean
language plpgsql
volatile
as $$
declare
  cutoff timestamptz := now() - make_interval(secs => window_seconds);
  hits   int;
begin
  delete from rate_limit_hits
    where bucket = bucket_key and hit_at < cutoff;

  select count(*) into hits
    from rate_limit_hits
    where bucket = bucket_key and hit_at >= cutoff;

  if hits >= max_hits then
    return false;
  end if;

  insert into rate_limit_hits (bucket) values (bucket_key);
  return true;
end;
$$;
