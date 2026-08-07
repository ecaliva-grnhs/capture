import { test } from 'node:test';
import assert from 'node:assert/strict';

import { enrich } from '../lib/enrich.js';
import { normalizeTags } from '../lib/anthropic.js';

const silent = { error() {} };
const ok = { tags: ['alpha', 'beta'], summary: 'A summary.' };
const vector = Array.from({ length: 1024 }, () => 0.1);

test('enrich returns both arms on success', async () => {
  const out = await enrich('body', {
    autoTag: async () => ok,
    embed: async () => vector,
    logger: silent,
  });
  assert.deepEqual(out.tags, ['alpha', 'beta']);
  assert.equal(out.summary, 'A summary.');
  assert.equal(out.embedding.length, 1024);
  assert.equal(out.degraded, false);
});

test('tagging failure still yields an embedding', async () => {
  // The capture must survive Claude being down.
  const out = await enrich('body', {
    autoTag: async () => {
      throw new Error('anthropic 529 overloaded');
    },
    embed: async () => vector,
    logger: silent,
  });
  assert.deepEqual(out.tags, []);
  assert.equal(out.summary, null);
  assert.equal(out.embedding.length, 1024);
  assert.equal(out.degraded, true);
  assert.deepEqual(out.failures, ['tagging']);
});

test('embedding failure still yields tags', async () => {
  const out = await enrich('body', {
    autoTag: async () => ok,
    embed: async () => {
      throw new Error('voyage timeout');
    },
    logger: silent,
  });
  assert.deepEqual(out.tags, ['alpha', 'beta']);
  assert.equal(out.embedding, null);
  assert.equal(out.degraded, true);
  assert.deepEqual(out.failures, ['embedding']);
});

test('both failing still resolves rather than throwing', async () => {
  const out = await enrich('body', {
    autoTag: async () => {
      throw new Error('down');
    },
    embed: async () => {
      throw new Error('down');
    },
    logger: silent,
  });
  assert.deepEqual(out.tags, []);
  assert.equal(out.summary, null);
  assert.equal(out.embedding, null);
  assert.equal(out.degraded, true);
  assert.deepEqual(out.failures, ['tagging', 'embedding']);
});

test('enrich never rejects', async () => {
  await assert.doesNotReject(() =>
    enrich('body', {
      autoTag: () => Promise.reject(new Error('boom')),
      embed: () => Promise.reject(new Error('boom')),
      logger: silent,
    })
  );
});

test('normalizeTags lowercases, strips #, dedupes and caps', () => {
  assert.deepEqual(normalizeTags(['#Work', 'work', 'IDEAS ', '']), ['work', 'ideas']);
  assert.deepEqual(normalizeTags('nope'), []);
  assert.deepEqual(normalizeTags([1, null, 'ok']), ['ok']);
  assert.equal(normalizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`)).length, 8);
});
