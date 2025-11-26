const CACHE_NAME = 'veritas-mvp-v11-' + Date.now();
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './auth.js',
    './sync_client.js',
    './pdf_local.js',
    './jspdf.min.js',
    './config.js',
    './manifest.json'
];

// Install event: Cache assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching all assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
});

// Activate event: Clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating new version:', CACHE_NAME);
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all([
                // Delete all old caches
                ...cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                }),
                // Take control of all clients immediately
                self.clients.claim()
            ]);
        })
    );
});

// Fetch event: Serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache hit - return response
                if (response) {
                    return response;
                }

                // Network request for uncached resources
                return fetch(event.request)
                    .then((response) => {
                        // Don't cache non-successful responses
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // Only cache local resources, not external ones
                        if (event.request.url.startsWith('http://localhost') ||
                            event.request.url.startsWith('http://192.168.') ||
                            !event.request.url.startsWith('http')) {
                            const responseToCache = response.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, responseToCache);
                                });
                        }

                        return response;
                    })
                    .catch((error) => {
                        console.log('[SW] Network request failed for:', event.request.url);

                        // Network failed - try to serve offline page for HTML requests
                        if (event.request.destination === 'document') {
                            return caches.match('./index.html');
                        }

                        // For API requests, return an offline error response
                        if (event.request.url.includes('/api/') || event.request.url.includes(':5000')) {
                            return new Response(
                                JSON.stringify({
                                    error: 'Offline - No network connection',
                                    offline: true
                                }),
                                {
                                    status: 503,
                                    statusText: 'Service Unavailable',
                                    headers: {
                                        'Content-Type': 'application/json'
                                    }
                                }
                            );
                        }

                        // For external resources that failed, just return empty response
                        return new Response('', { status: 200 });
                    });
            })
    );
});
