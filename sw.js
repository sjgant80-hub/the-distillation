// sw.js: after the first visit, the page and its published records load from this device.
// This worker only ever touches caches whose names start with "the-distillation-": other pages on this site are left alone.
const CACHE = 'the-distillation-v1';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'SEAL.json', 'data/settings.json', 'data/published.json', 'data/trace.json', 'data/gates.json', 'data/parity.json'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {})));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('the-distillation-') && k !== CACHE).map((k) => caches.delete(k))))));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !u.pathname.includes('/the-distillation/')) return;
  // network first, so a round appears as soon as it is published; the cache when offline
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}); return r; }).catch(() => caches.match(e.request)));
});
