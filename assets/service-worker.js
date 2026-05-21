const CACHE = 'medialens-1.0.0';
const OLD_CACHE_PREFIX = 'medialens-';
const CORE = [
  'index.html',
  'assets/platform.css',
  'assets/i18n.js',
  'assets/starter-catalog.js',
  'assets/imported-iptv-catalog.js',
  'assets/fast-feed-registry.js',
  'assets/vendor/hls.min.js',
  'assets/art/leader-global-live.jpg',
  'assets/art/leader-city-lights.jpg',
  'assets/art/leader-live-sports.jpg',
  'assets/art/leader-nature-relax.jpg',
  'assets/art/leader-smart-tv.jpg',
  'assets/art/leader-culture-world.jpg'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).catch(() => {}));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map(name => {
      if (name !== CACHE && name.startsWith(OLD_CACHE_PREFIX)) return caches.delete(name);
      return Promise.resolve(false);
    }));
    await self.clients.claim();
  })());
});

function isApiOrStreamRequest(url) {
  return url.pathname.startsWith('/api/') || /\/api\//.test(url.pathname) || /\.(m3u8|ts|m4s|mp4|aac)(\?|$)/i.test(url.pathname);
}

function shouldAlwaysNetwork(url) {
  return url.pathname.endsWith('/index.html') || url.pathname === '/'
    || url.pathname.endsWith('/assets/app.js')
    || url.pathname.endsWith('/assets/service-worker.js')
    || url.pathname.endsWith('/assets/starter-catalog.js')
    || url.pathname.endsWith('/assets/imported-iptv-catalog.js')
    || url.pathname.endsWith('/assets/fast-feed-registry.js')
    || url.pathname.endsWith('/assets/watch-graph.js')
    || url.pathname.endsWith('/assets/vendor/hls.min.js')
    || url.pathname.endsWith('/assets/i18n.js')
    || url.pathname.endsWith('/assets/platform.css');
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never cache player APIs or stream assets. Stale cached responses here break IPTV playback.
  if (isApiOrStreamRequest(url)) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  // App shell/code must be network-first so upgrades replace old player logic.
  if (shouldAlwaysNetwork(url)) {
    event.respondWith(fetch(req, { cache: 'no-store' }).then(async response => {
      try {
        const cache = await caches.open(CACHE);
        cache.put(req, response.clone());
      } catch {}
      return response;
    }).catch(() => caches.match(req)));
    return;
  }

  event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(async response => {
    if (response && response.ok && url.origin === self.location.origin) {
      try {
        const cache = await caches.open(CACHE);
        cache.put(req, response.clone());
      } catch {}
    }
    return response;
  })));
});
