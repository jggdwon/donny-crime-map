const CACHE_NAME = 'doncaster-crime-map-cache-v1';
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json'
  // CDN assets are cached on the fly
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Activate worker immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker] Caching App Shell');
      return cache.addAll(APP_SHELL_URLS);
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => self.clients.claim()) // Become the active service worker for all clients
  );
});

self.addEventListener('fetch', event => {
  // We only handle GET requests.
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Strategy: Network first for API calls to ensure fresh data.
  if (url.hostname.includes('data.police.uk')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        console.warn('API call failed, device is likely offline.');
        // Optionally, return a fallback response if offline
      })
    );
    return;
  }
  
  // Strategy: Cache first, then network for everything else (app shell, assets).
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(event.request).then(networkResponse => {
        // Check if we received a valid response
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        // Clone the response to use it in the cache and to return it to the browser.
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(error => {
        console.error('[Service Worker] Fetch failed:', error);
        // Here you could return a fallback "offline" page if you had one in the cache.
      });
    })
  );
});
