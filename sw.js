const CACHE_NAME = 'Bayan-cache-v2';

// 1. Files to cache immediately on install
const PRE_CACHE = [
    '/index.html',
    '/build/js/global.js',
    '/favicon.ico'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRE_CACHE))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// 2. The Dynamic Strategy: Cache as you go
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).then((response) => {
                // Don't cache if not a valid response or from a different domain (like Supabase API)
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }

                // Clone the response to save it in cache
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return response;
            });
        }).catch(() => {
            // Fallback if both network and cache fail (user is offline and hasn't visited page yet)
            if (event.request.mode === 'navigate') {
                return caches.match('/index.html');
            }
        })
    );
});