/* Haunted Hollow service worker: keeps the game on the device so it starts fast and plays offline. */
const VERSION = 'hh-app-v3';
const FILES = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
  './fonts/creepster.woff2', './fonts/pressstart2p-latin.woff2', './fonts/pressstart2p-latin-ext.woff2'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await caches.open(VERSION).then(cache => cache.addAll(FILES));
    // First install activates immediately. Later versions wait until the player taps UPDATE.
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

const UPDATE_UI = `<style>
#hh-update-banner{position:fixed;z-index:2147483647;top:max(12px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:12px;width:max-content;max-width:calc(100vw - 24px);padding:12px 14px;background:#1a0b2e;color:#fff;border:2px solid #ff8a1f;border-radius:10px;box-shadow:0 4px 24px #000b;font:12px/1.5 system-ui,sans-serif}
#hh-update-banner[hidden]{display:none}
#hh-update-banner button{border:0;border-radius:7px;padding:9px 12px;background:#ff8a1f;color:#1a0b2e;font:700 12px system-ui,sans-serif;cursor:pointer;white-space:nowrap}
</style><div id="hh-update-banner" role="status" aria-live="polite" hidden><span>Ein Update für Haunted Hollow ist bereit.</span><button id="hh-update-now" type="button">JETZT AKTUALISIEREN</button></div><script>
(()=>{
  if(!('serviceWorker' in navigator))return;
  let reloading=false;
  const banner=document.getElementById('hh-update-banner');
  const button=document.getElementById('hh-update-now');
  if(!banner||!button)return;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(reloading)return;
    reloading=true;
    location.reload();
  });
  navigator.serviceWorker.ready.then(registration=>{
    const showIfReady=()=>{
      if(registration.waiting&&navigator.serviceWorker.controller)banner.hidden=false;
    };
    showIfReady();
    registration.addEventListener('updatefound',()=>{
      const worker=registration.installing;
      if(!worker)return;
      worker.addEventListener('statechange',showIfReady);
    });
    // Check on return to the page as well as when the browser next checks in the background.
    window.addEventListener('focus',()=>registration.update().catch(()=>{}));
  }).catch(()=>{});
  button.addEventListener('click',()=>{
    const waiting=navigator.serviceWorker.controller&&navigator.serviceWorker;
    if(!waiting)return;
    button.disabled=true;
    button.textContent='UPDATE LÄUFT …';
    navigator.serviceWorker.ready.then(registration=>{
      if(registration.waiting)registration.waiting.postMessage({type:'SKIP_WAITING'});
      else location.reload();
    }).catch(()=>{button.disabled=false;button.textContent='JETZT AKTUALISIEREN';});
  });
})();
</script>`;

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      const cachedCopy = response.clone();
      caches.open(VERSION).then(cache => cache.put('./index.html', cachedCopy));
      return response.text().then(html => {
        if (!response.ok || !/text\/html/i.test(response.headers.get('content-type') || '')) return response;
        const updatedHtml = html.replace(/<\/body\s*>/i, `${UPDATE_UI}</body>`);
        const headers = new Headers(response.headers);
        headers.delete('content-length');
        headers.delete('content-encoding');
        return new Response(updatedHtml, {status: response.status, statusText: response.statusText, headers});
      });
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
