const CACHE_NAME = 'yatlo-v1';
const ASSETS = [
    '/index.html',
    '/build/html/hadiths.html',
    '/build/css/hadiths.css',
    '/build/js/global.js',
    'https://fonts.googleapis.com/css2?family=Amiri&family=Rakkas&display=swap'
];

// Install: Cache essential files
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

// Fetch: Serve from cache if offline
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});