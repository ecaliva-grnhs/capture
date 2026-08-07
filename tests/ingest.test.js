import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createEntry, bodyHash } from '../lib/ingest.js';

const vector = Array.from({ length: 1024 }, () => 0.1);

/**
 * Chainable stand-in for the supabase-js query builder. Records what was
 * inserted and what the duplicate lookup was asked for.
 */
function fakeDb({ existing = null, insertError = null, dupeError = null } = {}) {
  const calls = { inserted: null, filters: {} };

  const selectChain = {
    eq(col, val) {
      calls.filters[col] = val;
      return selectChain;
    },
    gte(col, val) {
      calls.filters[col] = val;
      return selectChain;
    },
    order: () => selectChain,
    limit: () => selectChain,
    maybeSingle: async () => ({ data: existing, error: dupeError }),
  };

  return {
    calls,
    from() {
      return {
        select: () => selectChain,
        insert(row) {
          calls.inserted = row;
          return {
            select: () => ({
              single: async () =>
                insertError
                  ? { data: null, error: insertError }
                  : { data: { id: 'new-id', ...row }, error: null },
            }),
          };
        },
      };
    },
  };
}

const enrichOk = async () => ({
  tags: ['alpha'],
  summary: 'Summary.',
  embedding: vector,
  degraded: false,
});

test('inserts an enriched entry', async () => {
  const db = fakeDb();
  const { entry, duplicate, degraded } = await createEntry(
    { body: 'hello world', source: 'shortcut', url: null },
    { supabase: db, enrich: enrichOk }
  );

  assert.equal(duplicate, false);
  assert.equal(degraded, false);
  assert.equal(entry.body, 'hello world');
  assert.deepEqual(db.calls.inserted.tags, ['alpha']);
  assert.equal(db.calls.inserted.embedding.length, 1024);
  assert.equal(db.calls.inserted.needs_enrichment, false);
});

test('saves the entry even when enrichment degrades completely', async () => {
  // The core guarantee: a capture is never lost to a failing third party.
  const db = fakeDb();
  const { entry, degraded } = await createEntry(
    { body: 'still saved', source: 'shortcut', url: null },
    {
      supabase: db,
      enrich: async () => ({
        tags: [],
        summary: null,
        embedding: null,
        degraded: true,
      }),
    }
  );

  assert.equal(entry.body, 'still saved');
  assert.equal(degraded, true);
  assert.equal(db.calls.inserted.embedding, null);
  // Flagged so the backfill pass can repair it later.
  assert.equal(db.calls.inserted.needs_enrichment, true);
});

test('collapses a duplicate captured inside the window', async () => {
  const existing = { id: 'old-id', body: 'same text' };
  const db = fakeDb({ existing });

  let enrichCalled = false;
  const { entry, duplicate } = await createEntry(
    { body: 'same text', source: 'shortcut', url: null },
    {
      supabase: db,
      enrich: async () => {
        enrichCalled = true;
        return enrichOk();
      },
    }
  );

  assert.equal(duplicate, true);
  assert.equal(entry.id, 'old-id');
  assert.equal(db.calls.inserted, null, 'must not insert a second row');
  assert.equal(enrichCalled, false, 'must not pay for enrichment on a dupe');
});

test('duplicate lookup uses the sha256 of the body', async () => {
  const db = fakeDb();
  await createEntry(
    { body: 'hash me', source: 'shortcut', url: null },
    { supabase: db, enrich: enrichOk }
  );
  assert.equal(db.calls.filters.body_hash, bodyHash('hash me'));
});

test('a failed duplicate check does not block the capture', async () => {
  const db = fakeDb({ dupeError: { message: 'connection reset' } });
  const { entry } = await createEntry(
    { body: 'resilient', source: 'shortcut', url: null },
    { supabase: db, enrich: enrichOk }
  );
  assert.equal(entry.body, 'resilient');
});

test('a failed insert surfaces as a retryable 503, not a 500', async () => {
  const db = fakeDb({ insertError: { message: 'db down' } });
  await assert.rejects(
    () =>
      createEntry(
        { body: 'nope', source: 'shortcut', url: null },
        { supabase: db, enrich: enrichOk }
      ),
    (err) => {
      assert.equal(err.status, 503);
      // The client must not see the raw database message.
      assert.ok(!/db down/.test(err.message));
      return true;
    }
  );
});

test('bodyHash is stable and content-addressed', () => {
  assert.equal(bodyHash('a'), bodyHash('a'));
  assert.notEqual(bodyHash('a'), bodyHash('b'));
  assert.match(bodyHash('a'), /^[0-9a-f]{64}$/);
});
