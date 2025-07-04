const CACHE_NAME = 'xago-cache-v2'; // Incremented cache version
const urlsToCache = [
  '/',
  'index.html',
  'style.css',
  'script.js',
  'aiWorker.js',
  'manifest.json',
  // We will not cache the placeholder icons as they don't exist yet
  'icon-192x192.png',
  'icon-512x512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Add this line
  // Perform install steps
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        // Add all URLs to cache, but don't fail the install if some are missing
        // This is a temporary measure because the icons are placeholders
        const promises = urlsToCache.map(urlToCache => {
          return fetch(urlToCache)
            .then(response => {
              if (!response.ok && response.status !== 404) { // Allow 404 for missing icons initially
                console.warn(`Failed to fetch ${urlToCache} for caching. Status: ${response.status}`);
              } else if (response.ok) {
                 return cache.put(urlToCache, response);
              }
              return Promise.resolve(); // Continue if resource not found or error
            })
            .catch(err => {
              console.warn(`Error fetching ${urlToCache} for caching:`, err);
              return Promise.resolve(); // Continue if there's a network error
            });
        });
        return Promise.all(promises);
      })
      .then(() => {
        console.log('All specified resources processed for caching during install.');
      })
      .catch(err => {
        console.error('Cache open failed during install:', err);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    self.clients.claim().then(() => { // Add self.clients.claim()
      return caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheWhitelist.indexOf(cacheName) === -1) {
              return caches.delete(cacheName);
            }
          })
        );
      });
    })
  );
});
