// Simple Service Worker that won't cause fetch errors
const CACHE_NAME = 'veritas-mvp-v12-' + Date.now();
const ASSETS_TO_CACHE = [
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
    console.log('[SW] Installing new version:', CACHE_NAME);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => {
                console.log('[SW] Installation complete');
                return self.skipWaiting();
            })
            .catch(error => {
                console.warn('[SW] Installation warning:', error);
            })
    );
});

// Activate event: Clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating new version:', CACHE_NAME);
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[SW] Activation complete');
                return self.clients.claim();
            })
    );
});

// Simple fetch handler that won't cause errors
self.addEventListener('fetch', (event) => {
    // Only handle GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Skip problematic requests that might fail
    if (event.request.url === 'http://localhost:8000/' ||
        event.request.url === 'http://localhost:8000' ||
        event.request.url.endsWith('/') && event.request.url.includes('localhost:8000')) {
        return; // Let browser handle these directly
    }

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // Return cached version if available
                if (cachedResponse) {
                    return cachedResponse;
                }

                // Try network request
                return fetch(event.request)
                    .then((response) => {
                        // Don't cache if not a successful response
                        if (!response || response.status !== 200) {
                            return response;
                        }

                        // Cache successful responses for local files
                        if (event.request.url.startsWith(self.location.origin)) {
                            const responseToCache = response.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, responseToCache)
                                        .catch(error => {
                                            console.warn('[SW] Cache warning:', error);
                                        });
                                });
                        }

                        return response;
                    })
                    .catch(() => {
                        // Network failed - try to return cached index.html for navigation requests
                        if (event.request.destination === 'document') {
                            return caches.match('./index.html');
                        }

                        // Return empty response for other failed requests
                        return new Response('', { status: 200 });
                    });
            })
            .catch((error) => {
                console.warn('[SW] Fetch handler error:', error);
                return new Response('Service Worker Error', { status: 500 });
            })
    );
});