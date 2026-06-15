/* ═══════════════════════════════════════════════════════════
   MAMTA MEDICAL — SERVICE WORKER (PWA offline support)

   What this does
   • Pre-caches the static "app shell" (HTML/CSS/JS/icons/fonts) so the
     site opens instantly and still works with no internet.
   • Caches product photos (Cloudinary) so they show offline too.
   • NEVER caches Firebase, Google sign-in, the AI proxy, or the map — those
     always go straight to the network, so login and live data never break.

   Updating the site
   • Bump SHELL_VERSION below whenever you change HTML/CSS/JS. The old cache
     is wiped automatically and visitors get the new files on their next open.
═══════════════════════════════════════════════════════════ */

const SHELL_VERSION = 'v3';                 // ← bump on every front-end change
const SHELL_CACHE = 'mm-shell-' + SHELL_VERSION;
const IMG_CACHE = 'mm-images-v1';           // Cloudinary product photos
const IMG_CACHE_MAX = 80;                   // keep at most ~80 images

/* Files that are guaranteed to exist and make up the offline shell.
   (admin.html and js/config.js are intentionally left out — admin is
   owner-only/online, and config.js is generated at deploy time.) */
const SHELL_ASSETS = [
  'index.html',
  'products.html',
  'css/index.css',
  'css/products.css',
  'js/index.js',
  'js/products.js',
  'js/chatbot.js',
  'manifest.json',
  'favicon.svg',
  'favicon.ico',
  'favicon-32.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

/* Cross-origin hosts we are happy to cache (static, safe to store). */
const SWR_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];
const IMG_HOSTS = ['res.cloudinary.com'];

/* ── INSTALL: pre-cache the shell ── */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // allSettled → one missing file can't fail the whole install
    await Promise.allSettled(SHELL_ASSETS.map(url => cache.add(url)));
    self.skipWaiting();
  })());
});

/* ── ACTIVATE: delete old shell caches ── */
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (k.startsWith('mm-shell-') && k !== SHELL_CACHE) return caches.delete(k);
      if (k === IMG_CACHE) return; // keep current image cache
    }));
    await self.clients.claim();
  })());
});

/* ── helpers ── */
async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || network || fetch(req);
}

async function cacheFirstImage(req) {
  const cache = await caches.open(IMG_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      cache.put(req, res.clone());
      trimCache(IMG_CACHE, IMG_CACHE_MAX);
    }
    return res;
  } catch (e) {
    return cached || Response.error();
  }
}

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length > max) {
    for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
  }
}

async function networkFirstNav(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    // offline → cached version of this page, else the home shell
    return (await cache.match(req)) || (await cache.match('index.html')) || Response.error();
  }
}

/* ── FETCH router ── */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                 // never touch writes/POSTs

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Full page loads → network-first so updates show, cache as offline backup.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirstNav(req));
    return;
  }

  if (sameOrigin) {
    // local CSS/JS/icons/manifest → fast from cache, refreshed in background
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Cross-origin:
  if (IMG_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirstImage(req));        // product photos
    return;
  }
  if (SWR_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req));   // fonts + Firebase SDK files
    return;
  }

  // Everything else (Firebase, Auth, AI proxy, Google Maps, Cloudinary upload…)
  // → not intercepted, goes straight to the network as normal.
});
