// This service worker ensures the app works offline by caching the app shell AND external dependencies.

const CACHE_NAME = 'openscan-v1';
// NOTE: We use relative paths ('./') so this works on GitHub Pages sub-directories.
const URLS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  // Critical Styles & Scripts
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  // Dependencies from Import Map (Ensure these match index.html exactly)
  'https://aistudiocdn.com/lucide-react@^0.554.0',
  'https://aistudiocdn.com/@google/genai@^1.30.0',
  'https://aistudiocdn.com/react@^19.2.0',
  'https://aistudiocdn.com/react-dom@^19.2.0',
  'https://aistudiocdn.com/jspdf@^2.5.1',
  'https://aistudiocdn.com/jszip@^3.10.1'
];

// Install Event - Pre-cache everything
self.addEventListener('install', (event: any) => {
  (self as any).skipWaiting(); // Force activation
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache and pre-caching dependencies');
      return cache.addAll(URLS_TO_CACHE).catch(err => {
        console.error("Pre-caching failed:", err);
      });
    })
  );
});

// Fetch Event - Stale-While-Revalidate Strategy
self.addEventListener('fetch', (event: any) => {
  // Allow all requests to pass through, but cache them if they are valid
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Check if we received a valid response
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors') {
          return networkResponse;
        }

        // Cache the new resource (clone it)
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Network failed (offline)
        // If we have a cached response, it was returned above.
        // If not, and it's a navigation request, try returning index.html from cache
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });

      // Return cached response immediately if available, otherwise wait for network
      return cachedResponse || fetchPromise;
    })
  );
});

// Activate Event - Clean old caches
self.addEventListener('activate', (event: any) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => (self as any).clients.claim()) // Take control immediately
  );
});