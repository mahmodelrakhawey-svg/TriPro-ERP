// ==============================================================================
// 🚀 TriPro ERP Enterprise PWA Service Worker (V2.0)
// High-performance Multi-Tier Asset & Offline Caching
// ==============================================================================

const CACHE_VERSION = 'tripro-pwa-v2.0.0';
const STATIC_CACHE = `tripro-static-${CACHE_VERSION}`;
const ASSETS_CACHE = `tripro-assets-${CACHE_VERSION}`;
const RUNTIME_CACHE = `tripro-runtime-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/logo.jpg',
  '/manifest.json'
];

// 1. Install: Pre-cache App Shell and activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn('[SW] App Shell pre-cache warning:', err);
      });
    })
  );
  self.skipWaiting();
});

// 2. Activate: Invalidate and purge old caches
self.addEventListener('activate', (event) => {
  const activeCaches = [STATIC_CACHE, ASSETS_CACHE, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (!activeCaches.includes(name)) {
            console.log('[SW] Purging outdated cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch: Multi-tier strategy based on resource type
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Non-GET requests (POST, PUT, DELETE) must ALWAYS bypass cache
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Ignore Chrome Extensions or external non-http schemes
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // A. Hashed Static Assets (Vite chunks /assets/*.js and /assets/*.css)
  // Strategy: Cache-First (Instant 0.01s load for heavy vendors like antd, charts, pdf)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(ASSETS_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (fetchErr) {
          // If network failed and not in cache, fallback
          console.warn('[SW] Failed to fetch asset:', url.pathname, fetchErr);
          throw fetchErr;
        }
      })
    );
    return;
  }

  // B. Images, Icons, and Web Fonts
  // Strategy: Cache-First with Stale-While-Revalidate
  const isImageOrFont = 
    request.destination === 'image' ||
    request.destination === 'font' ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|woff|woff2|ttf|eot)$/i);

  if (isImageOrFont) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // C. HTML Navigation (Single Page Application Fallback)
  // Strategy: Network-First with fallback to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put('/index.html', networkResponse.clone());
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedIndex = await caches.match('/index.html');
          return cachedIndex || new Response('Offline - TriPro ERP', {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        })
    );
    return;
  }

  // D. Dynamic API calls & Supabase queries
  // Strategy: Network-First with quick timeout (3s) and runtime cache fallback
  if (url.origin.includes('supabase.co') || url.pathname.startsWith('/api/')) {
    // 🛡️ صمام أمان أمني: استثناء طلبات المصادقة والجلسات من الكاش تماماً
    if (url.pathname.includes('/auth/v1/') || url.pathname.includes('/auth/')) {
      return; // تمرير مباشر للشبكة دون تخزين أو تدخل
    }

    event.respondWith(
      new Promise((resolve) => {
        const timeoutId = setTimeout(async () => {
          const cached = await caches.match(request);
          if (cached) resolve(cached);
        }, 3000);

        fetch(request)
          .then((response) => {
            clearTimeout(timeoutId);
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
            }
            resolve(response);
          })
          .catch(async () => {
            clearTimeout(timeoutId);
            const cached = await caches.match(request);
            if (cached) {
              resolve(cached);
            } else {
              resolve(new Response(JSON.stringify({ error: 'Network offline and no cached data available' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json; charset=utf-8' }
              }));
            }
          });
      })
    );
    return;
  }

  // Default: Network with Cache Fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
