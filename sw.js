/* Haunted Hollow service worker: caches the game for offline play and makes app updates actionable. */
const VERSION = 'hh-app-v4';
const FILES = ['./', './index.html', './manifest.webmanifest', './update-ui.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
  './fonts/creepster.woff2', './fonts/pressstart2p-latin.woff2', './fonts/pressstart2p-latin-ext.woff2'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(FILES)));
  // Activate updates immediately; the page reloads when the new worker takes control.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(async response => {
      if (!response.ok || !/text\/html/i.test(response.headers.get('content-type') || '')) return response;
      const html = await response.text();
      const injected = html.replace(/<\/body\s*>/i, '<script src="./update-ui.js" defer><\/script></body>');
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      headers.delete('content-encoding');
      const updatedResponse = new Response(injected, {status: response.status, statusText: response.statusText, headers});
      caches.open(VERSION).then(cache => cache.put('./index.html', updatedResponse.clone()));
      return updatedResponse;
    }).catch(() => caches.match('./index.html')));
    return;
  }

  event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(VERSION).then(cache => cache.put(request, copy));
    }
    return response;
  })));
});
