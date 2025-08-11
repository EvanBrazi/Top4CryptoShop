const CACHE_NAME = 'apps-cache-v5';
const ICONS_TO_CACHE = [
  '/icons/apps/',
  '/icons/apps/default.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ICONS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request).then(fetchResponse => {
        if (e.request.url.includes('/icons/apps/')) {
          const cacheCopy = fetchResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(e.request, cacheCopy);
          });
        }
        return fetchResponse;
      });
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});