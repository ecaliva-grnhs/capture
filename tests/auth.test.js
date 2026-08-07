import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { requireCaptureToken, TOKEN_HEADER } from '../lib/auth.js';

/** Minimal stand-in for the Request headers interface. */
function req(headers = {}) {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  return { headers: { get: (name) => lower[name.toLowerCase()] ?? null } };
}

const outcome = (fn) => {
  try {
    fn();
    return 'ok';
  } catch (err) {
    return err.status ?? 'error';
  }
};

beforeEach(() => {
  process.env.CAPTURE_TOKEN = 'correct-horse-battery-staple';
});

test('accepts the token via x-capture-token', () => {
  const r = req({ [TOKEN_HEADER]: 'correct-horse-battery-staple' });
  assert.equal(outcome(() => requireCaptureToken(r)), 'ok');
});

test('accepts the token as a bearer credential', () => {
  const r = req({ authorization: 'Bearer correct-horse-battery-staple' });
  assert.equal(outcome(() => requireCaptureToken(r)), 'ok');
});

test('rejects a wrong token with 401', () => {
  assert.equal(outcome(() => requireCaptureToken(req({ [TOKEN_HEADER]: 'nope' }))), 401);
});

test('rejects a missing token with 401', () => {
  assert.equal(outcome(() => requireCaptureToken(req())), 401);
});

test('rejects a token that is a prefix of the real one', () => {
  const r = req({ [TOKEN_HEADER]: 'correct-horse' });
  assert.equal(outcome(() => requireCaptureToken(r)), 401);
});

test('fails closed when CAPTURE_TOKEN is unset', () => {
  // The v1 bug: an unset secret meant "allow everyone". It must now refuse,
  // and must refuse even when the caller sends no token at all.
  delete process.env.CAPTURE_TOKEN;
  assert.notEqual(outcome(() => requireCaptureToken(req())), 'ok');
  assert.notEqual(
    outcome(() => requireCaptureToken(req({ [TOKEN_HEADER]: 'anything' }))),
    'ok'
  );
});

test('fails closed when CAPTURE_TOKEN is blank', () => {
  process.env.CAPTURE_TOKEN = '   ';
  assert.notEqual(outcome(() => requireCaptureToken(req({ [TOKEN_HEADER]: '   ' }))), 'ok');
});

test('cron guard accepts the capture token', async () => {
  const { requireCaptureOrCronToken } = await import('../lib/auth.js');
  const r = req({ authorization: 'Bearer correct-horse-battery-staple' });
  assert.equal(outcome(() => requireCaptureOrCronToken(r)), 'ok');
});

test('cron guard accepts CRON_SECRET when configured', async () => {
  const { requireCaptureOrCronToken } = await import('../lib/auth.js');
  process.env.CRON_SECRET = 'vercel-cron-secret';
  const r = req({ authorization: 'Bearer vercel-cron-secret' });
  assert.equal(outcome(() => requireCaptureOrCronToken(r)), 'ok');
  delete process.env.CRON_SECRET;
});

test('cron guard rejects a stale CRON_SECRET once unset', async () => {
  const { requireCaptureOrCronToken } = await import('../lib/auth.js');
  delete process.env.CRON_SECRET;
  const r = req({ authorization: 'Bearer vercel-cron-secret' });
  assert.equal(outcome(() => requireCaptureOrCronToken(r)), 401);
});

test('cron guard still fails closed without CAPTURE_TOKEN', async () => {
  const { requireCaptureOrCronToken } = await import('../lib/auth.js');
  delete process.env.CAPTURE_TOKEN;
  process.env.CRON_SECRET = 'vercel-cron-secret';
  assert.notEqual(
    outcome(() => requireCaptureOrCronToken(req({ authorization: 'Bearer vercel-cron-secret' }))),
    'ok'
  );
  delete process.env.CRON_SECRET;
});
