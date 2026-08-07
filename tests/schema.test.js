import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { EMBEDDING_DIMENSIONS } from '../lib/embeddings.js';
import { ENTRY_FIELDS } from '../lib/ingest.js';

const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

test('entries table declares every spec column', () => {
  for (const column of [
    'body',
    'tags',
    'summary',
    'source',
    'url',
    'created_at',
    'embedding',
  ]) {
    assert.match(sql, new RegExp(`\\b${column}\\b`), `missing column: ${column}`);
  }
});

test('embedding dimension matches the embedding client', () => {
  // A mismatch here fails only at insert time, in production.
  assert.match(sql, new RegExp(`vector\\(${EMBEDDING_DIMENSIONS}\\)`));
});

test('every field the API selects exists in the schema', () => {
  for (const field of ENTRY_FIELDS.split(',').map((f) => f.trim())) {
    assert.match(sql, new RegExp(`\\b${field}\\b`), `not in schema: ${field}`);
  }
});

test('indexes exist for feed, tags, semantic and full-text search', () => {
  assert.match(sql, /create index if not exists entries_created_at_idx/);
  assert.match(sql, /entries_tags_idx[\s\S]*?using gin \(tags\)/);
  assert.match(sql, /entries_embedding_idx[\s\S]*?using hnsw/);
  assert.match(sql, /entries_tsv_idx[\s\S]*?using gin \(body_tsv\)/);
});

test('tag filtering uses AND semantics in both search and feed', () => {
  // v1 mismatch: the feed used @> (all tags) while search used && (any tag),
  // so the same chips produced different results in the two modes.
  assert.match(sql, /e\.tags @> filter_tags/);
  assert.ok(
    !/e\.tags && filter_tags/.test(sql),
    'search must not fall back to overlap semantics'
  );
});

test('search degrades to full-text when no embedding is supplied', () => {
  assert.match(sql, /query_embedding is not null/);
  assert.match(sql, /websearch_to_tsquery/);
});

test('the superseded match_entries function is dropped', () => {
  assert.match(sql, /drop function if exists match_entries/);
});

test('rate limiting is enforced in the database, not per-instance', () => {
  assert.match(sql, /create table if not exists rate_limit_hits/);
  assert.match(sql, /function check_rate_limit/);
});

test('schema is idempotent — no bare creates that would fail on re-run', () => {
  const bareCreateTable = /create table (?!if not exists)/i.test(sql);
  const bareCreateIndex = /create index (?!if not exists)/i.test(sql);
  assert.equal(bareCreateTable, false, 'create table must use IF NOT EXISTS');
  assert.equal(bareCreateIndex, false, 'create index must use IF NOT EXISTS');
});
