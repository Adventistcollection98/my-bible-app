// Service Worker for offline access
const CACHE_NAME = 'bible-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/app.js',
    '/sw.js',
    '/manifest.json',
    '/bible-kjv.json'
];

// Install event - cache essential files
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching assets');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting(); // Activate immediately
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim(); // Take control immediately
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Handle navigation requests differently
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Cache successful responses
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    // Fallback to cache for offline
                    return caches.match(request)
                        .then((response) => {
                            return response || caches.match('/index.html');
                        });
                })
        );
        return;
    }

    // Cache-first strategy for assets and data
    event.respondWith(
        caches.match(request)
            .then((response) => {
                // Return cached response if available
                if (response) {
                    // Background update: fetch in background and update cache
                    if (request.url.includes('bible-kjv.json')) {
                        fetch(request)
                            .then((freshResponse) => {
                                if (freshResponse.ok) {
                                    caches.open(CACHE_NAME).then((cache) => {
                                        cache.put(request, freshResponse.clone());
                                    });
                                }
                            })
                            .catch(() => {
                                // Fetch failed, keep using cache
                            });
                    }
                    return response;
                }

                // No cache hit, try network
                return fetch(request)
                    .then((response) => {
                        // Don't cache failed responses
                        if (!response || response.status !== 200 || response.type === 'error') {
                            return response;
                        }

                        // Cache successful responses
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseClone);
                        });

                        return response;
                    })
                    .catch(() => {
                        // Network failed and no cache - return offline page
                        return new Response(
                            '<html><body><h1>Offline</h1><p>No cached data available for this request.</p></body></html>',
                            { headers: { 'Content-Type': 'text/html' } }
                        );
                    });
            })
    );
});

// Handle messages from clients
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'GET_CACHE_SIZE') {
        caches.open(CACHE_NAME).then((cache) => {
            cache.keys().then((requests) => {
                event.ports[0].postMessage({
                    cachedItems: requests.length,
                    cacheSize: requests.length * 1024 // Rough estimate
                });
            });
        });
    }
});
