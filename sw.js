const CACHE_PREFIX = 'Bayani'; // Used to identify caches managed by this app.

// This service worker is for an ONLINE-ONLY application.
// It ensures that the app is installable (PWA) but does NOT cache any assets.
// All requests go directly to the network, which solves the problem of seeing
// stale content after an update. If the user is offline, requests will fail,
// and the browser will show its standard offline error page.

self.addEventListener('install', (event) => {
    // This forces the waiting service worker to become the active service worker.
    // It ensures that updates are applied immediately.
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    // This event is fired when the service worker is activated.
    // We use it to clean up all old caches from previous versions.
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // If a cache name starts with our prefix, it's one of ours.
                    // Since this new version doesn't use a cache, we delete all of them.
                    if (cacheName.startsWith(CACHE_PREFIX)) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Take control of all open clients (tabs) to ensure they use this new service worker.
            return clients.claim();
        })
    );
});

// The Fetch Strategy: Network-Only.
// This handler is required for the app to be installable.
// It intercepts all network requests from the app but simply passes them
// through to the network without any caching.
self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request));
});