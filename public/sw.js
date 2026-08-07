/* Thought Capture service worker.
 *
 * Caching strategy, and why:
 *   - Navigations: network-first. A cache-first HTML shell goes stale the
 *     moment you deploy, and the stale HTML references hashed chunk names that
 *     no longer exist — which shows up as a blank screen, not a graceful
 *     fallback. Network-first with a cached fallback keeps offline working
 *     without that failure mode.
 *   - Hashed build assets (/_next/static/*): cache-first. The hash is the
 *     version, so these are immutable and safe to serve forever.
 *   - Everything else static: stale-while-revalidate.
 *   - API: never cached. Thoughts must be fresh when online.
 *
 * Only successful, basic (same-origin) responses are stored, so 404s and
 * opaque cross-origin responses never poison the cache.
 */

const VERSION = 'v2';
const SHELL_CACHE = `tc-shell-${VERSION}`;
const ASSET_CACHE = `tc-assets-${VERSION}`;
const KEEP = new Set([SHELL_CACHE, ASSET_CACHE]);

const OFFLINE_URL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, '/icons/icon-192.png']))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isCacheable(res) {
  return res && res.ok && res.type === 'basic';
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (isCacheable(res)) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached =
      (await cache.match(request)) ||
      (fallbackUrl ? await cache.match(fallbackUrl) : null);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (isCacheable(res)) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (isCacheable(res)) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // writes go through the page's outbox

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API traffic.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE, OFFLINE_URL));
    return;
  }

  // Immutable, content-hashed build output.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
});

// Where Background Sync exists, nudge open pages to drain the outbox. The
// queue itself lives in the page (iOS has no Background Sync), so the service
// worker's job is only to wake it.
self.addEventListener('sync', (event) => {
  if (event.tag === 'flush-outbox') {
    event.waitUntil(
      self.clients
        .matchAll({ includeUncontrolled: true, type: 'window' })
        .then((clients) =>
          clients.forEach((client) => client.postMessage({ type: 'flush-outbox' }))
        )
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'skip-waiting') self.skipWaiting();
});
