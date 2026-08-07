import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  safeUrl,
  parseEntryPayload,
  parseCursor,
  parseLimit,
  parseOffset,
} from '../lib/validate.js';

const status = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    return err.status;
  }
};

test('safeUrl accepts http and https', () => {
  assert.equal(safeUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeUrl('http://example.com/'), 'http://example.com/');
});

test('safeUrl rejects script-bearing schemes', () => {
  // The feed renders url as a clickable link; these must never be stored.
  for (const hostile of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ]) {
    assert.equal(status(() => safeUrl(hostile)), 400, `should reject ${hostile}`);
  }
});

test('safeUrl treats blank/absent as null', () => {
  assert.equal(safeUrl(undefined), null);
  assert.equal(safeUrl(null), null);
  assert.equal(safeUrl('   '), null);
});

test('safeUrl rejects unparseable strings', () => {
  assert.equal(status(() => safeUrl('not a url')), 400);
});

test('parseEntryPayload trims and defaults source', () => {
  const out = parseEntryPayload({ body: '  hello  ' });
  assert.equal(out.body, 'hello');
  assert.equal(out.source, 'shortcut');
  assert.equal(out.url, null);
});

test('parseEntryPayload rejects missing, empty and non-string bodies', () => {
  assert.equal(status(() => parseEntryPayload({})), 400);
  assert.equal(status(() => parseEntryPayload({ body: '   ' })), 400);
  assert.equal(status(() => parseEntryPayload({ body: 42 })), 400);
  assert.equal(status(() => parseEntryPayload(null)), 400);
  assert.equal(status(() => parseEntryPayload([])), 400);
});

test('parseEntryPayload enforces the length cap', () => {
  const long = 'x'.repeat(20001);
  const err = status(() => parseEntryPayload({ body: long }));
  assert.equal(err, 400);
  // Exactly at the cap is fine.
  assert.equal(parseEntryPayload({ body: 'x'.repeat(20000) }).body.length, 20000);
});

test('parseEntryPayload clamps source length', () => {
  const out = parseEntryPayload({ body: 'hi', source: 'a'.repeat(200) });
  assert.equal(out.source.length, 64);
});

test('parseCursor accepts ISO timestamps and rejects garbage', () => {
  assert.equal(parseCursor('2026-01-02T03:04:05.000Z'), '2026-01-02T03:04:05.000Z');
  assert.equal(parseCursor(null), null);
  assert.equal(parseCursor(''), null);
  // Previously this reached Postgres and surfaced as a 500.
  assert.equal(status(() => parseCursor('banana')), 400);
});

test('parseLimit clamps and validates', () => {
  assert.equal(parseLimit(null, { fallback: 30, max: 100 }), 30);
  assert.equal(parseLimit('5', { fallback: 30, max: 100 }), 5);
  assert.equal(parseLimit('9999', { fallback: 30, max: 100 }), 100);
  assert.equal(parseLimit('-4', { fallback: 30, max: 100 }), 1);
  assert.equal(status(() => parseLimit('abc', { fallback: 30, max: 100 })), 400);
});

test('parseOffset rejects negatives and caps', () => {
  assert.equal(parseOffset(null), 0);
  assert.equal(parseOffset('40'), 40);
  assert.equal(parseOffset('99999'), 1000);
  assert.equal(status(() => parseOffset('-1')), 400);
});
