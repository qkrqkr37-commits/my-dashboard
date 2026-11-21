/* MY · COMMAND BOARD — service worker
 * Strategy: NETWORK-FIRST. While online every request goes to the network (bypassing the
 * browser HTTP cache), so an updated index.html shows up on the next open. The cache is only
 * a fallback for when the network is unavailable.
 */
const CACHE = 'myboard-v1';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './morning-briefing.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Cache what is reachable; a single missing file must not fail the install.
    await Promise.all(CORE.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res && res.ok) await cache.put(url, res.clone());
      } catch (e) { /* offline install: nothing to precache for this file */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let the network handle other origins

  event.respondWith((async () => {
    const isDocument = req.mode === 'navigate' || url.pathname.endsWith('/') ||
      url.pathname.endsWith('.html');

    // network first — bypass the HTTP cache so the newest version always wins
    try {
      const fresh = await fetch(new Request(req, isDocument ? { cache: 'no-store' } : { cache: 'no-cache' }));
      if (fresh && fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(isDocument ? './index.html' : req, fresh.clone()).catch(() => {});
        return fresh;
      }
      if (fresh && fresh.status === 404) return fresh;
      throw new Error('bad status ' + (fresh && fresh.status));
    } catch (e) {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true }) ||
        (isDocument ? await cache.match('./index.html') : null) ||
        (isDocument ? await cache.match('./') : null);
      if (hit) return hit;
      return new Response('오프라인 상태이고 저장된 사본이 없습니다.', {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
