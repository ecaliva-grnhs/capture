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

// Regression guards for "ERROR: 42P17: generation expression is not immutable".
// A GENERATED column's expression must be strictly IMMUTABLE; several
// plausible-looking builtins are only STABLE and fail at CREATE time on a
// fresh database — which is exactly how this bit us.

/** Strip `--` line comments so prose about a trap isn't mistaken for the trap. */
function withoutComments(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

/** The expression text of every `generated always as (...) stored` column. */
function generatedExpressions(text) {
  return [
    ...withoutComments(text).matchAll(
      /generated\s+always\s+as\s*\(([\s\S]*?)\)\s*stored/gi
    ),
  ].map((m) => m[1]);
}

test('no generated column uses a STABLE function', () => {
  // convert_to() depends on database encoding; array_to_string() and the
  // text[]->text cast depend on element output functions. All are STABLE.
  const stableFns = ['convert_to', 'array_to_string', '::text)'];
  const expressions = generatedExpressions(sql);
  assert.ok(expressions.length > 0, 'expected at least one generated column');
  for (const expr of expressions) {
    for (const fn of stableFns) {
      assert.ok(
        !expr.includes(fn),
        `generated column expression uses non-immutable "${fn}": ${expr.trim()}`
      );
    }
  }
});

test('body_hash uses the immutable ::bytea cast, not convert_to', () => {
  assert.match(sql, /encode\(sha256\(body::bytea\), 'hex'\)/);
  assert.ok(
    !/convert_to/.test(withoutComments(sql)),
    'convert_to() is STABLE and cannot appear in executable SQL here'
  );
});

test('body_tsv is trigger-maintained, not generated', () => {
  // Flattening tags[] has no immutable formulation, so the vector is
  // maintained by a trigger and backfilled for pre-existing rows.
  assert.match(sql, /add column if not exists body_tsv tsvector;/);
  assert.match(sql, /create trigger entries_tsv_update/);
  assert.match(sql, /before insert or update of body, summary, tags/);
  assert.match(sql, /update entries[\s\S]*?set body_tsv = entries_search_vector/);
});

test('full-text indexing uses an explicit regconfig', () => {
  // to_tsvector(text) is STABLE; to_tsvector(regconfig, text) is IMMUTABLE.
  const calls = [...sql.matchAll(/to_tsvector\(([^,)]*)/g)].map((m) => m[1].trim());
  assert.ok(calls.length > 0);
  for (const arg of calls) {
    assert.equal(arg, "'english'", `to_tsvector called without a regconfig: ${arg}`);
  }
});

test('triggers are dropped before creation so re-runs do not error', () => {
  for (const trigger of ['entries_tsv_update', 'entries_set_updated_at']) {
    assert.match(
      sql,
      new RegExp(`drop trigger if exists ${trigger} on entries;`),
      `${trigger} must be dropped before create`
    );
  }
});

test('schema is idempotent — no bare creates that would fail on re-run', () => {
  const bareCreateTable = /create table (?!if not exists)/i.test(sql);
  const bareCreateIndex = /create index (?!if not exists)/i.test(sql);
  assert.equal(bareCreateTable, false, 'create table must use IF NOT EXISTS');
  assert.equal(bareCreateIndex, false, 'create index must use IF NOT EXISTS');
});
