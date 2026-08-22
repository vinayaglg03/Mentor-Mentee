/* AMIS service worker.
 *
 * Campus wifi drops in corridors and stairwells, which is exactly where a
 * mentor looks something up between classes. So:
 *
 *   - the app shell is cached, so it opens offline rather than showing the
 *     browser's dinosaur
 *   - GET /api responses are cached as they are fetched, and served from the
 *     cache when the network fails, with the time they were stored attached
 *     so the UI can say how old they are
 *   - writes made offline are queued and replayed when connectivity returns,
 *     rather than being lost with a generic failure
 */

const VERSION = 'v1';
const SHELL_CACHE = `amis-shell-${VERSION}`;
const DATA_CACHE = `amis-data-${VERSION}`;
const QUEUE_DB = 'amis-write-queue';
const QUEUE_STORE = 'requests';

const SHELL_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // A missing asset must not stop the worker installing.
      .then(cache => Promise.allSettled(SHELL_ASSETS.map(asset => cache.add(asset))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== SHELL_CACHE && key !== DATA_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// --- the offline write queue ---------------------------------------------

const openQueue = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(QUEUE_DB, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const withStore = async (mode, run) => {
  const db = await openQueue();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(QUEUE_STORE, mode);
    const store = transaction.objectStore(QUEUE_STORE);
    const result = run(store);
    transaction.oncomplete = () => resolve(result.result ?? result);
    transaction.onerror = () => reject(transaction.error);
  });
};

const queueWrite = async (request) => {
  const body = await request.clone().text();

  await withStore('readwrite', store => store.add({
    url: request.url,
    method: request.method,
    headers: [...request.headers].filter(([key]) => key.toLowerCase() !== 'authorization'),
    body,
    queuedAt: Date.now(),
  }));

  await notifyClients({ type: 'amis-write-queued' });
};

const listQueued = () => withStore('readonly', store => store.getAll());

const removeQueued = (id) => withStore('readwrite', store => store.delete(id));

// Replayed in the order they were made, so two edits to the same field land
// the right way round.
const flushQueue = async () => {
  const queued = await listQueued();
  if (queued.length === 0) return { replayed: 0, failed: 0 };

  let replayed = 0;
  let failed = 0;

  for (const entry of queued) {
    try {
      const response = await fetch(entry.url, {
        method: entry.method,
        headers: new Headers(entry.headers),
        body: entry.body,
        credentials: 'include',
      });

      // A 4xx will never succeed on a retry; drop it and tell the app.
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        await removeQueued(entry.id);
        if (response.ok) replayed++; else failed++;
      }
    } catch {
      // Still offline: leave it queued and stop trying for now.
      break;
    }
  }

  await notifyClients({ type: 'amis-queue-flushed', replayed, failed });
  return { replayed, failed };
};

const notifyClients = async (message) => {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) client.postMessage(message);
};

self.addEventListener('sync', (event) => {
  if (event.tag === 'amis-flush-writes') event.waitUntil(flushQueue());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'amis-flush') event.waitUntil(flushQueue());
  if (event.data?.type === 'amis-skip-waiting') self.skipWaiting();
});

// --- fetching -------------------------------------------------------------

const isApi = (url) => url.pathname.startsWith('/api/');

// Authentication must never be served from a cache.
const isNeverCached = (url) =>
  url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/reports/');

const handleApiGet = async (request) => {
  const cache = await caches.open(DATA_CACHE);

  try {
    const response = await fetch(request);

    if (response.ok) {
      const copy = response.clone();
      const headers = new Headers(copy.headers);
      // What the UI shows as "last updated".
      headers.set('X-AMIS-Cached-At', new Date().toISOString());
      cache.put(request, new Response(await copy.blob(), {
        status: copy.status,
        statusText: copy.statusText,
        headers,
      }));
    }

    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    return new Response(
      JSON.stringify({
        error: 'You are offline and this has not been loaded before.',
        offline: true,
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

const handleApiWrite = async (request) => {
  try {
    return await fetch(request);
  } catch {
    await queueWrite(request);

    if (self.registration.sync) {
      try { await self.registration.sync.register('amis-flush-writes'); } catch { /* not supported */ }
    }

    return new Response(
      JSON.stringify({
        queued: true,
        message: 'You are offline. This has been saved on the device and will be sent when you are back online.',
      }),
      { status: 202, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin && !isApi(url)) return;
  if (isNeverCached(url)) return;

  if (isApi(url)) {
    if (request.method === 'GET') {
      event.respondWith(handleApiGet(request));
    } else if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      event.respondWith(handleApiWrite(request));
    }
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then(cached => cached || caches.match('/')))
    );
    return;
  }

  // Static assets: cache first, they are content-hashed by the build.
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then((response) => {
      if (response.ok && request.method === 'GET') {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
