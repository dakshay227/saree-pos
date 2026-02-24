const CACHE_NAME = 'saree-pos-v1';

// These are the core files the phone needs to download to work offline
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  'https://unpkg.com/html5-qrcode' // The barcode scanner library
];

// 1. INSTALLATION: When the app is first opened, download the assets into the phone
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. ACTIVATION: Clean up any old versions of the app if you update the code later
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 3. FETCHING: When the app asks for a file, check the phone's offline cache FIRST!
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return the offline cached version if we have it, otherwise try the internet
      return response || fetch(event.request).then(fetchRes => {
        return caches.open(CACHE_NAME).then(cache => {
          // Save new files to cache as we browse so they work offline next time
          if (event.request.url.startsWith('http')) {
            cache.put(event.request.url, fetchRes.clone());
          }
          return fetchRes;
        });
      });
    })
  );
});