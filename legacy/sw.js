// sw.js - Service Worker for 5th Grade History Digital Treasure Codex PWA
const CACHE_NAME = 'treasure-codex-cache-v1';

const CORE_ASSETS = [
    './',
    './index.html',
    './manifest.webmanifest',
    './manifest.json',
    './favicon.svg',
    './logo.svg',
    './favicon.ico',
    './apple-touch-icon.png',
    './og-image.png',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable.png',
    './icons/apple-touch-icon.png'
];

// Install Event: Pre-cache local core files
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(CORE_ASSETS).catch((err) => {
                console.warn('[SW] Pre-cache warning for some local assets:', err);
            });
        }).then(() => {
            return self.skipWaiting();
        })
    );
});

// Activate Event: Clean up old caches and take control
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[SW] Removing old cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});

// Fetch Event: Stale-While-Revalidate & Cache First for CDN
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Only handle GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Handle CDN resources (Tailwind, Flaticon, Google Fonts) with Cache-First strategy
    if (url.origin.includes('cdn') || url.origin.includes('cdnjs') || url.origin.includes('flaticon')) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetch(request).then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            cache.put(request, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(() => {
                        // Return cached if network fails
                        return cachedResponse;
                    });
                });
            })
        );
        return;
    }

    // Handle Local Navigation and core files: Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch((err) => {
                // If network fails and no cached response, fallback to index.html for navigation
                if (request.mode === 'navigate') {
                    return caches.match('./index.html') || caches.match('./');
                }
                throw err;
            });

            return cachedResponse || fetchPromise;
        })
    );
});

// Listen for skip waiting message from app UI
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
