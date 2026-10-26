/* Notes Maker AI service worker: after the first visit the whole app (code, fonts, simulations) runs with no network.
   The list below is filled in at build time by tools/gen-sw.mjs. */
const CACHE = 'notesmaker-__VERSION__';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {})))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return; // never touch remote AI calls
  if (r.mode === 'navigate') { // page: network first (fresh), cached shell when offline
    e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put('./', cp)); return res; }).catch(() => caches.match('./').then(h => h || caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); } return res; })));
});
