// Service worker Jupiter Compta : coque de l'application en cache (consultation en connexion faible).
// Les données comptables ne sont jamais mises en cache ici (réponses /api en no-store).
const CACHE = 'jc-shell-v1';
const SHELL = ['/', '/connexion', '/manifest.webmanifest', '/brand/icone_Jupiter_Compta_192.png', '/brand/logo_jupiter_compta.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) =>
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))),
);
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok && (url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/brand'))) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('/'))),
  );
});
