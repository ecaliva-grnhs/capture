-- Thought Capture — database schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
--
-- Embedding dimension is 1024 to match Voyage AI `voyage-3.5` (Anthropic's
-- recommended embedding provider). If you swap embedding models, change the
-- vector(1024) dimension here AND in match_entries() below to match.

-- pgvector for semantic search
create extension if not exists vector;
-- gen_random_uuid()
create extension if not exists pgcrypto;

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

-- Reverse-chron feed
create index if not exists entries_created_at_idx
  on entries (created_at desc);

-- Tag filtering (array containment / overlap)
create index if not exists entries_tags_idx
  on entries using gin (tags);

-- Approximate nearest-neighbour search over embeddings (cosine distance).
-- HNSW gives good recall without a training step. Build it after you have
-- rows if you prefer, but it is safe to create up front.
create index if not exists entries_embedding_idx
  on entries using hnsw (embedding vector_cosine_ops);

-- Semantic search RPC. Returns rows ordered by cosine similarity, optionally
-- constrained to entries that overlap `filter_tags`.
create or replace function match_entries(
  query_embedding vector(1024),
  match_count     int    default 20,
  filter_tags     text[] default null
)
returns table (
  id         uuid,
  body       text,
  tags       text[],
  summary    text,
  source     text,
  url        text,
  created_at timestamptz,
  similarity float
)
language sql
stable
as $$
  select
    e.id,
    e.body,
    e.tags,
    e.summary,
    e.source,
    e.url,
    e.created_at,
    1 - (e.embedding <=> query_embedding) as similarity
  from entries e
  where e.embedding is not null
    and (
      filter_tags is null
      or cardinality(filter_tags) = 0
      or e.tags && filter_tags
    )
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

-- Distinct tags with counts, for the filter UI.
create or replace function tag_counts()
returns table (tag text, count bigint)
language sql
stable
as $$
  select t.tag, count(*)::bigint as count
  from entries e, unnest(e.tags) as t(tag)
  group by t.tag
  order by count desc, t.tag asc;
$$;
