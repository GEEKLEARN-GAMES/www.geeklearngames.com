/* ═══════════════════════════════════════════════════════════
   GEEKLEARN GAMES — service worker (PWA / étape launcher)
   ───────────────────────────────────────────────────────────
   Stratégie volontairement SIMPLE et sans liste à maintenir :
     • index.html (navigations) → network-first, repli cache → le site
       reste servi hors ligne après la première visite, mais une
       nouvelle version est toujours récupérée dès qu'il y a du réseau.
     • assets same-origin (css/js/img versionnés ?v=/?a=) → cache-first :
       une nouvelle version = une nouvelle URL, jamais de conflit.
     • cross-origin (Supabase, API de change) → JAMAIS interceptés.
   Discipline : bumper CACHE à chaque déploiement (PROGRESS.md).
═══════════════════════════════════════════════════════════ */
const CACHE = 'glg-v6';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./'])).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* L'onglet Options → Mises à jour envoie ce message pour activer
   immédiatement la version en attente (puis recharge sous le veil). */
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Supabase/API : réseau direct
  if (url.pathname.includes('/download/')) return;   // installeurs : jamais depuis un cache

  // Navigations → network-first (fraîcheur), repli cache (offline réel)
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const c = await caches.open(CACHE);
        c.put('./', res.clone()).catch(() => {});
        return res;
      } catch (err) {
        return (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Assets same-origin → cache-first + remplissage au fil de la navigation
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res && res.ok && (res.type === 'basic' || res.type === 'default')) {
      const c = await caches.open(CACHE);
      c.put(req, res.clone()).catch(() => {});
    }
    return res;
  })());
});
