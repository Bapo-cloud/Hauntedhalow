/* Haunted Hollow service worker: keeps the game on the device so it starts fast and plays offline.
   The game page itself is loaded fresh from the internet when possible, so updates arrive by themselves. */
const VERSION = 'hh-app-v2';
const FILES = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
  './fonts/creepster.woff2', './fonts/pressstart2p-latin.woff2', './fonts/pressstart2p-latin-ext.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate'){                       // the game page: newest version first, saved copy when offline
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)); return res; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok){ const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })));
});
