'use client';

import { apiFetch, ApiError, OfflineError } from './api.js';

/**
 * Offline capture queue.
 *
 * The whole promise of this app is that a thought you type is a thought you
 * keep. A failed POST — tunnel, plane, flaky signal — must not lose it, so the
 * capture goes to IndexedDB and is replayed when connectivity returns.
 *
 * The queue lives in the page rather than the service worker because iOS
 * Safari doesn't implement Background Sync; a page-driven flush on
 * `online`/visibility is the only mechanism that actually works on iPhone,
 * which is this app's primary target. The service worker still pings us on
 * `sync` where it is supported.
 */

const DB_NAME = 'thought-capture';
const DB_VERSION = 1;
const STORE = 'outbox';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    const request = fn(store);
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function queueEntry(entry) {
  const db = await openDb();
  try {
    return await tx(db, 'readwrite', (store) =>
      store.add({ ...entry, queued_at: new Date().toISOString(), attempts: 0 })
    );
  } finally {
    db.close();
  }
}

export async function pendingEntries() {
  const db = await openDb();
  try {
    return (await tx(db, 'readonly', (store) => store.getAll())) || [];
  } finally {
    db.close();
  }
}

export async function pendingCount() {
  return (await pendingEntries()).length;
}

async function removeEntry(id) {
  const db = await openDb();
  try {
    await tx(db, 'readwrite', (store) => store.delete(id));
  } finally {
    db.close();
  }
}

async function bumpAttempts(item) {
  const db = await openDb();
  try {
    await tx(db, 'readwrite', (store) =>
      store.put({ ...item, attempts: (item.attempts || 0) + 1 })
    );
  } finally {
    db.close();
  }
}

/**
 * Replay everything queued.
 * @returns {Promise<{ sent: object[], failed: number, remaining: number }>}
 */
export async function flushOutbox() {
  if (typeof indexedDB === 'undefined') {
    return { sent: [], failed: 0, remaining: 0 };
  }

  let items = [];
  try {
    items = await pendingEntries();
  } catch {
    return { sent: [], failed: 0, remaining: 0 };
  }

  const sent = [];
  let failed = 0;

  for (const item of items) {
    try {
      const res = await apiFetch('/api/entries', {
        method: 'POST',
        body: { body: item.body, source: item.source || 'web-offline' },
      });
      await removeEntry(item.id);
      if (res?.entry) sent.push(res.entry);
    } catch (err) {
      if (err instanceof OfflineError) break; // still offline; stop early
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        // A 4xx will never succeed on retry (bad payload, revoked token).
        // Keep it queued rather than silently destroying the user's text,
        // but stop counting it as transient.
        await bumpAttempts(item);
        failed += 1;
        continue;
      }
      await bumpAttempts(item);
      failed += 1;
    }
  }

  let remaining = 0;
  try {
    remaining = await pendingCount();
  } catch {
    /* ignore */
  }
  return { sent, failed, remaining };
}
